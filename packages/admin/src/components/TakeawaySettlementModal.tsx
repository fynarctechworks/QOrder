import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { orderService } from '../services';
import { settingsService } from '../services/settingsService';
import type { Order } from '../types';

type PaymentMethod = 'CASH' | 'CARD' | 'UPI';

interface SplitEntry {
  id: number;
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; icon: string; color: string; bg: string }> = [
  { value: 'CASH', label: 'Cash', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { value: 'CARD', label: 'Card', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { value: 'UPI', label: 'UPI', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
];

const METHOD_MAP = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m]));

interface TakeawaySettlementModalProps {
  orders: Order[];
  formatCurrency: (amount: number) => string;
  onClose: () => void;
}

export default function TakeawaySettlementModal({
  orders,
  formatCurrency,
  onClose,
}: TakeawaySettlementModalProps) {
  const queryClient = useQueryClient();
  const amountRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const settledRef = useRef(false);

  const [splits, setSplits] = useState<SplitEntry[]>([]);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod>('CASH');
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentRef, setCurrentRef] = useState('');
  const [settling, setSettling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [showSplitMode, setShowSplitMode] = useState(false);
  const [selectedQuickMethod, setSelectedQuickMethod] = useState<PaymentMethod | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const autoPrintedRef = useRef(false);

  /* ── Settings (for auto-print config) ── */
  const { data: restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  const total = orders.reduce((s, o) => s + o.total, 0);
  const subtotal = orders.reduce((s, o) => s + o.subtotal, 0);
  const tax = orders.reduce((s, o) => s + o.tax, 0);
  const allItems = orders.flatMap(o => o.items);
  const splitsTotal = splits.reduce((s, e) => s + e.amount, 0);
  const unallocated = Math.max(total - splitsTotal, 0);
  const splitsReady = splits.length > 0 && unallocated <= 0.01;

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['runningTables'] });
  }, [queryClient]);

  const settleOrders = async () => {
    for (const order of orders) {
      await orderService.updateStatus(order.id, 'completed');
    }
  };

  const handleQuickPay = (method: PaymentMethod) => {
    setSelectedQuickMethod(method);
  };

  const handleQuickSettle = async () => {
    if (settledRef.current || !selectedQuickMethod) return;
    setSettling(true);
    try {
      await settleOrders();
      settledRef.current = true;
      setSplits([{ id: nextId.current++, method: selectedQuickMethod, amount: total }]);
      setSettled(true);
      invalidateAll();
      toast.success('Takeaway order settled!');
    } catch (err: any) {
      toast.error(err?.message || 'Settlement failed');
      invalidateAll();
    } finally {
      setSettling(false);
    }
  };

  const handleAddSplit = () => {
    const amount = parseFloat(currentAmount);
    if (!amount || amount <= 0) { toast.error('Enter an amount'); return; }
    if (amount > unallocated + 0.01) { toast.error('Amount exceeds remaining balance'); return; }

    setSplits((prev) => [
      ...prev,
      { id: nextId.current++, method: currentMethod, amount: Math.min(amount, unallocated), reference: currentRef || undefined },
    ]);
    setCurrentAmount('');
    setCurrentRef('');
    const newUnallocated = unallocated - Math.min(amount, unallocated);
    if (newUnallocated > 0.01) {
      setTimeout(() => {
        setCurrentAmount(newUnallocated.toFixed(2));
        amountRef.current?.focus();
      }, 50);
    }
  };

  const handleRemoveSplit = (id: number) => {
    setSplits((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSettle = async () => {
    if (settledRef.current || splits.length === 0) return;
    setSettling(true);
    try {
      await settleOrders();
      settledRef.current = true;
      setSettled(true);
      invalidateAll();
      toast.success('Takeaway order settled!');
    } catch (err: any) {
      toast.error(err?.message || 'Settlement failed');
      invalidateAll();
    } finally {
      setSettling(false);
    }
  };

  const handlePrint = () => {
    const restaurantName = (restaurant?.name as string) || 'Restaurant';
    const pls = (restaurant?.settings ?? {}) as Record<string, unknown>;
    const logoUrl = (pls.printShowLogo !== false && pls.printLogoUrl) ? ((pls.printLogoUrl as string).startsWith('/uploads') ? `${window.location.origin}${pls.printLogoUrl}` : pls.printLogoUrl as string) : '';
    const headerText = (pls.printShowAddress !== false && pls.printHeaderText) ? pls.printHeaderText as string : '';
    const footerText = (pls.printFooterText as string) || '';
    const showCustomerInfo = (pls.printShowCustomerInfo as boolean) ?? true;
    const showModifiers = (pls.printShowItemModifiers as boolean) ?? true;
    const showInstructions = (pls.printShowSpecialInstructions as boolean) ?? true;
    const showSubtotal = (pls.printShowSubtotal as boolean) ?? true;
    const showTax = (pls.printShowTax as boolean) ?? true;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Takeaway Bill</title><style>
      body{font-family:monospace;max-width:350px;margin:0 auto;padding:20px;color:#111;font-size:13px}
      h2{text-align:center;margin:0 0 4px}
      .sub{text-align:center;color:#666;font-size:12px;margin-bottom:12px}
      .info{font-size:12px;color:#444;margin-bottom:4px}
      .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin:12px 0 6px}
      .item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
      .qty{font-weight:700;min-width:28px;height:28px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px}
      .item-detail{flex:1}
      .item-name{font-weight:700;font-size:14px}
      .mod{color:#888;font-size:11px;margin-top:2px}
      .note{color:#d97706;font-size:11px;margin-top:2px;font-weight:600}
      .order-note{background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin:6px 0;font-size:11px;font-weight:600;color:#92400e}
      .price{font-weight:700;white-space:nowrap}
      .row{display:flex;justify-content:space-between;padding:2px 0}
      .row.bold{font-weight:700;font-size:14px}
      .row .tag{color:#059669}
      hr{border:none;border-top:1px dashed #999;margin:8px 0}
      .center{text-align:center}
      .logo{text-align:center;margin-bottom:8px}
      .logo img{max-width:120px;max-height:60px}
      .header-text{text-align:center;color:#666;font-size:11px;white-space:pre-line;margin-bottom:8px}
      @media print{body{padding:0;margin:0}}
    </style></head><body>`);
    if (logoUrl) w.document.write(`<div class="logo"><img src="${logoUrl}" alt="logo"></div>`);
    w.document.write(`<h2>${restaurantName}</h2>`);
    if (headerText) w.document.write(`<div class="header-text">${headerText}</div>`);
    w.document.write(`<p class="sub">Takeaway</p>`);
    w.document.write(`<p class="sub">${orders.map(o => `#${o.orderNumber}`).join(', ')}</p>`);
    w.document.write(`<p class="sub">${new Date().toLocaleString()}</p>`);
    w.document.write(`<hr>`);
    orders.forEach(order => {
      if (showCustomerInfo) {
        if (order.customerName) w.document.write(`<p class="info">\u{1F464} ${order.customerName}${order.customerPhone ? ` \u00B7 ${order.customerPhone}` : ''}</p>`);
        else if (order.customerPhone) w.document.write(`<p class="info">\u{1F4F1} ${order.customerPhone}</p>`);
      }
      if (showInstructions && order.specialInstructions) w.document.write(`<div class="order-note">\u{1F4DD} ${order.specialInstructions}</div>`);
      order.items.forEach(item => {
        w.document.write(`<div class="item"><span class="qty">${item.quantity}</span><div class="item-detail"><div class="item-name">${item.menuItemName}</div>`);
        if (showModifiers && item.customizations && item.customizations.length > 0) {
          item.customizations.forEach(c => {
            w.document.write(`<div class="mod">${c.groupName}: ${c.options.map(o => o.name).join(', ')}</div>`);
          });
        }
        if (showInstructions && item.specialInstructions) w.document.write(`<div class="note">\u26A0 ${item.specialInstructions}</div>`);
        w.document.write(`</div><span class="price">${formatCurrency(item.totalPrice)}</span></div>`);
      });
    });
    w.document.write(`<hr>`);
    if (showSubtotal) w.document.write(`<div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>`);
    if (showTax && tax > 0) w.document.write(`<div class="row"><span>Tax</span><span>${formatCurrency(tax)}</span></div>`);
    w.document.write(`<div class="row bold"><span>Total</span><span>${formatCurrency(total)}</span></div>`);
    w.document.write(`<hr>`);
    w.document.write(`<div class="label">Paid Via</div>`);
    splits.forEach(s => {
      const m = METHOD_MAP[s.method];
      w.document.write(`<div class="row"><span class="tag">${m?.label || s.method}</span><span>${formatCurrency(s.amount)}</span></div>`);
    });
    if (footerText) w.document.write(`<hr><p class="center">${footerText}</p>`);
    w.document.write(`</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  /* ── Auto-print after settlement (browser printer type) ── */
  useEffect(() => {
    if (!settled || autoPrintedRef.current) return;
    const settings = (restaurant?.settings ?? {}) as Record<string, unknown>;
    const printerEnabled = (settings.printerEnabled as boolean) ?? false;
    const autoPrintOnComplete = (settings.autoPrintOnComplete as boolean) ?? true;
    const connectionType = (settings.printerConnectionType as string) ?? 'network';
    if (printerEnabled && autoPrintOnComplete && connectionType === 'browser') {
      autoPrintedRef.current = true;
      // Small delay to let state settle before opening print window
      setTimeout(() => handlePrint(), 400);
    }
  }, [settled, restaurant]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasCustomerPhone = orders.some((o) => o.customerPhone);

  const handleSendWhatsApp = async () => {
    setSendingWhatsApp(true);
    try {
      const result = await orderService.sendWhatsAppBill(orders.map((o) => o.id));
      if (result.sent) {
        toast.success(`Bill sent to ${result.phone} via WhatsApp`);
      } else {
        toast.error('Failed to send WhatsApp bill');
      }
    } catch {
      toast.error('Failed to send WhatsApp bill');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="" maxWidth="max-w-2xl">
      {settled ? (
        /* ═══ SETTLED STATE ═══ */
        <div className="text-center space-y-6 py-4">
          <div>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-text-primary">Bill Settled!</h2>
            <p className="text-text-secondary mt-1">Takeaway</p>
          </div>

          {/* Bill Summary */}
          <div className="bg-gray-50 rounded-xl p-4 text-left max-w-sm mx-auto">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Bill Summary</p>

            {allItems.map((item, i) => (
              <div key={i} className="flex justify-between py-1 text-sm">
                <span className="text-text-secondary">{item.quantity}x {item.menuItemName}</span>
                <span className="text-text-primary">{formatCurrency(item.totalPrice)}</span>
              </div>
            ))}
            <div className="border-t border-border-primary my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Tax</span>
                <span>{formatCurrency(tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1 border-t border-border-primary mt-1">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>

            {/* Payment Breakdown */}
            <div className="border-t border-border-primary mt-3 pt-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Paid via</p>
              {splits.map((s) => {
                const m = METHOD_MAP[s.method];
                return (
                  <div key={s.id} className="flex justify-between py-1 text-sm">
                    <span className={m?.color || 'text-text-secondary'}>{m?.label || s.method}</span>
                    <span className="font-medium text-text-primary">{formatCurrency(s.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            <button
              onClick={handlePrint}
              className="flex-1 px-5 py-3 bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print Bill
            </button>
            {hasCustomerPhone && (
              <button
                onClick={handleSendWhatsApp}
                disabled={sendingWhatsApp}
                className="flex-1 px-5 py-3 bg-white border-2 border-green-500 text-green-600 hover:bg-green-500 hover:text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                {sendingWhatsApp ? 'Sending...' : 'WhatsApp Bill'}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors text-sm"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        /* ═══ PAYMENT STATE ═══ */
        <div className="space-y-5">
          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Settle Bill</h2>
              <p className="text-sm text-text-secondary">Takeaway</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(total)}</p>
              <p className="text-xs text-text-muted">
                {allItems.length} item{allItems.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* ── Quick Pay ── */}
          {splits.length === 0 && !showSplitMode && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                Pay via
              </p>
              <div className="grid grid-cols-3 gap-2.5">
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
                    {allItems.map((item, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">{item.quantity}x {item.menuItemName}</span>
                          <span className="text-text-primary">{formatCurrency(item.totalPrice)}</span>
                        </div>
                        {item.customizations.length > 0 && (
                          <p className="text-xs text-text-muted pl-4">
                            {item.customizations.flatMap(c => c.options.map(o => o.name)).join(', ')}
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
                    {tax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">Tax</span>
                        <span>{formatCurrency(tax)}</span>
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

              {/* Split Payment toggle */}
              <button
                onClick={() => { setShowSplitMode(true); setSelectedQuickMethod(null); setCurrentAmount(total.toFixed(2)); }}
                className="w-full py-2.5 text-sm font-medium text-primary hover:text-primary-hover transition-colors flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-xl hover:border-primary/60 hover:bg-primary/5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Split Payment
              </button>
            </div>
          )}

          {/* ── Added Splits List ── */}
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
                      <div>
                        <span className={`text-sm font-semibold ${m?.color || 'text-text-primary'}`}>{m?.label || split.method}</span>
                        {split.reference && (
                          <span className="text-xs text-text-muted ml-2">Ref: {split.reference}</span>
                        )}
                      </div>
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

              {unallocated > 0.01 && (
                <div className="flex items-center justify-between px-4 py-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50">
                  <span className="text-sm text-amber-700">Remaining</span>
                  <span className="text-base font-bold text-amber-800">{formatCurrency(unallocated)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Add Split Form ── */}
          {showSplitMode && unallocated > 0.01 && (
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-text-secondary">
                  {splits.length === 0 ? 'Add First Payment' : 'Add Another Payment'}
                </p>
                {splits.length === 0 && (
                  <button
                    onClick={() => { setShowSplitMode(false); setCurrentAmount(''); }}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Method pills */}
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => setCurrentMethod(method.value)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                      currentMethod === method.value
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
                    ref={amountRef}
                    type="number"
                    step="0.01"
                    min="0"
                    max={unallocated}
                    value={currentAmount}
                    onChange={(e) => setCurrentAmount(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddSplit(); }}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 border border-border-primary rounded-xl text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  />
                </div>
                <button
                  onClick={() => setCurrentAmount(unallocated.toFixed(2))}
                  className="px-3 py-2 bg-white border border-border-primary hover:bg-gray-100 text-text-secondary rounded-xl text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Full
                </button>
                <button
                  onClick={() => setCurrentAmount((unallocated / 2).toFixed(2))}
                  className="px-3 py-2 bg-white border border-border-primary hover:bg-gray-100 text-text-secondary rounded-xl text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Half
                </button>
              </div>

              {/* Reference */}
              {(currentMethod === 'UPI' || currentMethod === 'CARD') && (
                <input
                  type="text"
                  value={currentRef}
                  onChange={(e) => setCurrentRef(e.target.value)}
                  placeholder="Reference / Txn ID (optional)"
                  className="w-full px-3 py-2 border border-border-primary rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}

              {/* Add button */}
              <button
                onClick={handleAddSplit}
                className="w-full py-2.5 bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add {currentAmount ? formatCurrency(parseFloat(currentAmount) || 0) : ''} via {METHOD_MAP[currentMethod]?.label}
              </button>
            </div>
          )}

          {/* ── Bill Summary + Settle Button (split mode) ── */}
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
                {unallocated > 0.01 && (
                  <div className="flex justify-between text-sm text-amber-600">
                    <span>Remaining</span>
                    <span className="font-medium">{formatCurrency(unallocated)}</span>
                  </div>
                )}
              </div>

              {splitsReady ? (
                <button
                  onClick={handleSettle}
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
                  Add {formatCurrency(unallocated)} more to complete the split
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
