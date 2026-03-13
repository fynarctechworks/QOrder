import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRestaurant } from '../context/RestaurantContext';
import { useSocket } from '../context/SocketContext';
import { useCartStore, selectTotalItems } from '../state/cartStore';
import { orderService } from '../services/orderService';
import { featureService } from '../services/featureService';
import { formatPrice } from '../utils/formatPrice';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import WaiterCallPanel from '../components/WaiterCallPanel';

export default function PayBillPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { restaurantSlug, tableId } = useParams<{ restaurantSlug: string; tableId: string }>();
  const { restaurant, table, isLoading: isContextLoading } = useRestaurant();
  const totalCartItems = useCartStore(selectTotalItems);
  const { onOrderStatusUpdate, onTableUpdated, joinTableRoom, leaveTableRoom } = useSocket();
  const queryClient = useQueryClient();
  const [paymentRequested, setPaymentRequested] = useState(false);

  // Join the table socket room for real-time updates
  useEffect(() => {
    if (!table?.id) return;
    joinTableRoom(table.id);
    return () => leaveTableRoom(table.id);
  }, [table?.id, joinTableRoom, leaveTableRoom]);

  // Fetch orders for bill
  const { data: orders = [], isLoading: isOrdersLoading } = useQuery({
    queryKey: ['orders', restaurant?.id, table?.id],
    queryFn: () => orderService.getByTable(restaurant!.id, table!.id),
    enabled: !!restaurant?.id && !!table?.id,
    staleTime: 0,
    refetchInterval: 15000,
  });

  // Real-time order updates
  useEffect(() => {
    const unsub1 = onOrderStatusUpdate((update) => {
      const qk = ['orders', restaurant?.id, table?.id];
      queryClient.setQueryData<typeof orders>(qk, (prev) => {
        if (!prev) return prev;
        if (['completed', 'cancelled'].includes(update.status)) {
          return prev.filter((o) => o.id !== update.orderId);
        }
        return prev.map((o) =>
          o.id === update.orderId ? { ...o, status: update.status } : o
        );
      });
      queryClient.invalidateQueries({ queryKey: qk });
    });

    const unsub2 = onTableUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['orders', restaurant?.id, table?.id] });
    });

    return () => { unsub1(); unsub2(); };
  }, [onOrderStatusUpdate, onTableUpdated, queryClient, restaurant?.id, table?.id]);

  // Request payment mutation
  const requestPaymentMut = useMutation({
    mutationFn: () => {
      if (!restaurant?.id || !table?.id) throw new Error('Missing context');
      return featureService.createServiceRequest(restaurant.id, table.id, 'BILL');
    },
    onSuccess: () => {
      setPaymentRequested(true);
      toast.success(t('payment.paymentRequested'));
    },
    onError: () => toast.error(t('common.error')),
  });

  const isLoading = isContextLoading || isOrdersLoading;
  const currency = restaurant?.currency || 'INR';

  // Active orders (non-completed/cancelled)
  const activeOrders = orders.filter((order) =>
    !['cancelled', 'completed'].includes(order.status)
  );

  // Aggregate bill
  const billSubtotal = activeOrders.reduce((sum, o) => sum + o.subtotal, 0);
  const billTax = activeOrders.reduce((sum, o) => sum + o.tax, 0);
  const billTotal = activeOrders.reduce((sum, o) => sum + o.total, 0);
  const allItems = activeOrders.flatMap((o) => o.items);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 safe-top">
          <div className="bg-primary">
            <div className="px-5 pt-4 pb-4">
              <div className="h-3 w-24 bg-white/20 rounded animate-pulse mb-2" />
              <div className="h-5 w-40 bg-white/20 rounded animate-pulse mb-1" />
              <div className="h-4 w-20 bg-white/20 rounded animate-pulse" />
            </div>
          </div>
        </header>
        <div className="px-5 pt-6 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="h-5 w-28 rounded bg-gray-100 animate-pulse mb-4" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between py-2">
                <div className="h-4 w-40 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 safe-top">
        <div className="bg-primary">
          <div className="px-5 pt-4 pb-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 font-medium tracking-wide uppercase">{t('payment.title')}</p>
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
          <>
          {/* Empty State */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('payment.title')}</h2>
            <div className="py-8 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 1a1 1 0 100 2 1 1 0 000-2z" />
              </svg>
              <p className="text-gray-500">{t('payment.noCompletedOrders')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('payment.noCompletedOrdersSubtext')}</p>
            </div>
          </div>

          {/* Service Request Buttons */}
          <WaiterCallPanel />
          </>
        ) : (
          <div className="space-y-4">
            {/* Bill Items */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t('payment.title')}</h2>

              <div className="divide-y divide-gray-100">
                {allItems.map((item, i) => (
                  <div key={`${item.id}-${i}`} className="py-3 flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.quantity}x {item.menuItemName}
                      </p>
                      {item.customizations?.length > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {item.customizations.flatMap((g) => g.options.map((o) => o.name)).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                      {formatPrice(item.totalPrice, currency)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 mt-2 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('orderStatus.itemTotal')}</span>
                  <span className="text-gray-900">{formatPrice(billSubtotal, currency)}</span>
                </div>
                {billTax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('orderStatus.taxesCharges')}</span>
                    <span className="text-gray-900">{formatPrice(billTax, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="text-base font-bold text-gray-900">{t('orderStatus.toPay')}</span>
                  <span className="text-base font-bold text-primary">{formatPrice(billTotal, currency)}</span>
                </div>
              </div>
            </div>

            {/* Service Request Buttons */}
            <WaiterCallPanel />

            {/* Payment Action */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              {paymentRequested ? (
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-3">
                    <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{t('payment.paymentRequested')}</h3>
                  <p className="text-sm text-gray-500 mt-1">{t('payment.waiterComing')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t('payment.pleaseWait')}</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 text-center mb-4">{t('payment.helpTextManual')}</p>
                  <button
                    onClick={() => requestPaymentMut.mutate()}
                    disabled={requestPaymentMut.isPending}
                    className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-base"
                  >
                    {requestPaymentMut.isPending ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 1a1 1 0 100 2 1 1 0 000-2z" />
                        </svg>
                        {t('payment.requestPayment')}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
