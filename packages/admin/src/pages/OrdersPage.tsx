import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { orderService } from '../services';
import { settingsService } from '../services/settingsService';
import { useSocket } from '../context/SocketContext';
import { sanitize } from '../utils/sanitize';
import { useCurrency } from '../hooks/useCurrency';
import { timeAgo } from '../utils/timeAgo';
import type { Order, OrderItem, OrderStatus } from '../types';
import RunningTablesSection from '../components/RunningTablesSection';
import SettlementModal from '../components/SettlementModal';
import TakeawaySettlementModal from '../components/TakeawaySettlementModal';
import PrintInvoice from '../components/PrintInvoice';

const UPLOAD_BASE = (import.meta.env.VITE_API_URL as string || 'http://localhost:3000/api').replace('/api', '');

/* ═══════════════════════════ Constants ════════════════════════ */

const STATUS_FLOW: OrderStatus[] = [
  'pending', 'preparing', 'payment_pending', 'completed',
];

const SM: Record<OrderStatus, {
  label: string; btnLabel: string; dot: string; bg: string; text: string; border: string;
  btnStyle: string; btnIcon: string;
}> = {
  pending:         { label: 'Pending',         btnLabel: 'Pending',         dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-l-amber-400',   btnStyle: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200/50',   btnIcon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  preparing:       { label: 'Preparing',       btnLabel: 'Confirm',         dot: 'bg-violet-500',  bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-l-violet-400',  btnStyle: 'bg-primary hover:bg-primary-hover text-white shadow-orange-200/50', btnIcon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  payment_pending: { label: 'Payment Pending', btnLabel: 'Served',          dot: 'bg-primary', bg: 'bg-orange-50', text: 'text-primary', border: 'border-l-orange-400', btnStyle: 'bg-primary hover:bg-primary-hover text-white shadow-orange-200/50', btnIcon: 'M5 13l4 4L19 7' },
  completed:       { label: 'Completed',       btnLabel: 'Complete',        dot: 'bg-gray-400',    bg: 'bg-gray-100',   text: 'text-gray-600',    border: 'border-l-gray-300',    btnStyle: 'bg-gray-500 hover:bg-gray-600 text-white shadow-gray-200/50',     btnIcon: 'M5 13l4 4L19 7' },
  cancelled:       { label: 'Cancelled',       btnLabel: 'Cancel',          dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-l-red-400',     btnStyle: 'bg-red-500 hover:bg-red-600 text-white shadow-red-200/50',       btnIcon: 'M6 18L18 6M6 6l12 12' },
};

/* ═══════════════════════════ Helpers ═════════════════════════ */

function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(s);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] ?? null : null;
}

interface TableBill {
  tableId: string;
  tableName: string;
  status: OrderStatus;
  orders: Order[];
  allItems: OrderItem[];
  total: number;
  subtotal: number;
  tax: number;
  orderCount: number;
  latestCreatedAt: string;
}

function makeBill(orders: Order[], status: OrderStatus): TableBill {
  const first = orders[0]!;
  return {
    tableId: first.tableId,
    tableName: first.tableName,
    status,
    orders,
    allItems: orders.flatMap(o => o.items),
    total: orders.reduce((s, o) => s + o.total, 0),
    subtotal: orders.reduce((s, o) => s + o.subtotal, 0),
    tax: orders.reduce((s, o) => s + o.tax, 0),
    orderCount: orders.length,
    latestCreatedAt: orders.reduce((latest, o) =>
      new Date(o.createdAt) > new Date(latest) ? o.createdAt : latest, first.createdAt),
  };
}

function groupOrdersByTable(orders: Order[], status: OrderStatus): TableBill[] {
  // Only merge orders by table for payment_pending; keep separate for pending/preparing
  if (status !== 'payment_pending') {
    return orders.map(o => makeBill([o], status));
  }
  const byTable = new Map<string, Order[]>();
  const takeaways: TableBill[] = [];
  for (const o of orders) {
    if (!o.tableId) {
      takeaways.push(makeBill([o], status));
    } else {
      if (!byTable.has(o.tableId)) byTable.set(o.tableId, []);
      byTable.get(o.tableId)!.push(o);
    }
  }
  const tableBills = Array.from(byTable.values()).map(grp => makeBill(grp, status));
  return [...tableBills, ...takeaways];
}

const BOARD_COL_META: { key: OrderStatus; label: string; dot: string; headerBg: string; headerText: string; emptyMsg: string }[] = [
  { key: 'pending',         label: 'Pending',         dot: 'bg-amber-500',   headerBg: 'bg-amber-50',   headerText: 'text-amber-700',   emptyMsg: 'No pending orders' },
  { key: 'preparing',       label: 'Preparing',       dot: 'bg-violet-500',  headerBg: 'bg-violet-50',  headerText: 'text-violet-700',  emptyMsg: 'No orders preparing' },
  { key: 'payment_pending', label: 'Payment Pending', dot: 'bg-primary', headerBg: 'bg-orange-50', headerText: 'text-primary', emptyMsg: 'No bills awaiting payment' },
];

/* ═══════════════════════════ Page ════════════════════════════ */

export default function OrdersPage() {
  const qc = useQueryClient();
  const formatCurrency = useCurrency();
  const { onNewOrder, onNewOrderFull, onOrderStatusUpdate, onKitchenReady, onItemKitchenReady, kdsCount } = useSocket();
  // 'board' shows the 3-column Kanban; 'completed'/'cancelled' show card grids
  const [view, setView] = useState<'board' | 'completed' | 'cancelled'>('board');
  const [settlementTableId, setSettlementTableId] = useState<string | null>(null);
  const [takeawaySettlementOrders, setTakeawaySettlementOrders] = useState<Order[] | null>(null);
  const [printSessionId, setPrintSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Order | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* ── Drag-and-drop state ── */
  const dragBillRef = useRef<TableBill | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  /* ── Query (fetch all, filter locally for accurate counts) ── */
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => orderService.getAll({ limit: 500 }),
    refetchInterval: 30_000,
    staleTime: 5_000, // Keep data fresh for 5s to avoid overwriting optimistic inserts
  });

  /* ── Restaurant settings (for auto-print config) ── */
  const { data: restaurant } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  /* ── Mutations ── */
  const advanceMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      orderService.updateStatus(id, status),
    onMutate: async ({ id, status }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ['orders'] });
      const prev = qc.getQueryData<{ data: Order[] }>(['orders']);
      // Optimistically move the order to the new status
      if (prev) {
        qc.setQueryData(['orders'], {
          ...prev,
          data: prev.data.map(o => o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o),
        });
      }
      return { prev };
    },
    onError: (err, vars, ctx) => {
      // Rollback on failure
      if (ctx?.prev) qc.setQueryData(['orders'], ctx.prev);
      console.error('[OrdersPage] Failed to update status', { orderId: vars.id, targetStatus: vars.status, error: err });
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    },
    onSuccess: (updatedOrder, vars) => {
      toast.success('Status updated');
      // Auto-print receipt via browser when order completes (browser printer type only)
      if (vars.status === 'completed') {
        const settings = (restaurant?.settings ?? {}) as Record<string, unknown>;
        const printerEnabled = (settings.printerEnabled as boolean) ?? false;
        const autoPrintOnComplete = (settings.autoPrintOnComplete as boolean) ?? true;
        const printerConnectionType = (settings.printerConnectionType as string) ?? 'network';

        if (printerEnabled && autoPrintOnComplete && printerConnectionType === 'browser') {
          const o = updatedOrder;
          const restaurantName = restaurant?.name || 'Restaurant';
          const pls = settings; // print layout settings
          const rawLogoUrl = (pls.qrLogoUrl || pls.printLogoUrl) as string | undefined;
          const logoUrl = (pls.printShowLogo !== false && rawLogoUrl) ? (rawLogoUrl.startsWith('/uploads') ? `${UPLOAD_BASE}${rawLogoUrl}` : rawLogoUrl) : '';
          const headerText = (pls.printShowAddress && pls.printHeaderText) ? pls.printHeaderText as string : '';
          const footerText = (pls.printFooterText as string) || '';
          const showCustomerInfo = (pls.printShowCustomerInfo as boolean) ?? true;
          const showModifiers = (pls.printShowItemModifiers as boolean) ?? true;
          const showInstructions = (pls.printShowSpecialInstructions as boolean) ?? true;
          const showSubtotal = (pls.printShowSubtotal as boolean) ?? true;
          const showTax = (pls.printShowTax as boolean) ?? true;
          const w = window.open('', '_blank', 'width=400,height=600');
          if (w) {
            w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
              body{font-family:monospace;max-width:350px;margin:0 auto;padding:20px;color:#111;font-size:13px}
              h2{text-align:center;margin:0 0 4px}
              .sub{text-align:center;color:#666;font-size:12px;margin-bottom:12px}
              .info{font-size:12px;color:#444;margin-bottom:4px}
              .item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
              .qty{font-weight:700;min-width:28px;height:28px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px}
              .item-detail{flex:1}
              .item-name{font-weight:700;font-size:14px}
              .mod{color:#888;font-size:11px;margin-top:2px}
              .note{color:#d97706;font-size:11px;margin-top:2px;font-weight:600}
              .order-note{background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin:6px 0;font-size:11px;font-weight:600;color:#92400e}
              .price{font-weight:700;white-space:nowrap}
              .row{display:flex;justify-content:space-between;padding:2px 0}
              .row.bold{font-weight:700;font-size:14px}
              hr{border:none;border-top:1px dashed #999;margin:8px 0}
              .center{text-align:center}
              .logo{text-align:center;margin-bottom:8px}
              .logo img{max-width:120px;max-height:60px}
              .header-text{text-align:center;color:#666;font-size:11px;white-space:pre-line;margin-bottom:8px}
              @page{size:80mm auto;margin:0}
              @media print{html,body{width:80mm;margin:0;padding:0;overflow:hidden}}
            </style></head><body>`);
            if (logoUrl) w.document.write(`<div class="logo"><img src="${logoUrl}" alt="logo"></div>`);
            w.document.write(`<h2>${restaurantName}</h2>`);
            if (headerText) w.document.write(`<div class="header-text">${headerText}</div>`);
            w.document.write(`<p class="sub">${o.tableName || 'Takeaway'}</p>`);
            w.document.write(`<p class="sub">Order: #${o.orderNumber}</p>`);
            w.document.write(`<p class="sub">${new Date(o.createdAt).toLocaleString()}</p>`);
            w.document.write(`<hr>`);
            if (showCustomerInfo) {
              if (o.customerName) w.document.write(`<p class="info">\u{1F464} ${o.customerName}${o.customerPhone ? ` \u00B7 ${o.customerPhone}` : ''}</p>`);
              else if (o.customerPhone) w.document.write(`<p class="info">\u{1F4F1} ${o.customerPhone}</p>`);
            }
            if (showInstructions && o.specialInstructions) w.document.write(`<div class="order-note">\u{1F4DD} ${o.specialInstructions}</div>`);
            o.items.forEach(item => {
              w.document.write(`<div class="item"><span class="qty">${item.quantity}</span><div class="item-detail"><div class="item-name">${item.menuItemName}</div>`);
              if (showModifiers && item.customizations && item.customizations.length > 0) {
                item.customizations.forEach(c => {
                  w.document.write(`<div class="mod">${c.groupName}: ${c.options.map(opt => opt.name).join(', ')}</div>`);
                });
              }
              if (showInstructions && item.specialInstructions) w.document.write(`<div class="note">\u26A0 ${item.specialInstructions}</div>`);
              w.document.write(`</div><span class="price">${formatCurrency(item.totalPrice)}</span></div>`);
            });
            w.document.write(`<hr>`);
            if (showSubtotal) w.document.write(`<div class="row"><span>Subtotal</span><span>${formatCurrency(o.subtotal)}</span></div>`);
            if (showTax && o.tax > 0) w.document.write(`<div class="row"><span>Tax</span><span>${formatCurrency(o.tax)}</span></div>`);
            w.document.write(`<div class="row bold"><span>TOTAL</span><span>${formatCurrency(o.total)}</span></div>`);
            if (footerText) w.document.write(`<hr><p class="center">${footerText}</p>`);
            w.document.write(`</body></html>`);
            w.document.close();
            setTimeout(() => { w.print(); w.onafterprint = () => w.close(); }, 300);
          }
        }
      }
    },
    onSettled: (_data, _err, vars) => {
      // Always refetch to sync with server
      qc.invalidateQueries({ queryKey: ['orders'] });
      // Only invalidate running tables for dine-in orders
      const order = all.find(o => o.id === vars.id);
      if (order?.tableId) {
        qc.invalidateQueries({ queryKey: ['runningTables'] });
      }
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => orderService.cancel(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      // Only invalidate running tables for dine-in orders
      const order = all.find(o => o.id === id);
      if (order?.tableId) {
        qc.invalidateQueries({ queryKey: ['runningTables'] });
      }
      setDetail(null);
      toast.success('Order cancelled');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to cancel order'),
  });



  /* ── Real-time ── */
  const recentFullOrderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Optimistically insert the full order into cache for instant display
    const u1 = onNewOrderFull((fullOrder: Order) => {
      // Track this order so onNewOrder doesn't trigger a redundant refetch
      recentFullOrderIds.current.add(fullOrder.id);
      setTimeout(() => recentFullOrderIds.current.delete(fullOrder.id), 5000);

      qc.setQueryData<{ data: Order[] }>(['orders'], (prev) => {
        if (!prev) return prev;
        // Avoid duplicates (in case refetch already picked it up)
        if (prev.data.some(o => o.id === fullOrder.id)) return prev;
        return { ...prev, data: [fullOrder, ...prev.data] };
      });
      // Delayed background refetch to sync (gives DB time to commit)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['orders'] });
      }, 3000);
      if (fullOrder?.tableId) {
        qc.invalidateQueries({ queryKey: ['runningTables'] });
      }
    });
    // Fallback: if onNewOrderFull doesn't fire, onNewOrder still refetches
    const u2 = onNewOrder((order) => {
      // Skip if already handled by onNewOrderFull
      if (order?.id && recentFullOrderIds.current.has(order.id)) return;
      qc.invalidateQueries({ queryKey: ['orders'] });
      if (order?.tableId) {
        qc.invalidateQueries({ queryKey: ['runningTables'] });
      }
    });
    const u3 = onOrderStatusUpdate(() => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['runningTables'] });
    });
    // Kitchen-ready: update preparedAt in cache + show toast
    const u4 = onKitchenReady((data) => {
      qc.setQueryData<{ data: Order[] }>(['orders'], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((o) =>
            o.id === data.orderId ? { ...o, preparedAt: data.preparedAt } : o
          ),
        };
      });
      toast.success(
        data.tableName && data.tableName !== 'Takeaway'
          ? `Order #${data.orderNumber} for ${data.tableName} is ready to serve!`
          : `Order #${data.orderNumber} is ready to serve!`,
        { duration: 3000, icon: '🍽️' }
      );
    });
    // Per-item kitchen-ready: update individual item's preparedAt in cache
    const u5 = onItemKitchenReady((data) => {
      qc.setQueryData<{ data: Order[] }>(['orders'], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((o) => {
            if (o.id !== data.orderId) return o;
            return {
              ...o,
              preparedAt: data.allItemsReady ? data.preparedAt : o.preparedAt,
              items: o.items.map((item) =>
                item.id === data.itemId ? { ...item, preparedAt: data.preparedAt } : item
              ),
            };
          }),
        };
      });
      toast.success(`${data.itemName} is ready!`, { duration: 2000, icon: '✅' });
    });
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [onNewOrder, onNewOrderFull, onOrderStatusUpdate, onKitchenReady, onItemKitchenReady, qc]);

  const all = (data?.data ?? []).filter(o => o.orderType !== 'QSR' && o.orderType !== 'QSR_TAKEAWAY' && o.orderType !== 'QSR_DELIVERY');

  /* Keep detail panel in sync after mutations — moved after paginated queries */

  /* ── Derived data ── */
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of all) m[o.status] = (m[o.status] || 0) + 1;
    return m;
  }, [all]);

  /* ── Search helper ── */
  const matchesSearch = useCallback((o: Order) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      o.tableName.toLowerCase().includes(q) ||
      o.items.some(i => i.menuItemName.toLowerCase().includes(q))
    );
  }, [search]);

  /* ── Board columns (pending / preparing / payment_pending) ── */
  const boardColumns = useMemo(() => {
    const BOARD_STATUSES: OrderStatus[] = ['pending', 'preparing', 'payment_pending'];
    const cols: Record<string, Order[]> = { pending: [], preparing: [], payment_pending: [] };
    for (const o of all) {
      if (BOARD_STATUSES.includes(o.status) && matchesSearch(o)) {
        cols[o.status]?.push(o);
      }
    }
    // Sort each column by createdAt desc
    for (const k of BOARD_STATUSES) {
      cols[k]?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return cols;
  }, [all, matchesSearch]);

  /* ── Group ALL board orders by table ── */
  const pendingBills = useMemo(
    () => groupOrdersByTable(boardColumns.pending || [], 'pending'),
    [boardColumns.pending],
  );
  const preparingBills = useMemo(
    () => groupOrdersByTable(boardColumns.preparing || [], 'preparing'),
    [boardColumns.preparing],
  );
  const ppTableBills = useMemo(
    () => groupOrdersByTable(boardColumns.payment_pending || [], 'payment_pending'),
    [boardColumns.payment_pending],
  );
  const boardBills = useMemo<Record<string, TableBill[]>>(() => ({
    pending: pendingBills,
    preparing: preparingBills,
    payment_pending: ppTableBills,
  }), [pendingBills, preparingBills, ppTableBills]);

  /* ── Completed / Cancelled — paginated queries (non-QSR only) ── */
  const GRID_PAGE_SIZE = 50;
  const NON_QSR_TYPES = ['DINE_IN', 'TAKEAWAY', 'PAN_CORNER'];

  const completedQuery = useInfiniteQuery({
    queryKey: ['orders', 'completed', 'non-qsr'],
    queryFn: ({ pageParam = 1 }) =>
      orderService.getAll({ status: 'COMPLETED' as unknown as OrderStatus, orderType: NON_QSR_TYPES, limit: GRID_PAGE_SIZE, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    enabled: view === 'completed',
    staleTime: 10_000,
  });

  const cancelledQuery = useInfiniteQuery({
    queryKey: ['orders', 'cancelled', 'non-qsr'],
    queryFn: ({ pageParam = 1 }) =>
      orderService.getAll({ status: 'CANCELLED' as unknown as OrderStatus, orderType: NON_QSR_TYPES, limit: GRID_PAGE_SIZE, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    enabled: view === 'cancelled',
    staleTime: 10_000,
  });

  const activeGridQuery = view === 'completed' ? completedQuery : cancelledQuery;

  const gridData = useMemo(() => {
    const pages = activeGridQuery.data?.pages ?? [];
    const list = pages.flatMap(p => p.data).filter(o => matchesSearch(o));
    type GridItem = { kind: 'order'; order: Order; ts: number };
    const items: GridItem[] = list.map(o => ({
      kind: 'order' as const,
      order: o,
      ts: new Date(o.updatedAt).getTime(),
    }));
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const getISTDay = (ts: number) => {
      const d = new Date(ts + IST_OFFSET_MS);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    };
    items.sort((a, b) => {
      const dayA = getISTDay(a.ts);
      const dayB = getISTDay(b.ts);
      if (dayB !== dayA) return dayB.localeCompare(dayA);
      const tokenA = a.order.tokenNumber ?? 0;
      const tokenB = b.order.tokenNumber ?? 0;
      if (tokenB !== tokenA) return tokenB - tokenA;
      return b.ts - a.ts;
    });
    return { items, total: pages[0]?.pagination.total ?? 0 };
  }, [activeGridQuery.data, matchesSearch]);

  /* Keep detail panel in sync after mutations */
  const allPaginatedOrders = useMemo(() => {
    const completed = completedQuery.data?.pages.flatMap(p => p.data) ?? [];
    const cancelled = cancelledQuery.data?.pages.flatMap(p => p.data) ?? [];
    return [...all, ...completed, ...cancelled];
  }, [all, completedQuery.data, cancelledQuery.data]);

  useEffect(() => {
    if (detail) {
      const fresh = allPaginatedOrders.find(o => o.id === detail.id);
      if (fresh && (fresh.updatedAt !== detail.updatedAt || fresh.preparedAt !== detail.preparedAt || JSON.stringify(fresh.items.map(i => i.preparedAt)) !== JSON.stringify(detail.items.map(i => i.preparedAt)))) setDetail(fresh);
    }
  }, [allPaginatedOrders, detail]);

  /* ── Download CSV ── */
  const handleDownloadCsv = useCallback(async (preset: string) => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const now = new Date();
      let dateFrom: string | undefined;
      let dateTo: string | undefined;

      if (preset === 'today') {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        dateTo = now.toISOString();
      } else if (preset === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFrom = weekAgo.toISOString();
        dateTo = now.toISOString();
      } else if (preset === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFrom = monthAgo.toISOString();
        dateTo = now.toISOString();
      }
      // 'all' → no date filters

      await orderService.downloadCsv(dateFrom, dateTo);
      toast.success('Report downloaded');
    } catch {
      toast.error('Failed to download report');
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div className="space-y-3 md:space-y-5">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <div className="flex items-center gap-3">
          {/* Download CSV dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="shrink-0 rounded-xl text-sm px-4 py-2 shadow-sm border border-gray-200 bg-white hover:bg-gray-50 text-text-secondary active:scale-[0.97] flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              {exporting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[160px]">
                  {[
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: 'This Week' },
                    { key: 'month', label: 'This Month' },
                    { key: 'all', label: 'All Time' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleDownloadCsv(opt.key)}
                      className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by ID, table, or item…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10 py-2.5 text-sm"
          />
        </div>
      </div>

      {/* ═══ Quick Stats ═══ */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending', value: String(counts['pending'] || 0), color: 'text-amber-600', iconBg: 'bg-amber-500', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', ring: (counts['pending'] || 0) > 0 ? 'ring-1 ring-amber-200' : '' },
          { label: 'Preparing', value: String(counts['preparing'] || 0), color: 'text-violet-600', iconBg: 'bg-violet-500', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', ring: (counts['preparing'] || 0) > 0 ? 'ring-1 ring-violet-200' : '' },
          { label: 'Payment Pending', value: String(counts['payment_pending'] || 0), color: 'text-primary', iconBg: 'bg-primary', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', ring: (counts['payment_pending'] || 0) > 0 ? 'ring-1 ring-orange-200' : '' },
        ].map(stat => (
          <div key={stat.label} className={`card p-4 transition-shadow ${stat.ring}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d={stat.icon} />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-text-muted font-medium uppercase tracking-wider leading-none">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color} mt-1 leading-none tabular-nums`}>{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ View Tabs ═══ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {([
          { key: 'board' as const, label: 'Order Board', dot: 'bg-violet-500', count: (counts['pending'] || 0) + (counts['preparing'] || 0) + (counts['payment_pending'] || 0) },
          { key: 'completed' as const, label: 'Completed', dot: 'bg-gray-400', count: completedQuery.data?.pages[0]?.pagination.total ?? counts['completed'] ?? 0 },
          { key: 'cancelled' as const, label: 'Cancelled', dot: 'bg-red-500', count: cancelledQuery.data?.pages[0]?.pagination.total ?? counts['cancelled'] ?? 0 },
        ]).map(tab => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setView(tab.key); if (tab.key === 'board') refetch(); }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface text-text-secondary hover:bg-surface-elevated'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-white/70' : tab.dot}`} />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[11px] tabular-nums min-w-[20px] h-5 inline-flex items-center justify-center px-1.5 rounded-full ${
                  active ? 'bg-white/20' : 'bg-surface-elevated text-text-muted'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ Board / Grid ═══ */}
      {isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 md:p-6 text-center">
          <p className="text-red-700 font-semibold">Failed to load orders</p>
          <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing.</p>
          <button onClick={() => refetch()} className="mt-3 px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors">Retry</button>
        </div>
      ) : isLoading ? (
        <OrderSkeleton />
      ) : view === 'board' ? (
        /* ── 3-column Kanban Board ── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
          {BOARD_COL_META.map(col => {
            const bills = boardBills[col.key] || [];
            return (
              <div key={col.key} className="flex flex-col min-h-[200px]">
                {/* Column Header */}
                <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-t-xl ${col.headerBg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <span className={`text-sm font-semibold ${col.headerText}`}>{col.label}</span>
                  </div>
                  <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${col.headerBg} ${col.headerText}`}>
                    {bills.length}
                  </span>
                </div>
                {/* Column Body — Drop zone */}
                <div
                  className={`flex-1 rounded-b-xl border border-t-0 p-2.5 space-y-2.5 overflow-y-auto lg:max-h-[calc(100vh-380px)] transition-all duration-150 ${
                    dragOverCol === col.key && dragBillRef.current && dragBillRef.current.status !== col.key
                    && (['pending', 'preparing', 'payment_pending'].indexOf(col.key) > ['pending', 'preparing', 'payment_pending'].indexOf(dragBillRef.current.status))
                      ? 'bg-primary/5 border-primary/30 ring-2 ring-primary/30'
                      : 'bg-surface/50 border-border/50'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const bill = dragBillRef.current;
                    const ORDER: OrderStatus[] = ['pending', 'preparing', 'payment_pending'];
                    const isForward = bill && ORDER.indexOf(col.key) > ORDER.indexOf(bill.status);
                    e.dataTransfer.dropEffect = isForward ? 'move' : 'none';
                    if (dragOverCol !== col.key) setDragOverCol(col.key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverCol(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCol(null);
                    const bill = dragBillRef.current;
                    if (bill && bill.status !== col.key) {
                      // Only allow forward movement: pending → preparing → payment_pending
                      const ORDER: OrderStatus[] = ['pending', 'preparing', 'payment_pending'];
                      const fromIdx = ORDER.indexOf(bill.status);
                      const toIdx = ORDER.indexOf(col.key);
                      if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
                        dragBillRef.current = null;
                        return;
                      }
                      // Block drag from preparing → payment_pending unless ALL items are kitchen-ready
                      if (bill.status === 'preparing' && col.key === 'payment_pending' && !bill.orders.every(o => o.items.every(i => i.preparedAt))) {
                        dragBillRef.current = null;
                        return;
                      }
                      for (const o of bill.orders) {
                        if (o.status === bill.status) {
                          advanceMut.mutate({ id: o.id, status: col.key as OrderStatus });
                        }
                      }
                    }
                    dragBillRef.current = null;
                  }}
                >
                  {bills.length === 0 ? (
                    <p className="text-center text-xs text-text-muted py-8">{col.emptyMsg}</p>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {bills.map(bill => (
                        <TableBillCard
                          key={`bill-${bill.tableId || bill.orders[0]?.id}-${bill.status}`}
                          bill={bill}
                          kdsCount={kdsCount}
                          onAdvanceAll={() => {
                            const ns = nextStatus(bill.status);
                            // Block advancing from preparing unless ALL items are kitchen-ready
                            if (bill.status === 'preparing' && !bill.orders.every(o => o.items.every(i => i.preparedAt))) return;
                            if (ns) {
                              for (const o of bill.orders) {
                                if (o.status === bill.status) {
                                  advanceMut.mutate({ id: o.id, status: ns });
                                }
                              }
                            }
                          }}
                          onServeNoKds={bill.status === 'preparing' && kdsCount === 0
                            ? async () => {
                              // Mark all items as kitchen-ready then advance
                              const itemPromises = bill.orders.flatMap(o =>
                                o.items.filter(i => !i.preparedAt).map(i =>
                                  orderService.markItemKitchenReady(o.id, i.id)
                                )
                              );
                              await Promise.all(itemPromises);
                              const ns = nextStatus(bill.status);
                              if (ns) {
                                for (const o of bill.orders) {
                                  if (o.status === bill.status) {
                                    advanceMut.mutate({ id: o.id, status: ns });
                                  }
                                }
                              }
                            }
                            : undefined}
                          onSendWaiter={undefined}
                          onSettleBill={bill.status === 'payment_pending'
                            ? bill.tableId
                              ? () => setSettlementTableId(bill.tableId)
                              : () => setTakeawaySettlementOrders(bill.orders)
                            : undefined}
                          onSelectOrder={o => setDetail(o)}
                          isAdvancing={advanceMut.isPending}
                          onDragStart={() => { dragBillRef.current = bill; }}
                          onDragEnd={() => { dragBillRef.current = null; setDragOverCol(null); }}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : activeGridQuery.isLoading ? (
        <OrderSkeleton />
      ) : (gridData.items.length === 0) ? (
        <EmptyState search={search} view={view as 'completed' | 'cancelled'} />
      ) : (
        /* ── Card grid for completed / cancelled ── */
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {gridData.items.map(item => (
                <OrderCard
                  key={item.order.id}
                  order={item.order}
                  onSelect={() => setDetail(item.order)}
                  onAdvance={() => {
                    const ns = nextStatus(item.order.status);
                    if (item.order.status === 'preparing' && !item.order.items.every(i => i.preparedAt)) return;
                    if (ns) advanceMut.mutate({ id: item.order.id, status: ns });
                  }}
                  isAdvancing={advanceMut.isPending}
                />
            ))}
          </AnimatePresence>
        </div>
        {activeGridQuery.hasNextPage && (
          <div className="flex justify-center pt-4">
            <button
              onClick={() => activeGridQuery.fetchNextPage()}
              disabled={activeGridQuery.isFetchingNextPage}
              className="px-6 py-2.5 text-sm font-medium rounded-xl bg-surface-elevated hover:bg-gray-100 text-text-secondary border border-border transition-colors"
            >
              {activeGridQuery.isFetchingNextPage ? 'Loading...' : `Load More (${gridData.items.length} of ${gridData.total})`}
            </button>
          </div>
        )}
        </>

      )}

      {/* ═══ Running Tables ═══ */}
      <RunningTablesSection />

      {/* ═══ Settlement Modal ═══ */}
      {settlementTableId && (
        <SettlementModal
          tableId={settlementTableId}
          formatCurrency={formatCurrency}
          onClose={() => {
            setSettlementTableId(null);
            qc.invalidateQueries({ queryKey: ['orders'] });
            qc.invalidateQueries({ queryKey: ['runningTables'] });
          }}
          onPrint={(sessionId) => {
            setPrintSessionId(sessionId);
          }}
        />
      )}

      {/* ═══ Takeaway Settlement Modal ═══ */}
      {takeawaySettlementOrders && (
        <TakeawaySettlementModal
          orders={takeawaySettlementOrders}
          formatCurrency={formatCurrency}
          onClose={() => {
            setTakeawaySettlementOrders(null);
            qc.invalidateQueries({ queryKey: ['orders'] });
          }}
        />
      )}

      {/* ═══ Print Invoice ═══ */}
      {printSessionId && (
        <PrintInvoice
          sessionId={printSessionId}
          formatCurrency={formatCurrency}
          onClose={() => setPrintSessionId(null)}
        />
      )}

      {/* ═══ Detail Slide-over ═══ */}
      <AnimatePresence>
        {detail && (
          <OrderDetail
            order={detail}
            onClose={() => setDetail(null)}
            onAdvance={s => {
              // Block advancing from preparing unless ALL items are kitchen-ready
              if (detail.status === 'preparing' && s === 'payment_pending' && !detail.items.every(i => i.preparedAt)) return;
              advanceMut.mutate({ id: detail.id, status: s });
            }}
            onCancel={() => cancelMut.mutate(detail.id)}
            isAdvancing={advanceMut.isPending}
            isCancelling={cancelMut.isPending}
          />
        )}
      </AnimatePresence>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

/* ─── Table Bill Card (grouped by table) ─────────────────── */

function TableBillCard({
  bill,
  kdsCount = 0,
  onAdvanceAll,
  onServeNoKds,
  onSendWaiter,
  onSettleBill,
  onSelectOrder,
  isAdvancing,
  onDragStart: handleDragStart,
  onDragEnd: handleDragEnd,
}: {
  bill: TableBill;
  kdsCount?: number;
  onAdvanceAll: () => void;
  onServeNoKds?: () => Promise<void>;
  onSendWaiter?: () => void;
  onSettleBill?: () => void;
  onSelectOrder: (order: Order) => void;
  isAdvancing: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const formatCurrency = useCurrency();
  const { data: restaurantSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });
  const isCompleted = bill.status === 'completed';
  const isPP = bill.status === 'payment_pending';
  const isTakeaway = !bill.tableId;
  const ns = nextStatus(bill.status);
  const meta = SM[bill.status];

  const [waiterState, setWaiterState] = useState<'idle' | 'sent' | 'ready'>('idle');

  const handleSendWaiter = useCallback(() => {
    setWaiterState('sent');
    if (onSendWaiter) onSendWaiter();
    setTimeout(() => setWaiterState('ready'), 1500);
  }, [onSendWaiter]);

  /* Native HTML5 drag-and-drop props */
  const dragProps: Record<string, unknown> = handleDragStart
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData('text/plain', '');
          e.dataTransfer.effectAllowed = 'move';
          handleDragStart();
        },
        onDragEnd: () => handleDragEnd?.(),
      }
    : {};

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      {...(dragProps as any)}
      className={`card border-l-[3px] ${meta.border} hover:shadow-elevated transition-all duration-200${handleDragStart ? ' cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Header: Table Name + Token + Status */}
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <p className="text-sm font-bold text-text-primary">{bill.tableName}</p>
              {(() => {
                const tokens = bill.orders
                  .map(o => o.tokenNumber)
                  .filter((t): t is number => t != null)
                  .sort((a, b) => a - b);
                const label = tokens.length > 0
                  ? (tokens.length === 1
                      ? `Token #${String(tokens[0]).padStart(3, '0')}`
                      : `Tokens ${tokens.map(t => `#${String(t).padStart(3, '0')}`).join(', ')}`)
                  : `#${bill.orders[0]?.orderNumber || bill.orders[0]?.id.slice(-6).toUpperCase()}`;
                return (
                  <span className="inline-flex items-center font-mono text-sm font-extrabold text-orange-700 bg-orange-50 border border-orange-100 rounded-md px-2 py-0.5 leading-none tracking-wide">
                    {label}
                  </span>
                );
              })()}
              {bill.orders.some(o => o.isPaid === false) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                  UNPAID
                </span>
              )}
              {bill.orders[0]?.sectionName && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-muted bg-gray-100 px-1.5 py-0.5 rounded ml-1">
                  <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {bill.orders[0].sectionName}
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-muted mt-1">
              {bill.orderCount} order{bill.orderCount > 1 ? 's' : ''} · {timeAgo(bill.latestCreatedAt)}
            </p>
            {bill.orders[0]?.customerName && (
              <div className="flex items-center gap-1.5 mt-1">
                <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-[11px] font-medium text-text-secondary leading-none">{bill.orders[0].customerName}</span>
                {bill.orders[0]?.customerPhone && (
                  <>
                    <span className="text-[11px] text-text-muted leading-none">·</span>
                    <span className="text-[11px] text-text-muted leading-none">{bill.orders[0].customerPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none shrink-0 ${meta.bg} ${meta.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>

        {/* Orders grouped */}
        <div className="space-y-2">
          {bill.orders.map(order => (
            <div
              key={order.id}
              onClick={() => onSelectOrder(order)}
              className="bg-surface-elevated/60 rounded-lg p-2.5 cursor-pointer hover:bg-surface-elevated transition-colors"
            >
              <div className="space-y-0.5">
                {order.items.map(item => (
                  <div key={item.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate text-text-secondary flex items-center gap-1">
                      {item.preparedAt && (
                        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <span className="text-text-primary font-medium tabular-nums">{item.quantity}×</span>
                      <span className="ml-1">{item.menuItemName}</span>
                    </span>
                    <span className="text-text-muted text-xs tabular-nums shrink-0">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-right mt-1 pt-1 border-t border-gray-100">
                <span className="text-xs font-semibold text-text-primary tabular-nums">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer: Combined total + action buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-surface-elevated/80 -mb-0.5">
          <div>
            <p className="text-[11px] text-text-muted leading-none">Total Bill</p>
            <span className="text-[17px] font-bold text-text-primary tabular-nums leading-tight">
              {formatCurrency(bill.total)}
            </span>
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {isCompleted ? (
              <span className="text-[13px] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 leading-none bg-orange-50 text-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Settled
              </span>
            ) : isPP ? (
              <>
                {isTakeaway && onSettleBill ? (
                  <button
                    onClick={onSettleBill}
                    className="text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 active:scale-95 inline-flex items-center gap-1.5 leading-none bg-primary hover:bg-primary-hover text-white shadow-orange-200/50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Settle Payment
                  </button>
                ) : (
                <>
                {waiterState === 'idle' && (
                  <button
                    onClick={handleSendWaiter}
                    className="text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 active:scale-95 inline-flex items-center gap-1.5 leading-none bg-blue-500 hover:bg-blue-600 text-white shadow-blue-200/50"
                  >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    Send Waiter
                  </button>
                )}
                {waiterState === 'sent' && (
                  <span className="text-[13px] font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 leading-none bg-blue-50 text-blue-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Waiter Sent
                  </span>
                )}
                {waiterState === 'ready' && onSettleBill && (
                      <button
                        onClick={onSettleBill}
                        className="text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 active:scale-95 inline-flex items-center gap-1.5 leading-none bg-primary hover:bg-primary-hover text-white shadow-orange-200/50"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Settle Payment
                      </button>
                )}
                </>
                )}
              </>
            ) : bill.status === 'preparing' && !bill.orders.every(o => o.items.every(i => i.preparedAt)) && kdsCount === 0 && onServeNoKds ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const pls = (restaurantSettings?.settings ?? {}) as Record<string, unknown>;
                    const rawLogoUrl2 = (pls.qrLogoUrl || pls.printLogoUrl) as string | undefined;
                    const logoUrl = (pls.printShowLogo !== false && rawLogoUrl2) ? (rawLogoUrl2.startsWith('/uploads') ? `${UPLOAD_BASE}${rawLogoUrl2}` : rawLogoUrl2) : '';
                    const headerText = (pls.printShowAddress !== false && pls.printHeaderText) ? pls.printHeaderText as string : '';
                    const footerText = (pls.printFooterText as string) || '';
                    const showCustomerInfo = (pls.printShowCustomerInfo as boolean) ?? true;
                    const showModifiers = (pls.printShowItemModifiers as boolean) ?? true;
                    const showInstructions = (pls.printShowSpecialInstructions as boolean) ?? true;
                    const showSubtotal = (pls.printShowSubtotal as boolean) ?? true;
                    const showTax = (pls.printShowTax as boolean) ?? true;
                    const w = window.open('', '_blank', 'width=400,height=600');
                    if (!w) return;
                    w.document.write(`<!DOCTYPE html><html><head><title>Kitchen Order</title><style>
                      body{font-family:monospace;max-width:350px;margin:0 auto;padding:20px;color:#111;font-size:13px}
                      h2{text-align:center;margin:0 0 4px}
                      .sub{text-align:center;color:#666;font-size:12px;margin-bottom:12px}
                      .info{font-size:12px;color:#444;margin-bottom:4px}
                      .item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
                      .qty{font-weight:700;min-width:28px;height:28px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px}
                      .item-detail{flex:1}
                      .item-name{font-weight:700;font-size:14px}
                      .mod{color:#888;font-size:11px;margin-top:2px}
                      .note{color:#d97706;font-size:11px;margin-top:2px;font-weight:600}
                      .order-note{background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin:6px 0;font-size:11px;font-weight:600;color:#92400e}
                      .customer{color:#888;font-size:11px;padding:4px 0;border-top:1px solid #eee;margin-top:4px}
                      .price{font-weight:700;white-space:nowrap}
                      hr{border:none;border-top:1px dashed #999;margin:8px 0}
                      .row{display:flex;justify-content:space-between;padding:2px 0}
                      .row.bold{font-weight:700;font-size:14px}
                      .center{text-align:center}
                      .logo{text-align:center;margin-bottom:8px}
                      .logo img{max-width:120px;max-height:60px}
                      .header-text{text-align:center;color:#666;font-size:11px;white-space:pre-line;margin-bottom:8px}
                      @page{size:80mm auto;margin:0}
                      @media print{html,body{width:80mm;margin:0;padding:0;overflow:hidden}}
                    </style></head><body>`);
                    if (logoUrl) w.document.write(`<div class="logo"><img src="${logoUrl}" alt="logo"></div>`);
                    w.document.write(`<h2>${bill.tableName || 'Takeaway'}</h2>`);
                    if (headerText) w.document.write(`<div class="header-text">${headerText}</div>`);
                    w.document.write(`<p class="sub">${bill.orders.map(o => `#${o.orderNumber || o.id.slice(-6).toUpperCase()}`).join(', ')}</p>`);
                    w.document.write(`<p class="sub">${new Date().toLocaleString()}</p>`);
                    bill.orders.forEach(order => {
                      if (showCustomerInfo) {
                        if (order.customerName) w.document.write(`<p class="info">👤 ${order.customerName}${order.customerPhone ? ` · ${order.customerPhone}` : ''}</p>`);
                        else if (order.customerPhone) w.document.write(`<p class="info">📱 ${order.customerPhone}</p>`);
                      }
                      if (showInstructions && order.specialInstructions) w.document.write(`<div class="order-note">📝 ${order.specialInstructions}</div>`);
                      order.items.forEach(item => {
                        w.document.write(`<div class="item"><span class="qty">${item.quantity}</span><div class="item-detail"><div class="item-name">${item.menuItemName}</div>`);
                        if (showModifiers && item.customizations && item.customizations.length > 0) {
                          item.customizations.forEach(c => {
                            w.document.write(`<div class="mod">${c.groupName}: ${c.options.map(o => o.name).join(', ')}</div>`);
                          });
                        }
                        if (showInstructions && item.specialInstructions) w.document.write(`<div class="note">⚠ ${item.specialInstructions}</div>`);
                        w.document.write(`</div><span class="price">${formatCurrency(item.totalPrice)}</span></div>`);
                      });
                    });
                    w.document.write(`<hr>`);
                    if (showSubtotal) w.document.write(`<div class="row"><span>Subtotal</span><span>${formatCurrency(bill.subtotal)}</span></div>`);
                    if (showTax && bill.tax > 0) w.document.write(`<div class="row"><span>Tax</span><span>${formatCurrency(bill.tax)}</span></div>`);
                    w.document.write(`<div class="row bold"><span>Total</span><span>${formatCurrency(bill.total)}</span></div>`);
                    if (footerText) w.document.write(`<hr><p class="center">${footerText}</p>`);
                    w.document.write(`</body></html>`);
                    w.document.close();
                    setTimeout(() => { w.print(); w.onafterprint = () => w.close(); }, 300);
                  }}
                  className="text-[13px] font-semibold px-3 py-2 rounded-lg shadow-sm transition-all duration-200 active:scale-95 inline-flex items-center gap-1.5 leading-none bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  onClick={onServeNoKds}
                  disabled={isAdvancing}
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 active:scale-95 inline-flex items-center gap-1.5 leading-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Served
                </button>
              </div>
            ) : bill.status === 'preparing' && !bill.orders.every(o => o.items.every(i => i.preparedAt)) ? (
              <span className="text-[13px] font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 leading-none bg-violet-50 text-violet-500 border border-violet-200">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Waiting for Kitchen
              </span>
            ) : bill.status === 'preparing' && bill.orders.every(o => o.items.every(i => i.preparedAt)) ? (
              <button
                onClick={onAdvanceAll}
                disabled={isAdvancing}
                className="text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 active:scale-95 inline-flex items-center gap-1.5 leading-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Served
              </button>
            ) : ns ? (
              <button
                onClick={onAdvanceAll}
                disabled={isAdvancing}
                className={`text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 active:scale-95 inline-flex items-center gap-1.5 leading-none ${SM[ns].btnStyle}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SM[ns].btnIcon} />
                </svg>
                {SM[ns].btnLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Order Card ──────────────────────────────────────────── */

function OrderCard({
  order,
  onSelect,
  onAdvance,
  isAdvancing,
}: {
  order: Order;
  onSelect: () => void;
  onAdvance: () => void;
  isAdvancing: boolean;
}) {
  const formatCurrency = useCurrency();
  const meta = SM[order.status];
  const ns = nextStatus(order.status);
  const isPending = order.status === 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      onClick={onSelect}
      className={`card cursor-pointer border-l-[3px] ${meta.border} hover:shadow-elevated transition-all duration-200
        ${isPending ? 'ring-1 ring-amber-200/70' : ''}`}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Row 1: Table/Order Type + Token + Status badge */}
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <p className="text-sm font-bold text-text-primary">{order.tableName}</p>
              <span className="inline-flex items-center font-mono text-sm font-extrabold text-orange-700 bg-orange-50 border border-orange-100 rounded-md px-2 py-0.5 leading-none tracking-wide">
                {order.tokenNumber != null
                  ? `Token #${String(order.tokenNumber).padStart(3, '0')}`
                  : `#${order.orderNumber || order.id.slice(-6).toUpperCase()}`}
              </span>
              {order.sectionName && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-muted bg-gray-100 px-1.5 py-0.5 rounded">
                  <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {order.sectionName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-text-muted leading-none">{timeAgo(order.createdAt)}</span>
            </div>
            {order.customerName && (
              <div className="flex items-center gap-1.5 mt-1">
                {order.customerName.startsWith('Group Order') ? (
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">GROUP</span>
                ) : (
                  <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                <span className="text-[11px] font-medium text-text-secondary leading-none">{order.customerName}</span>
                {order.customerPhone && (
                  <>
                    <span className="text-[11px] text-text-muted leading-none">·</span>
                    <span className="text-[11px] text-text-muted leading-none">{order.customerPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none shrink-0 ${meta.bg} ${meta.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${isPending ? 'animate-pulse' : ''}`} />
            {meta.label}
          </span>
        </div>

        {/* Items preview */}
        <div className="space-y-1.5">
          {order.items.slice(0, 3).map(item => (
            <div key={item.id} className="text-sm leading-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-text-secondary flex items-center gap-1">
                  {item.preparedAt && (
                    <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <span className="inline-block w-6 text-right text-text-primary font-medium tabular-nums">{item.quantity}×</span>
                  <span className="ml-1">{item.menuItemName}</span>
                </span>
                <span className="text-text-muted text-xs tabular-nums shrink-0">
                  {formatCurrency(item.totalPrice)}
                </span>
              </div>
              {item.customizations.length > 0 && (
                <p className="text-[11px] text-text-muted pl-7 leading-4 mt-0.5 truncate">
                  {item.customizations.map(c =>
                    `${c.groupName}: ${c.options.map(o => o.name).join(', ')}`
                  ).join(' · ')}
                </p>
              )}
            </div>
          ))}
          {order.items.length > 3 && (
            <p className="text-[11px] text-text-muted italic pl-7">
              +{order.items.length - 3} more item{order.items.length - 3 > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Special instructions indicator */}
        {(order.specialInstructions || order.items.some(i => i.specialInstructions)) && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 -mt-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Has special instructions</span>
          </div>
        )}

        {/* Footer: total + action */}
        <div className="flex items-center justify-between pt-3 border-t border-surface-elevated/80 -mb-0.5">
          <span className="text-[15px] font-bold text-text-primary tabular-nums leading-none">
            {formatCurrency(order.total)}
          </span>
          <div onClick={e => e.stopPropagation()}>
            {order.status === 'preparing' && !order.items.every(i => i.preparedAt) ? (
              <span className="text-[13px] font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 leading-none bg-violet-50 text-violet-500 border border-violet-200">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Waiting for Kitchen
              </span>
            ) : order.status === 'preparing' && order.items.every(i => i.preparedAt) ? (
              <button
                onClick={onAdvance}
                disabled={isAdvancing}
                className="text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 active:scale-95 inline-flex items-center gap-1.5 leading-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Served
              </button>
            ) : ns ? (
              <button
                onClick={onAdvance}
                disabled={isAdvancing}
                className={`text-[13px] font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50 active:scale-95 inline-flex items-center gap-1.5 leading-none ${SM[ns].btnStyle}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SM[ns].btnIcon} />
                </svg>
                {SM[ns].btnLabel}
              </button>
            ) : (
              <span className={`text-xs font-semibold leading-none ${meta.text}`}>{meta.label}</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Detail Slide-over ──────────────────────────────────── */

function OrderDetail({
  order,
  onClose,
  onAdvance,
  onCancel,
  isAdvancing,
  isCancelling,
}: {
  order: Order;
  onClose: () => void;
  onAdvance: (s: OrderStatus) => void;
  onCancel: () => void;
  isAdvancing: boolean;
  isCancelling: boolean;
}) {
  const formatCurrency = useCurrency();
  const meta = SM[order.status];
  const ns = nextStatus(order.status);
  const currentStep = STATUS_FLOW.indexOf(order.status);
  const isCancelled = order.status === 'cancelled';
  const isDone = order.status === 'completed' || isCancelled;

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
    enabled: order.status === 'completed',
  });

  const [manualPhone, setManualPhone] = useState('');
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  const whatsappMut = useMutation({
    mutationFn: (phone?: string) => orderService.sendWhatsAppBill([order.id], phone),
    onSuccess: (data) => {
      if (data.sent) { toast.success('Bill sent via WhatsApp'); setShowPhoneInput(false); setManualPhone(''); }
      else toast.error('Failed to send WhatsApp bill');
    },
    onError: () => toast.error('Failed to send WhatsApp bill'),
  });

  const handlePrint = useCallback(() => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const token = order.tokenNumber != null
      ? `Token #${String(order.tokenNumber).padStart(3, '0')}`
      : `#${order.orderNumber || order.id.slice(-6).toUpperCase()}`;

    const itemRows = order.items.map(item => `
      <tr>
        <td>${item.quantity}x ${esc(item.menuItemName)}${
          item.customizations.flatMap(g => g.options).map(o => `<br><small style="color:#666">+ ${esc(o.name)}</small>`).join('')
        }</td>
        <td style="text-align:right;white-space:nowrap">${formatCurrency(item.totalPrice)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><title>Bill</title><style>
      body{font-family:monospace;font-size:13px;width:300px;margin:0 auto;padding:16px}
      h2{text-align:center;font-size:15px;margin:0 0 4px}
      .sub{text-align:center;color:#666;font-size:11px;margin-bottom:4px}
      table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}
      .divider{border-top:1px dashed #000;margin:8px 0}
      .total td{font-weight:bold;font-size:14px}
      .footer{text-align:center;color:#666;font-size:11px;margin-top:12px}
    </style></head><body>
      <h2>${esc(settings?.name || 'Restaurant')}</h2>
      <div class="sub">${new Date(order.createdAt).toLocaleString()}</div>
      <div class="sub"><strong>${esc(token)}</strong>${order.customerName ? ` · ${esc(order.customerName)}` : ''}</div>
      <div class="divider"></div>
      <table>${itemRows}</table>
      <div class="divider"></div>
      <table>
        <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(order.subtotal)}</td></tr>
        <tr><td>Tax</td><td style="text-align:right">${formatCurrency(order.tax)}</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">${formatCurrency(order.total)}</td></tr>
      </table>
      <div class="footer">Thank you for visiting!</div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }, [order, settings, formatCurrency]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
      />

      {/* Panel */}
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* ── Header ── */}
        <div className="px-4 md:px-6 py-4 md:py-5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="inline-flex items-center font-mono text-2xl font-black text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1 leading-none tracking-wide">
                  {order.tokenNumber != null
                    ? `Token #${String(order.tokenNumber).padStart(3, '0')}`
                    : `#${order.orderNumber || order.id.slice(-6).toUpperCase()}`}
                </h2>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold leading-none ${meta.bg} ${meta.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                {order.isPaid === false && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                    UNPAID
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-text-secondary mt-1.5">
                <span>{order.tableName}</span>
                {order.sectionName && (
                  <>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-muted">{order.sectionName}</span>
                  </>
                )}
                <span className="text-text-muted">·</span>
                <span>{timeAgo(order.createdAt)}</span>
                <span className="text-text-muted">·</span>
                <span>{new Date(order.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              {order.customerName && (
                <div className="flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-sm font-medium text-text-secondary">{order.customerName}</span>
                  {order.customerPhone && (
                    <>
                      <span className="text-text-muted">·</span>
                      <span className="text-sm text-text-muted">{order.customerPhone}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          {!isCancelled && (
            <div className="mt-5">
              <div className="flex gap-1">
                {STATUS_FLOW.map((s, i) => (
                  <div
                    key={s}
                    className={`flex-1 h-1.5 rounded-full transition-colors ${
                      i <= currentStep ? 'bg-primary' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-text-muted leading-none">Placed</span>
                <span className="text-[10px] font-semibold text-primary leading-none">{meta.label}</span>
                <span className="text-[10px] text-text-muted leading-none">Done</span>
              </div>
            </div>
          )}

          {/* Cancelled banner */}
          {isCancelled && (
            <div className="mt-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700 font-medium">
              This order has been cancelled
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Items */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3 leading-none">
              Items ({order.items.length})
            </h3>
            <div className="space-y-2">
              {order.items.map(item => (
                <div key={item.id} className="p-3 rounded-xl bg-background border border-gray-100">
                  {/* ── Item header: qty + name + price ── */}
                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0 mt-px">
                      {item.quantity}×
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="font-medium text-text-primary text-sm leading-5 truncate">
                        {item.menuItemName}
                      </p>
                      {item.preparedAt && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Ready
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-text-primary tabular-nums shrink-0 leading-5">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>

                  {/* ── Customization groups (hierarchical) ── */}
                  {item.customizations.length > 0 && (
                    <div className="ml-10 mt-2 space-y-2">
                      {item.customizations.map(group => (
                        <div key={group.groupId}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted leading-none mb-1">
                            {group.groupName}
                          </p>
                          <div className="space-y-0.5">
                            {group.options.map(opt => (
                              <div key={opt.id} className="flex items-center justify-between text-xs leading-5">
                                <span className="text-text-secondary flex items-center gap-1.5">
                                  <span className="w-1 h-1 rounded-full bg-primary/40 shrink-0" />
                                  {opt.name}
                                </span>
                                {opt.priceModifier > 0 && (
                                  <span className="text-text-muted tabular-nums shrink-0">
                                    +{formatCurrency(opt.priceModifier)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Special instructions ── */}
                  {item.specialInstructions && (
                    <div className="ml-10 mt-2">
                      <p className="text-xs text-amber-600 italic leading-4 flex items-start gap-1.5">
                        <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {sanitize(item.specialInstructions)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Special Instructions */}
          {order.specialInstructions && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2 leading-none">
                Special Instructions
              </h3>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800 leading-5 flex items-start gap-2.5">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{sanitize(order.specialInstructions)}</span>
              </div>
            </section>
          )}

          {/* Payment Summary */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3 leading-none">
              Payment Summary
            </h3>
            <div className="rounded-xl bg-background border border-gray-100 p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <span className="text-text-primary tabular-nums">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Tax</span>
                <span className="text-text-primary tabular-nums">{formatCurrency(order.tax)}</span>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-primary">Total</span>
                <span className="font-bold text-primary text-lg tabular-nums leading-none">{formatCurrency(order.total)}</span>
              </div>
            </div>
          </section>

          {/* Order Meta */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3 leading-none">
              Order Details
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Created</span>
                <span className="text-text-secondary tabular-nums">{new Date(order.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Last updated</span>
                <span className="text-text-secondary tabular-nums">{new Date(order.updatedAt).toLocaleString()}</span>
              </div>
              {order.customerName && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Customer Name</span>
                  <span className="text-text-secondary font-medium">{order.customerName}</span>
                </div>
              )}
              {order.customerPhone && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Phone</span>
                  <a href={`tel:${order.customerPhone}`} className="text-primary font-medium hover:underline">{order.customerPhone}</a>
                </div>
              )}
              {order.estimatedReadyTime && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Est. ready</span>
                  <span className="text-text-secondary tabular-nums">{new Date(order.estimatedReadyTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              )}
              {order.preparedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Prepared at</span>
                  <span className="text-text-secondary tabular-nums">{new Date(order.preparedAt).toLocaleString()}</span>
                </div>
              )}
              {order.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Completed at</span>
                  <span className="text-text-secondary tabular-nums">{new Date(order.completedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Footer: completed actions ── */}
        {order.status === 'completed' && (
          <div className="border-t border-gray-100 bg-white">
            {/* Phone input (shown when no phone on order) */}
            {showPhoneInput && (
              <div className="px-6 pt-4 flex gap-2">
                <input
                  type="tel"
                  value={manualPhone}
                  onChange={e => setManualPhone(e.target.value)}
                  placeholder="Enter phone number"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  autoFocus
                />
                <button
                  onClick={() => whatsappMut.mutate(manualPhone || undefined)}
                  disabled={whatsappMut.isPending || !manualPhone.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-emerald-700"
                >
                  {whatsappMut.isPending ? '…' : 'Send'}
                </button>
              </div>
            )}
            <div className="px-6 py-4 flex gap-3">
              <button
                onClick={handlePrint}
                className="flex-1 py-3 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Bill
              </button>
              <button
                onClick={() => {
                  if (order.customerPhone) {
                    whatsappMut.mutate(undefined);
                  } else {
                    setShowPhoneInput(p => !p);
                  }
                }}
                disabled={whatsappMut.isPending}
                className="flex-1 py-3 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {whatsappMut.isPending ? 'Sending…' : 'WhatsApp'}
              </button>
            </div>
          </div>
        )}

        {/* ── Footer: active order actions ── */}
        {!isDone && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-white">
            <button
              onClick={onCancel}
              disabled={isCancelling}
              className="flex-1 py-3 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {isCancelling ? 'Cancelling…' : 'Cancel Order'}
            </button>
            {order.status === 'preparing' && !order.items.every(i => i.preparedAt) ? (
              <span className="flex-1 py-3 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 bg-violet-50 text-violet-500 border border-violet-200">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Waiting for Kitchen
              </span>
            ) : order.status === 'preparing' && order.items.every(i => i.preparedAt) ? (
              <button
                onClick={() => onAdvance(ns!)}
                disabled={isAdvancing}
                className="flex-1 py-3 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200/50"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {isAdvancing ? 'Updating…' : 'Mark Served'}
              </button>
            ) : ns ? (
              <button
                onClick={() => onAdvance(ns)}
                disabled={isAdvancing}
                className={`flex-1 py-3 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50 ${SM[ns].btnStyle}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SM[ns].btnIcon} />
                </svg>
                {isAdvancing ? 'Updating…' : `Mark ${SM[ns].btnLabel}`}
              </button>
            ) : null}
          </div>
        )}
      </motion.aside>
    </>
  );
}

/* ─── Empty State ────────────────────────────────────────── */

function EmptyState({ search, view }: { search: string; view: 'completed' | 'cancelled' }) {
  const label = view === 'completed' ? 'completed' : 'cancelled';
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <h3 className="font-semibold text-text-primary mb-1">No orders found</h3>
      <p className="text-sm text-text-muted max-w-xs">
        {search
          ? `No results for "${search}". Try a different search term.`
          : `No ${label} orders right now.`}
      </p>
    </div>
  );
}

/* ─── Loading Skeleton ───────────────────────────────────── */

function OrderSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-4 border-l-[3px] border-l-gray-200 animate-pulse flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="bg-surface-elevated h-4 w-20 rounded" />
              <div className="bg-surface-elevated h-3 w-28 rounded" />
            </div>
            <div className="bg-surface-elevated h-6 w-16 rounded-full" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="bg-surface-elevated h-3.5 w-6 rounded" />
              <div className="bg-surface-elevated h-3.5 flex-1 rounded" />
              <div className="bg-surface-elevated h-3 w-12 rounded" />
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-surface-elevated h-3.5 w-6 rounded" />
              <div className="bg-surface-elevated h-3.5 w-3/4 rounded" />
              <div className="bg-surface-elevated h-3 w-12 rounded" />
            </div>
          </div>
          <div className="border-t border-surface-elevated pt-3 flex items-center justify-between">
            <div className="bg-surface-elevated h-5 w-16 rounded" />
            <div className="bg-surface-elevated h-7 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
