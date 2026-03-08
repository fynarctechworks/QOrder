import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PaymentRequestPayload } from '../context/SocketContext';
import { useCurrency } from '../hooks/useCurrency';

interface PaymentRequestsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  requests: PaymentRequestPayload[];
  onDismiss?: (tableId: string) => void;
}

export default function PaymentRequestsOverlay({
  isOpen,
  onClose,
  requests,
  onDismiss,
}: PaymentRequestsOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const fmt = useCurrency();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [isOpen, onClose]);

  function timeAgo(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-50"
          />
          {/* Panel */}
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 right-6 z-50 w-96 max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-900">Payment Requests</h3>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {requests.length === 0 ? (
                <div className="py-12 text-center">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-500 font-medium">No pending requests</p>
                  <p className="text-xs text-gray-400 mt-1">Payment requests from customers will appear here</p>
                </div>
              ) : (
                requests.map((req) => (
                  <motion.div
                    key={req.tableId + req.requestedAt}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    className="bg-amber-50 border border-amber-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-200 text-amber-800 text-xs font-bold">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Table {req.tableNumber}
                          </span>
                          <span className="text-xs text-gray-500">{timeAgo(req.requestedAt)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-700">
                          <span>{req.orderCount} {req.orderCount === 1 ? 'order' : 'orders'}</span>
                          <span className="text-gray-300">•</span>
                          <span className="font-bold text-gray-900">{fmt(req.total)}</span>
                        </div>
                      </div>
                      <span className="ml-3 px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Awaiting
                      </span>
                    </div>
                    {onDismiss && (
                      <button
                        onClick={() => onDismiss(req.tableId)}
                        className="mt-2 w-full text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg py-1.5 transition-colors font-medium"
                      >
                        Dismiss
                      </button>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
