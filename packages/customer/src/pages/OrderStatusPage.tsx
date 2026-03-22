import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../context/SocketContext';
import { orderService } from '../services/orderService';
import { formatPrice } from '../utils/formatPrice';
import { sanitize } from '../utils/sanitize';

/* ─── helpers ─── */
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function OrderStatusPage() {
  const { t } = useTranslation();
  const currency = useMemo(() => localStorage.getItem('lastRestaurantCurrency') || 'INR', []);
  const fmtPrice = useCallback((p: number) => formatPrice(p, currency), [currency]);
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { joinOrderRoom, leaveOrderRoom, onOrderStatusUpdate } = useSocket();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Check if user came from orders page
  const isFromOrdersPage = localStorage.getItem('orderStatusReferrer') === 'orders';

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => orderService.getById(orderId!),
    enabled: !!orderId,
    staleTime: 0,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (orderId) {
      joinOrderRoom(orderId);
      return () => leaveOrderRoom(orderId);
    }
  }, [orderId, joinOrderRoom, leaveOrderRoom]);

  useEffect(() => {
    const unsubscribe = onOrderStatusUpdate((update) => {
      if (update.orderId === orderId) {
        // Optimistically patch the status in cache for instant UI update
        queryClient.setQueryData(['order', orderId], (prev: typeof order) => {
          if (!prev) return prev;
          return { ...prev, status: update.status };
        });
        // Background refetch for full consistency
        refetch();
      }
    });
    return unsubscribe;
  }, [orderId, onOrderStatusUpdate, refetch, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: () => orderService.cancel(orderId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      setShowCancelConfirm(false);
    },
  });

  const goBack = () => {
    const slug = localStorage.getItem('lastRestaurantSlug');
    const table = localStorage.getItem('lastTableId');
    const referrer = localStorage.getItem('orderStatusReferrer');
    
    // Clear the referrer after reading it
    localStorage.removeItem('orderStatusReferrer');

    // Invalidate table cache so session token is refreshed (it rotates after order completion)
    queryClient.invalidateQueries({ queryKey: ['table'] });
    
    if (slug && table) {
      if (referrer === 'orders') {
        // Go back to orders page
        navigate(`/r/${slug}/t/${table}/orders`);
      } else {
        // Go back to menu page (default for cart or direct navigation)
        navigate(`/r/${slug}/t/${table}/menu`);
      }
    } else {
      navigate('/');
    }
  };

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 safe-top">
          <div className="bg-primary">
            <div className="px-5 pt-4 pb-4 flex items-center justify-center relative">
              <div className="absolute left-5 w-10 h-10 rounded-full bg-white/20 animate-pulse" />
              <h1 className="text-lg font-bold text-white">{t('orderStatus.title')}</h1>
            </div>
          </div>
        </header>
        <div className="p-4 space-y-3">
          <div className="bg-white rounded-2xl p-6 space-y-4">
            <div className="h-20 w-20 mx-auto rounded-full bg-gray-100 animate-pulse" />
            <div className="h-6 w-48 mx-auto bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-32 mx-auto bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="bg-white rounded-2xl p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Error ─── */
  if (error || !order) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 safe-top">
          <div className="bg-primary">
            <div className="px-5 pt-4 pb-4 flex items-center justify-center relative">
              <button
                onClick={goBack}
                className="absolute left-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/15 transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-bold text-white">{t('orderStatus.title')}</h1>
            </div>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center px-8 pt-24">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <svg className="w-10 h-10 text-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{t('orderStatus.orderNotFound')}</h2>
          <p className="text-sm text-gray-500 text-center max-w-[260px]">
            {t('orderStatus.orderNotFoundDesc')}
          </p>
        </div>
      </div>
    );
  }

  const isCompleted = order.status === 'completed';
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* ─── Sticky header ─── */}
      <header className="sticky top-0 z-50 safe-top">
        <div className="bg-primary">
          <div className="px-5 pt-4 pb-4 flex items-center justify-center relative">
            <button
              onClick={goBack}
              className="absolute left-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/15 transition-colors"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-white">{t('orderStatus.title')}</h1>
          </div>
        </div>
      </header>

      <div className="pt-4 lg:px-8">
        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* ═══ Left column ═══ */}
          <div className="flex-1 min-w-0">
            {/* ── Hero status card ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-6 text-center">
                {/* Status icon */}
                <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  isCompleted ? 'bg-green-50' : isCancelled ? 'bg-primary/10' : 'bg-orange-50'
                }`}>
                  {isCompleted ? (
                    <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isCancelled ? (
                    <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <svg className="w-10 h-10 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </motion.div>
                  )}
                </div>

                <h1 className="text-xl font-bold text-gray-900 mb-1">
                  {isCompleted ? t('orderStatus.orderComplete') : isCancelled ? t('orderStatus.orderCancelled') : t('orderStatus.orderInProgress')}
                </h1>

                <p className="text-sm text-gray-400">
                  Order #{order.id.slice(-8).toUpperCase()}
                </p>

                {order.estimatedReadyTime && !isCompleted && !isCancelled && (
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 text-sm font-medium px-3 py-1.5 rounded-full">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t('orderStatus.readyBy', { time: fmtTime(order.estimatedReadyTime) })}
                  </div>
                )}
              </div>
            </motion.div>

            {/* ── Order items ── */}
            <OrderItemsSection items={order.items} fmtPrice={fmtPrice} />

            {/* ── Bill details ── */}
            <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3.5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  {t('orderStatus.billDetails')}
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('orderStatus.itemTotal')}</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('orderStatus.taxesCharges')}</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(order.tax)}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2.5 flex justify-between">
                    <span className="text-sm font-bold text-gray-900">{t('orderStatus.toPay')}</span>
                    <span className="text-sm font-bold text-gray-900">{fmtPrice(order.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Order info strip ── */}
            <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t('orderStatus.orderedAt')}</p>
                  <p className="text-xs text-gray-400">{fmtDate(order.createdAt)}</p>
                </div>
              </div>
            </div>

            {order.specialInstructions && (
              <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t('cart.specialInstructions')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sanitize(order.specialInstructions)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Cancel order ── */}
            {(order.status === 'pending' || (isFromOrdersPage && !['cancelled', 'completed'].includes(order.status))) && (
              <div className="mt-3 mx-4 lg:mx-0">
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={cancelMutation.isPending}
                  className="w-full py-3 rounded-2xl border-2 border-primary/30 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {cancelMutation.isPending ? t('orderStatus.cancelling') : t('orderStatus.cancelOrder')}
                </button>
              </div>
            )}

            {/* ── Cancel confirmation modal ── */}
            {showCancelConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
                >
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{t('orderStatus.cancelConfirm')}</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    {t('orderStatus.cancelWarning')}
                  </p>
                  {cancelMutation.isError && (
                    <p className="text-sm text-primary mb-4">
                      {cancelMutation.error instanceof Error
                        ? cancelMutation.error.message
                        : t('orderStatus.cancelFailed')}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
                    >
                      {t('orderStatus.keepOrder')}
                    </button>
                    <button
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="flex-1 py-2.5 rounded-xl bg-primary/100 text-white font-medium text-sm disabled:opacity-50"
                    >
                      {cancelMutation.isPending ? t('orderStatus.cancelling') : t('orderStatus.yesCancel')}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </div>

          {/* ═══ Right column — desktop only ═══ */}
          <div className="hidden lg:block w-[380px] flex-shrink-0">
            <div className="sticky top-[80px] space-y-4">
              {/* Summary card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="text-center mb-4">
                  <div className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${
                    isCompleted ? 'bg-green-50' : isCancelled ? 'bg-primary/10' : 'bg-orange-50'
                  }`}>
                    {isCompleted ? (
                      <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isCancelled ? (
                      <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                        <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </motion.div>
                    )}
                  </div>
                  <h2 className="font-bold text-gray-900">
                    {isCompleted ? t('orderStatus.orderComplete') : isCancelled ? t('orderStatus.orderCancelled') : t('orderStatus.inProgress')}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">#{order.id.slice(-8).toUpperCase()}</p>
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('orderStatus.items')}</span>
                    <span className="text-gray-900 font-medium">{order.items.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('cart.subtotal')}</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('orderStatus.taxes')}</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(order.tax)}</span>
                  </div>
                </div>

                <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">{t('cart.total')}</span>
                  <span className="text-lg font-bold text-gray-900">{fmtPrice(order.total)}</span>
                </div>
              </div>

              {order.estimatedReadyTime && !isCompleted && !isCancelled && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t('orderStatus.estimatedReady')}</p>
                    <p className="text-xs text-gray-400">{fmtTime(order.estimatedReadyTime)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper: parse "[Name]" prefix from item notes ─── */
function parseParticipant(instructions?: string): { name: string | null; notes: string | null } {
  if (!instructions) return { name: null, notes: null };
  const match = instructions.match(/^\[(.+?)\]\s*(.*)?$/);
  if (match) {
    return { name: match[1] ?? null, notes: match[2]?.trim() || null };
  }
  return { name: null, notes: instructions };
}

/* ─── Order Items Section — groups by participant for group orders ─── */
function OrderItemsSection({
  items,
  fmtPrice,
}: {
  items: import('../types').OrderItem[];
  fmtPrice: (p: number) => string;
}) {
  const { t } = useTranslation();
  // Check if this is a group order (items have [Name] prefixed notes)
  const parsed = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        ...parseParticipant(item.specialInstructions),
      })),
    [items],
  );

  const isGroupOrder = parsed.some((p) => p.name !== null);

  // Group items by participant name
  const grouped = useMemo(() => {
    if (!isGroupOrder) return null;
    const map = new Map<string, typeof parsed>();
    for (const item of parsed) {
      const key = item.name || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [isGroupOrder, parsed]);

  const renderItem = (item: (typeof parsed)[number]) => (
    <div key={item.id} className="flex items-start justify-between px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 w-5 h-5 bg-gray-100 rounded text-xs font-bold text-gray-600 flex items-center justify-center">
            {item.quantity}
          </span>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {item.menuItemName}
          </p>
        </div>
        {item.customizations.length > 0 && (
          <p className="text-xs text-gray-400 mt-0.5 ml-7 truncate">
            {item.customizations
              .map((c) => c.options.map((o) => o.name).join(', '))
              .join(' · ')}
          </p>
        )}
        {item.notes && (
          <p className="text-xs text-gray-400 mt-0.5 ml-7 italic truncate">{item.notes}</p>
        )}
      </div>
      <span className="text-sm font-medium text-gray-900 flex-shrink-0 ml-3">
        {fmtPrice(item.totalPrice)}
      </span>
    </div>
  );

  return (
    <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {t('orderStatus.orderItems')}
        </h3>
      </div>
      {grouped ? (
        /* Group order: show items grouped by participant */
        <div>
          {[...grouped.entries()].map(([name, groupItems]) => (
            <div key={name}>
              <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-primary uppercase tracking-wide">{name}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {groupItems.map(renderItem)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Regular order: flat list */
        <div className="divide-y divide-gray-50">
          {parsed.map(renderItem)}
        </div>
      )}
    </div>
  );
}
