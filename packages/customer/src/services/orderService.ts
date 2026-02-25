import { apiClient } from './apiClient';
import type { Order, CartItem } from '../types';

interface CreateOrderRequest {
  tableId: string;
  items: OrderItemRequest[];
  notes?: string;
  customerName?: string;
  customerPhone?: string;
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
    _idempotencyKey: string,
    slug?: string,
    customerName?: string,
    customerPhone?: string
  ): Promise<Order> {
    const items: OrderItemRequest[] = cartItems.map((item) => ({
      menuItemId: item.menuItem.id,
      quantity: item.quantity,
      notes: item.specialInstructions || undefined,
      modifiers: item.selectedCustomizations.flatMap((c) =>
        c.options.map((o) => ({ modifierId: o.id }))
      ),
    }));

    const request: CreateOrderRequest = {
      tableId,
      items,
      notes: specialInstructions || undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
    };

    // Use the public route with restaurant slug
    const restaurantSlug = slug || localStorage.getItem('lastRestaurantSlug') || '';
    return apiClient.post<Order>(`/public/r/${restaurantSlug}/orders`, request);
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
