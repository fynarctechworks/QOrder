import { apiClient } from './apiClient';
import type { Order, OrderStatus, PaginatedResponse } from '../types';

interface OrdersQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus | OrderStatus[];
  tableId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Maps the raw backend API response to the admin Order type.
 * The backend transformer already groups modifiers by their modifierGroup,
 * so the response shape matches our admin types directly.
 * This mapper ensures Decimal → number conversion and field naming consistency.
 */
function mapApiOrder(raw: Record<string, unknown>): Order {
  if (!raw || typeof raw !== 'object') {
    throw new Error('mapApiOrder: expected an object');
  }
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  return {
    id: r.id as string,
    orderNumber: (r.orderNumber as string) || '',
    tokenNumber: r.tokenNumber != null ? Number(r.tokenNumber) : null,
    restaurantId: r.restaurantId as string,
    tableId: (r.tableId as string) || '',
    tableName: (r.tableName as string) || 'Unknown',
    orderType: (r.orderType as string) || undefined,
    sectionName: (r.sectionName as string) || null,
    status: (r.status as string).toLowerCase() as OrderStatus,
    items: items.map((item: Record<string, unknown>) => ({
      id: item.id as string,
      menuItemId: item.menuItemId as string,
      menuItemName: (item.menuItemName as string) || '',
      menuItemImage: (item.menuItemImage as string) || undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      customizations: (item.customizations as Order['items'][0]['customizations']) || [],
      specialInstructions: (item.specialInstructions as string) || undefined,
      preparedAt: (item.preparedAt as string) || undefined,
    })),
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    specialInstructions: (r.specialInstructions as string) || undefined,
    customerName: (r.customerName as string) || undefined,
    customerPhone: (r.customerPhone as string) || undefined,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
    estimatedReadyTime: (r.estimatedReadyTime as string) || undefined,
    preparedAt: (r.preparedAt as string) || undefined,
    completedAt: (r.completedAt as string) || undefined,
  };
}

export const orderService = {
  async getAll(query: OrdersQuery = {}): Promise<PaginatedResponse<Order>> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      statuses.forEach((s) => params.append('status', s));
    }
    if (query.tableId) params.set('tableId', query.tableId);
    if (query.startDate) params.set('startDate', query.startDate);
    if (query.endDate) params.set('endDate', query.endDate);

    const raw = await apiClient.getRaw<{ success: boolean; data: Record<string, unknown>[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(`/orders?${params}`);
    return {
      data: raw.data.map(mapApiOrder),
      pagination: raw.meta,
    };
  },

  async getById(orderId: string): Promise<Order> {
    const raw = await apiClient.get<Record<string, unknown>>(`/orders/${orderId}`);
    return mapApiOrder(raw);
  },

  async getActive(): Promise<Order[]> {
    const raw = await apiClient.get<Record<string, unknown>[]>('/orders/active');
    return raw.map(mapApiOrder);
  },

  async updateStatus(orderId: string, status: OrderStatus, opts?: { skipAutoInvoice?: boolean }): Promise<Order> {
    // Backend uses UPPERCASE enums
    const statusMap: Record<string, string> = { payment_pending: 'PAYMENT_PENDING' };
    const backendStatus = statusMap[status] || status.toUpperCase();
    const raw = await apiClient.patch<Record<string, unknown>>(`/orders/${orderId}/status`, {
      status: backendStatus,
      ...(opts?.skipAutoInvoice ? { skipAutoInvoice: true } : {}),
    });
    return mapApiOrder(raw);
  },

  /** Kitchen Display marks food as ready (sets preparedAt, no status change) */
  async markKitchenReady(orderId: string): Promise<{ orderId: string }> {
    return apiClient.patch<{ orderId: string }>(`/orders/${orderId}/kitchen-ready`, {});
  },

  /** Kitchen Display marks a single item as ready */
  async markItemKitchenReady(orderId: string, itemId: string): Promise<{ orderId: string; itemId: string; allItemsReady: boolean }> {
    return apiClient.patch<{ orderId: string; itemId: string; allItemsReady: boolean }>(`/orders/${orderId}/items/${itemId}/kitchen-ready`, {});
  },

  async cancel(orderId: string, reason?: string): Promise<Order> {
    const raw = await apiClient.patch<Record<string, unknown>>(`/orders/${orderId}/cancel`, { reason });
    return mapApiOrder(raw);
  },

  async createOrder(data: {
    tableId?: string;
    items: Array<{ menuItemId: string; quantity: number; notes?: string; modifiers?: Array<{ modifierId: string }> }>;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
  }): Promise<Order> {
    const raw = await apiClient.post<Record<string, unknown>>('/orders/cashier', data);
    return mapApiOrder(raw);
  },

  /** QSR order — created directly as COMPLETED (pre-paid at counter) */
  async createQSROrder(data: {
    items: Array<{ menuItemId: string; quantity: number; notes?: string; modifiers?: Array<{ modifierId: string }> }>;
    tableId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    serviceType?: string;
  }): Promise<Order> {
    const raw = await apiClient.post<Record<string, unknown>>('/orders/qsr', data);
    return mapApiOrder(raw);
  },

  /**
   * Download orders as CSV file.
   * Uses raw fetch so we can handle the blob/file download.
   */
  async downloadCsv(dateFrom?: string, dateTo?: string): Promise<void> {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const token = (await import('../state/authStore')).useAuthStore.getState().accessToken;
    const baseUrl = apiClient.baseUrl;

    const res = await fetch(`${baseUrl}/orders/export/csv?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Failed to download report');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${dateFrom || 'all'}_to_${dateTo || 'now'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * Send bill via WhatsApp for takeaway orders
   */
  async sendWhatsAppBill(orderIds: string[]): Promise<{ sent: boolean; phone?: string }> {
    return apiClient.post<{ sent: boolean; phone?: string }>(
      `/orders/${orderIds.join(',')}/whatsapp-bill`, {},
    );
  },
};
