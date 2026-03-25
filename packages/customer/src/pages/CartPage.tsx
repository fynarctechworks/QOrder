import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useRestaurant } from '../context/RestaurantContext';
import { useCartStore } from '../state/cartStore';
import { orderService } from '../services/orderService';
import { featureService } from '../services/featureService';
import { formatPrice as fmtPrice } from '../utils/formatPrice';
import type { CartItem } from '../types';
import { resolveImg } from '../utils/resolveImg';
import CustomerInfoSheet from '../components/CustomerInfoSheet';
import { useGeolocation } from '../hooks/useGeolocation';

// Default tax rate (percentage) — overridden by restaurant.taxRate when available
const DEFAULT_TAX_RATE = 0;

/* ─── Swipeable cart item card ─── */
const SWIPE_THRESHOLD = -70;

function SwipeableCartItem({
  item,
  currency,
  onQtyChange,
  onRemove,
  onImageClick,
}: {
  item: CartItem;
  currency: string;
  onQtyChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onImageClick: () => void;
}) {
  const x = useMotionValue(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOpacity = useTransform(x, [-100, -50, 0], [1, 0.6, 0]);
  const deleteScale = useTransform(x, [-100, -50, 0], [1, 0.85, 0.7]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < SWIPE_THRESHOLD) {
      // Snap to reveal delete
      x.set(-80);
    } else {
      x.set(0);
    }
  };

  const handleDelete = () => {
    setIsDeleting(true);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Delete button underneath */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center pr-4"
        style={{ opacity: deleteOpacity }}
      >
        <motion.button
          style={{ scale: deleteScale }}
          onClick={handleDelete}
          className="w-14 h-14 bg-primary rounded-xl flex items-center justify-center text-white shadow-md active:bg-primary-hover transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </motion.button>
      </motion.div>

      {/* Swipeable card */}
      <motion.div
        style={{ x: isDeleting ? undefined : x }}
        drag={isDeleting ? false : 'x'}
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={isDeleting ? { x: '-100%' } : undefined}
        transition={isDeleting ? { duration: 0.3, ease: [0.32, 0.72, 0, 1] } : undefined}
        onAnimationComplete={() => {
          if (isDeleting) onRemove(item.id);
        }}
        className="relative bg-white rounded-2xl shadow-sm border border-gray-100 mx-4 lg:mx-0 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-3 p-3">
          {/* Thumb image — left side */}
          {item.menuItem.image && (
            <div
              className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
              onClick={onImageClick}
            >
              <img
                src={resolveImg(item.menuItem.image)}
                alt={item.menuItem.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Name + price + add-ons */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 leading-snug truncate">
              {item.menuItem.name}
            </h3>

            <p className="text-sm font-bold text-gray-900 mt-0.5">
              {fmtPrice(item.totalPrice, currency)}
            </p>

            {item.selectedCustomizations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.selectedCustomizations.map((group) => (
                  <span
                    key={group.groupId}
                    className="inline-flex items-center text-[11px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5"
                  >
                    {group.options.map((o) => o.name).join(', ')}
                    {group.options.some((o) => o.priceModifier > 0) && (
                      <span className="ml-0.5 text-gray-400">
                        +{fmtPrice(group.options.reduce((s, o) => s + o.priceModifier, 0), currency)}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quantity stepper */}
          <div className="flex-shrink-0">
            <div className="flex items-center border-2 border-primary rounded-lg overflow-hidden">
              <button
                onClick={() => onQtyChange(item.id, item.quantity - 1)}
                className="w-8 h-8 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                aria-label="Decrease quantity"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" d="M5 12h14" />
                </svg>
              </button>
              <span className="w-8 h-8 flex items-center justify-center text-sm font-bold text-primary-hover bg-primary/10">
                {item.quantity}
              </span>
              <button
                onClick={() => onQtyChange(item.id, item.quantity + 1)}
                className="w-8 h-8 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                aria-label="Increase quantity"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */

export default function CartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { restaurantSlug, tableId } = useParams();
  const { restaurant, isLoading } = useRestaurant();
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [showCustomerSheet, setShowCustomerSheet] = useState(false);

  // Prefetch session token as soon as customer info sheet opens,
  // so it's ready by the time the user fills in their details and the order mutation fires.
  useEffect(() => {
    if (showCustomerSheet && restaurant?.id && tableId) {
      queryClient.refetchQueries({ queryKey: ['table', restaurant.id, tableId] }).then(() => {
        const freshTable = queryClient.getQueryData<{ sessionToken?: string | null }>(['table', restaurant.id, tableId]);
        if (freshTable?.sessionToken) {
          sessionStorage.setItem(`sessionToken:${tableId}`, freshTable.sessionToken);
        }
      });
    }
  }, [showCustomerSheet, restaurant?.id, tableId, queryClient]);
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState<{ valid: boolean; discount?: { discountId: string; couponId?: string; discountAmount: number; discountName: string }; error?: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [autoDiscount, setAutoDiscount] = useState<{ discountId: string; discountAmount: number; discountName: string } | null>(null);
  const autoDiscountFetched = useRef(false);

  const items = useCartStore((s) => s.items);
  const updateItemQuantity = useCartStore((s) => s.updateItemQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const generateIdempotencyKey = useCartStore((s) => s.generateIdempotencyKey);
  const currency = restaurant?.currency || 'USD';

  /* geolocation for geo-fence */
  const { getCoords, error: geoError, position: geoPosition, refresh: refreshGeo } = useGeolocation();
  const geoFenceEnabled = !!restaurant?.geoFenceEnabled;
  const geoBlocked = geoFenceEnabled && !geoPosition;

  /* ─── Auto-apply discount ─── */
  const rawSubtotal = useMemo(() => items.reduce((sum, i) => sum + i.totalPrice, 0), [items]);
  useEffect(() => {
    if (!restaurant?.id || rawSubtotal <= 0) { setAutoDiscount(null); return; }
    // Skip auto-apply if a manual coupon is active
    if (couponResult?.valid) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      featureService.getAutoApply(restaurant.id, rawSubtotal)
        .then((res) => { if (!controller.signal.aborted) setAutoDiscount(res ?? null); })
        .catch(() => { if (!controller.signal.aborted) setAutoDiscount(null); });
    }, autoDiscountFetched.current ? 400 : 0); // debounce after first fetch
    autoDiscountFetched.current = true;
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [restaurant?.id, rawSubtotal, couponResult?.valid]);

  /* totals */
  const taxRate = (Number(restaurant?.taxRate) || DEFAULT_TAX_RATE) / 100;
  const activeDiscount = couponResult?.valid ? couponResult.discount : autoDiscount;
  const discountAmount = activeDiscount?.discountAmount ?? 0;
  const { subtotal, tax, total, estimatedTime, totalQty } = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
    const tax = subtotal * taxRate;
    const total = subtotal - discountAmount + tax;
    const maxPrepTime = Math.max(...items.map((i) => i.menuItem.prepTime ?? 0), 0);
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    return { subtotal, tax, total, estimatedTime: maxPrepTime, totalQty };
  }, [items, taxRate, discountAmount]);

  /* order mutation */
  const orderMutation = useMutation({
    mutationFn: async ({ customerName, customerPhone }: { customerName: string; customerPhone: string }) => {
      if (!restaurant?.id || !tableId) throw new Error('Missing restaurant or table information');
      const key = idempotencyKey || generateIdempotencyKey();
      if (!idempotencyKey) setIdempotencyKey(key);
      // Session token was prefetched when the customer info sheet opened.
      // Just use whatever is in sessionStorage — it should already be fresh.
      return orderService.create(restaurant.id, tableId, items, specialInstructions.trim() || undefined, key, restaurantSlug || restaurant.slug, customerName, customerPhone, getCoords(), couponResult?.valid ? couponCode.trim() : undefined);
    },
    onSuccess: (order: any) => {
      // Save the rotated session token from the response so next order uses the new one
      if (order?.newSessionToken && tableId) {
        sessionStorage.setItem(`sessionToken:${tableId}`, order.newSessionToken);
      }
      clearCart();
      setShowCustomerSheet(false);
      // Invalidate orders cache so OrdersPage shows new order immediately
      queryClient.invalidateQueries({ queryKey: ['orders'] });

      // If pay_before is enabled, trigger online payment immediately after order creation
      toast.success(t('cart.orderPlaced'));
      navigate(`/r/${restaurantSlug}/t/${tableId}/menu`);
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : t('cart.failedToPlace');
      // If the session token expired (table was cleared), refresh it and prompt retry
      if (msg.toLowerCase().includes('session expired')) {
        queryClient.invalidateQueries({ queryKey: ['table'] });
        toast.error(t('cart.sessionRefreshed'));
      } else {
        toast.error(msg);
      }
      setIdempotencyKey(null);
    },
  });

  const handleQty = useCallback(
    (id: string, qty: number) => (qty <= 0 ? removeItem(id) : updateItemQuantity(id, qty)),
    [updateItemQuantity, removeItem]
  );

  const handlePlaceOrder = () => {
    if (!items.length) return toast.error(t('cart.cartEmpty'));
    setShowCustomerSheet(true);
  };

  const handleConfirmOrder = (customerName: string, customerPhone: string) => {
    orderMutation.mutate({ customerName, customerPhone });
  };

  const goBack = () =>
    restaurantSlug && tableId ? navigate(`/r/${restaurantSlug}/t/${tableId}/menu`) : navigate(-1);

  /* ─── Loading skeleton ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 safe-top">
          <div className="bg-primary">
            <div className="px-5 pt-4 pb-4 flex items-center justify-center relative">
              <div className="absolute left-5 w-10 h-10 rounded-full bg-white/20 animate-pulse" />
              <h1 className="text-lg font-bold text-white">{t('cart.title')}</h1>
            </div>
          </div>
        </header>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 space-y-3">
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl bg-gray-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── Empty cart ─── */
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 safe-top">
          <div className="bg-primary">
            <div className="px-5 pt-4 pb-4 flex items-center justify-center relative">
              <button
                onClick={goBack}
                className="absolute left-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/15 transition-colors"
                aria-label="Go back"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg font-bold text-white">{t('cart.title')}</h1>
            </div>
          </div>
        </header>

        <div className="flex flex-col items-center justify-center px-8 pt-28">
          {/* Empty illustration */}
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center mb-6">
            <svg className="w-16 h-16 text-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('cart.empty')}</h2>
          <p className="text-sm text-gray-500 text-center mb-8 max-w-[260px] leading-relaxed">
            {t('cart.emptySubtext')}
          </p>
          <button
            onClick={goBack}
            className="bg-primary hover:bg-primary-hover text-white font-semibold text-sm px-8 py-3 rounded-xl transition-colors shadow-sm"
          >
            {t('cart.browseMenu')}
          </button>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-background pb-6">
      {/* ─── Sticky header ─── */}
      <header className="sticky top-0 z-50 safe-top">
        <div className="bg-primary">
          <div className="px-5 pt-4 pb-4 flex items-center justify-center relative">
            <button
              onClick={goBack}
              className="absolute left-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/15 transition-colors"
              aria-label="Go back"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-white">{t('cart.title')}</h1>
          </div>
        </div>
      </header>

      {/* ─── Geo-fence location warning ─── */}
      {geoBlocked && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {geoError ? t('cart.locationDenied', 'Location access was denied') : t('cart.locationRequired', 'Location access is required to place an order')}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {geoError ? t('cart.locationDeniedHint', 'Please enable location in your browser settings and try again.') : t('cart.locationRequiredHint', 'This restaurant requires location verification for orders.')}
            </p>
          </div>
          <button
            onClick={refreshGeo}
            className="flex-shrink-0 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            {t('cart.enableLocation', 'Enable')}
          </button>
        </div>
      )}

      {/* ─── Desktop two‑column ─── */}
      <div className="pt-4 lg:px-8 lg:py-6">
        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* ═══ Left column ═══ */}
          <div className="flex-1 min-w-0">
            {/* ── Item cards ── */}
            <div className="lg:rounded-2xl overflow-hidden">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mb-3"
                  >
                    <SwipeableCartItem
                      item={item}
                      currency={currency}
                      onQtyChange={handleQty}
                      onRemove={(id) => removeItem(id)}
                      onImageClick={() => navigate(`/r/${restaurantSlug}/t/${tableId}/item/${item.menuItem.id}`)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Add more items strip */}
            <div className="mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={goBack}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group"
              >
                <span className="text-sm font-semibold text-primary group-hover:text-primary-hover">
                  {t('menu.addMore')}
                </span>
                <svg className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* ── Special instructions / cooking request ── */}
            <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => setShowInstructions((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">
                      {specialInstructions ? t('menu.editInstructions') : t('menu.addInstructions')}
                    </p>
                    {specialInstructions && (
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">
                        {specialInstructions}
                      </p>
                    )}
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showInstructions ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <AnimatePresence>
                {showInstructions && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4">
                      <textarea
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        placeholder={t('menu.instructionsPlaceholder')}
                        className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none h-20 transition-colors"
                        maxLength={500}
                      />
                      <p className="text-right text-[10px] text-gray-300 mt-1 font-medium">
                        {specialInstructions.length}/500
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Estimated time strip ── */}
            {estimatedTime > 0 && (
              <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {t('menu.estPrepTime')}
                  </p>
                  <p className="text-xs text-gray-400">{estimatedTime} {t('menu.minutes')}</p>
                </div>
              </div>
            )}

            {/* ── Coupon code ── */}
            <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3.5">
                {/* Auto-applied discount banner */}
                {autoDiscount && !couponResult?.valid && (
                  <div className="mb-3 flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2.5 rounded-xl text-sm">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{autoDiscount.discountName}</span>
                    <span className="ml-auto font-semibold">-{fmtPrice(autoDiscount.discountAmount, currency)}</span>
                  </div>
                )}
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('menu.haveCoupon')}</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponResult(null); }}
                    placeholder={t('menu.enterCode')}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                  />
                  <button
                    onClick={async () => {
                      if (!couponCode.trim() || !restaurant?.id) return;
                      setCouponLoading(true);
                      try {
                        const res = await featureService.validateCoupon(restaurant.id, couponCode.trim(), subtotal);
                        setCouponResult(res);
                        if (res.valid) toast.success(`Coupon applied: ${res.discount?.discountName}`);
                        else toast.error(res.error || 'Invalid coupon');
                      } catch { toast.error(t('cart.failedToPlace')); }
                      finally { setCouponLoading(false); }
                    }}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
                  >
                    {couponLoading ? '...' : t('cart.apply')}
                  </button>
                </div>
                {couponResult?.valid && couponResult.discount && (
                  <div className="mt-2 flex items-center justify-between bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">
                    <span>{couponResult.discount.discountName} — {fmtPrice(couponResult.discount.discountAmount, currency)} off</span>
                    <button onClick={() => { setCouponResult(null); setCouponCode(''); }} className="text-green-500 hover:text-green-700 text-xs font-medium">{t('cart.remove')}</button>
                  </div>
                )}
                {couponResult && !couponResult.valid && (
                  <p className="mt-2 text-xs text-red-500">{couponResult.error}</p>
                )}
              </div>
            </div>

            {/* ── Bill details ── */}
            <div className="mt-3 mx-4 lg:mx-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3.5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  {t('payment.title')}
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('cart.subtotal')}</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(subtotal, currency)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">{activeDiscount?.discountName ?? t('cart.discount')}</span>
                      <span className="text-green-600 font-medium">-{fmtPrice(discountAmount, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('cart.tax')}</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(tax, currency)}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2.5 flex justify-between">
                    <span className="text-sm font-bold text-gray-900">{t('cart.total')}</span>
                    <span className="text-sm font-bold text-gray-900">{fmtPrice(total, currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Place order button (mobile) ── */}
            <div className="mt-4 mx-4 lg:hidden">
              <button
                onClick={handlePlaceOrder}
                disabled={geoBlocked}
                className={`w-full flex items-center justify-center gap-2 font-bold text-base py-4 rounded-2xl transition-colors shadow-sm ${geoBlocked ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover text-white'}`}
              >
                {t('cart.placeOrder')} &middot; {fmtPrice(total, currency)}
              </button>
            </div>
          </div>

          {/* ═══ Right column ─ desktop only ═══ */}
          <div className="hidden lg:block w-[380px] flex-shrink-0">
            <div className="sticky top-[80px] space-y-4">
              {/* Bill summary card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="font-bold text-gray-900 text-base mb-4">{t('cart.title')}</h3>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('cart.subtotal')} ({totalQty})</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(subtotal, currency)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-green-600">{activeDiscount?.discountName ?? t('cart.discount')}</span>
                      <span className="text-green-600 font-medium">-{fmtPrice(discountAmount, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('cart.tax')}</span>
                    <span className="text-gray-900 font-medium">{fmtPrice(tax, currency)}</span>
                  </div>
                  {estimatedTime > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('menu.estTime')}
                      </span>
                      <span className="text-gray-900 font-medium">{estimatedTime} {t('menu.minutes')}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">{t('cart.total')}</span>
                  <span className="text-lg font-bold text-gray-900">{fmtPrice(total, currency)}</span>
                </div>
              </div>

              {/* Place order button (desktop) */}
              <button
                onClick={handlePlaceOrder}
                disabled={geoBlocked}
                className={`w-full flex items-center justify-center gap-2 font-bold text-base py-4 rounded-2xl transition-colors shadow-sm ${geoBlocked ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover text-white'}`}
              >
                {t('cart.placeOrder')} &middot; {fmtPrice(total, currency)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Customer info bottom sheet ─── */}
      <CustomerInfoSheet
        open={showCustomerSheet}
        onClose={() => setShowCustomerSheet(false)}
        onConfirm={handleConfirmOrder}
        isPending={orderMutation.isPending}
        totalLabel={fmtPrice(total, currency)}
        restaurantId={restaurant?.id || ''}
        tableId={tableId || ''}
      />
    </div>
  );
}
