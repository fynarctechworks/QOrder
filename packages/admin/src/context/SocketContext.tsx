import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../state/authStore';
import type { Order, Table, OrderStatus } from '../types';

export interface PaymentRequestPayload {
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  total: number;
  orderCount: number;
  requestedAt: string;
}

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  onNewOrder: (callback: (order: Order) => void) => () => void;
  onOrderStatusUpdate: (
    callback: (data: { orderId: string; status: OrderStatus }) => void
  ) => () => void;
  onTableUpdate: (callback: (table: Table) => void) => () => void;
  onTableUpdated: (callback: () => void) => () => void;
  onSessionUpdated: (
    callback: (data: { sessionId: string; isFullyPaid?: boolean }) => void
  ) => () => void;
  onPaymentRequest: (callback: (data: PaymentRequestPayload) => void) => () => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  acknowledgePayment: (tableId: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export function SocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const { user, accessToken } = useAuthStore();
  const accessTokenRef = useRef(accessToken);
  const isAuthenticated = user !== null;

  // Keep token ref in sync without triggering socket reconnect
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // Callback refs
  const newOrderCallbacks = useRef<Set<(order: Order) => void>>(new Set());
  const statusUpdateCallbacks = useRef<
    Set<(data: { orderId: string; status: OrderStatus }) => void>
  >(new Set());
  const tableUpdateCallbacks = useRef<Set<(table: Table) => void>>(new Set());
  const tableUpdatedCallbacks = useRef<Set<() => void>>(new Set());
  const sessionUpdatedCallbacks = useRef<
    Set<(data: { sessionId: string; isFullyPaid?: boolean }) => void>
  >(new Set());
  const paymentRequestCallbacks = useRef<
    Set<(data: PaymentRequestPayload) => void>
  >(new Set());

  useEffect(() => {
    if (!isAuthenticated || !user?.restaurantId) {
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: {
        token: accessTokenRef.current,
        restaurantId: user.restaurantId,
        requireAuth: true,
      },
    });

    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => {
      setIsConnected(true);
      // Join restaurant room (also re-joins on reconnect)
      socket.emit('join:restaurant', user.restaurantId);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Reconnect when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket.disconnected) {
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for events
    socket.on('order:new', (order: Order) => {
      newOrderCallbacks.current.forEach((cb) => cb(order));
    });

    socket.on('order:statusUpdate', (data: { orderId: string; status: OrderStatus }) => {
      statusUpdateCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('table:update', (table: Table) => {
      tableUpdateCallbacks.current.forEach((cb) => cb(table));
    });

    socket.on('table:updated', () => {
      tableUpdatedCallbacks.current.forEach((cb) => cb());
    });

    socket.on('session:updated', (data: { sessionId: string; isFullyPaid?: boolean }) => {
      sessionUpdatedCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('payment:request', (data: PaymentRequestPayload) => {
      paymentRequestCallbacks.current.forEach((cb) => cb(data));
    });

    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
    };
  }, [isAuthenticated, user?.restaurantId]);

  const onNewOrder = useCallback((callback: (order: Order) => void) => {
    newOrderCallbacks.current.add(callback);
    return () => {
      newOrderCallbacks.current.delete(callback);
    };
  }, []);

  const onOrderStatusUpdate = useCallback(
    (callback: (data: { orderId: string; status: OrderStatus }) => void) => {
      statusUpdateCallbacks.current.add(callback);
      return () => {
        statusUpdateCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onTableUpdate = useCallback((callback: (table: Table) => void) => {
    tableUpdateCallbacks.current.add(callback);
    return () => {
      tableUpdateCallbacks.current.delete(callback);
    };
  }, []);

  const onTableUpdated = useCallback((callback: () => void) => {
    tableUpdatedCallbacks.current.add(callback);
    return () => {
      tableUpdatedCallbacks.current.delete(callback);
    };
  }, []);

  const onSessionUpdated = useCallback(
    (callback: (data: { sessionId: string; isFullyPaid?: boolean }) => void) => {
      sessionUpdatedCallbacks.current.add(callback);
      return () => {
        sessionUpdatedCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onPaymentRequest = useCallback(
    (callback: (data: PaymentRequestPayload) => void) => {
      paymentRequestCallbacks.current.add(callback);
      return () => {
        paymentRequestCallbacks.current.delete(callback);
      };
    },
    []
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus) => {
      socketRef.current?.emit('order:updateStatus', { orderId, status });
    },
    []
  );

  const acknowledgePayment = useCallback(
    (tableId: string) => {
      socketRef.current?.emit('payment:acknowledge' as any, { tableId });
    },
    []
  );

  const value = useMemo<SocketContextValue>(
    () => ({
      socket: socketInstance,
      isConnected,
      onNewOrder,
      onOrderStatusUpdate,
      onTableUpdate,
      onTableUpdated,
      onSessionUpdated,
      onPaymentRequest,
      updateOrderStatus,
      acknowledgePayment,
    }),
    [isConnected, socketInstance, onNewOrder, onOrderStatusUpdate, onTableUpdate, onTableUpdated, onSessionUpdated, onPaymentRequest, updateOrderStatus, acknowledgePayment]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
}
