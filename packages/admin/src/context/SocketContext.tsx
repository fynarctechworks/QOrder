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

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  onNewOrder: (callback: (order: Order) => void) => () => void;
  onNewOrderFull: (callback: (order: Order) => void) => () => void;
  onOrderStatusUpdate: (
    callback: (data: { orderId: string; status: OrderStatus }) => void
  ) => () => void;
  onKitchenReady: (
    callback: (data: { orderId: string; orderNumber: string; tableName: string; preparedAt: string }) => void
  ) => () => void;
  onItemKitchenReady: (
    callback: (data: { orderId: string; orderNumber: string; itemId: string; itemName: string; tableName: string; preparedAt: string; allItemsReady: boolean }) => void
  ) => () => void;
  onTableUpdate: (callback: (table: Table) => void) => () => void;
  onTableUpdated: (callback: (data: { tableId: string; status?: string; sessionToken?: string | null }) => void) => () => void;
  onSessionUpdated: (
    callback: (data: { sessionId: string; isFullyPaid?: boolean }) => void
  ) => () => void;
  onServiceRequest: (callback: (data: { id: string; type: string; tableId: string; tableName?: string }) => void) => () => void;
  onLeaveRequest: (callback: (data: { id: string; userName: string; leaveType: string; startDate: string; endDate: string; reason?: string }) => void) => () => void;
  onStockLow: (callback: (data: { count: number; items: Array<{ id: string; name: string; unit: string; currentStock: number; minStock: number }> }) => void) => () => void;
  onStaffLate: (callback: (data: { count: number; staff: Array<{ name: string; shiftName: string; shiftStart: string; minutesLate: number }> }) => void) => () => void;
  onStaffEarlyCheckout: (callback: (data: { count: number; staff: Array<{ name: string; shiftName: string; shiftEnd: string; minutesEarly: number }> }) => void) => () => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  triggerSync: () => void;
  kdsCount: number;
  kdsUsers: { id: string; name: string; role: string; roleTitle?: string }[];
  joinKds: () => void;
  leaveKds: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export function SocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [kdsCount, setKdsCount] = useState(0);
  const [kdsUsers, setKdsUsers] = useState<{ id: string; name: string; role: string; roleTitle?: string }[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const { user, accessToken } = useAuthStore();
  const isAuthenticated = user !== null;

  // Callback refs
  const newOrderCallbacks = useRef<Set<(order: Order) => void>>(new Set());
  const newOrderFullCallbacks = useRef<Set<(order: Order) => void>>(new Set());
  const statusUpdateCallbacks = useRef<
    Set<(data: { orderId: string; status: OrderStatus }) => void>
  >(new Set());
  const tableUpdateCallbacks = useRef<Set<(table: Table) => void>>(new Set());
  const tableUpdatedCallbacks = useRef<Set<(data: { tableId: string; status?: string; sessionToken?: string | null }) => void>>(new Set());
  const sessionUpdatedCallbacks = useRef<
    Set<(data: { sessionId: string; isFullyPaid?: boolean }) => void>
  >(new Set());
  const kitchenReadyCallbacks = useRef<
    Set<(data: { orderId: string; orderNumber: string; tableName: string; preparedAt: string }) => void>
  >(new Set());
  const itemKitchenReadyCallbacks = useRef<
    Set<(data: { orderId: string; orderNumber: string; itemId: string; itemName: string; tableName: string; preparedAt: string; allItemsReady: boolean }) => void>
  >(new Set());
  const serviceRequestCallbacks = useRef<
    Set<(data: { id: string; type: string; tableId: string; tableName?: string }) => void>
  >(new Set());
  const leaveRequestCallbacks = useRef<
    Set<(data: { id: string; userName: string; leaveType: string; startDate: string; endDate: string; reason?: string }) => void>
  >(new Set());
  const stockLowCallbacks = useRef<
    Set<(data: { count: number; items: Array<{ id: string; name: string; unit: string; currentStock: number; minStock: number }> }) => void>
  >(new Set());
  const staffLateCallbacks = useRef<
    Set<(data: { count: number; staff: Array<{ name: string; shiftName: string; shiftStart: string; minutesLate: number }> }) => void>
  >(new Set());
  const staffEarlyCheckoutCallbacks = useRef<
    Set<(data: { count: number; staff: Array<{ name: string; shiftName: string; shiftEnd: string; minutesEarly: number }> }) => void>
  >(new Set());

  useEffect(() => {
    // Don't create socket until we have a valid token
    if (!isAuthenticated || !user?.restaurantId || !accessToken) {
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
        token: accessToken,
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

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
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

    socket.on('order:newFull', (order: Order) => {
      newOrderFullCallbacks.current.forEach((cb) => cb(order));
    });

    socket.on('order:statusUpdate', (data: { orderId: string; status: OrderStatus }) => {
      statusUpdateCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('table:update', (table: Table) => {
      tableUpdateCallbacks.current.forEach((cb) => cb(table));
    });

    socket.on('table:updated', (data: { tableId: string; status?: string; sessionToken?: string | null }) => {
      tableUpdatedCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('session:updated', (data: { sessionId: string; isFullyPaid?: boolean }) => {
      sessionUpdatedCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('order:kitchenReady', (data: { orderId: string; orderNumber: string; tableName: string; preparedAt: string }) => {
      kitchenReadyCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('order:itemKitchenReady', (data: { orderId: string; orderNumber: string; itemId: string; itemName: string; tableName: string; preparedAt: string; allItemsReady: boolean }) => {
      itemKitchenReadyCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('service:request', (data: { id: string; type: string; tableId: string; tableName?: string }) => {
      serviceRequestCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('staff:leaveRequest', (data: { id: string; userName: string; leaveType: string; startDate: string; endDate: string; reason?: string }) => {
      leaveRequestCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('notification:stockLow' as any, (data: { count: number; items: Array<{ id: string; name: string; unit: string; currentStock: number; minStock: number }> }) => {
      stockLowCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('notification:staffLate' as any, (data: { count: number; staff: Array<{ name: string; shiftName: string; shiftStart: string; minutesLate: number }> }) => {
      staffLateCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('notification:staffEarlyCheckout' as any, (data: { count: number; staff: Array<{ name: string; shiftName: string; shiftEnd: string; minutesEarly: number }> }) => {
      staffEarlyCheckoutCallbacks.current.forEach((cb) => cb(data));
    });

    socket.on('kds:status' as any, (data: { count: number; users: { id: string; name: string; role: string; roleTitle?: string }[] }) => {
      setKdsCount(data.count);
      setKdsUsers(data.users || []);
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
    };
  }, [isAuthenticated, user?.restaurantId, accessToken]);

  const onNewOrder = useCallback((callback: (order: Order) => void) => {
    newOrderCallbacks.current.add(callback);
    return () => {
      newOrderCallbacks.current.delete(callback);
    };
  }, []);

  const onNewOrderFull = useCallback((callback: (order: Order) => void) => {
    newOrderFullCallbacks.current.add(callback);
    return () => {
      newOrderFullCallbacks.current.delete(callback);
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

  const onKitchenReady = useCallback(
    (callback: (data: { orderId: string; orderNumber: string; tableName: string; preparedAt: string }) => void) => {
      kitchenReadyCallbacks.current.add(callback);
      return () => {
        kitchenReadyCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onItemKitchenReady = useCallback(
    (callback: (data: { orderId: string; orderNumber: string; itemId: string; itemName: string; tableName: string; preparedAt: string; allItemsReady: boolean }) => void) => {
      itemKitchenReadyCallbacks.current.add(callback);
      return () => {
        itemKitchenReadyCallbacks.current.delete(callback);
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

  const onTableUpdated = useCallback((callback: (data: { tableId: string; status?: string; sessionToken?: string | null }) => void) => {
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

  const onServiceRequest = useCallback(
    (callback: (data: { id: string; type: string; tableId: string; tableName?: string }) => void) => {
      serviceRequestCallbacks.current.add(callback);
      return () => {
        serviceRequestCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onLeaveRequest = useCallback(
    (callback: (data: { id: string; userName: string; leaveType: string; startDate: string; endDate: string; reason?: string }) => void) => {
      leaveRequestCallbacks.current.add(callback);
      return () => {
        leaveRequestCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onStockLow = useCallback(
    (callback: (data: { count: number; items: Array<{ id: string; name: string; unit: string; currentStock: number; minStock: number }> }) => void) => {
      stockLowCallbacks.current.add(callback);
      return () => {
        stockLowCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onStaffLate = useCallback(
    (callback: (data: { count: number; staff: Array<{ name: string; shiftName: string; shiftStart: string; minutesLate: number }> }) => void) => {
      staffLateCallbacks.current.add(callback);
      return () => {
        staffLateCallbacks.current.delete(callback);
      };
    },
    []
  );

  const onStaffEarlyCheckout = useCallback(
    (callback: (data: { count: number; staff: Array<{ name: string; shiftName: string; shiftEnd: string; minutesEarly: number }> }) => void) => {
      staffEarlyCheckoutCallbacks.current.add(callback);
      return () => {
        staffEarlyCheckoutCallbacks.current.delete(callback);
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

  const triggerSync = useCallback(() => {
    socketRef.current?.emit('sync:trigger' as any);
  }, []);

  const joinKds = useCallback(() => {
    socketRef.current?.emit('kds:join' as any);
  }, []);

  const leaveKds = useCallback(() => {
    socketRef.current?.emit('kds:leave' as any);
  }, []);

  const value = useMemo<SocketContextValue>(
    () => ({
      socket: socketInstance,
      isConnected,
      onNewOrder,
      onNewOrderFull,
      onOrderStatusUpdate,
      onKitchenReady,
      onItemKitchenReady,
      onTableUpdate,
      onTableUpdated,
      onSessionUpdated,
      onServiceRequest,
      onLeaveRequest,
      onStockLow,
      onStaffLate,
      onStaffEarlyCheckout,
      updateOrderStatus,
      triggerSync,
      kdsCount,
      kdsUsers,
      joinKds,
      leaveKds,
    }),
    [isConnected, socketInstance, kdsCount, kdsUsers, onNewOrder, onNewOrderFull, onOrderStatusUpdate, onKitchenReady, onItemKitchenReady, onTableUpdate, onTableUpdated, onSessionUpdated, onServiceRequest, onLeaveRequest, onStockLow, onStaffLate, onStaffEarlyCheckout, updateOrderStatus, triggerSync, joinKds, leaveKds]
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
