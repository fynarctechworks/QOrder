import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { menuService } from '../services/menuService';
import { orderService } from '../services/orderService';
import type { Category, MenuItem } from '../types';
import { resolveImg } from '../utils/resolveImg';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

/* ─── Bill Panel ─────────────────────────────────────────────────────────── */
function BillPanel({
  cart,
  onAdd,
  onRemove,
  onClear,
  onCheckout,
  isCheckingOut,
}: {
  cart: CartItem[];
  onAdd: (item: MenuItem) => void;
  onRemove: (itemId: string) => void;  // decrease qty by 1 (removes if qty reaches 0)
  onClear: () => void;
  onCheckout: () => void;
  isCheckingOut: boolean;
}) {
  const subtotal = cart.reduce((sum, c) => sum + (c.menuItem.discountPrice ?? c.menuItem.price) * c.quantity, 0);

  return (
    <div className="flex flex-col h-full bg-white border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold text-text-primary">Current Bill</h2>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-xs text-error hover:underline">
            Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-8">
            <svg className="w-10 h-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm text-text-muted">Add items to start billing</p>
          </div>
        ) : (
          cart.map((c) => (
            <div key={c.menuItem.id} className="flex items-center gap-2 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {c.menuItem.isAgeRestricted && (
                    <span className="inline-flex items-center mr-1 px-1 py-0 bg-red-100 text-red-600 rounded text-[10px] font-semibold">18+</span>
                  )}
                  {c.menuItem.name}
                </p>
                <p className="text-xs text-text-muted">
                  ₹{(c.menuItem.discountPrice ?? c.menuItem.price).toFixed(2)} × {c.quantity}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onRemove(c.menuItem.id)}
                  className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-surface-elevated text-text-secondary hover:text-error transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-text-primary w-5 text-center">{c.quantity}</span>
                <button
                  onClick={() => onAdd(c.menuItem)}
                  className="w-6 h-6 rounded-full border border-primary flex items-center justify-center hover:bg-primary/10 text-primary transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              <span className="text-sm font-semibold text-text-primary w-14 text-right shrink-0">
                ₹{((c.menuItem.discountPrice ?? c.menuItem.price) * c.quantity).toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {cart.length > 0 && (
        <div className="px-4 py-3 border-t border-border space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Subtotal</span>
            <span className="font-semibold text-text-primary">₹{subtotal.toFixed(2)}</span>
          </div>
          <button
            onClick={onCheckout}
            disabled={isCheckingOut}
            className="w-full py-3 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {isCheckingOut ? 'Processing…' : `Bill  ₹${subtotal.toFixed(2)}`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Item Card ──────────────────────────────────────────────────────────── */
function ItemCard({ item, qty, onAdd }: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
}) {
  const price = item.discountPrice ?? item.price;

  return (
    <div
      className={`relative bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${
        qty > 0 ? 'border-primary shadow-sm' : 'border-border'
      } ${!item.isAvailable ? 'opacity-50' : 'cursor-pointer'}`}
      onClick={() => item.isAvailable && onAdd()}
    >
      {/* Image */}
      {item.image ? (
        <img src={resolveImg(item.image)} alt={item.name} className="w-full h-24 object-cover" />
      ) : (
        <div className="w-full h-24 bg-surface-elevated flex items-center justify-center">
          <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01" />
          </svg>
        </div>
      )}

      {/* Badges */}
      {item.isAgeRestricted && (
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded">
          18+
        </span>
      )}
      {!item.isAvailable && (
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-gray-700 text-white text-[10px] font-semibold rounded">
          N/A
        </span>
      )}
      {qty > 0 && (
        <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">
          {qty}
        </span>
      )}

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-semibold text-text-primary leading-tight truncate">{item.name}</p>
        <div className="flex items-center justify-between mt-1">
          <div>
            <span className="text-sm font-bold text-primary">₹{price.toFixed(2)}</span>
            {item.discountPrice != null && (
              <span className="text-[10px] text-text-muted line-through ml-1">₹{item.price.toFixed(2)}</span>
            )}
          </div>
          {item.isAvailable && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function PanCornerPage() {
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  /* ── Data ── */
  const { data: allCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: menuService.getCategories,
    staleTime: 60_000,
  });

  const { data: allItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['menuItems'],
    queryFn: menuService.getItems,
    staleTime: 60_000,
  });

  /* ── Filtered pan corner data ── */
  const panCategories = useMemo(
    () => allCategories.filter((c) => c.categoryGroup === 'PAN_CORNER' && c.isActive),
    [allCategories]
  );

  const panItems = useMemo(
    () => allItems.filter((item) => {
      const cat = allCategories.find((c) => c.id === item.categoryId);
      return cat?.categoryGroup === 'PAN_CORNER';
    }),
    [allItems, allCategories]
  );

  const selectedCategoryId = activeCategory ?? panCategories[0]?.id ?? null;

  const visibleItems = useMemo(
    () => panItems.filter((item) => item.categoryId === selectedCategoryId),
    [panItems, selectedCategoryId]
  );

  /* ── Cart helpers ── */
  const cartQty = (itemId: string) => cart.find((c) => c.menuItem.id === itemId)?.quantity ?? 0;

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) return prev.map((c) => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === itemId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((c) => c.menuItem.id !== itemId);
      return prev.map((c) => c.menuItem.id === itemId ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };

  /* ── Checkout ── */
  const checkoutMutation = useMutation({
    mutationFn: () =>
      orderService.createQSROrder({
        items: cart.map((c) => ({ menuItemId: c.menuItem.id, quantity: c.quantity })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        serviceType: 'takeaway',
        notes: 'Pan Corner',
      }),
    onSuccess: () => {
      toast.success('Bill created!');
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create bill'),
  });

  /* ── Empty state ── */
  if (panCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-text-primary">No Pan Corner categories yet</p>
          <p className="text-sm text-text-muted mt-1">
            Go to <strong>Menu</strong> and create a category with <strong>Category Group = Pan Corner</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-3 md:-m-6 overflow-hidden">

      {/* ── Left: Menu ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Category tabs */}
        <div className="flex gap-2 px-4 py-3 border-b border-border overflow-x-auto shrink-0 bg-white">
          {panCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                selectedCategoryId === cat.id
                  ? 'bg-primary text-white'
                  : 'bg-surface-elevated text-text-secondary hover:bg-surface-border'
              }`}
            >
              {cat.name}
              <span className="ml-1.5 text-xs opacity-70">
                ({panItems.filter((i) => i.categoryId === cat.id).length})
              </span>
            </button>
          ))}
        </div>

        {/* Items grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <svg className="w-10 h-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-sm text-text-muted">No items in this category</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  qty={cartQty(item.id)}
                  onAdd={() => addToCart(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Optional customer info bar */}
        <div className="flex gap-3 px-4 py-2.5 border-t border-border bg-white shrink-0">
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="input flex-1 text-sm py-1.5"
            placeholder="Customer name (optional)"
          />
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="input w-36 text-sm py-1.5"
            placeholder="Phone (optional)"
          />
        </div>
      </div>

      {/* ── Right: Bill ──────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col">
        <BillPanel
          cart={cart}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onClear={() => setCart([])}
          onCheckout={() => checkoutMutation.mutate()}
          isCheckingOut={checkoutMutation.isPending}
        />
      </div>
    </div>
  );
}
