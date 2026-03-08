import { apiClient } from './apiClient';
import { queueOrder } from '../utils/offlineDb';
import type { Order, CartItem } from '../types';

interface CreateOrderRequest {
  tableId: string;
  sessionToken?: string;
  items: OrderItemRequest[];
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  couponCode?: string;
  latitude?: number;
  longitude?: number;
}

interface OrderItemRequest {
  menuItemId: string;
  quantity: number;
  notes?: string;
  modifiers?: { modifierId: string }[];
}

export const orderService = {
  async create(
    _restaurantId: string,
    tableId: string,
    cartItems: CartItem[],
    specialInstructions: string | undefined,
    idempotencyKey: string,
    slug?: string,
    customerName?: string,
    customerPhone?: string,
    coords?: { latitude: number; longitude: number } | null,
    couponCode?: string,
  ): Promise<Order> {
    const items: OrderItemRequest[] = cartItems.map((item) => ({
      menuItemId: item.menuItem.id,
      quantity: item.quantity,
      notes: item.specialInstructions || undefined,
      modifiers: item.selectedCustomizations.flatMap((c) =>
        c.options.map((o) => ({ modifierId: o.id }))
      ),
    }));

    // Attach session token so the backend can verify this device actually scanned the QR
    const sessionToken = sessionStorage.getItem(`sessionToken:${tableId}`) || undefined;

    const request: CreateOrderRequest = {
      tableId,
      sessionToken,
      items,
      notes: specialInstructions || undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      couponCode: couponCode || undefined,
      ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
    };

    // Use the public route with restaurant slug
    const restaurantSlug = slug || localStorage.getItem('lastRestaurantSlug') || '';

    // If offline, queue order for later sync
    if (!navigator.onLine) {
      await queueOrder({ restaurantSlug, tableId, payload: request });
      // Return a placeholder so the UI can proceed
      return { id: `offline-${Date.now()}`, status: 'PENDING', items: [], createdAt: new Date().toISOString() } as unknown as Order;
    }

    return apiClient.post<Order>(`/public/r/${restaurantSlug}/orders`, request, {
      headers: { 'X-Idempotency-Key': idempotencyKey },
    });
  },

  async getById(orderId: string): Promise<Order> {
    return apiClient.get<Order>(`/public/orders/${orderId}/status`);
  },

  async getByTable(_restaurantId: string, tableId: string): Promise<Order[]> {
    return apiClient.get<Order[]>(`/public/tables/${tableId}/orders`);
  },

  async cancel(orderId: string): Promise<Order> {
    return apiClient.patch<Order>(`/public/orders/${orderId}/cancel`);
  },
};
