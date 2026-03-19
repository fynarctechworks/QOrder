import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { panCornerService, type PanCornerCategoryData, type PanCornerItemData } from '../services/panCornerService';
import { settingsService } from '../services';
import type { PanCornerCategory, PanCornerItem } from '../types';
import { resolveImg } from '../utils/resolveImg';
import Modal from '../components/Modal';
import PanCornerCategoryForm from '../components/pan-corner/PanCornerCategoryForm';
import PanCornerItemForm from '../components/pan-corner/PanCornerItemForm';

/* ─── Print ──────────────────────────────────────────────────────────────── */
function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PRINT_CSS = `
  *{color:#000!important;font-weight:bold!important}
  body{font-family:'Courier New',monospace;max-width:300px;margin:0 auto;padding:0;font-size:14px;-webkit-print-color-adjust:exact}
  .center{text-align:center}
  .restaurant{font-size:18px;font-weight:bold;margin:0 0 4px}
  .divider{border-top:2px dashed #000;margin:10px 0}
  .token-box{text-align:center;border:3px solid #000;border-radius:8px;padding:12px;margin:12px 0}
  .token-label{font-size:13px;text-transform:uppercase;letter-spacing:0.1em;font-weight:bold}
  .token-num{font-size:36px;font-weight:bold;line-height:1.1}
  .item{display:flex;gap:6px;padding:6px 0;align-items:flex-start;font-size:14px}
  .qty{min-width:28px;font-weight:bold;font-size:15px}
  .name{flex:1;font-size:14px;font-weight:bold}
  .price{text-align:right;white-space:nowrap;font-weight:bold;font-size:14px}
  .total-row{display:flex;justify-content:space-between;padding:3px 0;font-size:14px}
  .total-row.grand{font-size:16px;font-weight:bold;border-top:2px solid #000;padding-top:6px;margin-top:4px}
  .method{text-align:center;font-size:13px;margin-top:8px;font-weight:bold}
  .footer{text-align:center;font-size:12px;margin-top:12px;font-weight:bold}
  @page{size:80mm auto;margin:0}
  @media print{html,body{width:80mm;margin:0;padding:0;overflow:hidden}*{color:#000!important;font-weight:bold!important}}`;

function firePrintJob(html: string) {
  const w = window.open('', '_blank', 'width=420,height=650');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Pan Corner Receipt</title><style>${PRINT_CSS}</style></head><body style="padding:16px">${html}</body></html>`);
  w.document.close();
  w.print();
  w.onafterprint = () => w.close();
}

function printPanCornerReceipt(
  order: { orderNumber: string; total: number; tokenNumber: number },
  cartItems: CartItem[],
  paymentMethod: string,
  restaurantName: string,
  discountAmount: number,
  notes: string
) {
  const itemsHtml = cartItems.map(c => {
    const price = c.item.discountPrice ?? c.item.price;
    return `<div class="item"><span class="qty">${c.quantity}x</span><div class="name">${escapeHtml(c.item.name)}</div><span class="price">&#8377;${(price * c.quantity).toFixed(2)}</span></div>`;
  }).join('');

  const subtotal = cartItems.reduce((s, c) => s + (c.item.discountPrice ?? c.item.price) * c.quantity, 0);
  const tokenLabel = String(order.tokenNumber).padStart(3, '0');

  const html = `
    <p class="restaurant center">${escapeHtml(restaurantName)}</p>
    <div class="token-box">
      <div class="token-label">Token Number</div>
      <div class="token-num">${tokenLabel}</div>
    </div>
    <p class="center" style="font-size:16px;margin:4px 0;font-weight:bold">Pan Corner</p>
    <div class="divider"></div>
    ${itemsHtml}
    <div class="divider"></div>
    <div class="total-row"><span>Subtotal</span><span>&#8377;${subtotal.toFixed(2)}</span></div>
    ${discountAmount > 0 ? `<div class="total-row"><span>Discount</span><span>-&#8377;${discountAmount.toFixed(2)}</span></div>` : ''}
    <div class="total-row grand"><span>Total</span><span>&#8377;${Number(order.total).toFixed(2)}</span></div>
    <div class="method">Paid via ${escapeHtml(paymentMethod)}</div>
    ${notes ? `<div class="divider"></div><p style="font-size:12px;text-align:center;font-weight:bold">${escapeHtml(notes)}</p>` : ''}
    <div class="footer">Thank you! Please wait for your token to be called.</div>`;

  firePrintJob(html);
}

/* ─── Hold & Recall ──────────────────────────────────────────────────────── */
interface HeldTicket {
  id: string;
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  notes: string;
  heldAt: number;
}
const PC_HELD_KEY = 'pc_held_tickets';
function loadHeld(): HeldTicket[] {
  try { return JSON.parse(localStorage.getItem(PC_HELD_KEY) || '[]'); } catch { return []; }
}
function saveHeld(tickets: HeldTicket[]) {
  localStorage.setItem(PC_HELD_KEY, JSON.stringify(tickets));
}

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
  const [notes, setNotes] = useState('');
  const [selectedPayMethod, setSelectedPayMethod] = useState<PaymentMethod | null>(null);
  const [settled, setSettled] = useState(false);

  /* ── Discount ── */
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');

  /* ── Print toggle ── */
  const [autoPrint, setAutoPrint] = useState(true);
  const pendingPrintRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (settled && pendingPrintRef.current) {
      const fn = pendingPrintRef.current;
      pendingPrintRef.current = null;
      fn();
    }
  }, [settled]);

  /* ── Hold & Recall ── */
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>(loadHeld);
  const [showRecall, setShowRecall] = useState(false);

  /* ── Manage modals ── */
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PanCornerCategory | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PanCornerItem | null>(null);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
  const [manageModal, setManageModal] = useState<'categories' | 'items' | null>(null);

  /* ── Data ── */
  const { data: categories = [], isLoading: catsLoading } = useQuery<PanCornerCategory[]>({
    queryKey: ['panCornerCategories'],
    queryFn: panCornerService.getCategories,
    staleTime: 60_000,
  });

  const { data: allItems = [] } = useQuery<PanCornerItem[]>({
    queryKey: ['panCornerItems'],
    queryFn: () => panCornerService.getItems(),
    staleTime: 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 5 * 60_000,
  });
  const restaurantName = (settings?.name as string) || 'Pan Corner';

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

  const discountAmount = useMemo(() => {
    const val = parseFloat(discountValue);
    if (!val || val <= 0) return 0;
    if (discountType === 'PERCENTAGE') return Math.min(subtotal * val / 100, subtotal);
    return Math.min(val, subtotal);
  }, [discountValue, discountType, subtotal]);

  const displayTotal = subtotal - discountAmount;

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

  /* ── Delete mutations ── */
  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => panCornerService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panCornerCategories'] });
      toast.success('Category deleted');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete category'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => panCornerService.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panCornerItems'] });
      toast.success('Item deleted');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete item'),
  });

  const handleItemSubmit = (data: PanCornerItemData) => {
    if (editingItem) updateItemMutation.mutate({ id: editingItem.id, data });
    else createItemMutation.mutate(data);
  };

  /* ── Checkout ── */
  const checkoutMutation = useMutation({
    mutationFn: () =>
      panCornerService.checkout({
        items: cart.map((c) => ({ panCornerItemId: c.item.id, quantity: c.quantity })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        manualDiscount: discountAmount > 0 ? discountAmount : undefined,
        manualDiscountType: discountAmount > 0 ? 'FLAT' : undefined,
      }),
    onSuccess: (order) => {
      if (autoPrint) {
        const cartSnap = [...cart];
        const method = selectedPayMethod ?? 'CASH';
        const discount = discountAmount;
        const notesSnap = notes.trim();
        const name = restaurantName;
        pendingPrintRef.current = () => printPanCornerReceipt(order, cartSnap, method, name, discount, notesSnap);
      }
      setSettled(true);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`PC-${String(order.tokenNumber).padStart(3, '0')} — Settled!`);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create bill'),
  });

  const handleOpenSettle = () => {
    if (cart.length === 0) return;
    setSelectedPayMethod('CASH');
    setSettled(false);
    setShowSettlement(true);
  };

  const resetCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setDiscountValue('');
    setDiscountType('PERCENTAGE');
    setSettled(false);
    setShowSettlement(false);
  };

  const handleCloseSettlement = () => {
    if (settled) resetCart();
    else setShowSettlement(false);
  };

  /* ── Hold & Recall ── */
  const handleHold = () => {
    if (cart.length === 0) return;
    const ticket: HeldTicket = {
      id: `pc-held-${Date.now()}`,
      cart: [...cart],
      customerName,
      customerPhone,
      notes,
      heldAt: Date.now(),
    };
    const updated = [...heldTickets, ticket];
    setHeldTickets(updated);
    saveHeld(updated);
    resetCart();
    toast.success('Ticket held');
  };

  const handleRecall = (ticketId: string) => {
    const ticket = heldTickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    if (cart.length > 0) {
      const current: HeldTicket = { id: `pc-held-${Date.now()}`, cart: [...cart], customerName, customerPhone, notes, heldAt: Date.now() };
      const updated = [...heldTickets.filter((t) => t.id !== ticketId), current];
      setHeldTickets(updated);
      saveHeld(updated);
    } else {
      const updated = heldTickets.filter((t) => t.id !== ticketId);
      setHeldTickets(updated);
      saveHeld(updated);
    }
    setCart(ticket.cart);
    setCustomerName(ticket.customerName);
    setCustomerPhone(ticket.customerPhone);
    setNotes(ticket.notes);
    setShowRecall(false);
    toast.success('Ticket recalled');
  };

  const handleDeleteHeld = (ticketId: string) => {
    const updated = heldTickets.filter((t) => t.id !== ticketId);
    setHeldTickets(updated);
    saveHeld(updated);
  };

  /* ── Empty state ── */
  if (!catsLoading && activeCategories.length === 0) {
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
          {/* Print toggle */}
          <button
            onClick={() => setAutoPrint((v) => !v)}
            title={autoPrint ? 'Auto-print ON — click to disable' : 'Auto-print OFF — click to enable'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              autoPrint
                ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print {autoPrint ? 'ON' : 'OFF'}
          </button>

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

          {/* Recall button */}
          <button
            onClick={() => setShowRecall(true)}
            className="relative rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-2 border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recall
            {heldTickets.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{heldTickets.length}</span>
            )}
          </button>

          {/* Menu dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuDropdownOpen((v) => !v)}
              className="btn-primary rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-1.5"
            >
              Menu
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 z-20 py-1 overflow-hidden">
                  <button
                    onClick={() => { setMenuDropdownOpen(false); setManageModal('categories'); }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2.5 text-text-primary"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    Manage Categories
                  </button>
                  <button
                    onClick={() => { setMenuDropdownOpen(false); setManageModal('items'); }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2.5 text-text-primary"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Manage Items
                  </button>
                </div>
              </>
            )}
          </div>
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
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
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
              <div className="grid grid-cols-3 gap-2">
                {cart.map((c) => {
                  const price = c.item.discountPrice ?? c.item.price;
                  const lineTotal = price * c.quantity;
                  return (
                    <div
                      key={c.item.id}
                      className="border rounded-lg p-2 border-gray-200 hover:border-gray-300 transition-colors flex flex-col gap-1"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 flex-1 min-w-0">
                          {c.item.isAgeRestricted && (
                            <span className="inline-flex items-center mr-1 px-1 py-0 bg-red-100 text-red-600 rounded text-[10px] font-semibold">18+</span>
                          )}
                          {c.item.name}
                        </p>
                        <button
                          onClick={() => removeFromCart(c.item.id)}
                          className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400">₹{price.toFixed(2)}</p>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => updateQty(c.item.id, -1)}
                            className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors active:scale-90"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                            </svg>
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-gray-900 tabular-nums">{c.quantity}</span>
                          <button
                            onClick={() => updateQty(c.item.id, 1)}
                            className="w-5 h-5 rounded bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors active:scale-90"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                        <span className="text-xs font-bold text-gray-900 tabular-nums">₹{lineTotal.toFixed(2)}</span>
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
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Order notes (optional)…"
              />
            </div>
          )}

          {/* Totals + Settle */}
          <div className="px-4 py-3 border-t-2 border-gray-200 bg-gray-50/50 shrink-0 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900 tabular-nums">₹{subtotal.toFixed(2)}</span>
            </div>

            {/* Discount */}
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FLAT')}
                className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:border-primary"
              >
                <option value="PERCENTAGE">%</option>
                <option value="FLAT">Flat</option>
              </select>
              <input
                type="number" min="0" step="0.01" value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
                className="w-16 text-xs border border-gray-200 rounded-md px-2 py-1 text-center bg-white focus:outline-none focus:border-primary"
              />
              {discountAmount > 0 && (
                <span className="ml-auto text-xs font-medium text-orange-600 tabular-nums">-₹{discountAmount.toFixed(2)}</span>
              )}
            </div>

            <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-200">
              <span>Total</span>
              <span className="tabular-nums">₹{displayTotal.toFixed(2)}</span>
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
                onClick={handleOpenSettle}
                disabled={cart.length === 0}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Settle • ₹{displayTotal.toFixed(2)}
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

                    </div>
                  );
                })}

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
                    {c.item.isAgeRestricted && <span className="inline-flex items-center mr-1 px-1 py-0 bg-red-100 text-red-600 rounded text-[10px] font-semibold">18+</span>}
                    {c.quantity}× {c.item.name}
                  </span>
                  <span className="text-text-primary">₹{((c.item.discountPrice ?? c.item.price) * c.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-border-primary my-2" />
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-orange-600 mb-1">
                  <span>Discount</span><span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm">
                <span>Total</span><span>₹{displayTotal.toFixed(2)}</span>
              </div>
              <div className="border-t border-border-primary mt-3 pt-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Paid via</p>
                <p className={`text-sm font-semibold ${PAYMENT_METHODS.find((m) => m.value === selectedPayMethod)?.color}`}>{selectedPayMethod ?? 'CASH'}</p>
              </div>
            </div>

            <button onClick={handleCloseSettlement}
              className="w-full max-w-sm mx-auto px-5 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold transition-colors text-sm block">
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
                <p className="text-2xl font-bold text-text-primary">₹{displayTotal.toFixed(2)}</p>
                <p className="text-xs text-text-muted">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Customer details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Customer Name</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Phone Number</label>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
            </div>

            {/* Pay via — QSR style */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Pay via</p>
              <div className="grid grid-cols-3 gap-2.5">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m.value} onClick={() => setSelectedPayMethod(m.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      selectedPayMethod === m.value
                        ? `${m.bg} ${m.color} border-current shadow-sm`
                        : 'border-gray-200 text-gray-500 hover:border-primary hover:bg-primary/5'
                    }`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                    <span className="text-sm font-semibold">{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Bill summary + settle — appears after method selected */}
              {selectedPayMethod && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Bill Summary</p>
                  <div className="space-y-1">
                    {cart.map((c) => (
                      <div key={c.item.id} className="flex justify-between text-sm">
                        <span className="text-text-secondary truncate">{c.quantity}× {c.item.name}</span>
                        <span className="text-text-primary shrink-0 ml-2">₹{((c.item.discountPrice ?? c.item.price) * c.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-200 pt-2 space-y-1">
                    <div className="flex justify-between text-sm text-text-secondary">
                      <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-orange-600">
                        <span>Discount</span><span>-₹{discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-sm pt-1 border-t border-gray-200 mt-1">
                      <span>Total</span><span>₹{displayTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm pt-1">
                    <span className={PAYMENT_METHODS.find((m) => m.value === selectedPayMethod)?.color}>
                      Paying via {selectedPayMethod}
                    </span>
                    <span className="font-semibold text-text-primary">₹{displayTotal.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {checkoutMutation.isPending ? (
                      <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Settling…</>
                    ) : (
                      <>Settle Bill — ₹{displayTotal.toFixed(2)}</>
                    )}
                  </button>
                </div>
              )}
            </div>
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

      {/* Recall Modal */}
      <Modal open={showRecall} title="Held Tickets" onClose={() => setShowRecall(false)} maxWidth="max-w-2xl">
        {heldTickets.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">No held tickets</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[75vh] overflow-y-auto">
            {heldTickets.map((ticket) => {
              const ticketTotal = ticket.cart.reduce((s, c) => s + (c.item.discountPrice ?? c.item.price) * c.quantity, 0);
              return (
                <div key={ticket.id} className="border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:bg-amber-50/30 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{ticket.customerName || 'Guest'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ticket.cart.length} item{ticket.cart.length !== 1 ? 's' : ''} · ₹{ticketTotal.toFixed(2)} · {new Date(ticket.heldAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteHeld(ticket.id)} className="text-gray-400 hover:text-red-500 p-1 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5 mb-3">
                    {ticket.cart.slice(0, 4).map((c, i) => (
                      <div key={i}>{c.quantity}× {c.item.name}</div>
                    ))}
                    {ticket.cart.length > 4 && <div className="text-gray-400">+{ticket.cart.length - 4} more…</div>}
                  </div>
                  <button onClick={() => handleRecall(ticket.id)}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold text-sm transition-colors">
                    Recall Ticket
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Manage Categories modal */}
      <Modal
        open={manageModal === 'categories'}
        title="Manage Categories"
        onClose={() => setManageModal(null)}
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {categories.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No categories yet</p>
          ) : (
            categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{cat.name}</p>
                  <p className="text-xs text-text-muted">{cat._count?.items ?? 0} items · {cat.isActive ? 'Active' : 'Inactive'}</p>
                </div>
                <button
                  onClick={() => { setManageModal(null); setEditingCat(cat); setCatModalOpen(true); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
                >Edit</button>
                <button
                  onClick={() => deleteCatMutation.mutate(cat.id)}
                  disabled={deleteCatMutation.isPending}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                >Delete</button>
              </div>
            ))
          )}
          <div className="pt-2">
            <button
              onClick={() => { setManageModal(null); setEditingCat(null); setCatModalOpen(true); }}
              className="btn-primary w-full text-sm"
            >+ Add Category</button>
          </div>
        </div>
      </Modal>

      {/* Manage Items modal */}
      <Modal
        open={manageModal === 'items'}
        title="Manage Items"
        onClose={() => setManageModal(null)}
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {allItems.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No items yet</p>
          ) : (
            allItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{item.name}</p>
                  <p className="text-xs text-text-muted">₹{item.price.toFixed(2)} · {categories.find((c) => c.id === item.panCornerCategoryId)?.name ?? '—'}</p>
                </div>
                <button
                  onClick={() => { setManageModal(null); setEditingItem(item); setItemModalOpen(true); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
                >Edit</button>
                <button
                  onClick={() => deleteItemMutation.mutate(item.id)}
                  disabled={deleteItemMutation.isPending}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                >Delete</button>
              </div>
            ))
          )}
          <div className="pt-2">
            <button
              onClick={() => { setManageModal(null); setEditingItem(null); setItemModalOpen(true); }}
              className="btn-primary w-full text-sm"
            >+ Add Item</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
