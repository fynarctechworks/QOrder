import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { apiClient } from '../services/apiClient';

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

type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'WALLET';

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; icon: string }> = [
  {
    value: 'CASH',
    label: 'Cash',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    value: 'CARD',
    label: 'Card',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  },
  {
    value: 'UPI',
    label: 'UPI',
    icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    value: 'WALLET',
    label: 'Wallet',
    icon: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3',
  },
];

interface SettlementModalProps {
  tableId: string;
  formatCurrency: (amount: number) => string;
  onClose: () => void;
  onPrint?: (sessionId: string) => void;
}

export default function SettlementModal({
  tableId,
  formatCurrency,
  onClose,
  onPrint,
}: SettlementModalProps) {
  const queryClient = useQueryClient();
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch or create session for this table
  const { data: session, isLoading } = useQuery<SessionData>({
    queryKey: ['tableSession', tableId],
    queryFn: async () => {
      const data = await apiClient.get<any>(`/sessions/table/${tableId}`);
      // Transform response to match SessionData interface
      return {
        id: data.id,
        tableNumber: data.table.number,
        tableName: data.table.name,
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.totalAmount,
        payments: data.payments || [],
        items: data.orders?.flatMap((order: any) =>
          order.items.map((item: any) => ({
            name: item.menuItem.name,
            quantity: item.quantity,
            unitPrice: item.menuItem.price,
            totalPrice: item.subtotal,
            modifiers: item.modifiers.map((mod: any) => ({
              name: mod.name,
              price: mod.price,
            })),notes: item.notes,
          }))
        ) || [],
        status: data.status,
      };
    },
    enabled: !!tableId,
  });

  // Calculate totals
  const totalPaid =
    session?.payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0) || 0;
  const remaining = (session?.total || 0) - totalPaid;
  const sessionId = session?.id;

  // Add payment mutation
  const addPaymentMutation = useMutation({
    mutationFn: async (data: {
      amount: number;
      method: PaymentMethod;
      reference?: string;
      notes?: string;
    }) => {
      if (!sessionId) throw new Error('No active session');
      return apiClient.post<{ isFullyPaid: boolean }>(`/sessions/${sessionId}/split-payment`, data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tableSession', tableId] });
      queryClient.invalidateQueries({ queryKey: ['runningTables'] });
      
      if (result.isFullyPaid) {
        toast.success('Payment completed! Session closed.');
        onClose();
      } else {
        toast.success('Payment added successfully');
        setPaymentAmount('');
        setReference('');
        setNotes('');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add payment');
    },
  });

  const handleAddPayment = () => {
    const amount = parseFloat(paymentAmount);
    
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    if (amount > remaining) {
      toast.error('Payment amount exceeds remaining balance');
      return;
    }

    addPaymentMutation.mutate({
      amount,
      method: paymentMethod,
      reference: reference || undefined,
      notes: notes || undefined,
    });
  };

  const handleFullPayment = () => {
    setPaymentAmount(remaining.toFixed(2));
  };

  useEffect(() => {
    setPaymentAmount('');
    setReference('');
    setNotes('');
    setPaymentMethod('CASH');
  }, [tableId]);

  return (
    <Modal open={true} onClose={onClose} title="Settlement">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : !session ? (
        <div className="text-center py-8 text-text-muted">Session not found</div>
      ) : (
        <div className="space-y-6">
          {/* Table Info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-sm text-text-muted mb-1">Table</div>
            <div className="text-lg font-semibold text-text-primary">
              Table {session.tableNumber}
              {session.tableName && (
                <span className="text-sm text-text-secondary ml-2">({session.tableName})</span>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Order Items</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {session.items.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-start gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text-primary">
                      {item.quantity}x {item.name}
                    </div>
                    {item.modifiers.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.modifiers.map((mod, idx) => (
                          <div key={idx} className="text-xs text-text-muted pl-4">
                            + {mod.name} ({formatCurrency(mod.price)})
                          </div>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-xs text-text-muted italic mt-1">{item.notes}</div>
                    )}
                  </div>
                  <div className="font-semibold text-text-primary whitespace-nowrap">
                    {formatCurrency(item.totalPrice)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-2 border-t border-border-primary pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Subtotal</span>
              <span className="font-medium text-text-primary">{formatCurrency(session.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Tax</span>
              <span className="font-medium text-text-primary">{formatCurrency(session.tax)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t border-border-primary pt-2">
              <span className="text-text-primary">Total</span>
              <span className="text-text-primary">{formatCurrency(session.total)}</span>
            </div>
          </div>

          {/* Payment History */}
          {session.payments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Payment History</h3>
              <div className="space-y-2">
                {session.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex justify-between items-center p-3 bg-emerald-50 border border-emerald-200 rounded-lg"
                  >
                    <div>
                      <div className="text-sm font-medium text-emerald-700">{payment.method}</div>
                      <div className="text-xs text-emerald-600">
                        {new Date(payment.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-700">
                      {formatCurrency(payment.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remaining Balance */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-amber-900">Remaining Balance</span>
              <span className="text-2xl font-bold text-amber-900">{formatCurrency(remaining)}</span>
            </div>
          </div>

          {/* Add Payment Form */}
          {remaining > 0 && (
            <div className="space-y-4 border-t border-border-primary pt-4">
              <h3 className="text-sm font-semibold text-text-primary">Add Payment</h3>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      onClick={() => setPaymentMethod(method.value)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        paymentMethod === method.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border-primary bg-white text-text-secondary hover:border-gray-300'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={method.icon}
                        />
                      </svg>
                      <span className="text-xs font-medium">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Amount
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 px-4 py-2 border border-border-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={handleFullPayment}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-text-secondary rounded-xl text-sm font-medium transition-colors"
                  >
                    Full Amount
                  </button>
                </div>
              </div>

              {/* Reference (Optional) */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Reference (Optional)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Transaction ID"
                  className="w-full px-4 py-2 border border-border-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Notes (Optional) */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes"
                  rows={2}
                  className="w-full px-4 py-2 border border-border-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleAddPayment}
                  disabled={addPaymentMutation.isPending}
                  className="flex-1 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addPaymentMutation.isPending ? 'Processing...' : 'Add Payment'}
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-text-secondary rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {remaining === 0 && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-semibold">Fully Paid</span>
                </div>
              </div>
              {onPrint && sessionId && (
                <button
                  onClick={() => onPrint(sessionId)}
                  className="w-full px-6 py-3 bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Invoice
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
