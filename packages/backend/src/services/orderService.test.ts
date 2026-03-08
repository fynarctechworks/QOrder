import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma, mockCache } from '../__tests__/setup.js';
import { Decimal } from '@prisma/client/runtime/library';

vi.mock('../config/index.js', () => ({
  config: {
    env: 'test',
    port: 3000,
    jwt: {
      accessSecret: 'test-access-secret-that-is-long-enough-32chars',
      refreshSecret: 'test-refresh-secret-that-is-long-enough-32chars',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    cors: { origin: ['http://localhost:5173'] },
    isDevelopment: false,
    isProduction: false,
    redis: { url: 'redis://localhost:6379' },
    smtp: { host: '', port: 587, user: '', pass: '', from: '' },
    whatsapp: { token: '', phoneNumberId: '' },
    twilio: { accountSid: '', authToken: '', verifyServiceSid: '' },
    razorpay: { keyId: '', keySecret: '', webhookSecret: '' },
  },
}));

// Mock socket emitters
vi.mock('../socket/index.js', () => ({
  socketEmitters: {
    newOrder: vi.fn(),
    orderStatusUpdate: vi.fn(),
    tableUpdate: vi.fn(),
    newOrderFull: vi.fn(),
  },
  initializeSocket: vi.fn(),
}));

// Mock session + table + discount services
vi.mock('./sessionService.js', () => ({
  sessionService: {
    isSessionExpired: vi.fn().mockReturnValue(false),
    expireSession: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    touchSession: vi.fn().mockResolvedValue(undefined),
    recalculateSessionTotals: vi.fn().mockResolvedValue(undefined),
    getOrCreateSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
    getSessionById: vi.fn().mockResolvedValue(null),
    expireStaleSessions: vi.fn().mockResolvedValue(undefined),
    addPayment: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./tableService.js', () => ({
  tableService: {
    updateStatus: vi.fn(),
  },
}));

vi.mock('./discountService.js', () => ({
  discountService: {
    validateCoupon: vi.fn().mockResolvedValue({ valid: false }),
    getAutoApplyDiscounts: vi.fn().mockResolvedValue(null),
    incrementUsage: vi.fn(),
  },
}));

import { orderService } from './orderService.js';

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TABLE_ID = '550e8400-e29b-41d4-a716-446655440003';
const MENU_ITEM_ID = '550e8400-e29b-41d4-a716-446655440004';
const SESSION_TOKEN = '550e8400-e29b-41d4-a716-446655440005';

function mockMenuItem(overrides: Record<string, unknown> = {}) {
  return {
    id: MENU_ITEM_ID,
    name: 'Butter Chicken',
    price: new Decimal(299),
    description: 'Creamy tomato curry',
    image: null,
    restaurantId: RESTAURANT_ID,
    isActive: true,
    isAvailable: true,
    modifierGroups: [],
    ...overrides,
  };
}

describe('OrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Create Order ────────────────────────────────────────
  describe('createOrder', () => {
    it('should create order with valid input (customer scenario)', async () => {
      const restaurant = { taxRate: new Decimal(5), settings: { acceptsOrders: true } };
      const table = {
        id: TABLE_ID,
        number: '5',
        name: 'Table 5',
        sessionToken: SESSION_TOKEN,
        branchId: null,
      };

      mockPrisma.menuItem.findMany.mockResolvedValue([mockMenuItem()]);
      mockPrisma.table.findFirst.mockResolvedValue(table);
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: 'session-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3600000),
        lastActivityAt: new Date(),
        createdAt: new Date(),
      });

      // Transaction mock: returns the created order
      const createdOrder = {
        id: 'order-1',
        orderNumber: '260305-A1B2',
        restaurantId: RESTAURANT_ID,
        tableId: TABLE_ID,
        status: 'PENDING',
        subtotal: new Decimal(299),
        tax: new Decimal(14.95),
        total: new Decimal(313.95),
        items: [{ id: 'item-1', menuItemId: MENU_ITEM_ID, quantity: 1 }],
        table,
      };
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        // Mock the Prisma client inside the transaction
        const txClient = {
          ...mockPrisma,
          order: {
            ...mockPrisma.order,
            create: vi.fn().mockResolvedValue(createdOrder),
          },
          table: {
            ...mockPrisma.table,
            update: vi.fn().mockResolvedValue(table),
          },
          $queryRaw: vi.fn().mockResolvedValue([table]),
          $queryRawUnsafe: vi.fn().mockResolvedValue([]),
        };
        return fn(txClient);
      });

      const result = await orderService.createOrder(
        RESTAURANT_ID,
        {
          tableId: TABLE_ID,
          sessionToken: SESSION_TOKEN,
          items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
        },
        restaurant,
      );

      expect(result.id).toBe('order-1');
      expect(result.status).toBe('PENDING');
    });

    it('should reject order when restaurant is not accepting orders', async () => {
      const restaurant = { taxRate: new Decimal(5), settings: { acceptsOrders: false } };

      mockPrisma.menuItem.findMany.mockResolvedValue([mockMenuItem()]);
      mockPrisma.table.findFirst.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);

      await expect(
        orderService.createOrder(RESTAURANT_ID, {
          items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
        }, restaurant),
      ).rejects.toThrow('not currently accepting orders');
    });

    it('should reject order with wrong session token (QR spoof)', async () => {
      const restaurant = { taxRate: new Decimal(5), settings: { acceptsOrders: true } };
      const table = {
        id: TABLE_ID,
        number: '5',
        name: 'Table 5',
        sessionToken: SESSION_TOKEN,
        branchId: null,
      };

      mockPrisma.menuItem.findMany.mockResolvedValue([mockMenuItem()]);
      mockPrisma.table.findFirst.mockResolvedValue(table);
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);

      await expect(
        orderService.createOrder(RESTAURANT_ID, {
          tableId: TABLE_ID,
          sessionToken: '550e8400-e29b-41d4-a716-000000000000', // wrong token
          items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
        }, restaurant),
      ).rejects.toThrow('Session expired');
    });

    it('should reject order with no session token for a table that requires one', async () => {
      const restaurant = { taxRate: new Decimal(5), settings: { acceptsOrders: true } };
      const table = {
        id: TABLE_ID,
        number: '5',
        name: 'Table 5',
        sessionToken: SESSION_TOKEN,
        branchId: null,
      };

      mockPrisma.menuItem.findMany.mockResolvedValue([mockMenuItem()]);
      mockPrisma.table.findFirst.mockResolvedValue(table);
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);

      await expect(
        orderService.createOrder(RESTAURANT_ID, {
          tableId: TABLE_ID,
          // no sessionToken
          items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
        }, restaurant),
      ).rejects.toThrow('Session expired');
    });

    it('should reject order when menu item is unavailable', async () => {
      const restaurant = { taxRate: new Decimal(5), settings: { acceptsOrders: true } };

      // Return empty array — item filtered out because isAvailable=false
      mockPrisma.menuItem.findMany.mockResolvedValue([]);
      mockPrisma.table.findFirst.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);

      await expect(
        orderService.createOrder(RESTAURANT_ID, {
          items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
        }, restaurant),
      ).rejects.toThrow('Some menu items are not available');
    });

    it('should skip session token validation for cashier orders (initialStatus=PREPARING)', async () => {
      const restaurant = { taxRate: new Decimal(5), settings: { acceptsOrders: true } };
      const table = {
        id: TABLE_ID,
        number: '5',
        name: 'Table 5',
        sessionToken: SESSION_TOKEN, // table has a token
        branchId: null,
      };

      mockPrisma.menuItem.findMany.mockResolvedValue([mockMenuItem()]);
      mockPrisma.table.findFirst.mockResolvedValue(table);
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);

      const createdOrder = {
        id: 'order-cashier',
        status: 'PREPARING',
        subtotal: new Decimal(299),
        tax: new Decimal(14.95),
        total: new Decimal(313.95),
        items: [],
        table,
      };
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const txClient = {
          ...mockPrisma,
          order: { ...mockPrisma.order, create: vi.fn().mockResolvedValue(createdOrder) },
          table: { ...mockPrisma.table, update: vi.fn().mockResolvedValue(table) },
          $queryRaw: vi.fn().mockResolvedValue([table]),
        };
        return fn(txClient);
      });

      // No sessionToken but initialStatus='PREPARING' — should succeed
      const result = await orderService.createOrder(
        RESTAURANT_ID,
        {
          tableId: TABLE_ID,
          // no sessionToken — cashier doesn't need it
          items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
        },
        restaurant,
        'PREPARING', // initialStatus for cashier flow
      );

      expect(result.status).toBe('PREPARING');
    });

    it('should reject order with non-existent table', async () => {
      const restaurant = { taxRate: new Decimal(5), settings: { acceptsOrders: true } };

      mockPrisma.menuItem.findMany.mockResolvedValue([mockMenuItem()]);
      mockPrisma.table.findFirst.mockResolvedValue(null); // table doesn't exist
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);

      await expect(
        orderService.createOrder(RESTAURANT_ID, {
          tableId: TABLE_ID,
          sessionToken: SESSION_TOKEN,
          items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
        }, restaurant),
      ).rejects.toThrow('Table not found');
    });
  });

  // ── Get Active Orders ───────────────────────────────────
  describe('getActiveOrders', () => {
    it('should return cached active orders', async () => {
      const cachedOrders = [{ id: 'order-1', status: 'PENDING' }];
      mockCache.get.mockResolvedValue(cachedOrders);

      const result = await orderService.getActiveOrders(RESTAURANT_ID);

      expect(result).toEqual(cachedOrders);
    });

    it('should bypass cache when branch-filtered', async () => {
      const orders = [{ id: 'order-branch', status: 'PREPARING' }];
      mockPrisma.order.findMany.mockResolvedValue(orders);

      const result = await orderService.getActiveOrders(RESTAURANT_ID, 'branch-1');

      // Should call DB directly, not cache
      expect(mockPrisma.order.findMany).toHaveBeenCalled();
    });
  });

  // ── Get Orders (Paginated) ──────────────────────────────
  describe('getOrders', () => {
    it('should return paginated orders', async () => {
      mockPrisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
      mockPrisma.order.count.mockResolvedValue(25);

      const result = await orderService.getOrders(RESTAURANT_ID, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.orders).toHaveLength(2);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('should filter by status', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      await orderService.getOrders(RESTAURANT_ID, {
        status: 'PENDING',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });
  });
});
