import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { menuService, settingsService, orderService } from '../services';
import { useCurrency } from '../hooks/useCurrency';
import DietBadge from '../components/DietBadge';
import Modal from '../components/Modal';
import type { MenuItem, Category, Order } from '../types';

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

type PaymentMethod = 'CASH' | 'CARD' | 'UPI';

interface SplitEntry {
  id: number;
  method: PaymentMethod;
  amount: number;
}

interface HeldTicket {
  id: string;
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  notes: string;
  heldAt: number; // timestamp
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; icon: string; color: string; bg: string }> = [
  { value: 'CASH', label: 'Cash', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { value: 'CARD', label: 'Card', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { value: 'UPI', label: 'UPI', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
];

const METHOD_MAP = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m]));

/* ─── Held tickets localStorage helpers ── */
const HELD_KEY = 'qsr_held_tickets';
function loadHeldTickets(): HeldTicket[] {
  try {
    const raw = localStorage.getItem(HELD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHeldTickets(tickets: HeldTicket[]) {
  localStorage.setItem(HELD_KEY, JSON.stringify(tickets));
}

/* ─── Print helpers ── */
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
    .mods{font-size:12px;margin-top:1px;font-weight:bold}
    .price{text-align:right;white-space:nowrap;font-weight:bold;font-size:14px}
    .total-row{display:flex;justify-content:space-between;padding:3px 0;font-size:14px}
    .total-row.grand{font-size:16px;font-weight:bold;border-top:2px solid #000;padding-top:6px;margin-top:4px}
    .method{text-align:center;font-size:13px;margin-top:8px;font-weight:bold}
    .footer{text-align:center;font-size:12px;margin-top:12px;font-weight:bold}
    .k-header{font-size:16px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;margin:0}
    .k-token-box{text-align:center;border:3px solid #000;border-radius:8px;padding:12px;margin:12px 0}
    .k-token-label{font-size:13px;text-transform:uppercase;letter-spacing:0.1em;font-weight:bold}
    .k-token-num{font-size:36px;font-weight:bold;line-height:1.1}
    .k-item{display:flex;gap:8px;padding:6px 0;border-bottom:1px dotted #000;font-size:15px}
    .k-qty{min-width:28px;font-weight:bold;font-size:15px}
    .k-name{flex:1;font-weight:bold}
    .k-mods{font-size:13px;font-weight:bold;margin-top:2px}
    .k-time{text-align:center;font-size:13px;margin-top:8px;font-weight:bold}
    @page{size:80mm auto;margin:0}
    @media print{html,body{width:80mm;margin:0;padding:0;overflow:hidden} *{color:#000!important;font-weight:bold!important}}`;

function printOneReceipt(html: string, title: string): Promise<void> {
  return new Promise((resolve) => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) { resolve(); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${PRINT_CSS}</style></head><body style="padding:16px">${html}</body></html>`);
    w.document.close();
    let resolved = false;
    const done = () => { if (resolved) return; resolved = true; try { w.close(); } catch {} resolve(); };
    w.onload = () => {
      w.print();
      w.onafterprint = done;
      setTimeout(done, 8000); // fallback
    };
  });
}

function printReceipts(order: Order, paymentMethod: PaymentMethod, formatCurrency: (n: number) => string, restaurantName: string, itemStationMap?: Map<string, string>) {
  const customerItemsHtml = order.items.map(item => {
    const mods = (item.customizations || []).flatMap(g => g.options.map(o => o.name)).join(', ');
    return `<div class="item"><span class="qty">${item.quantity}x</span><div class="name">${escapeHtml(item.menuItemName)}${mods ? `<div class="mods">${escapeHtml(mods)}</div>` : ''}</div><span class="price">${escapeHtml(formatCurrency(item.totalPrice))}</span></div>`;
  }).join('');

  const kitchenItems = order.items.filter(item => (itemStationMap?.get(item.menuItemId) || 'KITCHEN') === 'KITCHEN');
  const beverageItems = order.items.filter(item => itemStationMap?.get(item.menuItemId) === 'BEVERAGE');

  const buildKotHtml = (items: typeof order.items) => items.map(item => {
    const mods = (item.customizations || []).flatMap(g => g.options.map(o => o.name)).join(', ');
    return `<div class="k-item"><span class="k-qty">${item.quantity}x</span><div class="k-name">${escapeHtml(item.menuItemName)}${mods ? `<div class="k-mods">${escapeHtml(mods)}</div>` : ''}</div></div>`;
  }).join('');

  const buildKotHtmlBody = (title: string, items: typeof order.items) => `
      <p class="k-header center">${escapeHtml(title)}</p>
      <p class="center" style="font-size:13px;margin:2px 0 0">${escapeHtml(restaurantName)}</p>
      <div class="k-token-box">
        <div class="k-token-label">Token</div>
        <div class="k-token-num">${escapeHtml(order.orderNumber)}</div>
      </div>
      ${order.customerName ? `<p class="center" style="font-size:14px;margin:4px 0"><strong>${escapeHtml(order.customerName)}</strong></p>` : ''}
      <div class="divider"></div>
      ${buildKotHtml(items)}
      ${order.specialInstructions ? `<div class="divider"></div><p style="font-size:13px"><strong>Notes:</strong> ${escapeHtml(order.specialInstructions)}</p>` : ''}
      <div class="k-time">${new Date().toLocaleString()}</div>`;

  const customerHtml = `
      <p class="restaurant center">${escapeHtml(restaurantName)}</p>
      <div class="token-box">
        <div class="token-label">Token Number</div>
        <div class="token-num">${escapeHtml(order.orderNumber)}</div>
      </div>
      <div class="divider"></div>
      ${customerItemsHtml}
      <div class="divider"></div>
      <div class="total-row"><span>Subtotal</span><span>${escapeHtml(formatCurrency(order.subtotal))}</span></div>
      ${order.tax > 0 ? `<div class="total-row"><span>Tax</span><span>${escapeHtml(formatCurrency(order.tax))}</span></div>` : ''}
      <div class="total-row grand"><span>Total</span><span>${escapeHtml(formatCurrency(order.total))}</span></div>
      <div class="method">Paid via ${escapeHtml(paymentMethod)}</div>
      <div class="footer">Thank you! Please wait for your token to be called.</div>`;

  const jobs: Array<{ html: string; title: string }> = [{ html: customerHtml, title: 'Customer Token' }];
  if (kitchenItems.length > 0) jobs.push({ html: buildKotHtmlBody('KITCHEN ORDER', kitchenItems), title: 'Kitchen KOT' });
  if (beverageItems.length > 0) jobs.push({ html: buildKotHtmlBody('BEVERAGE ORDER', beverageItems), title: 'Beverage KOT' });

  (async () => {
    for (const job of jobs) {
      await printOneReceipt(job.html, job.title);
      await new Promise(r => setTimeout(r, 2000));
    }
  })();
}

/* ═══════════════════ QSR Page ═══════════════════ */
export default function QSRPage() {
  const formatCurrency = useCurrency();
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

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const dataError = menuErr || catErr;

  const taxRate = settings?.taxRate ?? 0;
  const restaurantName = (settings?.name as string) || 'Restaurant';

  /* ── State ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeCartItemId, setActiveCartItemId] = useState<string | null>(null);

  // Settlement modal state
  const [showSettlement, setShowSettlement] = useState(false);
  const [selectedQuickMethod, setSelectedQuickMethod] = useState<PaymentMethod | null>(null);
  const [settling, setSettling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const settledRef = useRef(false);

  // WhatsApp invoice state
  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  // Split payment state
  const [showSplitMode, setShowSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitEntry[]>([]);
  const [currentSplitMethod, setCurrentSplitMethod] = useState<PaymentMethod>('CASH');
  const [currentSplitAmount, setCurrentSplitAmount] = useState('');
  const splitIdCounter = useRef(0);
  const splitAmountRef = useRef<HTMLInputElement>(null);

  // Hold & Recall state
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>(loadHeldTickets);
  const [showRecall, setShowRecall] = useState(false);
  const [showCart, setShowCart] = useState(false);

  // Discount state
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');

  /* ── Build menuItemId → kotStation map from cart + categories ── */
  const catStationMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach(c => map.set(c.id, c.kotStation || 'KITCHEN'));
    return map;
  }, [categories]);

  const buildItemStationMap = useCallback(() => {
    const map = new Map<string, string>();
    cart.forEach(c => {
      map.set(c.menuItem.id, catStationMap.get(c.menuItem.categoryId) || 'KITCHEN');
    });
    return map;
  }, [cart, catStationMap]);

  /* ── Send WhatsApp invoice (fire-and-forget with UI feedback) ── */
  const sendWhatsAppInvoice = async (orderId: string) => {
    if (!customerPhone.trim()) return;
    setWhatsappStatus('sending');
    try {
      const result = await orderService.sendWhatsAppBill([orderId]);
      if (result.sent) {
        setWhatsappStatus('sent');
        toast.success('WhatsApp invoice sent!');
      } else {
        setWhatsappStatus('failed');
        toast.error('WhatsApp invoice could not be delivered');
      }
    } catch {
      setWhatsappStatus('failed');
      toast.error('Failed to send WhatsApp invoice');
    }
  };

  /* ── Mutation — creates order directly as COMPLETED ── */
  const createOrderMut = useMutation({
    mutationFn: (data: Parameters<typeof orderService.createQSROrder>[0]) =>
      orderService.createQSROrder(data),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      settledRef.current = true;
      setCompletedOrder(order);
      setSettled(true);
      setSettling(false);
      toast.success(`Token #${order.orderNumber} — Order complete!`);
      // Auto-print customer token + station KOTs
      const stationMap = buildItemStationMap();
      setTimeout(() => printReceipts(order, selectedQuickMethod || 'CASH', formatCurrency, restaurantName, stationMap), 300);
      // Auto-send WhatsApp invoice
      sendWhatsAppInvoice(order.id);
    },
    onError: (err) => { setSettling(false); toast.error(err instanceof Error ? err.message : 'Failed to create order'); },
  });

  const resetForm = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setMenuSearch('');
    setSelectedCategory('all');
    setActiveCartItemId(null);
    setShowSettlement(false);
    setSelectedQuickMethod(null);
    setSettling(false);
    setSettled(false);
    setShowSplitMode(false);
    setSplits([]);
    setCurrentSplitMethod('CASH');
    setCurrentSplitAmount('');
    setCompletedOrder(null);
    setDiscountType('PERCENTAGE');
    setDiscountValue('');
    setWhatsappStatus('idle');
    settledRef.current = false;
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
      heldAt: Date.now(),
    };
    const updated = [...heldTickets, ticket];
    setHeldTickets(updated);
    saveHeldTickets(updated);
    toast.success('Ticket on hold');
    // Reset to fresh ticket
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setActiveCartItemId(null);
  };

  /* ── Recall a held ticket ── */
  const handleRecall = (ticketId: string) => {
    const ticket = heldTickets.find(t => t.id === ticketId);
    if (!ticket) return;
    // If current cart has items, hold it first
    if (cart.length > 0) {
      const currentTicket: HeldTicket = {
        id: `held-${Date.now()}`,
        cart: [...cart],
        customerName,
        customerPhone,
        notes,
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
    // Load the recalled ticket
    setCart(ticket.cart);
    setCustomerName(ticket.customerName);
    setCustomerPhone(ticket.customerPhone);
    setNotes(ticket.notes);
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

  const handleCloseSettlement = () => {
    if (settled) {
      resetForm();
    } else {
      setShowSettlement(false);
      setSelectedQuickMethod(null);
      setShowSplitMode(false);
      setSplits([]);
      setCurrentSplitMethod('CASH');
      setCurrentSplitAmount('');
    }
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
    });
  }, [menuItems, selectedCategory, menuSearch]);

  /* ── Active categories (that have available items) ── */
  const activeCategories = useMemo(() => {
    const catIds = new Set(menuItems.filter(i => i.isAvailable).map(i => i.categoryId));
    return categories.filter(c => catIds.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, menuItems]);

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

  /* ── Split payment helpers ── */
  const splitsTotal = useMemo(() => splits.reduce((s, e) => s + e.amount, 0), [splits]);
  const splitRemaining = total - splitsTotal;
  const splitsReady = splits.length > 0 && Math.abs(splitRemaining) < 0.01;

  const handleAddSplit = () => {
    const amount = parseFloat(currentSplitAmount);
    if (!amount || amount <= 0) { toast.error('Enter an amount'); return; }
    if (amount > splitRemaining + 0.01) { toast.error('Amount exceeds remaining balance'); return; }
    const finalAmount = Math.min(amount, splitRemaining);
    setSplits(prev => [...prev, { id: ++splitIdCounter.current, method: currentSplitMethod, amount: finalAmount }]);
    const newRemaining = splitRemaining - finalAmount;
    if (newRemaining > 0.01) {
      setCurrentSplitAmount(newRemaining.toFixed(2));
      setTimeout(() => splitAmountRef.current?.focus(), 50);
    } else {
      setCurrentSplitAmount('');
    }
  };

  const handleRemoveSplit = (id: number) => {
    setSplits(prev => prev.filter(s => s.id !== id));
  };

  const handleSplitSettle = () => {
    if (settledRef.current || !splitsReady) return;
    setSettling(true);
    createOrderMut.mutate({
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

  /* ── Settle — opens settlement modal ── */
  const handleOpenSettle = () => {
    if (cart.length === 0) return;
    setShowSettlement(true);
  };

  const handleQuickPay = (method: PaymentMethod) => {
    setSelectedQuickMethod(method);
  };

  const handleQuickSettle = () => {
    if (settledRef.current || !selectedQuickMethod) return;
    setSettling(true);
    createOrderMut.mutate({
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

  /* ── Build cart items list for bill summary ── */
  const cartSummaryItems = useMemo(() => {
    return cart.map(c => {
      const basePrice = c.menuItem.discountPrice ?? c.menuItem.price;
      const modTotal = c.selectedModifiers.reduce((s, m) => s + m.price, 0);
      return {
        name: c.menuItem.name,
        quantity: c.quantity,
        totalPrice: (basePrice + modTotal) * c.quantity,
        modifiers: c.selectedModifiers.map(m => m.name),
      };
    });
  }, [cart]);

  /* ═══════════════════════ ORDER VIEW ═══════════════════════ */
  return (
    <div className="-m-3 md:-m-6 flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {dataError && (
        <div className="bg-red-50 border-b border-red-200 px-3 md:px-6 py-2 flex items-center gap-3">
          <span className="text-sm text-red-600">Failed to load some data.</span>
          <button className="text-sm font-medium text-red-700 underline" onClick={() => { refetchMenu(); refetchCat(); }}>Retry</button>
        </div>
      )}
      {/* ═══ Top bar ═══ */}
      <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-text-primary tracking-tight">QSR</h1>
          <p className="text-xs md:text-sm text-text-muted hidden sm:block">Quick service — counter order &amp; settle</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3">
          <div className="flex items-center gap-2">
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary flex-1 sm:flex-none sm:w-36"
          />
          <input
            type="tel"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="Phone number *"
            required
            className={`border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary flex-1 sm:flex-none sm:w-36 ${!customerPhone.trim() ? 'border-red-300' : 'border-gray-200'}`}
          />
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={resetForm}
            className="btn-primary rounded-xl text-sm px-4 py-2 shadow-sm active:scale-[0.97] flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Order
          </button>
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
                <svg className="w-20 h-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No items yet</p>
                <p className="text-xs text-gray-300 mt-1">Tap menu items to add</p>
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
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromCart(c.cartId); if (isActive) setActiveCartItemId(null); }}
                        className="absolute top-2.5 right-2.5 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>

                      <div className="pr-6">
                        <p className="text-sm font-semibold text-gray-900">{c.menuItem.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(basePrice)}</p>
                      </div>

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

                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => updateQuantity(c.cartId, -1)}
                            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors active:scale-90"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                            </svg>
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-gray-900 tabular-nums">{c.quantity}</span>
                          <button
                            onClick={() => updateQuantity(c.cartId, 1)}
                            className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors active:scale-90"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
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

          {/* Totals + Settle Payment */}
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
            <button
              onClick={handleOpenSettle}
              disabled={cart.length === 0 || !customerPhone.trim()}
              className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Settle Payment • {formatCurrency(total)}
            </button>
            <button
              onClick={handleHold}
              disabled={cart.length === 0}
              className="w-full mt-1.5 py-2.5 border-2 border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Hold Ticket
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
          <div className="px-3 md:px-5 py-3 bg-white border-b border-gray-200 shrink-0">
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

                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <DietBadge type={item.dietType} />
                      </div>

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

      {/* ═══ Settlement Modal ═══ */}
      <Modal open={showSettlement} onClose={handleCloseSettlement} title="" maxWidth="max-w-2xl">
        {settled && completedOrder ? (
          /* ═══ SETTLED STATE ═══ */
          <div className="text-center space-y-6 py-4">
            <div>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-text-primary">Bill Settled!</h2>
              <p className="text-text-secondary mt-1">QSR</p>
            </div>

            {/* Bill Summary */}
            <div className="bg-gray-50 rounded-xl p-4 text-left max-w-sm mx-auto">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Bill Summary</p>

              {completedOrder.items.map((item, i) => (
                <div key={i} className="py-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">{item.quantity}x {item.menuItemName}</span>
                    <span className="text-text-primary">{formatCurrency(item.totalPrice)}</span>
                  </div>
                  {item.customizations && item.customizations.length > 0 && (
                    <p className="text-xs text-text-muted pl-4">
                      {item.customizations.flatMap(g => g.options.map(o => o.name)).join(', ')}
                    </p>
                  )}
                </div>
              ))}
              <div className="border-t border-border-primary my-2" />
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <span>{formatCurrency(completedOrder.subtotal)}</span>
              </div>
              {completedOrder.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Tax</span>
                  <span>{formatCurrency(completedOrder.tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-border-primary mt-1">
                <span>Total</span>
                <span>{formatCurrency(completedOrder.total)}</span>
              </div>

              {/* Payment Breakdown */}
              {splits.length > 0 ? (
                <div className="border-t border-border-primary mt-3 pt-3">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Paid via (Split)</p>
                  {splits.map(s => (
                    <div key={s.id} className="flex justify-between py-1 text-sm">
                      <span className={METHOD_MAP[s.method]?.color || 'text-text-secondary'}>
                        {METHOD_MAP[s.method]?.label || s.method}
                      </span>
                      <span className="font-medium text-text-primary">{formatCurrency(s.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : selectedQuickMethod ? (
                <div className="border-t border-border-primary mt-3 pt-3">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Paid via</p>
                  <div className="flex justify-between py-1 text-sm">
                    <span className={METHOD_MAP[selectedQuickMethod]?.color || 'text-text-secondary'}>
                      {METHOD_MAP[selectedQuickMethod]?.label || selectedQuickMethod}
                    </span>
                    <span className="font-medium text-text-primary">{formatCurrency(completedOrder.total)}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
              <button
                onClick={() => printReceipts(completedOrder, selectedQuickMethod || 'CASH', formatCurrency, restaurantName, buildItemStationMap())}
                className="flex-1 px-5 py-3 bg-white border-2 border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Reprint
              </button>

              {completedOrder.customerPhone && whatsappStatus !== 'sent' && (
                <button
                  onClick={() => sendWhatsAppInvoice(completedOrder.id)}
                  disabled={whatsappStatus === 'sending'}
                  className="flex-1 px-5 py-3 bg-white border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.613.613l4.458-1.495A11.932 11.932 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.7-6.42-1.9l-.164-.1-3.392 1.137 1.137-3.392-.1-.164A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                  {whatsappStatus === 'sending' ? 'Sending...' : whatsappStatus === 'failed' ? 'Retry WhatsApp' : 'Send WhatsApp'}
                </button>
              )}

              {whatsappStatus === 'sent' && (
                <div className="flex-1 px-5 py-3 bg-emerald-50 border-2 border-emerald-200 text-emerald-600 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  WhatsApp Sent
                </div>
              )}

              <button
                onClick={handleCloseSettlement}
                className="flex-1 px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors text-sm"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ═══ PAYMENT STATE ═══ */
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-text-primary">Settle Bill</h2>
                <p className="text-sm text-text-secondary">QSR</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-text-primary">{formatCurrency(total)}</p>
                <p className="text-xs text-text-muted">
                  {totalItems} item{totalItems !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Quick Pay — hidden when in split mode */}
            {!showSplitMode && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Pay via</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => handleQuickPay(method.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all active:scale-95 ${
                      selectedQuickMethod === method.value
                        ? `${method.bg} border-current ${method.color} shadow-sm`
                        : 'border-border-primary bg-white hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    <svg className={`w-6 h-6 ${selectedQuickMethod === method.value ? method.color : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={method.icon} />
                    </svg>
                    <span className={`text-sm font-semibold ${selectedQuickMethod === method.value ? method.color : 'text-text-primary'}`}>{method.label}</span>
                  </button>
                ))}
              </div>

              {/* Bill details + Settle */}
              {selectedQuickMethod && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Bill Summary</p>

                  <div className="space-y-1">
                    {cartSummaryItems.map((item, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">{item.quantity}x {item.name}</span>
                          <span className="text-text-primary">{formatCurrency(item.totalPrice)}</span>
                        </div>
                        {item.modifiers.length > 0 && (
                          <p className="text-xs text-text-muted pl-4">
                            {item.modifiers.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border-primary pt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-600">Discount{discountType === 'PERCENTAGE' ? ` (${discountNum}%)` : ''}</span>
                        <span className="text-orange-600">-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">Tax</span>
                        <span>{formatCurrency(taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-sm pt-1 border-t border-border-primary mt-1">
                      <span>Total</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm pt-1">
                    <span className={METHOD_MAP[selectedQuickMethod]?.color || 'text-text-secondary'}>
                      Paying via {METHOD_MAP[selectedQuickMethod]?.label}
                    </span>
                    <span className="font-semibold text-text-primary">{formatCurrency(total)}</span>
                  </div>

                  <button
                    onClick={handleQuickSettle}
                    disabled={settling}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-base"
                  >
                    {settling ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                        Settling...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Settle Bill — {formatCurrency(total)}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Split Payment toggle button */}
              {!showSplitMode && (
                <button
                  onClick={() => { setShowSplitMode(true); setSelectedQuickMethod(null); setCurrentSplitAmount(total.toFixed(2)); }}
                  className="w-full py-2.5 text-sm font-medium text-primary hover:text-primary-hover transition-colors flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-xl hover:border-primary/60 hover:bg-primary/5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Split Payment
                </button>
              )}
            </div>
            )}

            {/* ── Split Builder: Added splits list ── */}
            {splits.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Payment Split</p>
                {splits.map((split) => {
                  const m = METHOD_MAP[split.method];
                  return (
                    <div
                      key={split.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border ${m?.bg || 'bg-gray-50 border-gray-200'}`}
                    >
                      <div className="flex items-center gap-3">
                        <svg className={`w-5 h-5 ${m?.color || 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={m?.icon} />
                        </svg>
                        <span className={`text-sm font-semibold ${m?.color || 'text-text-primary'}`}>{m?.label || split.method}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-text-primary">{formatCurrency(split.amount)}</span>
                        {!settling && (
                          <button
                            onClick={() => handleRemoveSplit(split.id)}
                            className="p-1 rounded-lg hover:bg-white/60 text-text-muted hover:text-red-500 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Unallocated remaining */}
                {splitRemaining > 0.01 && (
                  <div className="flex items-center justify-between px-4 py-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50">
                    <span className="text-sm text-amber-700">Remaining</span>
                    <span className="text-base font-bold text-amber-800">{formatCurrency(splitRemaining)}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Add Split Form (show when in split mode and remaining > 0) ── */}
            {showSplitMode && splitRemaining > 0.01 && (
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text-secondary">
                    {splits.length === 0 ? 'Add First Payment' : 'Add Another Payment'}
                  </p>
                  {splits.length === 0 && (
                    <button
                      onClick={() => { setShowSplitMode(false); setCurrentSplitAmount(''); }}
                      className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {/* Method pills */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      onClick={() => setCurrentSplitMethod(method.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                        currentSplitMethod === method.value
                          ? 'border-primary bg-white text-primary shadow-sm'
                          : 'border-transparent bg-white/60 text-text-secondary hover:bg-white'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={method.icon} />
                      </svg>
                      <span className="text-[10px] font-medium leading-tight">{method.label}</span>
                    </button>
                  ))}
                </div>

                {/* Amount + quick buttons */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">₹</span>
                    <input
                      ref={splitAmountRef}
                      type="number"
                      step="0.01"
                      min="0"
                      max={splitRemaining}
                      value={currentSplitAmount}
                      onChange={e => setCurrentSplitAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSplit(); }}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 border border-border-primary rounded-xl text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                  </div>
                  <button
                    onClick={() => setCurrentSplitAmount(splitRemaining.toFixed(2))}
                    className="px-3 py-2 bg-white border border-border-primary hover:bg-gray-100 text-text-secondary rounded-xl text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    Full
                  </button>
                  <button
                    onClick={() => setCurrentSplitAmount((splitRemaining / 2).toFixed(2))}
                    className="px-3 py-2 bg-white border border-border-primary hover:bg-gray-100 text-text-secondary rounded-xl text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    Half
                  </button>
                </div>

                {/* Add button */}
                <button
                  onClick={handleAddSplit}
                  className="w-full py-2.5 bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add {currentSplitAmount ? formatCurrency(parseFloat(currentSplitAmount) || 0) : ''} via {METHOD_MAP[currentSplitMethod]?.label}
                </button>
              </div>
            )}

            {/* ── Bill Summary + Settle Button (when splits exist) ── */}
            {splits.length > 0 && (
              <div className="bg-white border-2 border-primary/20 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Bill Summary</p>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-text-secondary">
                    <span>Bill Total</span>
                    <span className="font-medium text-text-primary">{formatCurrency(total)}</span>
                  </div>
                  {splits.map((s) => {
                    const m = METHOD_MAP[s.method];
                    return (
                      <div key={s.id} className="flex justify-between text-sm">
                        <span className={m?.color || 'text-text-secondary'}>
                          {m?.label || s.method}
                        </span>
                        <span className="font-medium text-text-primary">{formatCurrency(s.amount)}</span>
                      </div>
                    );
                  })}
                  {splitRemaining > 0.01 && (
                    <div className="flex justify-between text-sm text-amber-600">
                      <span>Remaining</span>
                      <span className="font-medium">{formatCurrency(splitRemaining)}</span>
                    </div>
                  )}
                </div>

                {splitsReady ? (
                  <button
                    onClick={handleSplitSettle}
                    disabled={settling}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-base"
                  >
                    {settling ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                        Settling...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Settle Bill — {formatCurrency(splitsTotal)}
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-center text-xs text-amber-600 py-1">
                    Add more payments to cover the full amount
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ═══ Recall Modal ═══ */}
      <Modal open={showRecall} onClose={() => setShowRecall(false)} title="Held Tickets" maxWidth="max-w-lg">
        {heldTickets.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">No held tickets</p>
            <p className="text-xs mt-1">Hold a ticket to park it here</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
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
