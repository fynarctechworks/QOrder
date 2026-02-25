import { memo, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { tableService, type RunningTable } from '../services/tableService';
import { useSocket } from '../context/SocketContext';
import { useCurrency } from '../hooks/useCurrency';

/* ═══════════════════════ Running Table Card ══════════════════ */

interface RunningTableCardProps {
  table: RunningTable;
}

const RunningTableCard = memo(({ table }: RunningTableCardProps) => {
  const formatCurrency = useCurrency();
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Each card manages its own 1-second timer so parent doesn't re-render all cards
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate duration from sessionStart
  const durationSeconds = Math.floor(
    (currentTime - new Date(table.sessionStart).getTime()) / 1000
  );
  
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  const durationFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Determine duration color based on time
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationColor = 
    durationMinutes < 60 ? 'text-emerald-600 bg-emerald-50' : 
    durationMinutes < 120 ? 'text-amber-600 bg-amber-50' : 
    'text-red-600 bg-red-50';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.2 }}
      className="group relative bg-gradient-to-br from-white to-gray-50/50 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-emerald-300/50 transition-all duration-300 overflow-hidden"
    >
      {/* Accent Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
      
      {/* Content */}
      <div className="p-5">
        {/* Header: Table Number & Invoice */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Table</span>
              <span className="text-3xl font-black text-gray-900 group-hover:text-emerald-600 transition-colors">
                {table.tableNumber}
              </span>
            </div>
            {table.tableName && (
              <div className="text-sm text-gray-600 mt-0.5 font-medium">
                {table.tableName}
              </div>
            )}
          </div>
          {table.invoiceId && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100/80 text-xs font-semibold text-gray-600">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              #{table.invoiceId}
            </div>
          )}
        </div>

        {/* Total Amount - Primary Focus */}
        <div className="mb-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-3 border border-emerald-200/50">
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Total Bill</div>
          <div className="text-3xl font-black text-emerald-700 tracking-tight">
            {formatCurrency(table.totalAmount)}
          </div>
        </div>

        {/* Duration & Orders - Secondary Info */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className={`rounded-lg px-3 py-2 ${durationColor} transition-colors`}>
            <div className="flex items-center gap-1.5 mb-1">
              <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Time</div>
            </div>
            <div className="text-lg font-bold leading-none">{durationFormatted}</div>
          </div>
          <div className="rounded-lg px-3 py-2 bg-blue-50 text-blue-700">
            <div className="flex items-center gap-1.5 mb-1">
              <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Orders</div>
            </div>
            <div className="text-lg font-bold leading-none">{table.orderCount}</div>
          </div>
        </div>

        {/* Staff Name - Footer */}
        {table.staffName && (
          <div className="pt-3 border-t border-gray-200/60 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs text-gray-600 font-medium">{table.staffName}</span>
          </div>
        )}
      </div>

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/5 to-teal-500/5" />
      </div>
    </motion.div>
  );
});

RunningTableCard.displayName = 'RunningTableCard';

/* ═══════════════════════ Running Tables Section ══════════════ */

export default function RunningTablesSection() {
  const queryClient = useQueryClient();
  const { onTableUpdated } = useSocket();

  // Fetch running tables
  const { data: runningTables = [], isLoading } = useQuery({
    queryKey: ['runningTables'],
    queryFn: tableService.getRunningTables,
    refetchInterval: false, // No polling - use socket updates only
  });

  // Subscribe to table:updated socket event
  useEffect(() => {
    const unsubscribe = onTableUpdated(() => {
      // Invalidate and refetch running tables
      queryClient.invalidateQueries({ queryKey: ['runningTables'] });
    });

    return unsubscribe;
  }, [onTableUpdated, queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-200 animate-pulse w-9 h-9" />
            <div>
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-1" />
              <div className="h-3 w-40 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 p-5 animate-pulse"
            >
              <div className="h-1 w-full bg-gray-300 rounded mb-4" />
              <div className="flex justify-between mb-4">
                <div className="h-8 w-20 bg-gray-200 rounded" />
                <div className="h-6 w-12 bg-gray-200 rounded" />
              </div>
              <div className="h-16 bg-gray-200 rounded-lg mb-3" />
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="h-14 bg-gray-200 rounded-lg" />
                <div className="h-14 bg-gray-200 rounded-lg" />
              </div>
              <div className="h-8 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (runningTables.length === 0) {
    return null; // Don't show section if no running tables
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Running Tables
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Active dining sessions</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {runningTables.map((table) => (
          <RunningTableCard
            key={table.tableId}
            table={table}
          />
        ))}
      </div>
    </div>
  );
}
