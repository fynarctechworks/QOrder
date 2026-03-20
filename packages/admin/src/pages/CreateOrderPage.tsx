import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { menuService, tableService, settingsService, orderService } from '../services';
import { useCurrency } from '../hooks/useCurrency';
import DietBadge from '../components/DietBadge';
import Modal from '../components/Modal';
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

interface HeldTicket {
  id: string;
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  notes: string;
  selectedTable: string;
  heldAt: number;
}

/* ─── Held tickets localStorage helpers ── */
const HELD_KEY = 'createorder_held_tickets';
function loadHeldTickets(): HeldTicket[] {
  try {
    const raw = localStorage.getItem(HELD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHeldTickets(tickets: HeldTicket[]) {
  localStorage.setItem(HELD_KEY, JSON.stringify(tickets));
}

/* ═══════════════════ Create Order Page ═══════════════════ */
export default function CreateOrderPage() {
  const formatCurrency = useCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ── Data fetching ── */
  const { data: menuItems = [], isError: menuErr, refetch: refetchMenu } = useQuery({
    queryKey: ['menu'],
    queryFn: menuService.getItems,
  });

  const { data: categories = [], isError: catErr, refetch: refetchCat } = useQuery({
    queryKey: ['categories'],
    queryFn: menuService.getCategories,
  });

  const { data: tables = [], isError: tabErr, refetch: refetchTables } = useQuery({
    queryKey: ['tables'],
    queryFn: tableService.getAll,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
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

  // Hold & Recall state
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>(loadHeldTickets);
  const [showRecall, setShowRecall] = useState(false);
  const [showCart, setShowCart] = useState(false);

  // Discount state
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');

  /* ── Mutation ── */
  const createOrderMut = useMutation({
    mutationFn: (data: Parameters<typeof orderService.createOrder>[0]) =>
      orderService.createOrder(data),
    onSuccess: (_data, vars) => {
      toast.success('Order created');
      resetForm();
      qc.invalidateQueries({ queryKey: ['orders'] });
      if (vars.tableId) {
        qc.invalidateQueries({ queryKey: ['runningTables'] });
        qc.invalidateQueries({ queryKey: ['tables'] });
      }
    },
    onError: () => toast.error('Failed to create order'),
  });

  const resetForm = () => {
    setCart([]);
    setSelectedTable('');
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setMenuSearch('');
    setSelectedCategory('all');
    setActiveCartItemId(null);
  };

  /* ── Hold current ticket ── */
  const handleHold = () => {
    if (cart.length === 0) return;
    const ticket: HeldTicket = {
      id: `held-${Date.now()}`,
      cart: [...cart],
      customerName,
      customerPhone,
      notes,
      selectedTable,
      heldAt: Date.now(),
    };
    const updated = [...heldTickets, ticket];
    setHeldTickets(updated);
    saveHeldTickets(updated);
    toast.success('Ticket on hold');
    setCart([]);
    setSelectedTable('');
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setActiveCartItemId(null);
  };

  /* ── Recall a held ticket ── */
  const handleRecall = (ticketId: string) => {
    const ticket = heldTickets.find(t => t.id === ticketId);
    if (!ticket) return;
    if (cart.length > 0) {
      const currentTicket: HeldTicket = {
        id: `held-${Date.now()}`,
        cart: [...cart],
        customerName,
        customerPhone,
        notes,
        selectedTable,
        heldAt: Date.now(),
      };
      const withCurrent = [...heldTickets, currentTicket].filter(t => t.id !== ticketId);
      setHeldTickets(withCurrent);
      saveHeldTickets(withCurrent);
    } else {
      const without = heldTickets.filter(t => t.id !== ticketId);
      setHeldTickets(without);
      saveHeldTickets(without);
    }
    setCart(ticket.cart);
    setCustomerName(ticket.customerName);
    setCustomerPhone(ticket.customerPhone);
    setNotes(ticket.notes);
    setSelectedTable(ticket.selectedTable);
    setActiveCartItemId(null);
    setShowRecall(false);
    toast.success('Ticket recalled');
  };

  /* ── Delete a held ticket ── */
  const handleDeleteHeld = (ticketId: string) => {
    const updated = heldTickets.filter(t => t.id !== ticketId);
    setHeldTickets(updated);
    saveHeldTickets(updated);
  };

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
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems, selectedCategory, menuSearch]);

  /* ── Active categories (that have available items) ── */
  const activeCategories = useMemo(() => {
    const catIds = new Set(menuItems.filter(i => i.isAvailable).map(i => i.categoryId));
    return categories.filter(c => catIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, menuItems]);

  /* ── Tables for dropdown ── */
  const dropdownTables = useMemo(() => {
    return tables.filter((t: Table) => t.status === 'available' || t.status === 'occupied')
      .sort((a: Table, b: Table) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }, [tables]);

  // Group dropdown tables by section for optgroup display
  const groupedDropdownTables = useMemo(() => {
    const hasSections = dropdownTables.some((t: Table) => t.sectionId);
    if (!hasSections) return null;

    const groups: { sectionName: string | null; tables: Table[] }[] = [];
    const sectionMap = new Map<string | null, Table[]>();

    dropdownTables.forEach((t: Table) => {
      const key = t.sectionId ?? null;
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key)!.push(t);
    });

    const entries = Array.from(sectionMap.entries());
    entries.sort((a, b) => {
      if (a[0] === null && b[0] !== null) return 1;
      if (a[0] !== null && b[0] === null) return -1;
      const aSec = a[1][0]?.section;
      const bSec = b[1][0]?.section;
      return (aSec?.sortOrder ?? 0) - (bSec?.sortOrder ?? 0);
    });

    entries.forEach(([, tbs]) => {
      const sec = tbs[0]?.section;
      groups.push({ sectionName: sec?.name ?? null, tables: tbs });
    });

    return groups;
  }, [dropdownTables]);

  /* ── Refs for auto-scroll ── */
  const cartItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastAddedIdRef = useRef<string | null>(null);
  const cartIdCounter = useRef(0);

  const categoryBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (lastAddedIdRef.current) {
      const el = cartItemRefs.current.get(lastAddedIdRef.current);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      lastAddedIdRef.current = null;
    }
  }, [cart]);

  useEffect(() => {
    const targetKey = selectedCategory === 'all' ? 'all' : selectedCategory;
    const btn = categoryBtnRefs.current.get(targetKey);
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedCategory]);


  /* ── Cart helpers ── */
  const addToCart = useCallback((item: MenuItem) => {
    const hasCustomizations = (item.customizationGroups?.length ?? 0) > 0;
    if (!hasCustomizations) {
      const existing = cart.find(c => c.menuItem.id === item.id && c.selectedModifiers.length === 0);
      if (existing) {
        setCart(prev => prev.map(c =>
          c.cartId === existing.cartId ? { ...c, quantity: c.quantity + 1 } : c
        ));
        lastAddedIdRef.current = existing.cartId;
        setActiveCartItemId(existing.cartId);
        return;
      }
    }

    const id = `cart-${++cartIdCounter.current}`;
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
  }, [cart]);

  const updateQuantity = useCallback((cartId: string, delta: number) => {
    setCart(prev => prev.reduce<CartItem[]>((acc, c) => {
      if (c.cartId !== cartId) { acc.push(c); return acc; }
      const newQty = c.quantity + delta;
      if (newQty <= 0) return acc;
      acc.push({ ...c, quantity: newQty });
      return acc;
    }, []));
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

  const removeFromCart = useCallback((cartId: string) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId));
  }, []);

  const getCartQty = useCallback((menuItemId: string) => {
    return cart.filter(c => c.menuItem.id === menuItemId).reduce((sum, c) => sum + c.quantity, 0);
  }, [cart]);

  const totalItems = useMemo(() => cart.reduce((s, c) => s + c.quantity, 0), [cart]);

  /* ── Totals ── */
  const subtotal = useMemo(() => {
    return cart.reduce((sum, c) => {
      const basePrice = c.menuItem.discountPrice ?? c.menuItem.price;
      const modifierTotal = c.selectedModifiers.reduce((s, m) => s + m.price, 0);
      return sum + (basePrice + modifierTotal) * c.quantity;
    }, 0);
  }, [cart]);

  const taxAmount = subtotal * (taxRate / 100);
  const discountNum = parseFloat(discountValue) || 0;
  const discountAmount = discountType === 'PERCENTAGE'
    ? Math.min(subtotal * (discountNum / 100), subtotal)
    : Math.min(discountNum, subtotal);
  const total = subtotal - discountAmount + taxAmount;

  /* ── Submit ── */
  const handleSubmit = () => {
    if (cart.length === 0) return;
    createOrderMut.mutate({
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
      ...(discountAmount > 0 ? { manualDiscount: discountNum, manualDiscountType: discountType } : {}),
    });
  };

  return (
    <div className="-m-3 md:-m-6 flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {dataError && (
        <div className="bg-red-50 border-b border-red-200 px-3 md:px-6 py-2 flex items-center gap-3">
          <span className="text-sm text-red-600">Failed to load some data.</span>
          <button className="text-sm font-medium text-red-700 underline" onClick={() => { refetchMenu(); refetchCat(); refetchTables(); }}>Retry</button>
        </div>
      )}
      {/* ═══ Top bar ═══ */}
      <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-end gap-3 shrink-0">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {/* View Orders */}
          <button
            onClick={() => navigate('/orders')}
            className="rounded-xl text-sm px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-text-secondary active:scale-[0.97] flex items-center gap-2 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            View Orders
          </button>
          {/* Search menu items */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={menuSearch}
              onChange={e => setMenuSearch(e.target.value)}
              placeholder="Search menu items…"
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-44 sm:w-56"
            />
          </div>
          {/* Table select */}
          <select
            value={selectedTable}
            onChange={e => setSelectedTable(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white min-w-0 w-full sm:w-auto sm:min-w-[160px]"
          >
            <option value="">Takeaway</option>
            {groupedDropdownTables ? (
              groupedDropdownTables.map((group) => (
                <optgroup key={group.sectionName ?? 'unassigned'} label={group.sectionName ?? 'Unassigned'}>
                  {group.tables.map((t: Table) => (
                    <option
                      key={t.id}
                      value={t.id}
                    >
                      {t.name ? `${t.name} (${t.number})` : `Table ${t.number}`}
                      {t.status === 'occupied' ? ' • Occupied' : ''}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : (
              dropdownTables.map((t: Table) => (
                <option
                  key={t.id}
                  value={t.id}
                >
                  {t.name ? `${t.name} (${t.number})` : `Table ${t.number}`}
                  {t.status === 'occupied' ? ' • Occupied' : ''}
                </option>
              ))
            )}
          </select>

          {/* Customer name */}
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-28 sm:w-36"
          />

          {/* Customer phone */}
          <input
            type="tel"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="Phone number"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-28 sm:w-36"
          />

          {/* New Order (reset) */}
          <button
            onClick={resetForm}
            className="btn-primary rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Order
          </button>

          {/* Recall */}
          <button
            onClick={() => setShowRecall(true)}
            className="relative rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-2 border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recall
            {heldTickets.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {heldTickets.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ═══ Body ═══ */}
      <div className="flex flex-1 overflow-hidden bg-background relative">

        {/* Mobile cart overlay */}
        {showCart && (
          <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setShowCart(false)} />
        )}

        {/* ── RIGHT: Current Ticket ── */}
        <div className={`fixed inset-y-0 right-0 z-40 w-[300px] md:static md:z-auto md:w-[40%] flex flex-col bg-white border-l border-gray-200 shrink-0 transform transition-transform duration-200 order-last ${showCart ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0`}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Current Ticket</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCart(false)} className="md:hidden text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              {cart.length > 0 && (
                <button
                  onClick={() => { setCart([]); setActiveCartItemId(null); }}
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
                <p className="text-xs text-gray-300 mt-0.5">Click menu items to add</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
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
                      className={`border rounded-lg p-2 cursor-pointer transition-all flex flex-col gap-1 ${
                        isActive && hasGroups ? 'col-span-3 border-primary bg-primary/5 ring-1 ring-primary/20'
                          : isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 flex-1 min-w-0">{c.menuItem.name}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFromCart(c.cartId); if (isActive) setActiveCartItemId(null); }}
                          className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400">{formatCurrency(basePrice)}</p>

                      {/* Selected modifiers as text lines */}
                      {c.selectedModifiers.length > 0 && !isActive && (
                        <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                          {c.selectedModifiers.map(m => (
                            <span key={m.modifierId} className="text-[10px] text-primary leading-tight">
                              +{m.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Modifier buttons — only on active/focused item */}
                      {hasGroups && isActive && (
                        <div className="mt-1 space-y-1.5">
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

                      {/* Total row with quantity controls */}
                      <div className="flex items-center justify-between mt-auto pt-1" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => updateQuantity(c.cartId, -1)}
                            className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors active:scale-90"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                            </svg>
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-gray-900 tabular-nums">{c.quantity}</span>
                          <button
                            onClick={() => updateQuantity(c.cartId, 1)}
                            className="w-5 h-5 rounded bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors active:scale-90"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                        <span className="text-xs font-bold text-gray-900 tabular-nums">{formatCurrency(lineTotal)}</span>
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
            {/* Discount */}
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
              <select
                value={discountType}
                onChange={e => setDiscountType(e.target.value as 'PERCENTAGE' | 'FLAT')}
                className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:border-primary"
              >
                <option value="PERCENTAGE">%</option>
                <option value="FLAT">Flat</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                placeholder="0"
                className="w-16 text-xs border border-gray-200 rounded-md px-2 py-1 text-center bg-white focus:outline-none focus:border-primary"
              />
              {discountAmount > 0 && (
                <span className="ml-auto text-xs font-medium text-orange-600 tabular-nums">-{formatCurrency(discountAmount)}</span>
              )}
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
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleHold}
                disabled={cart.length === 0}
                className="flex-1 py-3 border-2 border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Hold
              </button>
              <button
                onClick={handleSubmit}
                disabled={cart.length === 0 || createOrderMut.isPending}
                className="flex-1 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm flex items-center justify-center gap-1.5"
              >
                {createOrderMut.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Placing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Place • {formatCurrency(total)}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── LEFT: Menu grid ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile cart toggle FAB */}
          <button
            onClick={() => setShowCart(true)}
            className="md:hidden fixed bottom-6 left-6 z-30 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{totalItems}</span>
            )}
          </button>
          {/* Search + Category tabs */}
          <div className="px-3 md:px-5 py-3 bg-white border-b border-gray-200 shrink-0">
            {/* Category sticky rail */}
            <div className="sticky top-0 z-10 -mx-3 md:-mx-5 px-3 md:px-5 py-3 bg-white/95 backdrop-blur border-y border-gray-100">
              <div className="flex flex-wrap items-center gap-2">
                  <button
                    ref={(el) => {
                      if (el) categoryBtnRefs.current.set('all', el);
                      else categoryBtnRefs.current.delete('all');
                    }}
                    onClick={() => setSelectedCategory('all')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all border ${
                      selectedCategory === 'all'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
                    }`}
                  >
                    All
                  </button>

                  {activeCategories.map((cat: Category) => (
                    <button
                      key={cat.id}
                      ref={(el) => {
                        if (el) categoryBtnRefs.current.set(cat.id, el);
                        else categoryBtnRefs.current.delete(cat.id);
                      }}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all border ${
                        selectedCategory === cat.id
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
                      }`}
                      title={cat.name}
                    >
                      {cat.name}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-3 md:p-5">
            {availableItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <svg className="w-16 h-16 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm font-medium">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
                      {qty > 0 && (
                        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow-sm">
                          {qty}
                        </span>
                      )}

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

      {/* ═══ Recall Modal ═══ */}
      <Modal open={showRecall} onClose={() => setShowRecall(false)} title="Held Tickets" maxWidth="max-w-3xl">
        {heldTickets.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">No held tickets</p>
            <p className="text-xs mt-1">Hold a ticket to park it here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[75vh] overflow-y-auto">
            {heldTickets.map(ticket => {
              const itemCount = ticket.cart.reduce((s, c) => s + c.quantity, 0);
              const ticketTotal = ticket.cart.reduce((sum, c) => {
                const base = c.menuItem.discountPrice ?? c.menuItem.price;
                const modT = c.selectedModifiers.reduce((s, m) => s + m.price, 0);
                return sum + (base + modT) * c.quantity;
              }, 0);
              const mins = Math.round((Date.now() - ticket.heldAt) / 60000);
              const timeAgo = mins < 1 ? 'Just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;

              return (
                <div
                  key={ticket.id}
                  className="border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:bg-amber-50/30 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {ticket.customerName || 'Guest'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {itemCount} item{itemCount !== 1 ? 's' : ''} • {formatCurrency(ticketTotal)} • {timeAgo}
                        {ticket.selectedTable && ' • Dine-in'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteHeld(ticket.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Discard ticket"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <div className="text-xs text-gray-500 space-y-0.5 mb-3">
                    {ticket.cart.slice(0, 4).map((c, i) => (
                      <div key={i}>
                        {c.quantity}x {c.menuItem.name}
                        {c.selectedModifiers.length > 0 && (
                          <span className="text-gray-400"> ({c.selectedModifiers.map(m => m.name).join(', ')})</span>
                        )}
                      </div>
                    ))}
                    {ticket.cart.length > 4 && (
                      <div className="text-gray-400">+{ticket.cart.length - 4} more…</div>
                    )}
                  </div>

                  <button
                    onClick={() => handleRecall(ticket.id)}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold text-sm transition-colors active:scale-[0.98]"
                  >
                    Recall Ticket
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
