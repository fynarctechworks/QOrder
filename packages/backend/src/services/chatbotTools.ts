import { prisma } from '../lib/prisma.js';
import { reportService } from './reportService.js';
import { crmService } from './crmService.js';
import { feedbackService } from './feedbackService.js';
import { inventoryService } from './inventoryService.js';
import { discountService } from './discountService.js';
import { staffManagementService } from './staffManagementService.js';
import type OpenAI from 'openai';

// ── Tool definitions for OpenAI function calling ────────────────────────────

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_todays_summary',
      description: 'Get today\'s summary: total revenue, order count, avg order value, pending/preparing/ready orders count.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_sales',
      description: 'Get daily sales data (revenue, order count, avg order value) for a date range.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
          endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hourly_sales',
      description: 'Get hourly sales breakdown for a date range. Useful for peak hours analysis.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_selling_items',
      description: 'Get the best-selling menu items by quantity sold and revenue.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
          limit: { type: 'number', description: 'Number of items to return (default 10)' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_category_performance',
      description: 'Get sales performance broken down by menu category.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_orders_by_status',
      description: 'Get order counts grouped by status (PENDING, CONFIRMED, PREPARING, READY, SERVED, COMPLETED, CANCELLED).',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD (optional, defaults to today)' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD (optional, defaults to today)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_orders',
      description: 'Get the most recent orders with details (order number, status, total, table, items).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of orders (default 10, max 20)' },
          status: { type: 'string', description: 'Filter by status: PENDING, CONFIRMED, PREPARING, READY, SERVED, COMPLETED, CANCELLED' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_table_status',
      description: 'Get current status of all tables (available, occupied) with section info.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_table_utilization',
      description: 'Get table utilization stats: session count, revenue, avg session duration per table.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payment_breakdown',
      description: 'Get payment method breakdown (Cash, Card, UPI, etc.) with totals.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_discount_report',
      description: 'Get discount usage report: discount names, total given, order count, avg discount per order.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_active_discounts',
      description: 'List all active discounts and coupons with their details (type, value, usage).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_feedback_summary',
      description: 'Get customer feedback stats: average ratings, total reviews, rating distribution.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_feedback',
      description: 'Get most recent customer feedback with ratings and comments.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of reviews (default 10)' },
          minRating: { type: 'number', description: 'Minimum rating filter (1-5)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_insights',
      description: 'Get customer summary: total customers, avg spend, top customers, VIP count, new customers.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_customers',
      description: 'Get top customers ranked by total spend or visit count.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of customers (default 10)' },
          metric: { type: 'string', enum: ['totalSpend', 'totalVisits'], description: 'Rank by spend or visits' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_status',
      description: 'Get current inventory status: all ingredients with stock levels, low-stock alerts.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_low_stock_alerts',
      description: 'Get ingredients that are below minimum stock level.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_staff_list',
      description: 'Get all staff members with their roles, active status, and last login.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_staff_attendance',
      description: 'Get staff attendance records for a date range.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leave_requests',
      description: 'Get pending and recent leave requests from staff.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'], description: 'Filter by status' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_menu_items',
      description: 'Get menu items list with prices, availability, category, diet type. Can search by name.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search by item name' },
          available: { type: 'boolean', description: 'Filter by availability' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_branches',
      description: 'Get all branches with their details, table counts, and staff counts.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_avg_prep_time',
      description: 'Get average order preparation time for a date range.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_peak_days',
      description: 'Get peak day analysis: busiest days of the week by revenue and order count.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_restaurant_info',
      description: 'Get restaurant details: name, address, tax rate, currency, settings.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDate(s: string) {
  return new Date(s + 'T00:00:00');
}

function parseDateEnd(s: string) {
  return new Date(s + 'T23:59:59.999');
}

function serialize(data: unknown): string {
  return JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  );
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  restaurantId: string,
): Promise<string> {
  try {
    switch (name) {
      // ── Revenue & Sales ─────────────────────────────────────
      case 'get_todays_summary': {
        const start = today();
        const end = endOfToday();
        const [orders, revenue] = await Promise.all([
          prisma.order.groupBy({
            by: ['status'],
            where: { restaurantId, createdAt: { gte: start, lte: end } },
            _count: { id: true },
            _sum: { total: true },
          }),
          prisma.order.aggregate({
            where: { restaurantId, createdAt: { gte: start, lte: end }, status: 'COMPLETED' },
            _sum: { total: true },
            _count: { id: true },
            _avg: { total: true },
          }),
        ]);
        const totalOrders = orders.reduce((s, o) => s + o._count.id, 0);
        const statusMap = Object.fromEntries(orders.map(o => [o.status, o._count.id]));
        return serialize({
          todaysRevenue: Number(revenue._sum.total ?? 0),
          completedOrders: revenue._count.id,
          totalOrders,
          avgOrderValue: Number(revenue._avg.total ?? 0),
          pendingOrders: statusMap['PENDING'] ?? 0,
          preparingOrders: (statusMap['CONFIRMED'] ?? 0) + (statusMap['PREPARING'] ?? 0),
          readyOrders: statusMap['READY'] ?? 0,
          servedOrders: statusMap['SERVED'] ?? 0,
          cancelledOrders: statusMap['CANCELLED'] ?? 0,
        });
      }

      case 'get_daily_sales': {
        const data = await reportService.dailySales(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      case 'get_hourly_sales': {
        const data = await reportService.hourlySales(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      case 'get_top_selling_items': {
        const data = await reportService.itemPerformance(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
          Math.min(Number(args.limit) || 10, 20),
        );
        return serialize(data);
      }

      case 'get_category_performance': {
        const data = await reportService.categoryPerformance(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      // ── Orders ──────────────────────────────────────────────
      case 'get_orders_by_status': {
        const start = args.startDate ? parseDate(args.startDate as string) : today();
        const end = args.endDate ? parseDateEnd(args.endDate as string) : endOfToday();
        const data = await reportService.orderStatusBreakdown(restaurantId, start, end);
        return serialize(data);
      }

      case 'get_recent_orders': {
        const limit = Math.min(Number(args.limit) || 10, 20);
        const where: any = { restaurantId };
        if (args.status) where.status = args.status;
        const orders = await prisma.order.findMany({
          where,
          include: {
            table: { select: { number: true, name: true } },
            items: { include: { menuItem: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return serialize(orders.map(o => ({
          orderNumber: o.orderNumber,
          status: o.status,
          total: Number(o.total),
          table: o.table ? `${o.table.name || 'Table ' + o.table.number}` : 'No table',
          items: o.items.map(i => `${i.quantity}x ${i.menuItem?.name ?? 'Item'}`),
          createdAt: o.createdAt,
        })));
      }

      // ── Tables ──────────────────────────────────────────────
      case 'get_table_status': {
        const tables = await prisma.table.findMany({
          where: { restaurantId },
          include: { section: { select: { name: true } } },
          orderBy: { number: 'asc' },
        });
        const summary = { available: 0, occupied: 0, inactive: 0 };
        const list = tables.map(t => {
          const s = t.status.toLowerCase() as keyof typeof summary;
          if (s in summary) summary[s]++;
          return {
            number: t.number,
            name: t.name,
            status: t.status,
            capacity: t.capacity,
            section: t.section?.name ?? 'Default',
          };
        });
        return serialize({ summary, tables: list });
      }

      case 'get_table_utilization': {
        const data = await reportService.tableUtilization(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      // ── Payments ────────────────────────────────────────────
      case 'get_payment_breakdown': {
        const data = await reportService.paymentBreakdown(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      // ── Discounts ───────────────────────────────────────────
      case 'get_discount_report': {
        const data = await reportService.discountReport(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      case 'get_active_discounts': {
        const [discounts, coupons] = await Promise.all([
          discountService.list(restaurantId),
          discountService.listCoupons(restaurantId),
        ]);
        return serialize({
          discounts: discounts.filter(d => d.isActive).map(d => ({
            name: d.name, type: d.type, value: Number(d.value),
            minOrder: Number(d.minOrderAmount), maxDiscount: Number(d.maxDiscount),
            isAutoApply: d.isAutoApply, usedCount: d.usedCount, maxUses: d.maxUses,
          })),
          coupons: coupons.filter((c: any) => c.isActive).map((c: any) => ({
            code: c.code, discountName: c.discount?.name,
            usedCount: c.usedCount, maxUses: c.maxUses, expiresAt: c.expiresAt,
          })),
        });
      }

      // ── Feedback ────────────────────────────────────────────
      case 'get_feedback_summary': {
        const data = await feedbackService.getStats(restaurantId);
        return serialize(data);
      }

      case 'get_recent_feedback': {
        const data = await feedbackService.list(restaurantId, {
          limit: Math.min(Number(args.limit) || 10, 20),
          minRating: args.minRating ? Number(args.minRating) : undefined,
        });
        return serialize(data);
      }

      // ── CRM / Customers ────────────────────────────────────
      case 'get_customer_insights': {
        const data = await crmService.getInsights(restaurantId);
        return serialize(data);
      }

      case 'get_top_customers': {
        const data = await crmService.getTopCustomers(
          restaurantId,
          Math.min(Number(args.limit) || 10, 20),
          (args.metric as 'totalSpend' | 'totalVisits') || 'totalSpend',
        );
        return serialize(data);
      }

      // ── Inventory ───────────────────────────────────────────
      case 'get_inventory_status': {
        const data = await inventoryService.getIngredients(restaurantId);
        return serialize(data.map((i: any) => ({
          name: i.name, unit: i.unit,
          currentStock: Number(i.currentStock), minStock: Number(i.minStock),
          costPerUnit: Number(i.costPerUnit),
          isLowStock: Number(i.currentStock) < Number(i.minStock),
        })));
      }

      case 'get_low_stock_alerts': {
        const data = await inventoryService.getLowStockAlerts(restaurantId);
        return serialize(data);
      }

      // ── Staff ───────────────────────────────────────────────
      case 'get_staff_list': {
        const staff = await prisma.user.findMany({
          where: { restaurantId },
          select: { id: true, name: true, email: true, username: true, role: true, isActive: true, lastLoginAt: true },
          orderBy: { name: 'asc' },
        });
        return serialize(staff);
      }

      case 'get_staff_attendance': {
        const data = await staffManagementService.getAttendance(restaurantId, {
          startDate: parseDate(args.startDate as string),
          endDate: parseDateEnd(args.endDate as string),
        });
        return serialize(data);
      }

      case 'get_leave_requests': {
        const data = await staffManagementService.getLeaveRequests(restaurantId, {
          status: args.status as any,
        });
        return serialize(data);
      }

      // ── Menu ────────────────────────────────────────────────
      case 'get_menu_items': {
        const where: any = { restaurantId, isActive: true };
        if (args.search) where.name = { contains: args.search as string, mode: 'insensitive' };
        if (args.available !== undefined) where.isAvailable = args.available;
        const items = await prisma.menuItem.findMany({
          where,
          include: { category: { select: { name: true } } },
          orderBy: { name: 'asc' },
          take: 50,
        });
        return serialize(items.map(i => ({
          name: i.name, price: Number(i.price),
          discountPrice: i.discountPrice ? Number(i.discountPrice) : null,
          category: i.category?.name, dietType: i.dietType,
          isAvailable: i.isAvailable, badge: i.badge,
        })));
      }

      // ── Branches ────────────────────────────────────────────
      case 'get_branches': {
        const branches = await prisma.branch.findMany({
          where: { restaurantId },
          include: {
            _count: { select: { tables: true, sections: true, users: true } },
          },
        });
        return serialize(branches.map(b => ({
          name: b.name, code: b.code, address: b.address,
          isActive: b.isActive,
          tables: b._count.tables, sections: b._count.sections, staff: b._count.users,
        })));
      }

      // ── Prep Time & Peak Days ───────────────────────────────
      case 'get_avg_prep_time': {
        const data = await reportService.avgPrepTime(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      case 'get_peak_days': {
        const data = await reportService.peakDayAnalysis(
          restaurantId,
          parseDate(args.startDate as string),
          parseDateEnd(args.endDate as string),
        );
        return serialize(data);
      }

      // ── Restaurant Info ─────────────────────────────────────
      case 'get_restaurant_info': {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: {
            name: true, description: true, address: true, phone: true, email: true,
            currency: true, taxRate: true, timezone: true,
          },
        });
        return serialize(restaurant);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    console.error(`Chatbot tool error [${name}]:`, err?.message);
    return JSON.stringify({ error: `Failed to fetch data: ${err?.message}` });
  }
}
