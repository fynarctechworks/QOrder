import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { apiClient } from '../services/apiClient';
import { settingsService } from '../services/settingsService';
import { creditService } from '../services/creditService';
import type { CreditAccount } from '../services/creditService';

/* ── Types ─────────────────────────────────────────────────── */
interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: string;
  createdAt: string;
}

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: Array<{ name: string; price: number }>;
  notes?: string;
}

interface SessionData {
  id: string;
  tableNumber: string;
  tableName?: string;
  subtotal: number;
  tax: number;
  total: number;
  payments: Payment[];
  items: OrderItem[];
  status: string;
}

type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'WALLET' | 'CREDIT';

interface SplitEntry {
  id: number;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  creditAccountId?: string;
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; icon: string; color: string; bg: string }> = [
  { value: 'CASH', label: 'Cash', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { value: 'CARD', label: 'Card', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { value: 'UPI', label: 'UPI', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { value: 'CREDIT', label: 'Credit', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

const METHOD_MAP = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m]));

/* ── Group identical items (same name + same modifiers) ──── */
function groupItems(items: OrderItem[]): OrderItem[] {
  const map = new Map<string, OrderItem>();
  for (const item of items) {
    const modKey = item.modifiers
      .map((m) => `${m.name}:${m.price}`)
      .sort()
      .join('|');
    const key = `${item.name}::${modKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalPrice += item.totalPrice;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

/* ── Props ─────────────────────────────────────────────────── */
interface SettlementModalProps {
  tableId: string;
  formatCurrency: (amount: number) => string;
  onClose: () => void;
  onPrint?: (sessionId: string) => void;
}

/* ══════════════════════════════════════════════════════════════
   SETTLEMENT MODAL  —  Split Payment with Bill Summary
   ══════════════════════════════════════════════════════════════ */
export default function SettlementModal({
  tableId,
  formatCurrency,
  onClose,
  onPrint,
}: SettlementModalProps) {
  const queryClient = useQueryClient();
  const amountRef = useRef<HTMLInputElement>(null);
  let nextId = useRef(1);

  // Snapshot of session data captured at settlement time so the
  // "Bill Settled" screen doesn't lose values when the query refetches.
  const settledSnapshotRef = useRef<SessionData | null>(null);

  /* ── Local split builder state ── */
  const [splits, setSplits] = useState<SplitEntry[]>([]);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod>('CASH');
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentRef, setCurrentRef] = useState('');
  const [selectedCreditAccount, setSelectedCreditAccount] = useState('');
  const [settling, setSettling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [settledSessionId, setSettledSessionId] = useState<string | null>(null);
  const [showSplitMode, setShowSplitMode] = useState(false);
  const [selectedQuickMethod, setSelectedQuickMethod] = useState<PaymentMethod | null>('CASH');
  const autoPrintedRef = useRef(false);

  /* ── Settings (for auto-print config) ── */
  const { data: printerRestaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  /* ── Fetch credit accounts ── */
  const { data: creditAccounts = [] } = useQuery<CreditAccount[]>({
    queryKey: ['credit-accounts-active'],
    queryFn: () => creditService.getAccounts({ active: true }),
    enabled: currentMethod === 'CREDIT',
  });

  /* ── Fetch session ── */
  const { data: session, isLoading, isFetching, error: sessionError } = useQuery<SessionData>({
    queryKey: ['tableSession', tableId],
    queryFn: async () => {
      const data = await apiClient.get<any>(`/sessions/table/${tableId}`);
      return {
        id: data.id,
        tableNumber: data.table?.number ?? data.tableNumber ?? '?',
        tableName: data.table?.name ?? data.tableName ?? null,
        subtotal: Number(data.subtotal ?? 0),
        tax: Number(data.tax ?? 0),
        total: Number(data.totalAmount ?? 0),
        payments: (data.payments || []).map((p: any) => ({
          ...p,
          amount: Number(p.amount),
        })),
        items: data.orders?.flatMap((order: any) =>
          order.items.map((item: any) => ({
            name: item.menuItem?.name ?? 'Unknown',
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice ?? 0),
            totalPrice: Number(item.totalPrice ?? 0),
            modifiers: (item.modifiers || []).map((mod: any) => ({
              name: mod.name,
              price: Number(mod.price ?? 0),
            })),
            notes: item.notes,
          }))
        ) || [],
        status: data.status,
      };
    },
    enabled: !!tableId,
  });

  /* ── Derived values ── */
  const completedPayments = session?.payments.filter((p) => p.status === 'COMPLETED') || [];
  const alreadyPaid = completedPayments.reduce((s, p) => s + p.amount, 0);
  const billRemaining = (session?.total || 0) - alreadyPaid;
  const splitsTotal = splits.reduce((s, e) => s + e.amount, 0);
  const unallocated = Math.max(billRemaining - splitsTotal, 0);
  const sessionId = session?.id;

  const isFullyPaidFromServer = session && session.total > 0 && billRemaining <= 0.01;

  /* ── Invalidate queries helper ── */
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tableSession', tableId] });
    queryClient.invalidateQueries({ queryKey: ['runningTables'] });
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['credit-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['credit-summary'] });
  }, [queryClient, tableId]);

  /* ── Add a split entry locally ── */
  const handleAddSplit = () => {
    const amount = parseFloat(currentAmount);
    if (!amount || amount <= 0) { toast.error('Enter an amount'); return; }
    if (amount > unallocated + 0.01) { toast.error('Amount exceeds remaining balance'); return; }
    if (currentMethod === 'CREDIT' && !selectedCreditAccount) { toast.error('Select a credit account'); return; }

    setSplits((prev) => [
      ...prev,
      {
        id: nextId.current++,
        method: currentMethod,
        amount: Math.min(amount, unallocated),
        reference: currentRef || undefined,
        creditAccountId: currentMethod === 'CREDIT' ? selectedCreditAccount : undefined,
      },
    ]);
    setCurrentAmount('');
    setCurrentRef('');
    setSelectedCreditAccount('');
    // Auto-fill next split amount with what's left
    const newUnallocated = unallocated - Math.min(amount, unallocated);
    if (newUnallocated > 0.01) {
      setTimeout(() => {
        setCurrentAmount(newUnallocated.toFixed(2));
        amountRef.current?.focus();
      }, 50);
    }
  };

  /* ── Remove a split entry ── */
  const handleRemoveSplit = (id: number) => {
    setSplits((prev) => prev.filter((s) => s.id !== id));
  };

  /* ── Quick pay: select a method for full payment ── */
  const handleQuickPay = (method: PaymentMethod) => {
    if (method === 'CREDIT') {
      setCurrentMethod('CREDIT');
      setCurrentAmount(billRemaining.toFixed(2));
      setShowSplitMode(true);
      setSelectedQuickMethod(null);
      return;
    }
    setSelectedQuickMethod(method);
  };

  /* ── Quick settle: pay full amount with selected method ── */
  const handleQuickSettle = async () => {
    if (!sessionId || !selectedQuickMethod) return;
    setSettling(true);
    try {
      await apiClient.post(`/sessions/${sessionId}/split-payment`, {
        amount: billRemaining,
        method: selectedQuickMethod,
      });
      setSplits([{ id: nextId.current++, method: selectedQuickMethod, amount: billRemaining }]);
      setSettledSessionId(sessionId);
      if (session) settledSnapshotRef.current = { ...session };
      invalidateAll();
      setSettled(true);
      toast.success('Bill settled! Table is now free.');
    } catch (err: any) {
      toast.error(err?.message || 'Payment failed');
      invalidateAll();
    } finally {
      setSettling(false);
    }
  };

  /* ── Settle: send all splits to server sequentially ── */
  const handleSettle = async () => {
    if (!sessionId || splits.length === 0) return;
    setSettling(true);
    try {
      for (const split of splits) {
        if (split.method === 'CREDIT' && split.creditAccountId) {
          await creditService.chargeToAccount(split.creditAccountId, {
            amount: split.amount,
            sessionId,
          });
        }
        await apiClient.post(`/sessions/${sessionId}/split-payment`, {
          amount: split.amount,
          method: split.method,
          reference: split.reference,
          creditAccountId: split.creditAccountId,
        });
      }
      setSettledSessionId(sessionId);      if (session) settledSnapshotRef.current = { ...session };      invalidateAll();
      setSettled(true);
      toast.success('Bill settled! Table is now free.');
    } catch (err: any) {
      toast.error(err?.message || 'Payment failed');
      invalidateAll(); // Refresh to see partial progress
    } finally {
      setSettling(false);
    }
  };

  /* ── Reset on table change ── */
  useEffect(() => {
    setSplits([]);
    setCurrentAmount('');
    setCurrentRef('');
    setCurrentMethod('CASH');
    setSelectedCreditAccount('');
    setSettled(false);
    setShowSplitMode(false);
    setSelectedQuickMethod(null);
  }, [tableId]);

  /* ── Auto-fill amount when splits are empty ── */
  useEffect(() => {
    if (session && splits.length === 0 && !currentAmount) {
      setCurrentAmount(billRemaining.toFixed(2));
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── When splits are ready (total matches), auto-trigger isn't needed ─ user must click Settle ── */
  const splitsReady = splits.length > 0 && unallocated <= 0.01;

  /* ── Auto-print after settlement (browser printer type) ── */
  useEffect(() => {
    if (!settled || !settledSessionId || autoPrintedRef.current) return;
    const settings = (printerRestaurant?.settings ?? {}) as Record<string, unknown>;
    const printerEnabled = (settings.printerEnabled as boolean) ?? false;
    const autoPrintOnComplete = (settings.autoPrintOnComplete as boolean) ?? true;
    const connectionType = (settings.printerConnectionType as string) ?? 'network';
    if (printerEnabled && autoPrintOnComplete && connectionType === 'browser' && onPrint) {
      autoPrintedRef.current = true;
      setTimeout(() => onPrint(settledSessionId), 400);
    }
  }, [settled, settledSessionId, printerRestaurant]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={true} onClose={onClose} title="" maxWidth="max-w-2xl">
      {(isLoading || (isFetching && !session?.items?.length)) ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      ) : !session ? (
        <div className="text-center py-12 text-text-muted">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-medium">Session not found</p>
          {sessionError && <p className="text-xs text-red-400 mt-1">{(sessionError as Error).message}</p>}
        </div>
      ) : (isFullyPaidFromServer || settled) ? (
        /* ═══ FULLY PAID / SETTLED STATE ═══ */
        (() => {
          // Use the snapshot captured at settlement time so that query
          // refetches (which may zero-out the closed session) don't affect
          // the "Bill Settled" display.
          const display = settledSnapshotRef.current || session;
          return (
        <div className="text-center space-y-6 py-4">
          <div>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-text-primary">Bill Settled!</h2>
            <p className="text-text-secondary mt-1">
              Table {display.tableNumber}{display.tableName ? ` (${display.tableName})` : ''}
            </p>
          </div>

          {/* Bill Summary */}
          <div className="bg-gray-50 rounded-xl p-4 text-left max-w-sm mx-auto">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Bill Summary</p>

            {/* Items */}
            {groupItems(display.items).map((item, i) => (
              <div key={i} className="flex justify-between py-1 text-sm">
                <span className="text-text-secondary">{item.quantity}x {item.name}</span>
                <span className="text-text-primary">{formatCurrency(item.totalPrice)}</span>
              </div>
            ))}
            <div className="border-t border-border-primary my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Subtotal</span>
              <span>{formatCurrency(display.subtotal)}</span>
            </div>
            {display.tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Tax</span>
                <span>{formatCurrency(display.tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1 border-t border-border-primary mt-1">
              <span>Total</span>
              <span>{formatCurrency(display.total)}</span>
            </div>

            {/* Payment Breakdown */}
            <div className="border-t border-border-primary mt-3 pt-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Paid via</p>
              {/* Show the splits we just processed (or server payments if coming back to already-settled) */}
              {(settled ? splits : []).map((s) => {
                const m = METHOD_MAP[s.method];
                return (
                  <div key={s.id} className="flex justify-between py-1 text-sm">
                    <span className={m?.color || 'text-text-secondary'}>{m?.label || s.method}</span>
                    <span className="font-medium text-text-primary">{formatCurrency(s.amount)}</span>
                  </div>
                );
              })}
              {(!settled ? completedPayments : []).map((p) => (
                <div key={p.id} className="flex justify-between py-1 text-sm">
                  <span className={METHOD_MAP[p.method]?.color || 'text-text-secondary'}>
                    {METHOD_MAP[p.method]?.label || p.method}
                  </span>
                  <span className="font-medium text-text-primary">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            {onPrint && settledSessionId && (
              <button
                onClick={() => onPrint(settledSessionId)}
                className="flex-1 px-5 py-3 bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Bill
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
          );
        })()
      ) : (
        /* ═══ PAYMENT STATE ═══ */
        <div className="space-y-5">
          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Settle Bill</h2>
              <p className="text-sm text-text-secondary">
                Table {session.tableNumber}{session.tableName ? ` (${session.tableName})` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(billRemaining)}</p>
              <p className="text-xs text-text-muted">
                {session.items.length} item{session.items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* ── Previously completed payments ── */}
          {completedPayments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {completedPayments.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {METHOD_MAP[p.method]?.label || p.method}: {formatCurrency(p.amount)}
                </span>
              ))}
            </div>
          )}

          {/* ── Quick Pay (only if no splits added yet and not in split mode) ── */}
          {splits.length === 0 && !showSplitMode && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                Pay via
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PAYMENT_METHODS.filter((m) => m.value !== 'CREDIT').map((method) => (
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

              {/* Bill details + Settle — shown when a method is selected */}
              {selectedQuickMethod && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Bill Summary</p>

                  {/* Items */}
                  <div className="space-y-1">
                    {groupItems(session.items).map((item, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">{item.quantity}x {item.name}</span>
                          <span className="text-text-primary">{formatCurrency(item.totalPrice)}</span>
                        </div>
                        {item.modifiers.length > 0 && (
                          <p className="text-xs text-text-muted pl-4">
                            {item.modifiers.map((m) => m.name).join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border-primary pt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">Subtotal</span>
                      <span>{formatCurrency(session.subtotal)}</span>
                    </div>
                    {session.tax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">Tax</span>
                        <span>{formatCurrency(session.tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-sm pt-1 border-t border-border-primary mt-1">
                      <span>Total</span>
                      <span>{formatCurrency(session.total)}</span>
                    </div>
                  </div>

                  {/* Payment method */}
                  <div className="flex justify-between text-sm pt-1">
                    <span className={METHOD_MAP[selectedQuickMethod]?.color || 'text-text-secondary'}>
                      Paying via {METHOD_MAP[selectedQuickMethod]?.label}
                    </span>
                    <span className="font-semibold text-text-primary">{formatCurrency(billRemaining)}</span>
                  </div>

                  {/* Settle button */}
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
                        Settle Bill — {formatCurrency(billRemaining)}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Split Payment toggle button */}
              <button
                onClick={() => { setShowSplitMode(true); setSelectedQuickMethod(null); setCurrentAmount(billRemaining.toFixed(2)); }}
                className="w-full py-2.5 text-sm font-medium text-primary hover:text-primary-hover transition-colors flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-xl hover:border-primary/60 hover:bg-primary/5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Split Payment
              </button>
            </div>
          )}

          {/* ── Split Builder ── */}
          {/* Added splits list */}
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

              {/* Unallocated remaining */}
              {unallocated > 0.01 && (
                <div className="flex items-center justify-between px-4 py-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50">
                  <span className="text-sm text-amber-700">Remaining</span>
                  <span className="text-base font-bold text-amber-800">{formatCurrency(unallocated)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Add Split Form (show when in split mode and unallocated > 0) ── */}
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
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
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

              {/* Credit account */}
              {currentMethod === 'CREDIT' && (
                <div>
                  {creditAccounts.length === 0 ? (
                    <p className="text-xs text-text-muted bg-white rounded-lg p-3">
                      No active credit accounts. Create one from the Credit page.
                    </p>
                  ) : (
                    <select
                      value={selectedCreditAccount}
                      onChange={(e) => setSelectedCreditAccount(e.target.value)}
                      className="w-full px-3 py-2.5 border border-border-primary rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select credit account...</option>
                      {creditAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} {acc.phone ? `(${acc.phone})` : ''} — {formatCurrency(Number(acc.balance))}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

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

          {/* ── Bill Summary + Settle Button ── */}
          {splits.length > 0 && (
            <div className="bg-white border-2 border-primary/20 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Bill Summary</p>

              <div className="space-y-1.5">
                <div className="flex justify-between text-sm text-text-secondary">
                  <span>Bill Total</span>
                  <span className="font-medium text-text-primary">{formatCurrency(billRemaining)}</span>
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
