import { apiClient } from './apiClient';

// ─── Types ──────────────────────────────────────────────────

export interface GroupOrder {
  id: string;
  code: string;
  status: 'OPEN' | 'LOCKED' | 'SUBMITTED' | 'EXPIRED' | 'CANCELLED';
  hostName: string;
  hostPhone?: string;
  expiresAt: string;
  restaurantId: string;
  tableId?: string;
  orderId?: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    taxRate: number;
    geoFenceEnabled?: boolean;
  };
  table?: {
    id: string;
    number: string;
    name: string;
  } | null;
  participants: GroupParticipant[];
}

export interface GroupParticipant {
  id: string;
  name: string;
  phone?: string;
  isHost: boolean;
  isReady: boolean;
  joinedAt: string;
  cartItems: GroupCartItem[];
}

export interface GroupCartItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  modifiers: any[];
  menuItem: {
    id: string;
    name: string;
    price: number;
    discountPrice?: number;
    image?: string;
    dietType?: string | null;
  };
}

// ─── Service ────────────────────────────────────────────────

export const groupOrderService = {
  /** Create a new group order (host). */
  async create(
    data: {
      restaurantId: string;
      tableId?: string;
      sessionToken?: string;
      hostName: string;
      hostPhone?: string;
    },
    coords?: { latitude: number; longitude: number } | null,
  ): Promise<GroupOrder> {
    return apiClient.post<GroupOrder>('/public/group', {
      ...data,
      ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
    });
  },

  /** Get group order by code. */
  async getByCode(code: string): Promise<GroupOrder> {
    return apiClient.get<GroupOrder>(`/public/group/${code.toUpperCase()}`);
  },

  /** Join a group order. */
  async join(code: string, data: { name: string; phone?: string }, coords?: { latitude: number; longitude: number } | null): Promise<GroupParticipant> {
    return apiClient.post<GroupParticipant>(`/public/group/${code.toUpperCase()}/join`, {
      ...data,
      ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
    });
  },

  /** Add item to participant's cart. */
  async addCartItem(
    code: string,
    participantId: string,
    data: {
      menuItemId: string;
      quantity: number;
      notes?: string;
      modifiers?: { modifierId: string }[];
    },
  ): Promise<GroupCartItem> {
    return apiClient.post<GroupCartItem>(
      `/public/group/${code}/participants/${participantId}/cart`,
      data,
    );
  },

  /** Update a cart item quantity. */
  async updateCartItem(
    code: string,
    participantId: string,
    itemId: string,
    data: { quantity: number },
  ): Promise<GroupCartItem> {
    return apiClient.patch<GroupCartItem>(
      `/public/group/${code}/participants/${participantId}/cart/${itemId}`,
      data,
    );
  },

  /** Remove a cart item. */
  async removeCartItem(code: string, participantId: string, itemId: string): Promise<void> {
    return apiClient.delete<void>(
      `/public/group/${code}/participants/${participantId}/cart/${itemId}`,
    );
  },

  /** Mark participant as ready. */
  async markReady(code: string, participantId: string): Promise<GroupParticipant> {
    return apiClient.post<GroupParticipant>(
      `/public/group/${code}/participants/${participantId}/ready`,
    );
  },

  /** Submit the group order (host only). */
  async submit(
    code: string,
    participantId: string,
    coords?: { latitude: number; longitude: number } | null,
  ): Promise<{ groupOrder: GroupOrder; order: any; newSessionToken?: string }> {
    return apiClient.post<{ groupOrder: GroupOrder; order: any; newSessionToken?: string }>(
      `/public/group/${code}/submit`,
      {
        participantId,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      },
    );
  },

  /** Cancel the group order (host only). */
  async cancel(code: string, participantId: string): Promise<void> {
    return apiClient.post<void>(
      `/public/group/${code}/cancel`,
      { participantId },
    );
  },
};
