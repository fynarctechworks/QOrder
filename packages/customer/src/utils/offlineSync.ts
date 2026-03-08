import { getQueuedOrders, removeQueuedOrder, updateQueuedOrder } from './offlineDb';
import { apiClient } from '../services/apiClient';

const MAX_RETRIES = 3;

/**
 * Attempt to sync all queued offline orders to the server.
 * Called when the app detects it's back online.
 */
export async function syncOfflineOrders(): Promise<{ synced: number; failed: number }> {
  const orders = await getQueuedOrders();
  let synced = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await apiClient.post(`/restaurants/${order.restaurantSlug}/orders`, order.payload);
      await removeQueuedOrder(order.id!);
      synced++;
    } catch {
      order.retries++;
      if (order.retries >= MAX_RETRIES) {
        await removeQueuedOrder(order.id!);
        failed++;
      } else {
        await updateQueuedOrder(order);
      }
    }
  }

  return { synced, failed };
}
