import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api';

interface BillData {
  id: string;
  tokenNumber?: number | null;
  orderNumber: string;
  restaurantName: string;
  currency: string;
  restaurantAddress?: string | null;
  restaurantPhone?: string | null;
  customerName?: string | null;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers: Array<{ name: string; price: number }>;
  }>;
  subtotal: number;
  tax: number;
  total: number;
}

function fmt(currency: string, amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

export default function BillPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [bill, setBill] = useState<BillData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    fetch(`${API_BASE}/bill/${orderId}`)
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setBill)
      .catch(() => setError(true));
  }, [orderId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-400 mb-2">Bill not found</p>
          <p className="text-sm text-gray-400">This bill link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const token = bill.tokenNumber != null
    ? `Token #${String(bill.tokenNumber).padStart(3, '0')}`
    : `#${bill.orderNumber}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-10 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-orange-500 px-6 py-5 text-white text-center">
          <h1 className="text-xl font-bold">{bill.restaurantName}</h1>
          {bill.restaurantAddress && (
            <p className="text-orange-100 text-xs mt-1">{bill.restaurantAddress}</p>
          )}
          {bill.restaurantPhone && (
            <p className="text-orange-100 text-xs">{bill.restaurantPhone}</p>
          )}
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Order info */}
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono font-bold text-orange-600 text-base">{token}</span>
            <span className="text-gray-400 text-xs">
              {new Date(bill.createdAt).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
          {bill.customerName && (
            <p className="text-sm text-gray-600">
              <span className="text-gray-400">Customer: </span>{bill.customerName}
            </p>
          )}

          <div className="border-t border-dashed border-gray-200" />

          {/* Items */}
          <div className="space-y-3">
            {bill.items.map((item, i) => (
              <div key={i}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-orange-500 bg-orange-50 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                      {item.quantity}×
                    </span>
                    <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0 ml-2">
                    {fmt(bill.currency, item.totalPrice)}
                  </span>
                </div>
                {item.modifiers.length > 0 && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {item.modifiers.map((m, j) => (
                      <div key={j} className="flex items-center justify-between text-xs text-gray-400">
                        <span>+ {m.name}</span>
                        {m.price > 0 && <span>+{fmt(bill.currency, m.price)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-200" />

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{fmt(bill.currency, bill.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax</span>
              <span>{fmt(bill.currency, bill.tax)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span>
              <span className="text-orange-600">{fmt(bill.currency, bill.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 text-center">
          <p className="text-xs text-gray-400">Thank you for visiting!</p>
          <p className="text-xs text-gray-300 mt-1">Powered by QOrder</p>
        </div>
      </div>
    </div>
  );
}
