import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { panCornerService, type PanCornerCategoryData, type PanCornerItemData } from '../services/panCornerService';
import { orderService } from '../services/orderService';
import type { PanCornerCategory, PanCornerItem } from '../types';
import { resolveImg } from '../utils/resolveImg';
import Modal from '../components/Modal';
import PanCornerCategoryForm from '../components/pan-corner/PanCornerCategoryForm';
import PanCornerItemForm from '../components/pan-corner/PanCornerItemForm';

/* ─── Payment Methods ──────────────────────────────────────────────────────── */
type PaymentMethod = 'CASH' | 'CARD' | 'UPI';

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; color: string; bg: string; icon: string }> = [
  {
    value: 'CASH', label: 'Cash', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    value: 'CARD', label: 'Card', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  },
  {
    value: 'UPI', label: 'UPI', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200',
    icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
];

/* ─── Cart ─────────────────────────────────────────────────────────────────── */
interface CartItem {
  item: PanCornerItem;
  quantity: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function PanCornerPage() {
  const queryClient = useQueryClient();

  /* ── UI state ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [showCart, setShowCart] = useState(false);

  /* ── Settlement ── */
  const [showSettlement, setShowSettlement] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedPayMethod, setSelectedPayMethod] = useState<PaymentMethod>('CASH');
  const [settled, setSettled] = useState(false);

  /* ── Manage modals ── */
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PanCornerCategory | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PanCornerItem | null>(null);

  /* ── Data ── */
  const { data: categories = [] } = useQuery<PanCornerCategory[]>({
    queryKey: ['panCornerCategories'],
    queryFn: panCornerService.getCategories,
    staleTime: 60_000,
  });

  const { data: allItems = [] } = useQuery<PanCornerItem[]>({
    queryKey: ['panCornerItems'],
    queryFn: () => panCornerService.getItems(),
    staleTime: 60_000,
  });

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);
  const selectedCategoryId = activeCategory ?? activeCategories[0]?.id ?? null;

  const visibleItems = useMemo(() => {
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase();
      return allItems.filter((i) => i.name.toLowerCase().includes(q));
    }
    return allItems.filter((i) => i.panCornerCategoryId === selectedCategoryId);
  }, [allItems, selectedCategoryId, menuSearch]);

  /* ── Cart helpers ── */
  const cartQty = (itemId: string) => cart.find((c) => c.item.id === itemId)?.quantity ?? 0;
  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const subtotal = cart.reduce((sum, c) => sum + (c.item.discountPrice ?? c.item.price) * c.quantity, 0);

  const addToCart = (item: PanCornerItem) => {
    if (!item.isAvailable) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) return prev.map((c) => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { item, quantity: 1 }];
    });
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev.reduce<CartItem[]>((acc, c) => {
        if (c.item.id !== itemId) { acc.push(c); return acc; }
        const newQty = c.quantity + delta;
        if (newQty > 0) acc.push({ ...c, quantity: newQty });
        return acc;
      }, [])
    );
  };

  const removeFromCart = (itemId: string) => setCart((prev) => prev.filter((c) => c.item.id !== itemId));

  /* ── Category mutations ── */
  const createCatMutation = useMutation({
    mutationFn: (data: PanCornerCategoryData) => panCornerService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panCornerCategories'] });
      toast.success('Category created');
      setCatModalOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create category'),
  });

  const updateCatMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PanCornerCategoryData }) =>
      panCornerService.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panCornerCategories'] });
      toast.success('Category updated');
      setCatModalOpen(false);
      setEditingCat(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update category'),
  });

  const isCatMutating = createCatMutation.isPending || updateCatMutation.isPending;

  const handleCatSubmit = (data: PanCornerCategoryData) => {
    if (editingCat) updateCatMutation.mutate({ id: editingCat.id, data });
    else createCatMutation.mutate(data);
  };

  /* ── Item mutations ── */
  const createItemMutation = useMutation({
    mutationFn: (data: PanCornerItemData) => panCornerService.createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panCornerItems'] });
      toast.success('Item added');
      setItemModalOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add item'),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PanCornerItemData }) =>
      panCornerService.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panCornerItems'] });
      toast.success('Item updated');
      setItemModalOpen(false);
      setEditingItem(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update item'),
  });

  const isItemMutating = createItemMutation.isPending || updateItemMutation.isPending;

  const handleItemSubmit = (data: PanCornerItemData) => {
    if (editingItem) updateItemMutation.mutate({ id: editingItem.id, data });
    else createItemMutation.mutate(data);
  };

  /* ── Checkout ── */
  const checkoutMutation = useMutation({
    mutationFn: () =>
      orderService.createQSROrder({
        items: cart.map((c) => ({ menuItemId: c.item.id, quantity: c.quantity })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        serviceType: 'takeaway',
        notes: 'Pan Corner',
      }),
    onSuccess: () => {
      setSettled(true);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create bill'),
  });

  const handleOpenSettle = () => {
    if (cart.length === 0) return;
    setSelectedPayMethod('CASH');
    setSettled(false);
    setShowSettlement(true);
  };

  const handleCloseSettlement = () => {
    setShowSettlement(false);
    if (settled) {
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setSettled(false);
    }
  };

  /* ── Empty state ── */
  if (activeCategories.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-text-primary">No Pan Corner categories yet</p>
            <p className="text-sm text-text-muted mt-1">Create your first category to get started</p>
          </div>
          <button
            onClick={() => { setEditingCat(null); setCatModalOpen(true); }}
            className="btn-primary px-6"
          >
            + New Category
          </button>
        </div>
        <Modal
          open={catModalOpen}
          title="New Pan Corner Category"
          onClose={() => { setCatModalOpen(false); setEditingCat(null); }}
        >
          <PanCornerCategoryForm
            initial={editingCat}
            isLoading={isCatMutating}
            onSubmit={handleCatSubmit}
            onCancel={() => { setCatModalOpen(false); setEditingCat(null); }}
          />
        </Modal>
      </>
    );
  }

  /* ── Main layout ── */
  return (
    <div className="-m-3 md:-m-6 flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>

      {/* ═══ Top bar ═══ */}
      <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-2.5 flex items-center gap-3 shrink-0">
        <div className="shrink-0">
          <h1 className="text-lg md:text-xl font-bold text-text-primary tracking-tight">Pan Corner</h1>
          <p className="text-xs text-text-muted hidden sm:block leading-none mt-0.5">Counter billing — add &amp; settle</p>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-44 shrink-0">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* + Category */}
          <button
            onClick={() => { setEditingCat(null); setCatModalOpen(true); }}
            className="rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-1.5 border border-gray-200 bg-white text-text-primary hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Category
          </button>

          {/* + Item */}
          <button
            onClick={() => { setEditingItem(null); setItemModalOpen(true); }}
            className="btn-primary rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>
      </div>

      {/* ═══ Body ═══ */}
      <div className="flex flex-1 overflow-hidden bg-background relative">

        {/* Mobile cart overlay */}
        {showCart && (
          <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setShowCart(false)} />
        )}

        {/* ── LEFT: Current Ticket ── */}
        <div className={`fixed inset-y-0 left-0 z-40 w-[300px] md:static md:z-auto xl:w-[340px] flex flex-col bg-white border-r border-gray-200 shrink-0 transform transition-transform duration-200 ${showCart ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Current Ticket</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCart(false)} className="md:hidden text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  Clear All
                </button>
              )}
              {totalItems > 0 && (
                <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <svg className="w-14 h-14 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No items yet</p>
                <p className="text-xs text-gray-300 mt-0.5">Tap menu items to add</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {cart.map((c) => {
                  const price = c.item.discountPrice ?? c.item.price;
                  const lineTotal = price * c.quantity;
                  return (
                    <div
                      key={c.item.id}
                      className="border rounded-lg px-2.5 py-2 border-gray-200 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {c.item.isAgeRestricted && (
                              <span className="inline-flex items-center mr-1 px-1 py-0 bg-red-100 text-red-600 rounded text-[10px] font-semibold">18+</span>
                            )}
                            {c.item.name}
                          </p>
                          <p className="text-xs text-gray-400">₹{price.toFixed(2)}</p>
                        </div>
                        <button
                          onClick={() => removeFromCart(c.item.id)}
                          className="text-red-400 hover:text-red-600 transition-colors shrink-0 mt-0.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => updateQty(c.item.id, -1)}
                            className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors active:scale-90"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                            </svg>
                          </button>
                          <span className="w-7 text-center text-xs font-bold text-gray-900 tabular-nums">{c.quantity}</span>
                          <button
                            onClick={() => updateQty(c.item.id, 1)}
                            className="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors active:scale-90"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                        <span className="text-sm font-bold text-gray-900 tabular-nums">₹{lineTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Totals + Settle */}
          <div className="px-4 py-3 border-t-2 border-gray-200 bg-gray-50/50 shrink-0 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900 tabular-nums">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">₹{subtotal.toFixed(2)}</span>
            </div>
            <button
              onClick={handleOpenSettle}
              disabled={cart.length === 0}
              className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Settle Payment • ₹{subtotal.toFixed(2)}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Menu grid ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Mobile cart toggle FAB */}
          <button
            onClick={() => setShowCart(true)}
            className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{totalItems}</span>
            )}
          </button>

          {/* Category tabs */}
          <div className="shrink-0">
            <div className="sticky top-0 z-10 px-3 md:px-5 py-3 bg-white/95 backdrop-blur border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-2">
                {activeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id); setMenuSearch(''); }}
                    onDoubleClick={() => { setEditingCat(cat); setCatModalOpen(true); }}
                    title="Double-click to edit"
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all border ${
                      selectedCategoryId === cat.id && !menuSearch.trim()
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
                    }`}
                  >
                    {cat.name}
                    <span className="ml-1.5 text-xs opacity-70">
                      ({allItems.filter((i) => i.panCornerCategoryId === cat.id).length})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-3 md:p-5">
            {visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <svg className="w-16 h-16 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-sm font-medium">No items found</p>
                {!menuSearch.trim() && (
                  <button
                    onClick={() => { setEditingItem(null); setItemModalOpen(true); }}
                    className="mt-3 btn-primary px-5 text-sm"
                  >
                    + Add Item
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {visibleItems.map((item) => {
                  const qty = cartQty(item.id);
                  const price = item.discountPrice ?? item.price;
                  return (
                    <div key={item.id} className="relative group">
                      <button
                        onClick={() => addToCart(item)}
                        disabled={!item.isAvailable}
                        className={`text-left w-full bg-white rounded-xl border p-3.5 transition-all active:scale-[0.97] hover:shadow-md relative ${
                          qty > 0
                            ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                            : 'border-border hover:border-gray-300'
                        } ${!item.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {qty > 0 && (
                          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow-sm">
                            {qty}
                          </span>
                        )}

                        {item.image && (
                          <img
                            src={resolveImg(item.image)}
                            alt={item.name}
                            className="w-full h-24 object-cover rounded-lg mb-2.5"
                          />
                        )}

                        <div className="flex items-start gap-1.5 mb-1">
                          {item.isAgeRestricted && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded">18+</span>
                          )}
                          {!item.isAvailable && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-semibold rounded">N/A</span>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-text-primary truncate">{item.name}</p>

                        <div className="flex items-baseline gap-1.5 mt-2">
                          <span className="text-sm font-bold text-primary">₹{price.toFixed(2)}</span>
                          {item.discountPrice != null && (
                            <span className="text-[11px] text-text-muted line-through">₹{item.price.toFixed(2)}</span>
                          )}
                        </div>
                      </button>

                      <button
                        onClick={() => { setEditingItem(item); setItemModalOpen(true); }}
                        className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-black/60 hover:bg-black/80 text-white text-[10px] rounded transition-opacity"
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}

                {!menuSearch.trim() && (
                  <button
                    onClick={() => { setEditingItem(null); setItemModalOpen(true); }}
                    className="h-full min-h-[8rem] rounded-xl border-2 border-dashed border-gray-200 hover:border-primary/50 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-primary transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs font-medium">Add Item</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Settlement Modal ═══ */}
      <Modal open={showSettlement} onClose={handleCloseSettlement} title="" maxWidth="max-w-lg">
        {settled ? (
          /* ── Success state ── */
          <div className="text-center space-y-6 py-4">
            <div>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-text-primary">Bill Settled!</h2>
              <p className="text-text-secondary mt-1">Pan Corner</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 text-left max-w-sm mx-auto">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Bill Summary</p>
              {cart.map((c) => (
                <div key={c.item.id} className="py-1 text-sm flex justify-between">
                  <span className="text-text-secondary">
                    {c.item.isAgeRestricted && (
                      <span className="inline-flex items-center mr-1 px-1 py-0 bg-red-100 text-red-600 rounded text-[10px] font-semibold">18+</span>
                    )}
                    {c.quantity}× {c.item.name}
                  </span>
                  <span className="text-text-primary">₹{((c.item.discountPrice ?? c.item.price) * c.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-border-primary my-2" />
              <div className="flex justify-between font-bold text-sm">
                <span>Total</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="border-t border-border-primary mt-3 pt-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Paid via</p>
                <p className={`text-sm font-semibold ${PAYMENT_METHODS.find((m) => m.value === selectedPayMethod)?.color}`}>
                  {selectedPayMethod}
                </p>
              </div>
            </div>

            <button
              onClick={handleCloseSettlement}
              className="w-full max-w-sm mx-auto px-5 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold transition-colors text-sm block"
            >
              Done — New Order
            </button>
          </div>
        ) : (
          /* ── Payment state ── */
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-text-primary">Settle Bill</h2>
                <p className="text-sm text-text-secondary">Pan Corner</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-text-primary">₹{subtotal.toFixed(2)}</p>
                <p className="text-xs text-text-muted">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Customer details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Payment method */}
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Payment Method</p>
              <div className="grid grid-cols-3 gap-3">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setSelectedPayMethod(m.value)}
                    className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border-2 transition-all ${
                      selectedPayMethod === m.value
                        ? `${m.bg} ${m.color} border-current shadow-sm`
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                    <span className="text-sm font-semibold">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Order summary */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
              {cart.map((c) => (
                <div key={c.item.id} className="flex justify-between text-sm">
                  <span className="text-text-secondary truncate">
                    {c.quantity}× {c.item.name}
                  </span>
                  <span className="text-text-primary shrink-0 ml-2">
                    ₹{((c.item.discountPrice ?? c.item.price) * c.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60 active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            >
              {checkoutMutation.isPending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm & Settle • ₹{subtotal.toFixed(2)}
                </>
              )}
            </button>
          </div>
        )}
      </Modal>

      {/* Category modal */}
      <Modal
        open={catModalOpen}
        title={editingCat ? 'Edit Category' : 'New Pan Corner Category'}
        onClose={() => { setCatModalOpen(false); setEditingCat(null); }}
      >
        <PanCornerCategoryForm
          initial={editingCat}
          isLoading={isCatMutating}
          onSubmit={handleCatSubmit}
          onCancel={() => { setCatModalOpen(false); setEditingCat(null); }}
        />
      </Modal>

      {/* Item modal */}
      <Modal
        open={itemModalOpen}
        title={editingItem ? 'Edit Item' : 'Add Pan Corner Item'}
        onClose={() => { setItemModalOpen(false); setEditingItem(null); }}
      >
        <PanCornerItemForm
          initial={editingItem}
          categories={categories}
          isLoading={isItemMutating}
          onSubmit={handleItemSubmit}
          onCancel={() => { setItemModalOpen(false); setEditingItem(null); }}
        />
      </Modal>
    </div>
  );
}
