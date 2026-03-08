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
import { useQueryClient } from '@tanstack/react-query';
import type { OrderStatusUpdate, SocketEvents } from '../types';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  joinOrderRoom: (orderId: string) => void;
  leaveOrderRoom: (orderId: string) => void;
  joinTableRoom: (tableId: string) => void;
  leaveTableRoom: (tableId: string) => void;
  requestPayment: (data: PaymentRequestPayload) => void;
  onOrderStatusUpdate: (callback: (update: OrderStatusUpdate) => void) => () => void;
  onTableUpdated: (callback: (data: { tableId: string }) => void) => () => void;
  onPaymentAcknowledged: (callback: (data: { tableId: string }) => void) => () => void;
}

export interface PaymentRequestPayload {
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  total: number;
  orderCount: number;
  requestedAt: string;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const statusUpdateCallbacks = useRef<Set<(update: OrderStatusUpdate) => void>>(
    new Set()
  );
  const paymentAckCallbacks = useRef<Set<(data: { tableId: string }) => void>>(
    new Set()
  );
  const tableUpdatedCallbacks = useRef<Set<(data: { tableId: string }) => void>>(
    new Set()
  );
  // Track which order rooms we've joined so we can re-join on reconnect
  const joinedRooms = useRef<Set<string>>(new Set());
  const joinedTableRooms = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Initialize socket connection
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('Socket connected:', socket.id);
      setIsConnected(true);
      // Re-join any order rooms after reconnect
      joinedRooms.current.forEach((orderId) => {
        socket.emit('order:join', { orderId });
      });
      // Re-join any table rooms after reconnect
      joinedTableRooms.current.forEach((tableId) => {
        socket.emit('join:table', tableId);
      });
    });

    socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      if (import.meta.env.DEV) console.error('Socket connection error:', error);
    });

    // Listen for order status updates
    socket.on('order:statusUpdate', (update: OrderStatusUpdate) => {
      statusUpdateCallbacks.current.forEach((callback) => callback(update));
    });

    // Listen for payment acknowledgement from admin
    socket.on('payment:acknowledged', (data: { tableId: string }) => {
      paymentAckCallbacks.current.forEach((callback) => callback(data));
    });

    // Listen for table status updates (e.g. session closed, table freed)
    socket.on('table:updated', (data: { tableId: string }) => {
      tableUpdatedCallbacks.current.forEach((callback) => callback(data));
    });

    // Listen for sync refresh from admin
    socket.on('sync:refresh', () => {
      if (import.meta.env.DEV) console.log('Sync refresh received from admin');
      queryClient.invalidateQueries();
    });

    // Reconnect when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket.disconnected) {
        if (import.meta.env.DEV) console.log('Tab visible — reconnecting socket');
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinOrderRoom = useCallback((orderId: string) => {
    joinedRooms.current.add(orderId);
    socketRef.current?.emit('order:join', { orderId });
  }, []);

  const leaveOrderRoom = useCallback((orderId: string) => {
    joinedRooms.current.delete(orderId);
    socketRef.current?.emit('order:leave', { orderId });
  }, []);

  const joinTableRoom = useCallback((tableId: string) => {
    joinedTableRooms.current.add(tableId);
    socketRef.current?.emit('join:table', tableId);
  }, []);

  const leaveTableRoom = useCallback((tableId: string) => {
    joinedTableRooms.current.delete(tableId);
    socketRef.current?.emit('leave:table', tableId);
  }, []);

  const requestPayment = useCallback((data: PaymentRequestPayload) => {
    (socketRef.current as Socket<SocketEvents, SocketEvents> | null)?.emit('payment:request', data);
  }, []);

  const onOrderStatusUpdate = useCallback(
    (callback: (update: OrderStatusUpdate) => void) => {
      statusUpdateCallbacks.current.add(callback);
      return () => {
        statusUpdateCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onPaymentAcknowledged = useCallback(
    (callback: (data: { tableId: string }) => void) => {
      paymentAckCallbacks.current.add(callback);
      return () => {
        paymentAckCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onTableUpdated = useCallback(
    (callback: (data: { tableId: string }) => void) => {
      tableUpdatedCallbacks.current.add(callback);
      return () => {
        tableUpdatedCallbacks.current.delete(callback);
      };
    },
    []
  );

  const value = useMemo<SocketContextValue>(
    () => ({
      socket: socketRef.current,
      isConnected,
      joinOrderRoom,
      leaveOrderRoom,
      joinTableRoom,
      leaveTableRoom,
      requestPayment,
      onOrderStatusUpdate,
      onTableUpdated,
      onPaymentAcknowledged,
    }),
    [isConnected, joinOrderRoom, leaveOrderRoom, joinTableRoom, leaveTableRoom, requestPayment, onOrderStatusUpdate, onTableUpdated, onPaymentAcknowledged]
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
