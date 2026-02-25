import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { pubClient, subClient, redis } from '../lib/redis.js';
import { prisma } from '../lib/index.js';
import { logger } from '../lib/logger.js';
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData,
  AccessTokenPayload,
  PaymentRequestPayload,
} from '../types/index.js';

let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

// Redis-based rate limiter for socket events (works across processes)
const RATE_LIMIT_WINDOW_SEC = 60; // 1 minute
const RATE_LIMIT_MAX = 10; // max events per window

async function isRateLimited(key: string): Promise<boolean> {
  try {
    const redisKey = `rl:sock:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, RATE_LIMIT_WINDOW_SEC);
    }
    return count > RATE_LIMIT_MAX;
  } catch {
    // If Redis is unavailable, allow the request (fail open)
    return false;
  }
}

export function initializeSocket(httpServer: HTTPServer) {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    }
  );

  // Use Redis adapter for horizontal scaling
  io.adapter(createAdapter(pubClient, subClient));

  // ── Authentication middleware ──
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (token) {
      try {
        const payload = jwt.verify(token as string, config.jwt.accessSecret) as AccessTokenPayload;
        socket.data.userId = payload.userId;
        socket.data.restaurantId = payload.restaurantId;
      } catch {
        // For admin connections that require auth, reject immediately
        if (socket.handshake.auth.requireAuth) {
          return next(new Error('Authentication failed'));
        }
        // Otherwise continue without auth (public customer connections)
      }
    }
    
    next();
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    logger.debug({ socketId: socket.id, userId: socket.data.userId }, 'Socket connected');

    // ── Join restaurant room (admin only — requires valid JWT) ──
    socket.on('join:restaurant', (restaurantId: string) => {
      if (!socket.data.userId) {
        socket.emit('error', 'Authentication required');
        return;
      }
      // Only allow if user belongs to this restaurant
      if (socket.data.restaurantId !== restaurantId) {
        socket.emit('error', 'Not authorized for this restaurant');
        return;
      }
      socket.join(`restaurant:${restaurantId}`);
      logger.debug({ socketId: socket.id, restaurantId }, 'Joined restaurant room');
    });

    // ── Join table room (customers — validate table exists and has active session) ──
    socket.on('join:table', async (tableId: string) => {
      try {
        // Validate table exists
        const table = await prisma.table.findUnique({ where: { id: tableId } });
        if (!table) {
          socket.emit('error', 'Table not found');
          return;
        }

        socket.data.tableId = tableId;
        socket.join(`table:${tableId}`);
        logger.debug({ socketId: socket.id, tableId }, 'Joined table room');
      } catch (err) {
        logger.error({ err, tableId }, 'Failed to validate table for join:table');
        socket.emit('error', 'Failed to join table room');
      }
    });

    // ── Join order room (customers — validate order belongs to socket's table) ──
    socket.on('order:join', async ({ orderId }: { orderId: string }) => {
      try {
        const tableId = socket.data.tableId;
        if (!tableId) {
          socket.emit('error', 'Must join a table before joining an order room');
          return;
        }
        // Validate that the order belongs to the table this socket is connected to
        const order = await prisma.order.findFirst({
          where: { id: orderId, tableId },
          select: { id: true },
        });
        if (!order) {
          socket.emit('error', 'Order not found for this table');
          return;
        }
        socket.join(`order:${orderId}`);
        logger.debug({ socketId: socket.id, orderId }, 'Joined order room');
      } catch (err) {
        logger.error({ err, orderId }, 'Failed to validate order for order:join');
        socket.emit('error', 'Failed to join order room');
      }
    });

    socket.on('order:leave', ({ orderId }: { orderId: string }) => {
      socket.leave(`order:${orderId}`);
      logger.debug({ socketId: socket.id, orderId }, 'Left order room');
    });

    // ── Leave rooms ──
    socket.on('leave:restaurant', (restaurantId: string) => {
      socket.leave(`restaurant:${restaurantId}`);
    });

    socket.on('leave:table', (tableId: string) => {
      socket.leave(`table:${tableId}`);
    });

    // ── Payment request (customer → admin) — validated & rate-limited ──
    socket.on('payment:request', async (data: PaymentRequestPayload) => {
      // Rate-limit by socket id
      if (await isRateLimited(`payment:${socket.id}`)) {
        socket.emit('error', 'Too many payment requests. Please wait.');
        return;
      }

      try {
        // Validate the table belongs to the claimed restaurant and has an active session
        const table = await prisma.table.findFirst({
          where: { id: data.tableId, restaurantId: data.restaurantId },
        });

        if (!table) {
          socket.emit('error', 'Invalid table or restaurant');
          return;
        }

        const activeSession = await prisma.tableSession.findFirst({
          where: { tableId: data.tableId, status: 'ACTIVE' },
        });

        if (!activeSession) {
          socket.emit('error', 'No active session for this table');
          return;
        }

        logger.info({ socketId: socket.id, tableId: data.tableId, restaurantId: data.restaurantId }, 'Payment request received');
        // Forward to the restaurant's admin room
        io!.to(`restaurant:${data.restaurantId}`).emit('payment:request', data);
      } catch (err) {
        logger.error({ err }, 'Failed to validate payment request');
        socket.emit('error', 'Payment request failed');
      }
    });

    // ── Payment acknowledge (admin → customer) ──
    socket.on('payment:acknowledge', ({ tableId }: { tableId: string }) => {
      if (!socket.data.userId) {
        socket.emit('error', 'Authentication required');
        return;
      }
      logger.info({ socketId: socket.id, tableId }, 'Payment acknowledged by admin');
      // Notify the customer's table room
      io!.to(`table:${tableId}`).emit('payment:acknowledged', { tableId });
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
    });

    socket.on('error', (error) => {
      logger.error({ socketId: socket.id, err: error }, 'Socket error');
    });
  });

  logger.info('Socket.io initialized');

  return io;
}

export function getIO() {
  return io;
}

// Helper functions for emitting events
export const socketEmitters = {
  // Emit new order to restaurant
  emitNewOrder(restaurantId: string, orderPayload: ServerToClientEvents['order:new'] extends (arg: infer T) => void ? T : never) {
    if (io) {
      io.to(`restaurant:${restaurantId}`).emit('order:new', orderPayload);
    }
  },

  // Emit order status update
  emitOrderStatusUpdate(
    restaurantId: string, 
    orderId: string, 
    tableId: string | null,
    payload: ServerToClientEvents['order:statusUpdate'] extends (arg: infer T) => void ? T : never
  ) {
    if (io) {
      // Notify restaurant staff
      io.to(`restaurant:${restaurantId}`).emit('order:statusUpdate', payload);
      
      // Notify order room (for customer tracking)
      io.to(`order:${orderId}`).emit('order:statusUpdate', payload);

      // Notify table if applicable
      if (tableId) {
        io.to(`table:${tableId}`).emit('order:statusUpdate', payload);
      }
    }
  },

  // Emit table status update
  emitTableUpdate(
    restaurantId: string,
    payload: ServerToClientEvents['table:update'] extends (arg: infer T) => void ? T : never
  ) {
    if (io) {
      io.to(`restaurant:${restaurantId}`).emit('table:update', payload);
    }
  },

  // Emit menu update
  emitMenuUpdate(
    restaurantId: string,
    payload: ServerToClientEvents['menu:update'] extends (arg: infer T) => void ? T : never
  ) {
    if (io) {
      io.to(`restaurant:${restaurantId}`).emit('menu:update', payload);
    }
  },
};
