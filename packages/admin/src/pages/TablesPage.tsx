import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { tableService, settingsService } from '../services';
import { useSocket } from '../context/SocketContext';
import { useCurrency } from '../hooks/useCurrency';
import Modal from '../components/Modal';
import QRCodeModal from '../components/QRCodeModal';
import TableForm, { type TableFormData } from '../components/TableForm';
import SettlementModal from '../components/SettlementModal';
import ViewOrderModal from '../components/ViewOrderModal';
import PrintInvoice from '../components/PrintInvoice';
import type { Table, TableStatus } from '../types';

const CUSTOMER_BASE_URL = import.meta.env.VITE_CUSTOMER_URL || 'http://localhost:5174';

/* ═══════════════════════════ Constants ════════════════════════ */

const SM: Record<TableStatus, {
  label: string;
  dot: string;
  bg: string;
  text: string;
  ring: string;
  icon: string;
  accent: string;
}> = {
  available: {
    label: 'Available',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    accent: 'bg-emerald-500',
  },
  occupied: {
    label: 'Occupied',
    dot: 'bg-red-500',
    bg: 'bg-red-50',
    text: 'text-red-700',
    ring: 'ring-red-200',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    accent: 'bg-red-500',
  },
  reserved: {
    label: 'Reserved',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    accent: 'bg-amber-500',
  },
  cleaning: {
    label: 'Cleaning',
    dot: 'bg-sky-500',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    ring: 'ring-sky-200',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    accent: 'bg-sky-500',
  },
};

const FILTER_ALL = 'all' as const;
type FilterKey = TableStatus | typeof FILTER_ALL;

/* ═══════════════════════════ Sub-components ══════════════════ */

/** Stat card */
function StatCard({
  icon,
  label,
  value,
  accent,
  delay = 0,
}: {
  icon: string;
  label: string;
  value: number;
  accent: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4"
    >
      <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center shrink-0 shadow-sm`}>
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-text-primary leading-none">{value}</p>
        <p className="text-xs text-text-muted mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}

/** Stats skeleton */
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 animate-pulse flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gray-200" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-10 bg-gray-200 rounded" />
            <div className="h-3 w-20 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grid skeleton */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gray-200" />
              <div className="h-7 w-20 bg-gray-100 rounded-full" />
            </div>
            <div className="h-5 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
            <div className="h-10 w-full bg-gray-100 rounded-xl" />
          </div>
          <div className="border-t border-gray-100 px-6 py-3 flex justify-between">
            <div className="h-8 w-24 bg-gray-100 rounded-lg" />
            <div className="h-8 w-8 bg-gray-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Empty state */
function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">
        {filtered ? 'No tables match this filter' : 'No tables yet'}
      </h3>
      <p className="text-sm text-text-muted mb-5 text-center max-w-xs">
        {filtered
          ? 'Try selecting a different status filter'
          : 'Add your first table to start managing your floor'}
      </p>
      {filtered && (
        <button onClick={onClear} className="btn-secondary text-sm px-5 py-2.5 rounded-xl">
          Clear filter
        </button>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════ Page ════════════════════════════ */

export default function TablesPage() {
  const queryClient = useQueryClient();
  const formatCurrency = useCurrency();
  const { onTableUpdated, onSessionUpdated } = useSocket();
  const [filter, setFilter] = useState<FilterKey>(FILTER_ALL);

  // ── Modal state ──
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [viewOrderTableId, setViewOrderTableId] = useState<string | null>(null);
  const [settlementTableId, setSettlementTableId] = useState<string | null>(null);
  const [printSessionId, setPrintSessionId] = useState<string | null>(null);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const openNewTable = useCallback(() => { setEditingTable(null); setTableModalOpen(true); }, []);
  const openEditTable = useCallback((table: Table) => { setEditingTable(table); setTableModalOpen(true); }, []);
  const closeTableModal = useCallback(() => { setTableModalOpen(false); setEditingTable(null); }, []);
  const openViewOrder = useCallback((tableId: string) => setViewOrderTableId(tableId), []);
  const closeViewOrder = useCallback(() => setViewOrderTableId(null), []);
  const openSettlement = useCallback((tableId: string) => setSettlementTableId(tableId), []);
  const closeSettlement = useCallback(() => setSettlementTableId(null), []);
  const openPrint = useCallback((sessionId: string) => setPrintSessionId(sessionId), []);
  const closePrint = useCallback(() => setPrintSessionId(null), []);

  // ── Queries ──
  const { data: tables = [], isLoading, isError } = useQuery({
    queryKey: ['tables'],
    queryFn: tableService.getAll,
  });

  // Fetch restaurant info for slug (used in QR URL)
  const { data: restaurant } = useQuery({
    queryKey: ['restaurant'],
    queryFn: settingsService.get,
  });

  // Fetch running tables with live billing
  const { data: runningTables = [] } = useQuery({
    queryKey: ['runningTables'],
    queryFn: tableService.getRunningTables,
    refetchInterval: false, // Socket-driven updates only
  });

  // Subscribe to socket updates
  useEffect(() => {
    const unsubscribe = onTableUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['runningTables'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    });
    return unsubscribe;
  }, [onTableUpdated, queryClient]);

  useEffect(() => {
    const unsubscribe = onSessionUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['runningTables'] });
    });
    return unsubscribe;
  }, [onSessionUpdated, queryClient]);

  // ── Mutations ──
  const createTableMutation = useMutation({
    mutationFn: (data: TableFormData) => tableService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Table created');
      closeTableModal();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create table'),
  });

  const updateTableMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TableFormData }) =>
      tableService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Table updated');
      closeTableModal();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update table'),
  });

  const handleTableSubmit = useCallback((data: TableFormData) => {
    if (editingTable) {
      updateTableMutation.mutate({ id: editingTable.id, data });
    } else {
      createTableMutation.mutate(data);
    }
  }, [editingTable, updateTableMutation, createTableMutation]);

  const isTableMutating = createTableMutation.isPending || updateTableMutation.isPending;

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TableStatus }) =>
      tableService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Table status updated');
    },
    onError: () => toast.error('Failed to update table status'),
  });

  const openQR = useCallback((table: Table) => {
    if (!restaurant?.slug) {
      toast.error('Restaurant info not loaded yet');
      return;
    }
    setQrTable(table);
  }, [restaurant]);

  const deleteMutation = useMutation({
    mutationFn: tableService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Table deleted');
    },
    onError: () => toast.error('Failed to delete table'),
  });

  // ── Derived ──
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tables.length, available: 0, occupied: 0, reserved: 0, cleaning: 0 };
    tables.forEach((t) => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }, [tables]);

  const filtered = useMemo(() => {
    if (filter === FILTER_ALL) return tables;
    return tables.filter((t) => t.status === filter);
  }, [tables, filter]);

  const totalCapacity = useMemo(() => tables.reduce((s, t) => s + t.capacity, 0), [tables]);
  const activeOrders = useMemo(() => tables.reduce((s, t) => s + t.activeOrders, 0), [tables]);

  // Create a map of tableId -> running bill amount for quick lookup
  const runningBillMap = useMemo(() => {
    const map = new Map<string, number>();
    runningTables.forEach((rt) => {
      map.set(rt.tableId, rt.totalAmount);
    });
    return map;
  }, [runningTables]);

  /* ═════════════════════════ RENDER ═════════════════════════ */

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Table Management</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Monitor and manage your floor layout
          </p>
        </div>
        <button onClick={openNewTable} className="btn-primary rounded-xl text-sm px-5 py-2.5 shadow-sm active:scale-[0.97]">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Table
        </button>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────── */}
      {isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700 font-semibold">Failed to load tables</p>
          <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing.</p>
        </div>
      ) : isLoading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" label="Total Tables" value={tables.length} accent="bg-violet-500" delay={0} />
          <StatCard icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" label="Available" value={counts.available ?? 0} accent="bg-emerald-500" delay={0.05} />
          <StatCard icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" label="Total Capacity" value={totalCapacity} accent="bg-sky-500" delay={0.10} />
          <StatCard icon="M13 2L3 14h9l-1 8 10-12h-9l1-8z" label="Active Orders" value={activeOrders} accent="bg-amber-500" delay={0.15} />
        </div>
      )}

      {/* ── Filter Tabs ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {([FILTER_ALL, 'available', 'occupied', 'reserved', 'cleaning'] as FilterKey[]).map((key) => {
            const isAll = key === FILTER_ALL;
            const active = filter === key;
            const s = isAll ? null : SM[key as TableStatus];
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  active
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-50 text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                }`}
              >
                {!isAll && s && (
                  <span className={`w-2 h-2 rounded-full ${active ? 'bg-white/80' : s.dot}`} />
                )}
                {isAll ? 'All Tables' : s?.label}
                <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-gray-200 text-text-secondary'}`}>
                  {counts[key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Floor Grid ──────────────────────────────────────── */}
      {isLoading ? (
        <GridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState filtered={filter !== FILTER_ALL} onClear={() => setFilter(FILTER_ALL)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          <AnimatePresence mode="popLayout">
            {filtered.map((table, idx) => (
              <TableCard
                key={table.id}
                table={table}
                index={idx}
                currentBillAmount={runningBillMap.get(table.id)}
                formatCurrency={formatCurrency}
                onStatusChange={(status) => updateStatusMutation.mutate({ id: table.id, status })}
                onGenerateQR={() => openQR(table)}
                onViewOrder={() => openViewOrder(table.id)}
                onEdit={() => openEditTable(table)}
                onDelete={() => {
                  setDeleteTarget({ id: table.id, name: table.name });
                }}
                isUpdating={updateStatusMutation.isPending}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Table Modal ─────────────────────────────────────── */}
      <Modal open={tableModalOpen} title={editingTable ? 'Edit Table' : 'New Table'} onClose={closeTableModal}>
        <TableForm initial={editingTable} isLoading={isTableMutating} onSubmit={handleTableSubmit} onCancel={closeTableModal} />
      </Modal>

      {/* ── View Order Modal ────────────────────────────────── */}
      {viewOrderTableId && (
        <ViewOrderModal
          tableId={viewOrderTableId}
          onClose={closeViewOrder}
          onSettleBill={() => {
            closeViewOrder();
            openSettlement(viewOrderTableId);
          }}
        />
      )}

      {/* ── Settlement Modal ────────────────────────────────── */}
      {settlementTableId && (
        <SettlementModal
          tableId={settlementTableId}
          formatCurrency={formatCurrency}
          onClose={closeSettlement}
          onPrint={(sessionId) => {
            openPrint(sessionId);
            closeSettlement();
          }}
        />
      )}

      {/* ── Print Invoice ───────────────────────────────────── */}
      {printSessionId && (
        <PrintInvoice
          sessionId={printSessionId}
          formatCurrency={formatCurrency}
          onClose={closePrint}
        />
      )}

      {/* ── QR Code Modal ───────────────────────────────────── */}
      {qrTable && restaurant?.slug && (
        <QRCodeModal
          open={!!qrTable}
          tableName={qrTable.name}
          tableNumber={qrTable.number}
          url={`${CUSTOMER_BASE_URL}/r/${restaurant.slug}/t/${qrTable.id}`}
          onClose={() => setQrTable(null)}
        />
      )}

      {/* ── Delete Confirmation Modal ───────────────────── */}
      <Modal open={!!deleteTarget} title="Confirm Delete" onClose={() => setDeleteTarget(null)}>
        <p className="text-sm text-text-secondary mb-6">
          Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════ Table Card ══════════════════════ */

interface TableCardProps {
  table: Table;
  index: number;
  currentBillAmount?: number;
  formatCurrency: (amount: number) => string;
  onStatusChange: (status: TableStatus) => void;
  onGenerateQR: () => void;
  onViewOrder: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isUpdating: boolean;
}

function TableCard({
  table,
  index,
  currentBillAmount,
  formatCurrency,
  onStatusChange,
  onGenerateQR,
  onViewOrder,
  onEdit,
  onDelete,
  isUpdating,
}: TableCardProps) {
  const s = SM[table.status] || SM[table.status.toLowerCase() as TableStatus] || SM.available;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0, transition: { delay: index * 0.04 } }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-200 transition-all duration-300`}
    >
      {/* ── Main body ── */}
      <div className="p-6">
        {/* Top row: number badge + status chip */}
        <div className="flex items-center justify-between mb-5">
          <div className={`min-w-14 h-14 px-3 rounded-2xl ${s.bg} ring-2 ${s.ring} flex items-center justify-center`}>
            <span className={`text-sm font-bold ${s.text} text-center leading-tight break-words line-clamp-2`}>{table.name || table.number}</span>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        </div>

        {/* Table info */}
        <h3 className="text-[15px] font-semibold text-text-primary mb-1">{table.number}</h3>
        <div className="flex items-center gap-3 text-xs text-text-muted mb-4">
          <span className="inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {table.capacity} seats
          </span>
          {table.activeOrders > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {table.activeOrders} active order{table.activeOrders !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Current Bill Amount - Show only for occupied tables with active orders */}
        {table.status === 'occupied' && table.activeOrders > 0 && (
          <>
            <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-[10px] text-emerald-700 font-medium mb-0.5 uppercase tracking-wide">Current Bill</div>
              <div className="text-lg font-bold text-emerald-700">
                {currentBillAmount !== undefined && currentBillAmount > 0 
                  ? formatCurrency(currentBillAmount) 
                  : formatCurrency(0)}
              </div>
            </div>
            <button
              onClick={onViewOrder}
              className="w-full mb-4 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium text-sm transition-colors shadow-sm active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View Order
            </button>
          </>
        )}

        {/* Status selector */}
        <div className="relative">
          <select
            value={table.status}
            onChange={(e) => onStatusChange(e.target.value as TableStatus)}
            disabled={isUpdating}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-10 text-sm font-medium text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:border-gray-300"
          >
            {(Object.keys(SM) as TableStatus[]).map((status) => (
              <option key={status} value={status}>
                {SM[status].label}
              </option>
            ))}
          </select>
          {/* Status icon inside select */}
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <svg className={`w-4 h-4 ${s.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
            </svg>
          </div>
          {/* Chevron */}
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between">
        <button
          onClick={onGenerateQR}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary bg-gray-50 hover:bg-gray-100 hover:text-text-primary transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          QR Code
        </button>

        {/* Actions menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {/* Dropdown */}
          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 bottom-full mb-1 w-36 bg-white rounded-xl border border-gray-200 shadow-lg z-30 py-1 overflow-hidden"
                >
                  <button
                    onClick={() => { onEdit(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit Table
                  </button>
                  <button
                    onClick={() => { onGenerateQR(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download QR
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => { onDelete(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
