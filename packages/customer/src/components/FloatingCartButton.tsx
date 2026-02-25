import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useCartStore, selectTotalItems } from '../state/cartStore';
import { useUIStore } from '../state/uiStore';
import { resolveImg } from '../utils/resolveImg';

function FloatingCartButtonComponent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { restaurantSlug, tableId } = useParams();
  const totalItems = useCartStore(selectTotalItems);
  const items = useCartStore((s) => s.items);
  const isDrawerOpen = useUIStore((s) => s.isDrawerOpen);

  const [isVisible, setIsVisible] = useState(false);
  const [bounce, setBounce] = useState(false);
  const prevItemsRef = useRef(totalItems);

  // Hide on cart page and order status page
  const isCartPage = location.pathname.includes('/cart');
  const isOrderPage = location.pathname.includes('/order-status');
  const shouldShow = totalItems > 0 && !isCartPage && !isOrderPage && !isDrawerOpen;

  // Slide-up animation on appear
  useEffect(() => {
    if (shouldShow) {
      const t = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(t);
    } else {
      setIsVisible(false);
    }
  }, [shouldShow]);

  // Bounce when item count changes
  useEffect(() => {
    if (totalItems !== prevItemsRef.current && totalItems > 0) {
      setBounce(true);
      const t = setTimeout(() => setBounce(false), 400);
      prevItemsRef.current = totalItems;
      return () => clearTimeout(t);
    }
    prevItemsRef.current = totalItems;
  }, [totalItems]);

  if (!shouldShow) return null;

  const handleClick = () => {
    if (restaurantSlug && tableId) {
      navigate(`/r/${restaurantSlug}/t/${tableId}/cart`);
    }
  };

  // Get unique item thumbnails (max 3)
  const thumbnails = items
    .filter((item) => item.menuItem.image)
    .slice(0, 3)
    .map((item) => resolveImg(item.menuItem.image)!);

  return createPortal(
    <div
      className={`fixed bottom-[4.5rem] left-4 right-4 z-[9999] safe-bottom lg:left-0 lg:right-0 lg:mx-auto lg:max-w-[1280px] lg:px-8 transition-all duration-300 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <button
        onClick={handleClick}
        aria-label={`View cart, ${totalItems} ${totalItems === 1 ? 'item' : 'items'}`}
        className="w-full lg:max-w-md lg:mx-auto flex items-center justify-between pl-3 pr-3 py-2.5 bg-primary text-white rounded-2xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform duration-150"
      >
        {/* Left side: thumbnails + text */}
        <div className="flex items-center gap-3">
          {/* Stacked thumbnails */}
          {thumbnails.length > 0 && (
            <div className="flex items-center -space-x-2.5">
              {thumbnails.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className={`w-9 h-9 rounded-full border-2 border-white/30 object-cover transition-transform duration-300 ${
                    bounce ? 'scale-110' : 'scale-100'
                  }`}
                  style={{ zIndex: thumbnails.length - i }}
                />
              ))}
            </div>
          )}
          <div className="text-left">
            <span className="font-bold text-[15px] leading-tight block">View cart</span>
            <span className="text-xs text-white/75 font-medium">
              {totalItems} {totalItems === 1 ? 'Item' : 'Items'}
            </span>
          </div>
        </div>

        {/* Right side: chevron circle */}
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
    </div>,
    document.body
  );
}

export const FloatingCartButton = memo(FloatingCartButtonComponent);
