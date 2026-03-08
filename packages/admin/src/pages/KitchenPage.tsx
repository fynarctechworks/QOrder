import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../context/SocketContext';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_PERMISSIONS, type PageKey, type RolePermissions } from '../components/PermissionsTab';
import type { Order, OrderItem, OrderStatus } from '../types';

/* ═══════════════════ Helpers ═══════════════════════════ */

function playNewOrderSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = 1100;
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.65);
  } catch {
    /* AudioContext not available */
  }
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ═══════════════════ Flattened Item Type ══════════════ */

interface KitchenItem extends OrderItem {
  orderId: string;
  orderNumber: string;
  tableName: string;
  sectionName: string | null;
  orderCreatedAt: string;
  customerName?: string;
  orderSpecialInstructions?: string;
}

/* ═══════════════════ Column Meta ═══════════════════════ */

const COLUMNS: {
  key: 'cooking' | 'ready';
  label: string;
  dot: string;
  headerBg: string;
  headerText: string;
  borderColor: string;
  emptyMsg: string;
  accent: 'blue' | 'emerald';
}[] = [
  {
    key: 'cooking',
    label: 'Preparing',
    dot: 'bg-blue-400',
    headerBg: 'bg-blue-500/10',
    headerText: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    emptyMsg: 'Nothing being prepared',
    accent: 'blue',
  },
  {
    key: 'ready',
    label: 'Ready to Serve',
    dot: 'bg-emerald-400',
    headerBg: 'bg-emerald-500/10',
    headerText: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    emptyMsg: 'No items ready',
    accent: 'emerald',
  },
];

/* ═══════════════════ Item Ticket ══════════════════════ */

const ItemTicket = memo(function ItemTicket({
  item,
  accentColor,
  onMarkReady,
  isUpdating,
}: {
  item: KitchenItem;
  accentColor: 'blue' | 'emerald';
  onMarkReady?: () => void;
  isUpdating?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const created = new Date(item.orderCreatedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - created) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [item.orderCreatedAt]);

  const timerColor =
    elapsed > 900 ? 'text-red-400' : elapsed > 600 ? 'text-amber-300' : 'text-emerald-400';

  const accent = accentColor === 'blue' ? 'border-l-blue-400' : 'border-l-emerald-400';

  return (
    <div className={`bg-gray-800/80 rounded-lg border-l-4 ${accent} overflow-hidden`}>
      {/* Ticket header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-white tracking-wide">
            #{item.orderNumber}
          </span>
          {item.tableName && item.tableName !== 'Unknown' && (
            <span className="text-[11px] font-semibold text-gray-400 bg-gray-700/80 px-1.5 py-0.5 rounded">
              {item.tableName}
            </span>
          )}
          {item.sectionName && (
            <span className="text-[10px] text-gray-500 font-medium">
              {item.sectionName}
            </span>
          )}
        </div>
        <span className={`text-xs font-mono font-bold tabular-nums ${timerColor}`}>
          {formatTimer(elapsed)}
        </span>
      </div>

      {/* Item detail */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="shrink-0 w-8 h-8 rounded-md bg-gray-700 flex items-center justify-center text-base font-bold text-white">
            {item.quantity}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-100 leading-snug">
              {item.menuItemName}
            </p>
            {item.customizations.length > 0 &&
              item.customizations.map((c) => (
                <p key={c.groupId} className="text-xs text-gray-400 mt-0.5">
                  {c.groupName}: {c.options.map((o) => o.name).join(', ')}
                </p>
              ))}
            {item.specialInstructions && (
              <p className="text-xs text-amber-400 mt-1 font-medium">
                ⚠ {item.specialInstructions}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Order-level special instructions */}
      {item.orderSpecialInstructions && (
        <div className="mx-3 mb-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-md">
          <p className="text-[11px] font-semibold text-amber-400">
            📝 {item.orderSpecialInstructions}
          </p>
        </div>
      )}

      {/* Customer name */}
      {item.customerName && (
        <div className="px-4 pb-2 border-t border-gray-700/30 pt-1.5">
          <p className="text-[11px] text-gray-500 font-medium">{item.customerName}</p>
        </div>
      )}

      {/* Ready button — only for preparing items */}
      {onMarkReady && (
        <div className="px-3 pb-3 pt-1">
          <button
            onClick={onMarkReady}
            disabled={isUpdating}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {isUpdating ? 'UPDATING…' : 'READY'}
          </button>
        </div>
      )}
    </div>
  );
});

/* ═══════════════════ Main Page ═══════════════════════════ */

export default function KitchenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isConnected, onNewOrder, onNewOrderFull, onOrderStatusUpdate, onItemKitchenReady, joinKds, leaveKds } = useSocket();

  const recentFullOrderIds = useRef<Set<string>>(new Set());

  // Track which item is being updated (for button loading state)
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  // Determine the first non-kitchen page to navigate back to
  const { data: restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });
  const lockSettings = (restaurant?.settings ?? {}) as Record<string, unknown>;
  const backPath = useMemo(() => {
    if (!user) return null;
    if (user.role === 'OWNER') return '/dashboard';
    const savedPerms = lockSettings.rolePermissions as RolePermissions | undefined;
    const roleKey = user.role as keyof RolePermissions;
    let allowedPages: PageKey[];
    if (user.roleTitle && savedPerms?.[user.roleTitle]) {
      allowedPages = savedPerms[user.roleTitle] || [];
    } else {
      allowedPages = savedPerms?.[roleKey] || DEFAULT_PERMISSIONS[roleKey] || [];
    }
    const firstNonKitchen = allowedPages.find((p) => p !== 'kitchen');
    if (!firstNonKitchen) return null;
    const PAGE_TO_PATH: Record<PageKey, string> = {
      dashboard: '/dashboard',
      'create-order': '/create-order',
      orders: '/orders',
      menu: '/menu',
      tables: '/tables',
      analytics: '/analytics',
      inventory: '/inventory',
      kitchen: '/kitchen',
      captain: '/captain',
      crm: '/crm',
      credit: '/credit',
      reports: '/reports',
      'staff-management': '/staff-management',
    };
    return PAGE_TO_PATH[firstNonKitchen] || '/dashboard';
  }, [user, lockSettings]);

  // Register this page as a KDS client once socket is connected
  useEffect(() => {
    if (!isConnected) return;
    joinKds();
    return () => { leaveKds(); };
  }, [isConnected, joinKds, leaveKds]);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ─── Fetch active orders ─── */
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['kitchen-orders'],
    queryFn: async () => {
      const all = await orderService.getActive();
      // KDS shows only preparing orders
      return all.filter((o) => o.status === 'preparing');
    },
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  /* ─── Socket listeners ─── */
  useEffect(() => {
    const unsub1 = onNewOrderFull((fullOrder: Order) => {
      if (fullOrder.status !== 'preparing') return;
      recentFullOrderIds.current.add(fullOrder.id);
      setTimeout(() => recentFullOrderIds.current.delete(fullOrder.id), 5000);
      qc.setQueryData<Order[]>(['kitchen-orders'], (prev = []) => {
        if (prev.some((o) => o.id === fullOrder.id)) return prev;
        return [fullOrder, ...prev];
      });
      playNewOrderSound();
    });

    const unsub2 = onNewOrder((order: Order) => {
      if (recentFullOrderIds.current.has(order.id)) return;
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
      playNewOrderSound();
    });

    const unsub3 = onOrderStatusUpdate((data: { orderId: string; status: OrderStatus }) => {
      const status = data.status.toLowerCase() as OrderStatus;
      if (status === 'preparing') {
        // If the full order already handled via onNewOrderFull, skip the refetch
        if (recentFullOrderIds.current.has(data.orderId)) return;
        // If order isn't already in the kitchen cache (e.g. customer order just confirmed),
        // refetch from API so it appears on the KDS
        const current = qc.getQueryData<Order[]>(['kitchen-orders']) ?? [];
        if (!current.some((o) => o.id === data.orderId)) {
          qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
          playNewOrderSound();
          return;
        }
      }
      qc.setQueryData<Order[]>(['kitchen-orders'], (prev = []) => {
        if (status !== 'preparing') {
          return prev.filter((o) => o.id !== data.orderId);
        }
        return prev.map((o) =>
          o.id === data.orderId ? { ...o, status } : o
        );
      });
    });

    // Listen for per-item kitchen-ready events (from this or another KDS instance)
    const unsub4 = onItemKitchenReady((data) => {
      qc.setQueryData<Order[]>(['kitchen-orders'], (prev = []) =>
        prev.map((o) => {
          if (o.id !== data.orderId) return o;
          return {
            ...o,
            preparedAt: data.allItemsReady ? data.preparedAt : o.preparedAt,
            items: o.items.map((item) =>
              item.id === data.itemId ? { ...item, preparedAt: data.preparedAt } : item
            ),
          };
        })
      );
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [onNewOrder, onNewOrderFull, onOrderStatusUpdate, onItemKitchenReady, qc]);

  /* ─── Flatten orders → individual items ─── */
  const columnData = useMemo(() => {
    const cooking: KitchenItem[] = [];
    const ready: KitchenItem[] = [];

    for (const order of orders) {
      if (order.status !== 'preparing') continue;
      for (const item of order.items) {
        const kitchenItem: KitchenItem = {
          ...item,
          orderId: order.id,
          orderNumber: order.orderNumber,
          tableName: order.tableName,
          sectionName: order.sectionName ?? null,
          orderCreatedAt: order.createdAt,
          customerName: order.customerName,
          orderSpecialInstructions: order.specialInstructions,
        };
        if (item.preparedAt) {
          ready.push(kitchenItem);
        } else {
          cooking.push(kitchenItem);
        }
      }
    }

    // Sort by order creation time (oldest first)
    const sortFn = (a: KitchenItem, b: KitchenItem) =>
      new Date(a.orderCreatedAt).getTime() - new Date(b.orderCreatedAt).getTime();
    cooking.sort(sortFn);
    ready.sort(sortFn);

    return { cooking, ready };
  }, [orders]);

  /* ─── Mark Item Ready mutation ─── */
  const readyMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      orderService.markItemKitchenReady(orderId, itemId),
    onMutate: async ({ orderId, itemId }) => {
      setUpdatingItemId(itemId);
      await qc.cancelQueries({ queryKey: ['kitchen-orders'] });
      qc.setQueryData<Order[]>(['kitchen-orders'], (prev = []) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const updatedItems = o.items.map((i) =>
            i.id === itemId ? { ...i, preparedAt: new Date().toISOString() } : i
          );
          const allReady = updatedItems.every((i) => i.preparedAt);
          return {
            ...o,
            items: updatedItems,
            preparedAt: allReady ? new Date().toISOString() : o.preparedAt,
          };
        })
      );
    },
    onSettled: () => {
      setUpdatingItemId(null);
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const handleMarkItemReady = useCallback(
    (orderId: string, itemId: string) => readyMutation.mutate({ orderId, itemId }),
    [readyMutation]
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col select-none overflow-hidden">
      {/* ─── Header Bar ─── */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          {backPath && (
            <button
              onClick={() => navigate(backPath)}
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              title="Back"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          <div className="flex items-center gap-2">
            <img src="/Q Order Logo QO.svg" alt="Q Order" className="w-6 h-6" />
            <h1 className="text-base font-bold tracking-wider uppercase text-gray-200">
              Kitchen Display
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-5 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-gray-500">Preparing</span>
            <span className="font-bold text-blue-400 tabular-nums">{columnData.cooking.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-gray-500">Ready</span>
            <span className="font-bold text-emerald-400 tabular-nums">{columnData.ready.length}</span>
          </div>

          <span className="w-px h-5 bg-gray-700" />

          <span className="font-mono font-bold text-gray-300 tabular-nums text-base">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-xs text-gray-500">{isConnected ? 'Live' : 'Offline'}</span>
          </div>

          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors" title="Fullscreen">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </header>

      {/* ─── Board ─── */}
      <main className="flex-1 overflow-hidden p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-gray-700 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Loading orders…</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 h-full">
            {COLUMNS.map((col) => {
              const items = columnData[col.key];
              return (
                <div key={col.key} className="flex flex-col h-full min-h-0">
                  {/* Column header */}
                  <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-xl ${col.headerBg} border ${col.borderColor} border-b-0`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                      <span className={`text-sm font-bold uppercase tracking-wider ${col.headerText}`}>
                        {col.label}
                      </span>
                    </div>
                    <span className={`text-xs font-bold tabular-nums px-2.5 py-1 rounded-full bg-gray-800/50 ${col.headerText}`}>
                      {items.length}
                    </span>
                  </div>

                  {/* Column body — scrollable */}
                  <div className={`flex-1 overflow-y-auto rounded-b-xl border ${col.borderColor} border-t-0 bg-gray-900/40 p-2.5 space-y-2.5`}>
                    {items.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-600">{col.emptyMsg}</p>
                      </div>
                    ) : (
                      items.map((kitchenItem) => (
                        <ItemTicket
                          key={kitchenItem.id}
                          item={kitchenItem}
                          accentColor={col.accent}
                          onMarkReady={col.key === 'cooking' ? () => handleMarkItemReady(kitchenItem.orderId, kitchenItem.id) : undefined}
                          isUpdating={updatingItemId === kitchenItem.id}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

    </div>
  );
}
