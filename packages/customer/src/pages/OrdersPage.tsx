import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRestaurant } from '../context/RestaurantContext';
import { useSocket } from '../context/SocketContext';
import { useCartStore, selectTotalItems } from '../state/cartStore';
import { orderService } from '../services/orderService';
import { formatPrice } from '../utils/formatPrice';
import type { OrderStatus } from '../types';
import { useTranslation } from 'react-i18next';

const getStatusConfig = (status: OrderStatus) => {
  switch (status) {
    case 'pending':
      return {
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        ),
        labelKey: 'orders.statusLabel.pending',
      };
    case 'preparing':
      return {
        bg: 'bg-yellow-50',
        text: 'text-yellow-700',
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
            <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
            <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
          </svg>
        ),
        labelKey: 'orders.statusLabel.preparing',
      };
    case 'payment_pending':
      return {
        bg: 'bg-green-50',
        text: 'text-green-700',
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
          </svg>
        ),
        labelKey: 'orders.statusLabel.payment_pending',
      };
    case 'completed':
      return {
        bg: 'bg-primary/10',
        text: 'text-primary',
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ),
        labelKey: 'orders.statusLabel.completed',
      };
    case 'cancelled':
      return {
        bg: 'bg-red-50',
        text: 'text-red-600',
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        ),
        labelKey: 'orders.statusLabel.cancelled',
      };
    default:
      return {
        bg: 'bg-gray-50',
        text: 'text-gray-600',
        icon: null,
        labelKey: status,
      };
  }
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  
  if (isToday) {
    return `Today, ${date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    })}`;
  }
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function OrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { restaurantSlug, tableId } = useParams<{ restaurantSlug: string; tableId: string }>();
  const { restaurant, table, isLoading: isContextLoading } = useRestaurant();
  const totalCartItems = useCartStore(selectTotalItems);
  const { onOrderStatusUpdate, onTableUpdated, joinTableRoom, leaveTableRoom } = useSocket();
  const queryClient = useQueryClient();

  // Join the table socket room so we receive order:statusUpdate & table:updated events
  useEffect(() => {
    if (!table?.id) return;
    joinTableRoom(table.id);
    return () => leaveTableRoom(table.id);
  }, [table?.id, joinTableRoom, leaveTableRoom]);

  const { data: orders = [], isLoading: isOrdersLoading } = useQuery({
    queryKey: ['orders', restaurant?.id, table?.id],
    queryFn: () => orderService.getByTable(restaurant!.id, table!.id),
    enabled: !!restaurant?.id && !!table?.id,
    staleTime: 0,
    refetchInterval: 15000,
  });

  // Optimistically patch order status in cache from socket events —
  // this avoids a full server round-trip and makes the UI update instantly.
  useEffect(() => {
    const unsub1 = onOrderStatusUpdate((update) => {
      const qk = ['orders', restaurant?.id, table?.id];

      queryClient.setQueryData<typeof orders>(qk, (prev) => {
        if (!prev) return prev;

        // If order completed/cancelled, remove it immediately
        if (['completed', 'cancelled'].includes(update.status)) {
          const filtered = prev.filter((o) => o.id !== update.orderId);
          // If we removed something, return the new list
          if (filtered.length !== prev.length) return filtered;
        }

        // Otherwise update the status in-place
        return prev.map((o) =>
          o.id === update.orderId ? { ...o, status: update.status } : o
        );
      });

      // Also do a background refetch for consistency
      queryClient.invalidateQueries({ queryKey: qk });
    });

    const unsub2 = onTableUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['orders', restaurant?.id, table?.id] });
    });

    return () => { unsub1(); unsub2(); };
  }, [onOrderStatusUpdate, onTableUpdated, queryClient, restaurant?.id, table?.id]);

  const isLoading = isContextLoading || isOrdersLoading;

  // Only show active (non-completed/cancelled) orders to the customer.
  // Completed orders belong to a closed session and should not be visible
  // to the next person who scans the QR code.
  const activeOrders = orders.filter((order) => 
    !['cancelled', 'completed'].includes(order.status)
  );

  const handleOrderClick = (orderId: string) => {
    localStorage.setItem('orderStatusReferrer', 'orders');
    navigate(`/order-status/${orderId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header Skeleton */}
        <header className="sticky top-0 z-50 safe-top">
          <div className="bg-primary">
            <div className="px-5 pt-4 pb-4">
              <div className="h-3 w-24 bg-white/20 rounded animate-pulse mb-2" />
              <div className="h-5 w-40 bg-white/20 rounded animate-pulse mb-1" />
              <div className="h-4 w-20 bg-white/20 rounded animate-pulse" />
            </div>
          </div>
        </header>
        
        {/* Content Skeleton */}
        <div className="px-5 pt-6 space-y-6">
          {/* Active Orders Skeleton */}
          <div>
            <div className="h-5 w-28 rounded bg-gray-100 animate-pulse mb-3" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                    <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                  </div>
                  <div className="h-4 w-full rounded bg-gray-100 animate-pulse mb-2" />
                  <div className="h-4 w-3/4 rounded bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 safe-top">
        <div className="bg-primary">
          <div className="px-5 pt-4 pb-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 font-medium tracking-wide uppercase">{t('orders.title')}</p>
              <h1 className="text-lg font-extrabold text-white tracking-tight truncate" style={{ fontFamily: "'Modern Negra', serif" }}>
                {restaurant?.name || 'Restaurant'}
              </h1>
              {table && (
                <p className="text-sm text-white/70 font-medium">
                  {t('menu.table', { number: table.number })}
                </p>
              )}
            </div>

            {/* Cart icon */}
            <button
              onClick={() => navigate(`/r/${restaurantSlug}/t/${tableId}/cart`)}
              className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/15 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {totalCartItems > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-white text-primary text-[10px] font-bold rounded-full px-1">
                  {totalCartItems > 99 ? '99+' : totalCartItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-5 pt-6 pb-24">
        {activeOrders.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('orders.title')}</h2>
            <div className="py-8 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-gray-500">{t('orders.noOrders')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('orders.noOrdersSubtext')}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{t('orders.activeOrders')}</h2>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
                {activeOrders.length}
              </span>
            </div>
            <div className="space-y-3">
              {activeOrders.map((order) => {
                const statusConfig = getStatusConfig(order.status);
                return (
                  <button
                    key={order.id}
                    onClick={() => handleOrderClick(order.id)}
                    className="w-full p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] text-left"
                  >
                    {/* Status Row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig.bg}`}>
                        <span className={statusConfig.text}>
                          {statusConfig.icon}
                        </span>
                        <span className={`text-xs font-bold ${statusConfig.text}`}>
                          {t(statusConfig.labelKey)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 font-medium">
                        {formatDateTime(order.createdAt)}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-gray-900 mb-0.5">
                        {t('orders.item', { count: order.items.length })}
                      </p>
                      <p className="text-xs text-gray-500 line-clamp-1">
                        {order.items.map((item) => `${item.quantity}x ${item.menuItemName}`).join(', ')}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-base font-bold text-gray-900">
                        {formatPrice(order.total, restaurant?.currency || 'USD')}
                      </span>
                      <div className="flex items-center gap-1 text-primary">
                        <span className="text-xs font-semibold">{t('orders.viewDetails')}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
