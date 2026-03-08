import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { menuService, tableService, settingsService, orderService } from '../services';
import { useCurrency } from '../hooks/useCurrency';
import DietBadge from '../components/DietBadge';
import type { MenuItem, Table, Category } from '../types';

/* ─── Types ── */
interface SelectedModifier {
  modifierId: string;
  name: string;
  price: number;
}

interface CartItem {
  cartId: string;
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
  selectedModifiers: SelectedModifier[];
}

type CaptainView = 'tables' | 'order';

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-50 border-green-200 text-green-700',
  occupied: 'bg-orange-50 border-orange-200 text-orange-700',
  reserved: 'bg-blue-50 border-blue-200 text-blue-700',
  cleaning: 'bg-gray-50 border-gray-200 text-gray-500',
};

const STATUS_DOTS: Record<string, string> = {
  available: 'bg-green-400',
  occupied: 'bg-orange-400',
  reserved: 'bg-blue-400',
  cleaning: 'bg-gray-400',
};

/* ═══════════════════ Captain Page ═══════════════════ */
export default function CaptainPage() {
  const formatCurrency = useCurrency();
  const qc = useQueryClient();

  const [view, setView] = useState<CaptainView>('tables');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customerName, setCustomerName] = useState('');
  const [activeCartItemId, setActiveCartItemId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  /* ── Data fetching ── */
  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu'],
    queryFn: menuService.getItems,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: menuService.getCategories,
  });

  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: tableService.getAll,
    refetchInterval: 10_000,
  });

  const { data: runningTables = [] } = useQuery({
    queryKey: ['runningTables'],
    queryFn: tableService.getRunningTables,
    refetchInterval: 10_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const taxRate = settings?.taxRate ?? 0;

  /* ── Running table lookup ── */
  const runningMap = useMemo(() => {
    const map = new Map<string, typeof runningTables[0]>();
    runningTables.forEach(rt => map.set(rt.tableId, rt));
    return map;
  }, [runningTables]);

  /* ── Tables grouped by section ── */
  const groupedTables = useMemo(() => {
    const groups: { sectionName: string; tables: Table[] }[] = [];
    const sectionMap = new Map<string, Table[]>();

    const sorted = [...tables].sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true })
    );

    sorted.forEach(t => {
      const key = t.sectionId ?? '__none__';
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key)!.push(t);
    });

    const entries = Array.from(sectionMap.entries());
    entries.sort((a, b) => {
      if (a[0] === '__none__' && b[0] !== '__none__') return 1;
      if (a[0] !== '__none__' && b[0] === '__none__') return -1;
      const aSec = a[1][0]?.section;
      const bSec = b[1][0]?.section;
      return (aSec?.sortOrder ?? 0) - (bSec?.sortOrder ?? 0);
    });

    entries.forEach(([, tbs]) => {
      const sec = tbs[0]?.section;
      groups.push({ sectionName: sec?.name ?? 'Unassigned', tables: tbs });
    });

    return groups;
  }, [tables]);

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

  const activeCategories = useMemo(() => {
    const catIds = new Set(menuItems.filter(i => i.isAvailable).map(i => i.categoryId));
    return categories.filter(c => catIds.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, menuItems]);

  /* ── Category map for showing category names ── */
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach(c => map.set(c.id, c.name));
    return map;
  }, [categories]);

  /* ── Refs for auto-scroll ── */
  const cartItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastAddedIdRef = useRef<string | null>(null);
  const cartIdCounter = useRef(0);

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
    const id = `c-${++cartIdCounter.current}`;
    lastAddedIdRef.current = id;
    setActiveCartItemId(id);
    setCart(prev => {
      const defaultMods: SelectedModifier[] = [];
      item.customizationGroups?.forEach(g => {
        g.options.forEach(opt => {
          if (opt.isDefault && opt.isAvailable) {
            defaultMods.push({ modifierId: opt.id, name: opt.name, price: opt.priceModifier });
          }
        });
      });
      return [...prev, { cartId: id, menuItem: item, quantity: 1, selectedModifiers: defaultMods }];
    });
  }, []);

  const getCartQty = useCallback((menuItemId: string) => {
    return cart.filter(c => c.menuItem.id === menuItemId).reduce((sum, c) => sum + c.quantity, 0);
  }, [cart]);

  const removeFromCart = useCallback((cartId: string) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId));
  }, []);

  const toggleModifier = useCallback((cartId: string, groupId: string, maxSelect: number, mod: { id: string; name: string; priceModifier: number }) => {
    setCart(prev => prev.map(c => {
      if (c.cartId !== cartId) return c;
      const has = c.selectedModifiers.some(m => m.modifierId === mod.id);
      if (has) {
        return { ...c, selectedModifiers: c.selectedModifiers.filter(m => m.modifierId !== mod.id) };
      }
      const group = c.menuItem.customizationGroups?.find(g => g.id === groupId);
      if (!group) return c;
      const groupOptionIds = new Set(group.options.map(o => o.id));
      const currentGroupCount = c.selectedModifiers.filter(m => groupOptionIds.has(m.modifierId)).length;
      if (maxSelect > 0 && currentGroupCount >= maxSelect) {
        if (maxSelect === 1) {
          const withoutGroup = c.selectedModifiers.filter(m => !groupOptionIds.has(m.modifierId));
          return { ...c, selectedModifiers: [...withoutGroup, { modifierId: mod.id, name: mod.name, price: mod.priceModifier }] };
        }
        return c;
      }
      return { ...c, selectedModifiers: [...c.selectedModifiers, { modifierId: mod.id, name: mod.name, price: mod.priceModifier }] };
    }));
  }, []);

  const getItemTotal = useCallback((c: CartItem) => {
    const base = c.menuItem.discountPrice ?? c.menuItem.price;
    const modTotal = c.selectedModifiers.reduce((s, m) => s + m.price, 0);
    return (base + modTotal) * c.quantity;
  }, []);

  /* ── Totals ── */
  const subtotal = useMemo(() => cart.reduce((sum, c) => sum + getItemTotal(c), 0), [cart, getItemTotal]);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  /* ── Mutation ── */
  const createOrderMut = useMutation({
    mutationFn: (data: Parameters<typeof orderService.createOrder>[0]) =>
      orderService.createOrder(data),
    onSuccess: () => {
      toast.success('Order placed!');
      setCart([]);
      setCustomerName('');
      setNotes('');
      setActiveCartItemId(null);
      setView('tables');
      setSelectedTable(null);
      setMenuSearch('');
      setSelectedCategory('all');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['runningTables'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: () => toast.error('Failed to place order'),
  });

  const handlePlaceOrder = () => {
    if (cart.length === 0 || !selectedTable) return;
    createOrderMut.mutate({
      tableId: selectedTable.id,
      items: cart.map(c => ({
        menuItemId: c.menuItem.id,
        quantity: c.quantity,
        notes: c.notes,
        modifiers: c.selectedModifiers.length > 0
          ? c.selectedModifiers.map(m => ({ modifierId: m.modifierId }))
          : undefined,
      })),
      customerName: customerName.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  /* ── Table selection ── */
  const handleTableSelect = (table: Table) => {
    setSelectedTable(table);
    setView('order');
    setCart([]);
    setMenuSearch('');
    setSelectedCategory('all');
    setCustomerName('');
    setNotes('');
    setActiveCartItemId(null);
  };

  const handleBackToTables = () => {
    setView('tables');
    setSelectedTable(null);
    setCart([]);
    setNotes('');
    setActiveCartItemId(null);
  };

  /* ═══════════════════ RENDER ═══════════════════ */

  // ════════ TABLE VIEW ════════
  if (view === 'tables') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Captain View</h1>
          <p className="text-sm text-text-muted mt-0.5">Select a table to take orders</p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries({ available: 'Available', occupied: 'Occupied', reserved: 'Reserved', cleaning: 'Cleaning' }).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOTS[k]}`} />
              {v}
            </span>
          ))}
        </div>

        {tablesLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-xl border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          groupedTables.map(group => (
            <div key={group.sectionName}>
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
                {group.sectionName}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {group.tables.map(table => {
                  const running = runningMap.get(table.id);
                  const isOccupied = table.status === 'occupied';
                  return (
                    <motion.button
                      key={table.id}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleTableSelect(table)}
                      className={`relative rounded-xl border-2 p-4 text-left transition-all hover:shadow-md active:shadow-sm ${STATUS_COLORS[table.status] || STATUS_COLORS.available}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold">
                          {table.name || `T${table.number}`}
                        </span>
                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOTS[table.status] || STATUS_DOTS.available}`} />
                      </div>
                      <p className="text-xs opacity-70 mt-0.5">
                        {table.capacity && `${table.capacity} seats`}
                      </p>
                      {isOccupied && running && (
                        <div className="mt-2 pt-2 border-t border-current/10 text-xs space-y-0.5">
                          <p className="font-semibold">{running.orderCount} order{running.orderCount !== 1 ? 's' : ''}</p>
                          <p className="opacity-70">{formatCurrency(running.totalAmount)}</p>
                          <p className="opacity-60">{running.durationInMinutes}m ago</p>
                        </div>
                      )}
                      {!isOccupied && (
                        <p className="text-xs font-medium mt-2 opacity-80">Tap to take order</p>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ════════ ORDER VIEW ════════
  return (
    <div className="-m-6 flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* ═══ Top bar ═══ */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleBackToTables} className="btn-icon">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              {selectedTable?.name || `Table ${selectedTable?.number}`}
            </h1>
            <p className="text-sm text-text-muted">
              {selectedTable?.section?.name && `${selectedTable.section.name} · `}
              {selectedTable?.status === 'occupied' ? 'Occupied' : 'Available'}
              {selectedTable?.capacity ? ` · ${selectedTable.capacity} seats` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Table indicator pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="text-sm font-semibold text-primary">
              {selectedTable?.name || `Table ${selectedTable?.number}`}
            </span>
          </div>

          {/* Customer name */}
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-36"
          />

          {/* Back to tables */}
          <button
            onClick={handleBackToTables}
            className="btn-primary rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Change Table
          </button>
        </div>
      </div>

      {/* ═══ Body ═══ */}
      <div className="flex flex-1 overflow-hidden bg-background">

        {/* ── LEFT: Current Ticket ── */}
        <div className="w-[300px] xl:w-[340px] flex flex-col bg-white border-r border-gray-200 shrink-0">
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
                  const isActive = activeCartItemId === c.cartId;
                  return (
                    <div
                      key={c.cartId}
                      ref={(el) => { if (el) cartItemRefs.current.set(c.cartId, el); else cartItemRefs.current.delete(c.cartId); }}
                      onClick={() => setActiveCartItemId(isActive ? null : c.cartId)}
                      className={`border rounded-lg p-3 relative cursor-pointer transition-all ${
                        isActive
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Remove button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromCart(c.cartId); if (isActive) setActiveCartItemId(null); }}
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
                                      onClick={(e) => { e.stopPropagation(); toggleModifier(c.cartId, group.id, group.maxSelections, opt); }}
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

                      {/* Total row */}
                      <div className="flex items-center justify-end mt-2.5">
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
              onClick={handlePlaceOrder}
              disabled={cart.length === 0 || createOrderMut.isPending}
              className="w-full mt-2 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            >
              {createOrderMut.isPending ? (
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
          {/* Search + Category tabs */}
          <div className="px-5 py-3 bg-white border-b border-gray-200 shrink-0">
            {/* Search bar */}
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={menuSearch}
                onChange={e => setMenuSearch(e.target.value)}
                placeholder="Search menu items…"
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
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
  );
}
