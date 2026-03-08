import { UserRole } from '@prisma/client';

// Express request extensions
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string | null;
        role: UserRole;
        restaurantId: string;
      };
      restaurantId?: string;
      branchId?: string | null; // Active branch context (null = all branches)
    }
  }
}

// JWT Payload types
export interface AccessTokenPayload {
  userId: string;
  email: string | null;
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
  'order:newFull': (order: unknown) => void;
  'order:statusUpdate': (data: OrderStatusUpdate) => void;
  'order:kitchenReady': (data: { orderId: string; orderNumber: string; tableName: string; preparedAt: string }) => void;
  'order:itemKitchenReady': (data: { orderId: string; orderNumber: string; itemId: string; itemName: string; tableName: string; preparedAt: string; allItemsReady: boolean }) => void;
  'table:update': (table: TableSocketPayload) => void;
  'table:updated': (data: { tableId: string; status?: string; sessionToken?: string | null }) => void;
  'session:updated': (data: { sessionId: string; isFullyPaid?: boolean }) => void;
  'menu:update': (data: MenuUpdatePayload) => void;
  'payment:request': (data: PaymentRequestPayload) => void;
  'payment:acknowledged': (data: { tableId: string }) => void;
  'sync:refresh': () => void;
  'group:joined': (data: GroupParticipantPayload) => void;
  'group:cartUpdated': (data: GroupCartUpdatePayload) => void;
  'group:ready': (data: { participantId: string; name: string }) => void;
  'group:submitted': (data: { code: string; orderId: string }) => void;
  'group:cancelled': (data: { code: string }) => void;
  'group:expired': (data: { code: string }) => void;
  'service:request': (data: unknown) => void;
  'staff:leaveRequest': (data: { id: string; userName: string; leaveType: string; startDate: string; endDate: string; reason?: string }) => void;
  'service:acknowledged': (data: { id: string; type: string }) => void;
  'queue:updated': (data: unknown) => void;
  'kds:status': (data: { count: number; users: { id: string; name: string; role: string; roleTitle?: string }[] }) => void;
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
  'sync:trigger': () => void;
  'join:group': (code: string) => void;
  'leave:group': (code: string) => void;
  'kds:join': () => void;
  'kds:leave': () => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  restaurantId?: string;
  tableId?: string;
  isKds?: boolean;
  userName?: string;
  userRole?: string;
  userRoleTitle?: string;
}

// Socket payload types
export interface OrderSocketPayload {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  tableNumber?: string;
  tableName?: string;
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

export interface GroupParticipantPayload {
  code: string;
  participantId: string;
  name: string;
  isHost: boolean;
}

export interface GroupCartUpdatePayload {
  code: string;
  participantId: string;
  participantName: string;
  action: 'added' | 'updated' | 'removed';
  item?: {
    id: string;
    menuItemId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    notes?: string;
  };
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
