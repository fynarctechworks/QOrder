import { UserRole } from '@prisma/client';

// Express request extensions
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        restaurantId: string;
      };
      restaurantId?: string;
    }
  }
}

// JWT Payload types
export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  restaurantId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Socket.io event types
export interface ServerToClientEvents {
  'order:new': (order: OrderSocketPayload) => void;
  'order:statusUpdate': (data: OrderStatusUpdate) => void;
  'table:update': (table: TableSocketPayload) => void;
  'table:updated': (data: { tableId: string }) => void;
  'session:updated': (data: { sessionId: string; isFullyPaid?: boolean }) => void;
  'menu:update': (data: MenuUpdatePayload) => void;
  'payment:request': (data: PaymentRequestPayload) => void;
  'payment:acknowledged': (data: { tableId: string }) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  'join:restaurant': (restaurantId: string) => void;
  'join:table': (tableId: string) => void;
  'order:join': (data: { orderId: string }) => void;
  'order:leave': (data: { orderId: string }) => void;
  'leave:restaurant': (restaurantId: string) => void;
  'leave:table': (tableId: string) => void;
  'payment:request': (data: PaymentRequestPayload) => void;
  'payment:acknowledge': (data: { tableId: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  restaurantId?: string;
  tableId?: string;
}

// Socket payload types
export interface OrderSocketPayload {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  tableNumber?: string;
  items: Array<{
    name: string;
    quantity: number;
  }>;
  createdAt: string;
}

export interface OrderStatusUpdate {
  orderId: string;
  orderNumber: string;
  status: string;
  previousStatus: string;
  estimatedTime?: number;
  updatedAt: string;
}

export interface TableSocketPayload {
  id: string;
  number: string;
  status: string;
  updatedAt: string;
}

export interface MenuUpdatePayload {
  type: 'item' | 'category' | 'availability';
  itemId?: string;
  categoryId?: string;
  data: unknown;
}

export interface PaymentRequestPayload {
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  total: number;
  orderCount: number;
  requestedAt: string;
}

export {};
