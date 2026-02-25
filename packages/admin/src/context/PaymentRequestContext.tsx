import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSocket, type PaymentRequestPayload } from './SocketContext';

const STORAGE_KEY = 'qorder_payment_requests';
const OVERLAY_KEY = 'qorder_payment_overlay';

function loadPersistedRequests(): PaymentRequestPayload[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadPersistedOverlay(): boolean {
  try {
    return sessionStorage.getItem(OVERLAY_KEY) === '1';
  } catch {
    return false;
  }
}

interface PaymentRequestContextValue {
  paymentRequests: PaymentRequestPayload[];
  addPaymentRequest: (tableId: string, tableName: string, total: number, orderCount: number) => void;
  clearPaymentRequest: (tableId: string) => void;
  isOverlayOpen: boolean;
  setIsOverlayOpen: (open: boolean) => void;
}

const PaymentRequestContext = createContext<PaymentRequestContextValue | null>(null);

export function PaymentRequestProvider({ children }: { children: ReactNode }) {
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestPayload[]>(loadPersistedRequests);
  const [isOverlayOpen, setIsOverlayOpen] = useState(loadPersistedOverlay);
  const { onPaymentRequest } = useSocket();

  useEffect(() => {
    const unsub = onPaymentRequest((data) => {
      setPaymentRequests((prev) => {
        const filtered = prev.filter((r) => r.tableId !== data.tableId);
        return [...filtered, data];
      });
    });
    return unsub;
  }, [onPaymentRequest]);

  // Persist paymentRequests to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(paymentRequests));
  }, [paymentRequests]);

  // Persist overlay state
  useEffect(() => {
    sessionStorage.setItem(OVERLAY_KEY, isOverlayOpen ? '1' : '0');
  }, [isOverlayOpen]);

  const addPaymentRequest = useCallback((tableId: string, tableName: string, total: number, orderCount: number) => {
    setPaymentRequests((prev) => {
      const filtered = prev.filter((r) => r.tableId !== tableId);
      const entry: PaymentRequestPayload = {
        restaurantId: '',
        tableId,
        tableNumber: tableName,
        total,
        orderCount,
        requestedAt: new Date().toISOString(),
      };
      return [...filtered, entry];
    });
    setIsOverlayOpen(true);
  }, []);

  const clearPaymentRequest = useCallback((tableId: string) => {
    setPaymentRequests((prev) => {
      const next = prev.filter((r) => r.tableId !== tableId);
      if (next.length === 0) setIsOverlayOpen(false);
      return next;
    });
  }, []);

  return (
    <PaymentRequestContext.Provider
      value={{ paymentRequests, addPaymentRequest, clearPaymentRequest, isOverlayOpen, setIsOverlayOpen }}
    >
      {children}
    </PaymentRequestContext.Provider>
  );
}

export function usePaymentRequests() {
  const ctx = useContext(PaymentRequestContext);
  if (!ctx) throw new Error('usePaymentRequests must be used within PaymentRequestProvider');
  return ctx;
}
