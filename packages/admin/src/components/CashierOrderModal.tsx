import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { menuService, tableService, settingsService } from '../services';
import { useCurrency } from '../hooks/useCurrency';
import DietBadge from './DietBadge';
import type { MenuItem, Table, Category } from '../types';

/* ─── Types ── */
interface SelectedModifier {
  modifierId: string;
  name: string;
  price: number;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
  selectedModifiers: SelectedModifier[];
}

interface CashierOrderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    tableId?: string;
    items: Array<{ menuItemId: string; quantity: number; notes?: string; modifiers?: Array<{ modifierId: string }> }>;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
  }) => void;
  isSubmitting: boolean;
}

/* ═══════════════════ Main modal ═══════════════════ */
export default function CashierOrderModal({ open, onClose, onSubmit, isSubmitting }: CashierOrderModalProps) {
  const formatCurrency = useCurrency();

  /* ── Data fetching ── */
  const { data: menuItems = [], isError: menuErr } = useQuery({
    queryKey: ['menu'],
    queryFn: menuService.getItems,
    enabled: open,
  });

  const { data: categories = [], isError: catErr } = useQuery({
    queryKey: ['categories'],
    queryFn: menuService.getCategories,
    enabled: open,
  });

  const { data: tables = [], isError: tabErr } = useQuery({
    queryKey: ['tables'],
    queryFn: tableService.getAll,
    enabled: open,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    enabled: open,
  });

  const dataError = menuErr || catErr || tabErr;

  const taxRate = settings?.taxRate ?? 0;

  /* ── State ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeCartItemId, setActiveCartItemId] = useState<string | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCart([]);
      setSelectedTable('');
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      setMenuSearch('');
      setSelectedCategory('all');
      setActiveCartItemId(null);
    }
  }, [open]);

  /* ── Category map for showing category names ── */
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach(c => map.set(c.id, c.name));
    return map;
  }, [categories]);

  /* ── Filtered menu ── */
  const availableItems = useMemo(() => {
    return menuItems.filter(item => {
      if (!item.isAvailable) return false;
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) return false;
      if (menuSearch.trim()) {
        const q = menuSearch.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [menuItems, selectedCategory, menuSearch]);

  /* ── Active categories (that have available items) ── */
  const activeCategories = useMemo(() => {
    const catIds = new Set(menuItems.filter(i => i.isAvailable).map(i => i.categoryId));
    return categories.filter(c => catIds.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, menuItems]);

  /* ── Tables for dropdown ── */
  const dropdownTables = useMemo(() => {
    return tables.filter((t: Table) => t.status === 'available' || t.status === 'occupied')
      .sort((a: Table, b: Table) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }, [tables]);

  /* ── Refs for auto-scroll ── */
  const cartItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastAddedIdRef = useRef<string | null>(null);

  // Scroll to last-added cart item after render
  useEffect(() => {
    if (lastAddedIdRef.current) {
      const el = cartItemRefs.current.get(lastAddedIdRef.current);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      lastAddedIdRef.current = null;
    }
  }, [cart]);

  /* ── Cart helpers ── */
  const addToCart = useCallback((item: MenuItem) => {
    lastAddedIdRef.current = item.id;
    setActiveCartItemId(item.id);
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id);
      if (existing) {
        return prev.map(c => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      // Auto-select default modifiers
      const defaultMods: SelectedModifier[] = [];
      item.customizationGroups?.forEach(g => {
        g.options.forEach(opt => {
          if (opt.isDefault && opt.isAvailable) {
            defaultMods.push({ modifierId: opt.id, name: opt.name, price: opt.priceModifier });
          }
        });
      });
      return [...prev, { menuItem: item, quantity: 1, selectedModifiers: defaultMods }];
    });
  }, []);

  const toggleModifier = useCallback((menuItemId: string, groupId: string, maxSelect: number, mod: { id: string; name: string; priceModifier: number }) => {
    setCart(prev => prev.map(c => {
      if (c.menuItem.id !== menuItemId) return c;
      const has = c.selectedModifiers.some(m => m.modifierId === mod.id);
      if (has) {
        // Remove it
        return { ...c, selectedModifiers: c.selectedModifiers.filter(m => m.modifierId !== mod.id) };
      }
      // Add it, but respect maxSelect for this group
      const group = c.menuItem.customizationGroups?.find(g => g.id === groupId);
      if (!group) return c;
      const groupOptionIds = new Set(group.options.map(o => o.id));
      const currentGroupCount = c.selectedModifiers.filter(m => groupOptionIds.has(m.modifierId)).length;
      if (maxSelect > 0 && currentGroupCount >= maxSelect) {
        // If single-select (max=1), replace
        if (maxSelect === 1) {
          const withoutGroup = c.selectedModifiers.filter(m => !groupOptionIds.has(m.modifierId));
          return { ...c, selectedModifiers: [...withoutGroup, { modifierId: mod.id, name: mod.name, price: mod.priceModifier }] };
        }
        return c; // Can't add more
      }
      return { ...c, selectedModifiers: [...c.selectedModifiers, { modifierId: mod.id, name: mod.name, price: mod.priceModifier }] };
    }));
  }, []);

  const removeFromCart = useCallback((menuItemId: string) => {
    setCart(prev => prev.filter(c => c.menuItem.id !== menuItemId));
  }, []);

  const getCartQty = useCallback((menuItemId: string) => {
    return cart.find(c => c.menuItem.id === menuItemId)?.quantity ?? 0;
  }, [cart]);

  /* ── Totals ── */
  const subtotal = useMemo(() => {
    return cart.reduce((sum, c) => {
      const basePrice = c.menuItem.discountPrice ?? c.menuItem.price;
      const modifierTotal = c.selectedModifiers.reduce((s, m) => s + m.price, 0);
      return sum + (basePrice + modifierTotal) * c.quantity;
    }, 0);
  }, [cart]);

  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  /* ── Submit ── */
  const handleSubmit = () => {
    if (cart.length === 0) return;
    onSubmit({
      tableId: selectedTable || undefined,
      items: cart.map(c => ({
        menuItemId: c.menuItem.id,
        quantity: c.quantity,
        notes: c.notes,
        modifiers: c.selectedModifiers.length > 0
          ? c.selectedModifiers.map(m => ({ modifierId: m.modifierId }))
          : undefined,
      })),
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-[51] w-[96vw] sm:w-[92vw] max-w-6xl h-[92vh] sm:h-[88vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {dataError && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 text-sm text-red-600 shrink-0">
          Failed to load some data. Close and reopen to retry.
        </div>
      )}
      {/* ═══ Dark header ═══ */}
      <div className="bg-primary h-14 flex items-center justify-between px-5 shrink-0 shadow-lg z-10 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>

        </div>

        <div className="flex items-center gap-3">
          {/* Table select */}
          <select
            value={selectedTable}
            onChange={e => setSelectedTable(e.target.value)}
            className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-white/40 appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="" className="text-gray-900">Takeaway</option>
            {dropdownTables.map((t: Table) => (
              <option
                key={t.id}
                value={t.id}
                disabled={t.status === 'occupied'}
                className={t.status === 'occupied' ? 'text-red-500' : 'text-gray-900'}
              >
                {t.name ? `${t.name} (${t.number})` : `Table ${t.number}`}
                {t.status === 'occupied' ? ' • Occupied' : ''}
              </option>
            ))}
          </select>

          {/* Customer name */}
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name"
            className="bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-white/40 w-32"
          />

          {/* Customer phone */}
          <input
            type="tel"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="Phone number *"
            required
            className={`bg-white/10 text-white placeholder-white/40 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-white/40 w-32 ${!customerPhone.trim() ? 'border-red-400/60' : 'border-white/20'}`}
          />

          {/* New Order button */}
          <button
            onClick={() => { setCart([]); setNotes(''); setSelectedTable(''); setCustomerName(''); setCustomerPhone(''); }}
            className="bg-white text-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
          >
            New Order
          </button>
        </div>
      </div>

      {/* ═══ Body ═══ */}
      <div className="flex flex-1 overflow-hidden bg-background">

        {/* ── LEFT: Current Ticket ── */}
        <div className="hidden sm:flex w-[300px] xl:w-[340px] flex-col bg-white border-r border-gray-200 shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Current Ticket</h2>
            {cart.length > 0 && (
              <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <svg className="w-20 h-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No items yet</p>
                <p className="text-xs text-gray-300 mt-1">Click menu items to add</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => {
                  const basePrice = c.menuItem.discountPrice ?? c.menuItem.price;
                  const modTotal = c.selectedModifiers.reduce((s, m) => s + m.price, 0);
                  const lineTotal = (basePrice + modTotal) * c.quantity;
                  const hasGroups = (c.menuItem.customizationGroups?.length ?? 0) > 0;
                  const isActive = activeCartItemId === c.menuItem.id;
                  return (
                    <div
                      key={c.menuItem.id}
                      ref={(el) => { if (el) cartItemRefs.current.set(c.menuItem.id, el); else cartItemRefs.current.delete(c.menuItem.id); }}
                      onClick={() => setActiveCartItemId(isActive ? null : c.menuItem.id)}
                      className={`border rounded-lg p-3 relative cursor-pointer transition-all ${
                        isActive
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Remove button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromCart(c.menuItem.id); if (isActive) setActiveCartItemId(null); }}
                        className="absolute top-2.5 right-2.5 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>

                      {/* Item info */}
                      <div className="pr-6">
                        <p className="text-sm font-semibold text-gray-900">{c.menuItem.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(basePrice)}</p>
                      </div>

                      {/* Selected modifiers as text lines */}
                      {c.selectedModifiers.length > 0 && !isActive && (
                        <div className="mt-1.5 space-y-0.5">
                          {c.selectedModifiers.map(m => (
                            <div key={m.modifierId} className="flex items-center justify-between text-xs text-primary">
                              <span>+ {m.name}</span>
                              <span className="tabular-nums">{m.price > 0 ? `+${formatCurrency(m.price)}` : 'Free'}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Modifier buttons — only on active/focused item */}
                      {hasGroups && isActive && (
                        <div className="mt-2 space-y-1.5">
                          {c.menuItem.customizationGroups.map(group => {
                            const selectedIds = new Set(c.selectedModifiers.map(m => m.modifierId));
                            return (
                              <div key={group.id} className="flex flex-wrap gap-1.5">
                                {group.options.filter(o => o.isAvailable).map(opt => {
                                  const isSelected = selectedIds.has(opt.id);
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleModifier(c.menuItem.id, group.id, group.maxSelections, opt); }}
                                      className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border active:scale-95 select-none ${
                                        isSelected
                                          ? 'bg-primary/10 border-primary text-primary'
                                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
                                      }`}
                                    >
                                      {opt.name}
                                      {opt.priceModifier > 0 && (
                                        <span className={`text-[11px] ${isSelected ? 'text-primary/70' : 'text-gray-400'}`}>+{formatCurrency(opt.priceModifier)}</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Qty + total row */}
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-xs text-gray-500">Qty: {c.quantity}</span>
                        <span className="text-sm font-bold text-gray-900 tabular-nums">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          {cart.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Order notes (optional)…"
                rows={2}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {/* Totals + Place Order */}
          <div className="px-4 py-3 border-t-2 border-gray-200 bg-gray-50/50 shrink-0 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tax ({taxRate}%)</span>
                <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={cart.length === 0 || isSubmitting || !customerPhone.trim()}
              className="w-full mt-2 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Placing Order…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Place Order • {formatCurrency(total)}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Menu grid ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Category tabs */}
          <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                selectedCategory === 'all'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              All
            </button>
            {activeCategories.map((cat: Category) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}


          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {availableItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <svg className="w-16 h-16 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm font-medium">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {availableItems.map((item) => {
                  const qty = getCartQty(item.id);
                  const price = item.discountPrice ?? item.price;
                  const catName = categoryMap.get(item.categoryId) || '';

                  return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`text-left bg-white rounded-xl border p-3.5 transition-all active:scale-[0.97] hover:shadow-md relative ${
                        qty > 0 ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : 'border-border hover:border-muted'
                      }`}
                    >
                      {/* Diet badge */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <DietBadge type={item.dietType} />
                      </div>

                      {/* Info */}
                      <p className="text-sm font-semibold text-text-primary truncate">{item.name}</p>
                      {catName && (
                        <p className="text-xs text-text-muted mt-0.5 truncate">{catName}</p>
                      )}
                      <p className="text-sm font-bold text-primary mt-2">{formatCurrency(price)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
