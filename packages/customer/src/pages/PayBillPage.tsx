import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useRestaurant } from '../context/RestaurantContext';
import { useSocket } from '../context/SocketContext';
import { orderService } from '../services/orderService';
import { formatPrice as fmtPrice } from '../utils/formatPrice';

export default function PayBillPage() {
  const navigate = useNavigate();
  const { restaurantSlug, tableId } = useParams<{ restaurantSlug: string; tableId: string }>();
  const { restaurant, table } = useRestaurant();
  const { joinTableRoom, leaveTableRoom, requestPayment, onPaymentAcknowledged } = useSocket();

  const [requestStatus, setRequestStatus] = useState<'idle' | 'requested' | 'acknowledged'>(() => {
    try {
      const saved = sessionStorage.getItem(`pay_status_${tableId}`);
      if (saved === 'requested' || saved === 'acknowledged') return saved;
    } catch {}
    return 'idle';
  });

  // Persist requestStatus so refresh keeps it
  useEffect(() => {
    if (tableId) {
      sessionStorage.setItem(`pay_status_${tableId}`, requestStatus);
    }
  }, [requestStatus, tableId]);

  // Join table room so we can receive payment acknowledgement
  useEffect(() => {
    if (tableId) {
      joinTableRoom(tableId);
      return () => leaveTableRoom(tableId);
    }
  }, [tableId, joinTableRoom, leaveTableRoom]);

  // Listen for payment acknowledgement from admin
  useEffect(() => {
    const unsub = onPaymentAcknowledged((data) => {
      if (data.tableId === tableId) {
        setRequestStatus('acknowledged');
      }
    });
    return unsub;
  }, [tableId, onPaymentAcknowledged]);

  // Fetch all orders for this table
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', tableId],
    queryFn: () => orderService.getByTable(restaurant?.id || '', tableId!),
    enabled: !!tableId && !!restaurant,
    refetchInterval: 10_000, // Poll every 10s
  });

  // Calculate totals only from payment_pending orders
  const completedOrders = orders.filter(order => 
    ['payment_pending'].includes(order.status)
  );

  // Reset payment request status when new orders appear that need payment
  useEffect(() => {
    if (requestStatus === 'acknowledged' && completedOrders.length > 0) {
      setRequestStatus('idle');
    }
  }, [completedOrders.length, requestStatus]);

  // Use order.subtotal and order.tax from the API (order.total already includes tax)
  const subtotal = completedOrders.reduce((sum, order) => sum + order.subtotal, 0);
  const tax = completedOrders.reduce((sum, order) => sum + order.tax, 0);
  const total = completedOrders.reduce((sum, order) => sum + order.total, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ─── Sticky header ─── */}
      <header className="sticky top-0 z-50 safe-top">
        <div className="bg-primary">
          <div className="px-5 pt-4 pb-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 font-medium tracking-wide uppercase">Pay Bill</p>
              <h1 className="text-lg font-extrabold text-white tracking-tight truncate" style={{ fontFamily: "'Modern Negra', serif" }}>
                {restaurant?.name || 'Q Order'}
              </h1>
              {table && (
                <p className="text-sm text-white/70 font-medium">
                  Table {table.number}
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
            </button>
          </div>
        </div>
      </header>

      {/* ─── Content ─── */}
      <div className="px-5 pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* Bill summary */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Bill Summary</h2>
              
              {completedOrders.length === 0 ? (
                <div className="py-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-gray-500">No completed orders yet</p>
                  <p className="text-sm text-gray-400 mt-1">Place an order to see your bill here</p>
                </div>
              ) : (
                <>
                  {/* Orders list */}
                  <div className="space-y-3 mb-4">
                    {completedOrders.map((order) => (
                      <div key={order.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            Order #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">
                          {fmtPrice(order.total, restaurant?.currency || 'USD')}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="pt-4 border-t-2 border-gray-200 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="font-medium text-gray-900">
                        {fmtPrice(subtotal, restaurant?.currency || 'USD')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Tax</span>
                      <span className="font-medium text-gray-900">
                        {fmtPrice(tax, restaurant?.currency || 'USD')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="text-base font-bold text-gray-900">Total</span>
                      <span className="text-xl font-bold text-primary">
                        {fmtPrice(total, restaurant?.currency || 'USD')}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Payment button */}
            {completedOrders.length > 0 && (
              <>
                {requestStatus === 'idle' ? (
                  <button
                    onClick={() => {
                      if (restaurant && tableId && table) {
                        requestPayment({
                          restaurantId: restaurant.id,
                          tableId,
                          tableNumber: table.number,
                          total,
                          orderCount: completedOrders.length,
                          requestedAt: new Date().toISOString(),
                        });
                        setRequestStatus('requested');
                      }
                    }}
                    className="w-full mt-6 py-4 bg-primary text-white font-semibold rounded-2xl shadow-lg transition-all active:opacity-80"
                  >
                    Request Payment
                  </button>
                ) : requestStatus === 'requested' ? (
                  <div className="w-full mt-6 py-4 bg-amber-50 border-2 border-amber-200 rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <svg className="w-5 h-5 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-amber-700 font-bold text-base">Payment requested</span>
                    </div>
                    <p className="text-amber-600 text-xs">Waiting for staff acknowledgement…</p>
                  </div>
                ) : (
                  <div className="w-full mt-6 py-4 bg-green-50 border-2 border-green-200 rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-700 font-bold text-base">Waiter is coming shortly</span>
                    </div>
                    <p className="text-green-600 text-xs">Please wait at your table</p>
                  </div>
                )}
              </>
            )}

            {/* Help text */}
            <p className="text-center text-xs text-gray-500 mt-4 px-4">
              Click "Request Payment" to notify the staff. You can pay at the counter or request a card machine at your table.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
