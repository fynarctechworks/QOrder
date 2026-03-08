import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { orderService, analyticsService } from '../services';
import { useSocket } from '../context/SocketContext';
import { useCurrency } from '../hooks/useCurrency';
import { timeAgo } from '../utils/timeAgo';

import type { Order, OrderStatus, AnalyticsSummary } from '../types';
import toast from 'react-hot-toast';

/* ═══════════════════════════ Constants ════════════════════════ */

const SM: Record<OrderStatus, {
  label: string; dot: string; bg: string; text: string;
}> = {
  pending:         { label: 'Pending',         dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700' },
  preparing:       { label: 'Preparing',       dot: 'bg-violet-500',  bg: 'bg-violet-50',  text: 'text-violet-700' },
  payment_pending: { label: 'Payment Pending', dot: 'bg-primary',     bg: 'bg-primary/10', text: 'text-primary' },
  completed:       { label: 'Completed',       dot: 'bg-gray-400',    bg: 'bg-gray-100',   text: 'text-gray-600' },
  cancelled:       { label: 'Cancelled',       dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700' },
};

const DONUT_COLORS = ['#FF660E', '#E55A0B', '#FF8040', '#6B7280', '#D1D5DB'];

const CHART_GRADIENT_ID = 'dashRevenueGradient';

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #E5E7EB',
  borderRadius: '12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  color: '#1F2937',
  fontSize: '13px',
  padding: '10px 14px',
};

/* ═══════════════════════════ Helpers ═════════════════════════ */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

/* ═══════════════════════════ Page ════════════════════════════ */

export default function DashboardPage() {
  const qc = useQueryClient();
  const formatCurrency = useCurrency();
  const { onNewOrder, onOrderStatusUpdate } = useSocket();

  /* ── Queries ── */
  const { data: activeOrders = [], isLoading: ordersLoading, isError: ordersError } = useQuery({
    queryKey: ['orders', 'active'],
    queryFn: orderService.getActive,
    staleTime: 0,
  });

  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => analyticsService.getSummary({ period: 'day' }),
    staleTime: 0,
  });

  /* ── Real-time ── */
  useEffect(() => {
    const u1 = onNewOrder((order) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      if (order?.tableId) {
        qc.invalidateQueries({ queryKey: ['runningTables'] });
      }
      toast('New order received!', { icon: '🔔', duration: 3000 });
    });
    const u2 = onOrderStatusUpdate(() => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      qc.invalidateQueries({ queryKey: ['runningTables'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    });
    return () => { u1(); u2(); };
  }, [onNewOrder, onOrderStatusUpdate, qc]);

  /* ── Derived ── */
  const pendingOrders = useMemo(
    () => activeOrders.filter(o => o.status === 'pending'),
    [activeOrders],
  );
  const preparingOrders = useMemo(
    () => activeOrders.filter(o => o.status === 'preparing'),
    [activeOrders],
  );

  const revenueTrend = useMemo(() => {
    if (!analytics?.dailyRevenue || analytics.dailyRevenue.length < 2) return null;
    const rev = analytics.dailyRevenue;
    const currEntry = rev[rev.length - 1];
    const prevEntry = rev[rev.length - 2];
    if (!currEntry || !prevEntry) return null;
    const curr = currEntry.revenue;
    const prev = prevEntry.revenue;
    if (prev === 0) return curr > 0 ? { pct: 100, up: true, diff: curr } : null;
    const pct = ((curr - prev) / prev) * 100;
    return { pct: Math.abs(pct), up: pct >= 0, diff: Math.abs(curr - prev) };
  }, [analytics]);

  const ordersTrend = useMemo(() => {
    if (!analytics?.dailyRevenue || analytics.dailyRevenue.length < 2) return null;
    const rev = analytics.dailyRevenue;
    const currEntry = rev[rev.length - 1];
    const prevEntry = rev[rev.length - 2];
    if (!currEntry || !prevEntry) return null;
    const curr = currEntry.orders;
    const prev = prevEntry.orders;
    if (prev === 0) return curr > 0 ? { pct: 100, up: true, diff: curr } : null;
    const pct = ((curr - prev) / prev) * 100;
    return { pct: Math.abs(pct), up: pct >= 0, diff: Math.abs(curr - prev) };
  }, [analytics]);

  const topItemsDonut = useMemo(() => {
    if (!analytics?.topItems?.length) return [];
    const top5 = analytics.topItems.slice(0, 5);
    const totalRev = top5.reduce((s, i) => s + i.revenue, 0);
    return top5.map((item, idx) => ({
      name: item.itemName,
      value: item.revenue,
      pct: totalRev > 0 ? Math.round((item.revenue / totalRev) * 100) : 0,
      color: DONUT_COLORS[idx % DONUT_COLORS.length] ?? '#6B7280',
    }));
  }, [analytics]);

  const peakHour = useMemo(() => {
    if (!analytics?.hourlyData?.length) return null;
    const peak = analytics.hourlyData.reduce((a, b) => (b.orders > a.orders ? b : a));
    return peak.orders > 0 ? peak : null;
  }, [analytics]);

  const recentOrders = useMemo(() => {
    return [...activeOrders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [activeOrders]);



  const isLoading = ordersLoading || analyticsLoading;
  const isError = ordersError || analyticsError;

  return (
    <div className="space-y-6">

      {/* ═══════════════════ Header ═══════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {greeting()} — {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingOrders.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {pendingOrders.length} pending
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            Live
          </span>
        </div>
      </div>

      {/* ═══════════════════ Stat Cards ═══════════════════ */}
      {isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700 font-semibold">Failed to load dashboard data</p>
          <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing.</p>
        </div>
      ) : isLoading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            }
            label="Revenue"
            value={formatCurrency(analytics?.totalRevenue ?? 0)}
            trend={revenueTrend ? { pct: revenueTrend.pct, up: revenueTrend.up } : undefined}
            sub={revenueTrend ? `${revenueTrend.up ? '+' : '-'}${formatCurrency(revenueTrend.diff)} than yesterday` : `${analytics?.totalOrders ?? 0} orders`}
            iconBg="bg-primary"
            iconColor="text-white"
            delay={0}
          />
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4H18a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" />
                <path d="M9 12h6M9 16h4" />
              </svg>
            }
            label="Orders"
            value={String(analytics?.totalOrders ?? 0)}
            trend={ordersTrend ? { pct: ordersTrend.pct, up: ordersTrend.up } : undefined}
            sub={ordersTrend ? `${ordersTrend.up ? '+' : '-'}${ordersTrend.diff} than yesterday` : `avg ${formatCurrency(analytics?.averageOrderValue ?? 0)}`}
            iconBg="bg-sky-500"
            iconColor="text-white"
            delay={0.05}
          />
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M7 16l4-4 4 4 5-6" />
              </svg>
            }
            label="Avg Order"
            value={formatCurrency(analytics?.averageOrderValue ?? 0)}
            sub={peakHour ? `Peak at ${fmtHour(peakHour.hour)}` : 'No peak data'}
            iconBg="bg-violet-500"
            iconColor="text-white"
            delay={0.1}
          />
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            }
            label="Active Now"
            value={String(activeOrders.length)}
            sub={preparingOrders.length > 0 ? `${preparingOrders.length} in progress` : 'All clear'}
            iconBg="bg-amber-500"
            iconColor="text-white"
            delay={0.15}
            highlight={pendingOrders.length > 0}
          />
        </div>
      )}

      {/* ═══════════════════ Charts + Performance ═══════════════════ */}
      {!isLoading && analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Revenue Area Chart */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-6 pt-5 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-text-primary">Revenue</h3>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-text-primary tabular-nums">
                      {formatCurrency(analytics.totalRevenue)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-primary/80" /> Revenue
                  </span>
                </div>
              </div>
            </div>
            <div className="px-4 pb-4">
              <RevenueAreaChart data={analytics.dailyRevenue} formatCurrency={formatCurrency} />
            </div>
          </motion.div>

          {/* Revenue Donut */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-6 pt-5 pb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text-primary">Top Items Breakdown</h3>
              <span className="text-[11px] text-text-muted">Today</span>
            </div>
            <div className="px-6 pb-5">
              <RevenueDonut data={topItemsDonut} formatCurrency={formatCurrency} />
            </div>
          </motion.div>

          {/* Order Status Overview */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-3 flex flex-col gap-4"
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-semibold text-text-primary">Order Status</h3>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Pending', count: pendingOrders.length, color: '#F59E0B', bg: 'bg-amber-50' },
                  { label: 'Preparing', count: preparingOrders.length, color: '#8B5CF6', bg: 'bg-violet-50' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                      <span className="text-sm font-bold" style={{ color: s.color }}>{s.count}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary">{s.label}</p>
                      <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${activeOrders.length > 0 ? (s.count / activeOrders.length) * 100 : 0}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] text-text-muted tabular-nums shrink-0">
                      {activeOrders.length > 0 ? Math.round((s.count / activeOrders.length) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Total Active</span>
                  <span className="text-sm font-bold text-text-primary tabular-nums">{activeOrders.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-[15px] font-semibold text-text-primary mb-3">Order Pace</h3>
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
                  <span className="text-xs text-text-muted">Orders / Hour</span>
                  <span className="text-sm font-bold text-text-primary tabular-nums">
                    {(() => {
                      const activeHrs = analytics.hourlyData.filter(h => h.orders > 0).length;
                      return activeHrs > 0 ? (analytics.totalOrders / activeHrs).toFixed(1) : '0';
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
                  <span className="text-xs text-text-muted">Items / Order</span>
                  <span className="text-sm font-bold text-text-primary tabular-nums">
                    {analytics.totalOrders > 0
                      ? (analytics.topItems.reduce((s, i) => s + i.quantity, 0) / analytics.totalOrders).toFixed(1)
                      : '0'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-text-muted">Active Hours</span>
                  <span className="text-sm font-bold text-text-primary tabular-nums">
                    {analytics.hourlyData.filter(h => h.orders > 0).length}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ═══════════════════ Bottom Grid ═══════════════════ */}
      {!isLoading && analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Recent Orders */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text-primary">Recent Orders</h3>
              <span className="text-[11px] text-text-muted">Today</span>
            </div>
            <RecentOrdersTable orders={recentOrders} formatCurrency={formatCurrency} />
          </motion.div>

          {/* Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text-primary">Activity</h3>
              <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </div>
            <div className="px-5 pb-5">
              <ActivityFeed orders={activeOrders} />
            </div>
          </motion.div>
        </div>
      )}

      {/* ═══════════════════ Hourly + Summary ═══════════════════ */}
      {!isLoading && analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Hourly Activity</h3>
                <p className="text-xs text-text-muted mt-0.5">Order volume throughout the day</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-primary/80" /> Orders
                </span>
              </div>
            </div>
            <HourlyChart data={analytics.hourlyData} formatCurrency={formatCurrency} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
          >
            <div className="mb-4">
              <h3 className="text-[15px] font-semibold text-text-primary">Today's Summary</h3>
              <p className="text-xs text-text-muted mt-0.5">Key metrics at a glance</p>
            </div>
            <DailySummaryPanel analytics={analytics} formatCurrency={formatCurrency} />
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

/* ─── Stat Card ──────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  trend,
  sub,
  iconBg,
  iconColor,
  delay = 0,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: { pct: number; up: boolean };
  sub: string;
  iconBg: string;
  iconColor: string;
  delay?: number;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-all duration-300 group ${
        highlight ? 'border-amber-200 ring-1 ring-amber-100' : 'border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-sm ${iconColor}`}>
          {icon}
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold ${
            trend.up ? 'bg-primary/10 text-primary' : 'bg-red-50 text-red-500'
          }`}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d={trend.up ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'} />
            </svg>
            {trend.pct.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-text-muted font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-text-primary leading-none tabular-nums mb-1.5">{value}</p>
      <p className="text-[11px] text-text-muted leading-none">{sub}</p>
    </motion.div>
  );
}

/* ─── Revenue Area Chart ─────────────────────────────────── */

function RevenueAreaChart({
  data,
  formatCurrency,
}: {
  data: AnalyticsSummary['dailyRevenue'];
  formatCurrency: (v: number, opts?: { minimumFractionDigits?: number }) => string;
}) {
  if (!data?.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-muted">
        No revenue data yet
      </div>
    );
  }

  return (
    <div className="h-52 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={CHART_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF660E" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#FF660E" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickMargin={8}
            tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { weekday: 'short' })} />
          <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickMargin={8} width={45}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
          <ReTooltip contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [formatCurrency(value), 'Revenue']}
            labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} />
          <Area type="monotone" dataKey="revenue" stroke="#FF660E" strokeWidth={2.5}
            fill={`url(#${CHART_GRADIENT_ID})`} dot={false}
            activeDot={{ r: 5, fill: '#FF660E', stroke: '#fff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Revenue Donut ──────────────────────────────────────── */

function RevenueDonut({
  data,
  formatCurrency,
}: {
  data: { name: string; value: number; pct: number; color: string }[];
  formatCurrency: (v: number, opts?: { minimumFractionDigits?: number }) => string;
}) {
  if (!data.length) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-text-muted">
        No items data yet
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <div className="flex justify-center mb-4">
        <div className="relative">
          <PieChart width={180} height={180}>
            <Pie data={data} cx={85} cy={85} innerRadius={55} outerRadius={80}
              paddingAngle={3} dataKey="value" stroke="none">
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-xs text-text-muted font-medium">Total</p>
            <p className="text-lg font-bold text-text-primary tabular-nums">{formatCurrency(total)}</p>
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-text-secondary truncate">{item.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-text-primary tabular-nums">{formatCurrency(item.value)}</span>
              <span className="text-xs text-text-muted tabular-nums w-10 text-right">{item.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Quick Stat Row ─────────────────────────────────────── */



/* ─── Recent Orders Table ────────────────────────────────── */

function RecentOrdersTable({
  orders,
  formatCurrency,
}: {
  orders: Order[];
  formatCurrency: (v: number, opts?: { minimumFractionDigits?: number }) => string;
}) {
  if (orders.length === 0) {
    return (
      <div className="px-6 pb-5 text-sm text-text-muted text-center py-8">
        No recent orders
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-6">Order</th>
            <th className="text-left text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-2">Table</th>
            <th className="text-left text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-2">Time</th>
            <th className="text-right text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-2">Amount</th>
            <th className="text-right text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-6">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => {
            const meta = SM[order.status];
            return (
              <tr key={order.id}
                className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors ${
                  idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                }`}
              >
                <td className="py-3 px-6">
                  <p className="font-mono text-xs font-semibold text-text-primary">#{order.id.slice(-6).toUpperCase()}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
                </td>
                <td className="py-3 px-2">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded">{order.tableName}</span>
                </td>
                <td className="py-3 px-2">
                  <span className="text-xs text-text-muted tabular-nums">{timeAgo(order.createdAt)}</span>
                </td>
                <td className="py-3 px-2 text-right">
                  <span className="text-sm font-semibold text-text-primary tabular-nums">{formatCurrency(order.total)}</span>
                </td>
                <td className="py-3 px-6 text-right">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Top Sellers Panel ──────────────────────────────────── */



/* ─── Activity Feed ──────────────────────────────────────── */

function ActivityFeed({ orders }: { orders: Order[] }) {
  const sorted = useMemo(() =>
    [...orders]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 8),
    [orders],
  );

  if (sorted.length === 0) {
    return <div className="text-sm text-text-muted text-center py-8">No recent activity</div>;
  }

  const statusActivity: Record<string, { icon: string; action: string; color: string; bg: string }> = {
    pending:         { icon: 'M12 8v4l3 3', action: 'New order received', color: 'text-amber-600', bg: 'bg-amber-50' },
    confirmed:       { icon: 'M9 12l2 2 4-4', action: 'Order confirmed', color: 'text-sky-600', bg: 'bg-sky-50' },
    preparing:       { icon: 'M17.657 18.657A8 8 0 016.343 7.343', action: 'Being prepared', color: 'text-violet-600', bg: 'bg-violet-50' },
    served:          { icon: 'M5 13l4 4L19 7', action: 'Served to table', color: 'text-primary', bg: 'bg-orange-50' },
    payment_pending: { icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', action: 'Payment pending', color: 'text-primary', bg: 'bg-primary/10' },
    completed:       { icon: 'M5 13l4 4L19 7', action: 'Completed', color: 'text-gray-500', bg: 'bg-gray-50' },
    cancelled:       { icon: 'M6 18L18 6M6 6l12 12', action: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50' },
  };

  const todayStr = new Date().toDateString();

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
      {sorted.map((order) => {
        const act = statusActivity[order.status] ?? statusActivity.pending!;
        const orderDate = new Date(order.updatedAt || order.createdAt);
        const isToday = orderDate.toDateString() === todayStr;

        return (
          <div key={order.id} className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg ${act.bg} flex items-center justify-center shrink-0 mt-0.5`}>
              <svg className={`w-4 h-4 ${act.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={act.icon} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted tabular-nums leading-none mb-1">
                {isToday
                  ? orderDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }
              </p>
              <p className="text-sm text-text-primary leading-tight">{act.action}</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                #{order.id.slice(-6).toUpperCase()} · {order.tableName}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Hourly Chart ───────────────────────────────────────── */

function HourlyChart({
  data,
  formatCurrency,
}: {
  data: AnalyticsSummary['hourlyData'];
  formatCurrency: (v: number, opts?: { minimumFractionDigits?: number }) => string;
}) {
  const BAR_AREA_H = 148;

  const hours = useMemo(() => {
    const map = new Map(data.map(d => [d.hour, d]));
    const result = [];
    for (let h = 11; h <= 21; h++) {
      result.push(map.get(h) ?? { hour: h, orders: 0, revenue: 0 });
    }
    return result;
  }, [data]);

  const maxOrders = Math.max(...hours.map(d => d.orders), 1);
  const peakHourData = hours.length > 0 ? hours.reduce((best, d) => (d.orders > best.orders ? d : best), hours[0]!) : undefined;
  const hasAnyData = hours.some(d => d.orders > 0);

  return (
    <div className="flex items-end gap-1.5">
      {hours.map(d => {
        const ratio = d.orders / maxOrders;
        const barH = d.orders > 0 ? Math.max(ratio * BAR_AREA_H, 12) : 3;
        const now = new Date().getHours();
        const isCurrent = d.hour === now;
        const isPeak = hasAnyData && peakHourData != null && d.hour === peakHourData.hour && peakHourData.orders > 0;

        return (
          <div key={d.hour} className="flex-1 flex flex-col items-center justify-end group relative"
            style={{ height: BAR_AREA_H + 40 }}>
            {d.orders > 0 && (
              <span className="text-[10px] font-bold text-primary mb-1 tabular-nums leading-none">{d.orders}</span>
            )}
            {d.orders > 0 && (
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <div className="bg-text-primary text-white text-[10px] px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                  <p className="font-semibold">{d.orders} orders</p>
                  <p className="text-white/70">{formatCurrency(d.revenue)}</p>
                </div>
                <div className="w-2 h-2 bg-text-primary rotate-45 mx-auto -mt-1" />
              </div>
            )}
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: barH }}
              transition={{ delay: (d.hour - 11) * 0.03, duration: 0.4, ease: 'easeOut' }}
              className={`w-full rounded-t-md ${
                isPeak ? 'bg-primary shadow-md ring-2 ring-primary/30'
                  : isCurrent ? 'bg-primary/70 shadow-sm'
                    : d.orders > 0 ? 'bg-primary/45 group-hover:bg-primary/65'
                      : 'bg-surface-elevated'
              }`}
            />
            <span className={`text-[10px] tabular-nums leading-none mt-1.5 ${
              isPeak ? 'text-primary font-bold' : isCurrent ? 'text-primary font-semibold' : 'text-text-muted'
            }`}>
              {d.hour > 12 ? `${d.hour - 12}p` : d.hour === 12 ? '12p' : `${d.hour}a`}
            </span>
            {isPeak && (
              <span className="text-[7px] font-extrabold text-primary uppercase tracking-widest mt-0.5">peak</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Daily Summary Panel ────────────────────────────────── */

function DailySummaryPanel({
  analytics,
  formatCurrency,
}: {
  analytics: AnalyticsSummary;
  formatCurrency: (v: number, opts?: { minimumFractionDigits?: number }) => string;
}) {
  const totalRevInHours = analytics.hourlyData.filter(h => h.orders > 0).length;
  const peakHourData = analytics.hourlyData.reduce((best, d) => (d.orders > best.orders ? d : best), { hour: 0, orders: 0, revenue: 0 });
  const avgPerHour = totalRevInHours > 0 ? analytics.totalRevenue / totalRevInHours : 0;

  const revenueHours = useMemo(() => {
    const map = new Map(analytics.hourlyData.map(d => [d.hour, d]));
    const result = [];
    for (let h = 11; h <= 21; h++) {
      result.push(map.get(h) ?? { hour: h, orders: 0, revenue: 0 });
    }
    return result;
  }, [analytics.hourlyData]);

  const maxRevenue = Math.max(...revenueHours.map(d => d.revenue), 1);

  return (
    <div className="flex flex-col flex-1 gap-5">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-text-primary">Revenue by Hour</p>
          <span className="text-[10px] text-text-muted tabular-nums">{formatCurrency(avgPerHour)} avg/hr</span>
        </div>
        <div className="flex items-end gap-1 flex-1" style={{ minHeight: 80 }}>
          {revenueHours.map((d) => {
            const ratio = d.revenue / maxRevenue;
            const barH = d.revenue > 0 ? Math.max(ratio * 72, 4) : 2;
            const isPeak = d.hour === peakHourData.hour && peakHourData.orders > 0;
            return (
              <div key={d.hour} className="flex-1 flex flex-col items-center justify-end group relative">
                {d.revenue > 0 && (
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div className="bg-text-primary text-white text-[9px] px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
                      {formatCurrency(d.revenue)}
                    </div>
                  </div>
                )}
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: barH }}
                  transition={{ delay: (d.hour - 11) * 0.03, duration: 0.4 }}
                  className={`w-full rounded-t ${
                    isPeak ? 'bg-primary' : d.revenue > 0 ? 'bg-primary/50' : 'bg-gray-100'
                  }`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1 mt-1">
          {revenueHours.map(d => (
            <span key={d.hour} className="flex-1 text-center text-[8px] text-text-muted tabular-nums">
              {d.hour > 12 ? `${d.hour - 12}` : d.hour === 12 ? '12' : `${d.hour}`}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-elevated/60 rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-sm font-bold text-text-primary tabular-nums">{peakHourData.orders > 0 ? fmtHour(peakHourData.hour) : '—'}</p>
          <p className="text-[9px] text-text-muted font-medium mt-0.5 uppercase tracking-wider">Peak Hour</p>
        </div>
        <div className="bg-surface-elevated/60 rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-sm font-bold text-text-primary tabular-nums">{peakHourData.orders > 0 ? peakHourData.orders : 0}</p>
          <p className="text-[9px] text-text-muted font-medium mt-0.5 uppercase tracking-wider">Peak Orders</p>
        </div>
        <div className="bg-surface-elevated/60 rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-sm font-bold text-text-primary tabular-nums">{(analytics.tableConversionRate * 100).toFixed(0)}%</p>
          <p className="text-[9px] text-text-muted font-medium mt-0.5 uppercase tracking-wider">Conversion</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeletons ──────────────────────────────────────────── */

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200" />
            <div className="w-14 h-6 rounded-lg bg-gray-100" />
          </div>
          <div className="h-3 bg-gray-100 rounded w-16 mb-2" />
          <div className="h-7 bg-gray-200 rounded w-24 mb-2" />
          <div className="h-2.5 bg-gray-100 rounded w-32" />
        </div>
      ))}
    </div>
  );
}


