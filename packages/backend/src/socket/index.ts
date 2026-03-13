import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
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
  GroupParticipantPayload,
  GroupCartUpdatePayload,
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

// Socket event payload schemas
const uuidSchema = z.string().uuid();

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
      maxHttpBufferSize: 1e6, // 1 MB
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
      if (!uuidSchema.safeParse(restaurantId).success) {
        socket.emit('error', 'Invalid restaurant ID');
        return;
      }
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
      // Send current KDS status to the newly joined socket
      (async () => {
        const room = await io!.in(`kds:${restaurantId}`).fetchSockets();
        const seen = new Set<string>();
        const users: { id: string; name: string; role: string; roleTitle?: string }[] = [];
        for (const s of room) {
          const uid = s.data.userId;
          if (uid && !seen.has(uid)) {
            seen.add(uid);
            users.push({ id: uid, name: s.data.userName || 'Unknown', role: s.data.userRole || 'STAFF', roleTitle: s.data.userRoleTitle || undefined });
          }
        }
        socket.emit('kds:status', { count: room.length, users });
      })();
    });

    // ── Join table room (customers — validate table exists and has active session) ──
    socket.on('join:table', async (tableId: string) => {
      if (!uuidSchema.safeParse(tableId).success) {
        socket.emit('error', 'Invalid table ID');
        return;
      }
      try {
        // Validate table exists and has an active session
        const table = await prisma.table.findUnique({ where: { id: tableId } });
        if (!table) {
          socket.emit('error', 'Table not found');
          return;
        }

        // Verify table has an active session before allowing join
        const activeSession = await prisma.tableSession.findFirst({
          where: { tableId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!activeSession) {
          socket.emit('error', 'No active session for this table');
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

    // ── Join / leave group order room (customers) ──
    socket.on('join:group', (code: string) => {
      socket.join(`group:${code}`);
      logger.debug({ socketId: socket.id, groupCode: code }, 'Joined group room');
    });

    socket.on('leave:group', (code: string) => {
      socket.leave(`group:${code}`);
      logger.debug({ socketId: socket.id, groupCode: code }, 'Left group room');
    });

    // ── Sync trigger (admin → all customers in restaurant) ──
    socket.on('sync:trigger', async () => {
      if (!socket.data.userId || !socket.data.restaurantId) {
        socket.emit('error', 'Authentication required');
        return;
      }
      // Verify user has admin-level access
      const user = await prisma.user.findUnique({
        where: { id: socket.data.userId },
        select: { role: true },
      });
      if (!user || !['OWNER', 'ADMIN', 'MANAGER'].includes(user.role)) {
        socket.emit('error', 'Insufficient permissions');
        return;
      }
      logger.info({ socketId: socket.id, restaurantId: socket.data.restaurantId }, 'Sync triggered by admin');
      // Broadcast refresh to all clients in the restaurant room
      io!.to(`restaurant:${socket.data.restaurantId}`).emit('sync:refresh');
    });

    // ── Helper to build KDS status payload ──
    async function buildKdsStatus(restaurantId: string) {
      const room = await io!.in(`kds:${restaurantId}`).fetchSockets();
      // Deduplicate by userId (same user could have multiple KDS tabs)
      const seen = new Set<string>();
      const users: { id: string; name: string; role: string; roleTitle?: string }[] = [];
      for (const s of room) {
        const uid = s.data.userId;
        if (uid && !seen.has(uid)) {
          seen.add(uid);
          users.push({ id: uid, name: s.data.userName || 'Unknown', role: s.data.userRole || 'STAFF', roleTitle: s.data.userRoleTitle || undefined });
        }
      }
      return { count: room.length, users };
    }

    // ── KDS join/leave ──
    socket.on('kds:join', async () => {
      if (!socket.data.userId || !socket.data.restaurantId) {
        socket.emit('error', 'Authentication required');
        return;
      }
      socket.data.isKds = true;
      // Look up user name if not already stored
      if (!socket.data.userName) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: socket.data.userId },
            select: { name: true, role: true, roleTitle: true },
          });
          if (user) {
            socket.data.userName = user.name;
            socket.data.userRole = user.role;
            socket.data.userRoleTitle = user.roleTitle ?? undefined;
          }
        } catch { /* ignore lookup failure */ }
      }
      socket.join(`kds:${socket.data.restaurantId}`);
      logger.info({ socketId: socket.id, restaurantId: socket.data.restaurantId }, 'KDS joined');
      // Broadcast updated KDS status with user details
      const status = await buildKdsStatus(socket.data.restaurantId);
      io!.to(`restaurant:${socket.data.restaurantId}`).emit('kds:status', status);
    });

    socket.on('kds:leave', async () => {
      if (!socket.data.restaurantId) return;
      socket.data.isKds = false;
      socket.leave(`kds:${socket.data.restaurantId}`);
      logger.info({ socketId: socket.id, restaurantId: socket.data.restaurantId }, 'KDS left');
      const status = await buildKdsStatus(socket.data.restaurantId);
      io!.to(`restaurant:${socket.data.restaurantId}`).emit('kds:status', status);
    });

    socket.on('disconnect', async (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
      // If this was a KDS socket, broadcast updated status
      if (socket.data.isKds && socket.data.restaurantId) {
        const status = await buildKdsStatus(socket.data.restaurantId);
        io!.to(`restaurant:${socket.data.restaurantId}`).emit('kds:status', status);
      }
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

  // ── Group order emitters ──

  emitGroupJoined(code: string, payload: GroupParticipantPayload) {
    if (io) {
      io.to(`group:${code}`).emit('group:joined', payload);
    }
  },

  emitGroupCartUpdated(code: string, payload: GroupCartUpdatePayload) {
    if (io) {
      io.to(`group:${code}`).emit('group:cartUpdated', payload);
    }
  },

  emitGroupReady(code: string, data: { participantId: string; name: string }) {
    if (io) {
      io.to(`group:${code}`).emit('group:ready', data);
    }
  },

  emitGroupSubmitted(code: string, orderId: string) {
    if (io) {
      io.to(`group:${code}`).emit('group:submitted', { code, orderId });
    }
  },

  emitGroupCancelled(code: string) {
    if (io) {
      io.to(`group:${code}`).emit('group:cancelled', { code });
    }
  },

  emitGroupExpired(code: string) {
    if (io) {
      io.to(`group:${code}`).emit('group:expired', { code });
    }
  },
};
