import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';
import { settingsService } from '../services/settingsService';
import './PrintInvoice.css';

interface PrintInvoiceProps {
  sessionId: string;
  formatCurrency: (amount: number) => string;
  onClose: () => void;
}

interface InvoiceData {
  invoiceNumber: string;
  restaurant: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  table: {
    number: string;
    name?: string;
  };
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers: Array<{ name: string; price: number }>;
    notes?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  payments: Array<{
    method: string;
    amount: number;
    createdAt: string;
  }>;
  totalPaid: number;
  remaining: number;
}

export default function PrintInvoice({
  sessionId,
  formatCurrency,
  onClose,
}: PrintInvoiceProps) {
  const { data: invoice, isLoading } = useQuery<InvoiceData>({
    queryKey: ['invoice', sessionId],
    queryFn: () => apiClient.get<InvoiceData>(`/sessions/${sessionId}/print`),
  });

  const { data: restaurantData } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });
  const pls = (restaurantData?.settings ?? {}) as Record<string, unknown>;
  const logoUrl = (pls.printShowLogo !== false && pls.printLogoUrl) ? ((pls.printLogoUrl as string).startsWith('/uploads') ? `${window.location.origin}${pls.printLogoUrl}` : pls.printLogoUrl as string) : '';
  const headerText = (pls.printShowAddress !== false && pls.printHeaderText) ? pls.printHeaderText as string : '';
  const footerText = (pls.printFooterText as string) || 'Thank you for dining with us!';
  const showAddress = (pls.printShowAddress as boolean) ?? true;
  const showModifiers = (pls.printShowItemModifiers as boolean) ?? true;
  const showInstructions = (pls.printShowSpecialInstructions as boolean) ?? true;
  const showSubtotal = (pls.printShowSubtotal as boolean) ?? true;
  const showTax = (pls.printShowTax as boolean) ?? true;

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    // Auto-print after loading
    if (invoice) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [invoice]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-text-muted">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-muted mb-4">Invoice not found</p>
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="print-invoice-container">
      {/* Non-printable controls */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium shadow-lg"
        >
          <svg
            className="w-5 h-5 inline mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Print
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-text-secondary rounded-lg font-medium shadow-lg"
        >
          Close
        </button>
      </div>

      {/* Printable invoice */}
      <div className="invoice-paper">
        {/* Header */}
        <div className="invoice-header">
          {logoUrl && (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <img src={logoUrl} alt="logo" style={{ maxWidth: 120, maxHeight: 60 }} />
            </div>
          )}
          <h1 className="restaurant-name">{invoice.restaurant.name}</h1>
          {headerText ? (
            <p className="restaurant-info" style={{ whiteSpace: 'pre-line' }}>{headerText}</p>
          ) : (
            showAddress && (
              <>
                {invoice.restaurant.address && (
                  <p className="restaurant-info">{invoice.restaurant.address}</p>
                )}
                {invoice.restaurant.phone && (
                  <p className="restaurant-info">Tel: {invoice.restaurant.phone}</p>
                )}
                {invoice.restaurant.email && (
                  <p className="restaurant-info">{invoice.restaurant.email}</p>
                )}
              </>
            )
          )}
        </div>

        <div className="divider" />

        {/* Invoice Info */}
        <div className="invoice-meta">
          <div className="meta-row">
            <span className="meta-label">Invoice No:</span>
            <span className="meta-value">{invoice.invoiceNumber}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Table:</span>
            <span className="meta-value">
              {invoice.table.number}
              {invoice.table.name && ` (${invoice.table.name})`}
            </span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Date:</span>
            <span className="meta-value">
              {new Date(invoice.date).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>
        </div>

        <div className="divider" />

        {/* Items */}
        <div className="items-section">
          <table className="items-table">
            <thead>
              <tr>
                <th className="text-left">Item</th>
                <th className="text-center">Qty</th>
                <th className="text-right">Price</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={index}>
                  <td className="item-name">
                    <div>{item.name}</div>
                    {showModifiers && item.modifiers.length > 0 && (
                      <div className="modifiers">
                        {item.modifiers.map((mod, idx) => (
                          <div key={idx} className="modifier-item">
                            + {mod.name} ({formatCurrency(mod.price)})
                          </div>
                        ))}
                      </div>
                    )}
                    {showInstructions && item.notes && <div className="item-notes">Note: {item.notes}</div>}
                  </td>
                  <td className="text-center">{item.quantity}</td>
                  <td className="text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divider" />

        {/* Totals */}
        <div className="totals-section">
          {showSubtotal && (
            <div className="total-row">
              <span>Subtotal:</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
          )}
          {showTax && (
            <div className="total-row">
              <span>Tax:</span>
              <span>{formatCurrency(invoice.tax)}</span>
            </div>
          )}
          <div className="total-row total-final">
            <span>Total:</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>
        </div>

        {/* Payments */}
        {invoice.payments.length > 0 && (
          <>
            <div className="divider" />
            <div className="payments-section">
              <div className="section-title">Payments</div>
              {invoice.payments.map((payment, index) => (
                <div key={index} className="payment-row">
                  <span>
                    {payment.method} -{' '}
                    {new Date(payment.createdAt).toLocaleString('en-IN', {
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className="font-medium">{formatCurrency(payment.amount)}</span>
                </div>
              ))}
              <div className="payment-row payment-total">
                <span>Paid:</span>
                <span>{formatCurrency(invoice.totalPaid)}</span>
              </div>
              {invoice.remaining > 0 && (
                <div className="payment-row payment-remaining">
                  <span>Remaining:</span>
                  <span>{formatCurrency(invoice.remaining)}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="invoice-footer">
          <p className="thank-you">{footerText}</p>
        </div>
      </div>
    </div>
  );
}
