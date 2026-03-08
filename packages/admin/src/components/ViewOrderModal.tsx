import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '../hooks/useCurrency';
import { tableService, TableOrderDetails } from '../services/tableService';

interface ViewOrderModalProps {
  tableId: string;
  onClose: () => void;
  onSettleBill: () => void;
}

export default function ViewOrderModal({ tableId, onClose, onSettleBill }: ViewOrderModalProps) {
  const formatCurrency = useCurrency();

  // Fetch order data for the table
  const { data: sessionData, isLoading } = useQuery<TableOrderDetails>({
    queryKey: ['tableOrders', tableId],
    queryFn: () => tableService.getTableOrders(tableId),
  });

  const handleSettleBill = () => {
    onClose();
    onSettleBill();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        <div className="p-6 overflow-y-auto max-h-[90vh]">
          <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
            {sessionData && (
              <p className="mt-1 text-sm text-gray-600">
                Table {sessionData.tableNumber}
                {sessionData.tableName && ` - ${sessionData.tableName}`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm text-gray-500">Loading order details...</p>
          </div>
        )}

        {/* Order Items */}
        {sessionData && !isLoading && (
          <>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sessionData.items.map((item, index) => (
                <div
                  key={index}
                  className="bg-gray-50 rounded-xl p-4 border border-gray-200"
                >
                  {/* Item Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold">
                          {item.quantity}
                        </span>
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        {formatCurrency(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(item.totalPrice)}
                      </p>
                    </div>
                  </div>

                  {/* Modifiers */}
                  {item.modifiers.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {item.modifiers.map((modifier, modIndex) => (
                        <div
                          key={modIndex}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-600">+ {modifier.name}</span>
                          <span className="text-gray-900 font-medium">
                            {modifier.price > 0 ? formatCurrency(modifier.price) : 'Free'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Special Notes */}
                  {item.notes && (
                    <div className="mt-2 pl-8">
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md text-xs">
                        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <span className="text-amber-700 font-medium">{item.notes}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bill Summary */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-5 border border-orange-200">
              <h3 className="text-sm font-semibold text-orange-900 mb-3 uppercase tracking-wide">
                Bill Summary
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary">Subtotal</span>
                  <span className="font-medium text-orange-900">{formatCurrency(sessionData.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary">Tax</span>
                  <span className="font-medium text-orange-900">{formatCurrency(sessionData.tax)}</span>
                </div>
                <div className="pt-2 border-t border-orange-300 flex items-center justify-between">
                  <span className="text-base font-bold text-orange-900">Total Amount</span>
                  <span className="text-2xl font-black text-primary">{formatCurrency(sessionData.total)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleSettleBill}
                className="flex-1 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Settle Bill
              </button>
            </div>
          </>
        )}

        {/* Empty State */}
        {sessionData && sessionData.items.length === 0 && !isLoading && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No orders found for this table</p>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
