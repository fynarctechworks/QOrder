import type { OrderStatus } from '../types';

/** Map an order status to a DaisyUI badge class. */
export const getStatusColor = (status: OrderStatus): string => {
  switch (status) {
    case 'pending':
      return 'badge-warning';
    case 'preparing':
      return 'badge-info';
    case 'payment_pending':
      return 'badge-success';
    case 'completed':
      return 'badge-neutral';
    case 'cancelled':
      return 'badge-error';
    default:
      return 'badge-neutral';
  }
};
