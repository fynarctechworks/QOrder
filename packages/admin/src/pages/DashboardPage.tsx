import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

import type { Order, OrderStatus, AnalyticsSummary, DashboardExtras } from '../types';
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
  const navigate = useNavigate();
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

  const { data: extras, isError: _extrasError } = useQuery({
    queryKey: ['analytics', 'dashboard-extras'],
    queryFn: () => analyticsService.getDashboardExtras(),
    staleTime: 30_000,
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6 text-center">
          <p className="text-red-700 font-semibold">Failed to load dashboard data</p>
          <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing.</p>
        </div>
      ) : isLoading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

      {/* ═══════════════════ Secondary KPIs ═══════════════════ */}
      {extras && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 7h4v4H7zM7 13h4v4H7zM13 7h4v4h-4z" />
              </svg>
            }
            label="QR Scans"
            value={String(extras.qrScansToday)}
            sub={`${extras.customersToday} unique customers`}
            iconBg="bg-teal-500"
            iconColor="text-white"
            delay={0}
          />
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M3 10h18" />
              </svg>
            }
            label="Active Tables"
            value={`${extras.tableStatus.occupied}/${extras.tableStatus.total}`}
            sub={'All tables'}
            iconBg="bg-indigo-500"
            iconColor="text-white"
            delay={0.05}
          />
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            }
            label="Customers"
            value={String(extras.customersToday)}
            sub={extras.qrScansToday > 0 ? `${Math.round((analytics?.totalOrders ?? 0) / Math.max(extras.qrScansToday, 1) * 100)}% conversion` : 'No QR scans'}
            iconBg="bg-rose-500"
            iconColor="text-white"
            delay={0.1}
          />
          <StatCard
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
            label="Taxes Collected"
            value={formatCurrency(extras.financials.totalTax)}
            sub={extras.financials.totalDiscount > 0 ? `${formatCurrency(extras.financials.totalDiscount)} discounts` : 'No discounts today'}
            iconBg="bg-emerald-500"
            iconColor="text-white"
            delay={0.15}
          />
        </div>
      )}

      {/* ═══════════════════ Charts + Performance ═══════════════════ */}
      {!isLoading && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 md:gap-4">
          {/* Revenue Area Chart */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="md:col-span-1 lg:col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-4 sm:px-6 pt-5 pb-2">
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
            className="md:col-span-1 lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text-primary">Top Items Breakdown</h3>
              <span className="text-[11px] text-text-muted">Today</span>
            </div>
            <div className="px-4 sm:px-6 pb-5">
              <RevenueDonut data={topItemsDonut} formatCurrency={formatCurrency} />
            </div>
          </motion.div>

          {/* Order Status Overview */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="md:col-span-2 lg:col-span-3 flex flex-col gap-3 md:gap-4"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 md:gap-4">

          {/* Recent Orders */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="md:col-span-2 lg:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between">
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
            className="md:col-span-2 lg:col-span-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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

      {/* ═══════════════════ Table Status + Payments + Financial ═══════════════════ */}
      {extras && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">

          {/* Table Status Overview */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-text-primary">Table Status</h3>
              <span className="text-[11px] text-text-muted">{extras.tableStatus.total} total</span>
            </div>
            <TableStatusGrid tableStatus={extras.tableStatus} />
          </motion.div>

          {/* Payments Summary */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-text-primary">Payments</h3>
              <span className="text-[11px] text-text-muted">Today</span>
            </div>
            <PaymentsSummary payments={extras.paymentSummary} formatCurrency={formatCurrency} />
          </motion.div>

          {/* Financial Snapshot */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-text-primary">Financial Snapshot</h3>
              <span className="text-[11px] text-text-muted">Today</span>
            </div>
            <FinancialSnapshot financials={extras.financials} totalRevenue={analytics?.totalRevenue ?? 0} formatCurrency={formatCurrency} />
          </motion.div>
        </div>
      )}

      {/* ═══════════════════ Alerts + Low Performers ═══════════════════ */}
      {extras && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">

          {/* Notifications & Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text-primary">Alerts</h3>
              {(extras.lowStockItems.length + extras.pendingServiceRequests + extras.pendingPayments) > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] font-bold">
                  {extras.lowStockItems.length + extras.pendingServiceRequests + extras.pendingPayments}
                </span>
              )}
            </div>
            <div className="px-5 pb-5">
              <AlertsPanel extras={extras} />
            </div>
          </motion.div>

          {/* Low Performing Items */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text-primary">Low Performing Items</h3>
              <span className="text-[11px] text-text-muted">Today</span>
            </div>
            <div className="px-5 pb-5">
              <LowPerformersPanel items={extras.lowPerformingItems} formatCurrency={formatCurrency} />
            </div>
          </motion.div>
        </div>
      )}

      {/* ═══════════════════ Quick Actions ═══════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Add Menu Item', icon: 'M12 4v16m8-8H4', path: '/menu', bg: 'bg-primary/10', color: 'text-primary' },
          { label: 'Manage Tables', icon: 'M4 6h16M4 10h16M4 14h10', path: '/tables', bg: 'bg-sky-50', color: 'text-sky-600' },
          { label: 'View Orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', path: '/orders', bg: 'bg-violet-50', color: 'text-violet-600' },
          { label: 'View Reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', path: '/reports', bg: 'bg-amber-50', color: 'text-amber-600' },
        ].map((action) => (
          <motion.button
            key={action.label}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(action.path)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all group`}
          >
            <div className={`w-9 h-9 rounded-lg ${action.bg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
              <svg className={`w-4.5 h-4.5 ${action.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={action.icon} />
              </svg>
            </div>
            <span className="text-sm font-medium text-text-primary">{action.label}</span>
          </motion.button>
        ))}
      </div>
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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-white rounded-xl border shadow-sm p-5 hover:shadow-md transition-shadow ${
        highlight ? 'border-amber-200 ring-1 ring-amber-100' : 'border-gray-100'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-sm ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted font-medium uppercase tracking-wider leading-none">{label}</p>
            {trend && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                trend.up ? 'bg-primary/10 text-primary' : 'bg-red-50 text-red-500'
              }`}>
                {trend.up ? '↑' : '↓'} {trend.pct.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-text-primary mt-1.5 leading-none tabular-nums">{value}</p>
          <p className="text-xs text-text-muted mt-1 leading-none">{sub}</p>
        </div>
      </div>
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
      <div className="px-4 sm:px-6 pb-5 text-sm text-text-muted text-center py-8">
        No recent orders
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-3 md:px-6">Order</th>
            <th className="text-left text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-2">Table</th>
            <th className="hidden sm:table-cell text-left text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-2">Time</th>
            <th className="text-right text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-2">Amount</th>
            <th className="text-right text-[11px] text-text-muted font-medium uppercase tracking-wider py-2.5 px-3 md:px-6">Status</th>
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
                <td className="py-3 px-3 md:px-6">
                  <p className="font-mono text-xs font-semibold text-text-primary">#{order.id.slice(-6).toUpperCase()}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
                </td>
                <td className="py-3 px-2">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary bg-surface-elevated px-2 py-0.5 rounded">{order.tableName}</span>
                </td>
                <td className="hidden sm:table-cell py-3 px-2">
                  <span className="text-xs text-text-muted tabular-nums">{timeAgo(order.createdAt)}</span>
                </td>
                <td className="py-3 px-2 text-right">
                  <span className="text-sm font-semibold text-text-primary tabular-nums">{formatCurrency(order.total)}</span>
                </td>
                <td className="py-3 px-3 md:px-6 text-right">
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
    if (!data.length) return [];
    const map = new Map(data.map(d => [d.hour, d]));
    const minH = Math.min(...data.map(d => d.hour));
    const maxH = Math.max(...data.map(d => d.hour));
    const startH = Math.min(minH, 8);
    const endH = Math.max(maxH, 22);
    const result = [];
    for (let h = startH; h <= endH; h++) {
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
    const data = analytics.hourlyData;
    if (!data.length) return [];
    const map = new Map(data.map(d => [d.hour, d]));
    const minH = Math.min(...data.map(d => d.hour));
    const maxH = Math.max(...data.map(d => d.hour));
    const startH = Math.min(minH, 8);
    const endH = Math.max(maxH, 22);
    const result = [];
    for (let h = startH; h <= endH; h++) {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

/* ─── Table Status Grid ─────────────────────────────────── */

function TableStatusGrid({ tableStatus }: { tableStatus: DashboardExtras['tableStatus'] }) {
  const segments = [
    { label: 'Available', count: tableStatus.available, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'Occupied', count: tableStatus.occupied, color: 'bg-primary', text: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Reserved', count: tableStatus.reserved, color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Inactive', count: tableStatus.inactive, color: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-100' },
  ];
  const total = tableStatus.total || 1;

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {segments.filter(s => s.count > 0).map((s) => (
          <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${(s.count / total) * 100}%` }} />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {segments.map((s) => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${s.bg}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-text-muted">{s.label}</span>
            </div>
            <span className={`text-sm font-bold ${s.text} tabular-nums`}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Payments Summary ───────────────────────────────────── */

const PAYMENT_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  CASH:   { icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  CARD:   { icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z', color: 'text-sky-600', bg: 'bg-sky-50' },
  UPI:    { icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', color: 'text-violet-600', bg: 'bg-violet-50' },
  WALLET: { icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', color: 'text-amber-600', bg: 'bg-amber-50' },
  ONLINE: { icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9', color: 'text-primary', bg: 'bg-primary/10' },
  CREDIT: { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-rose-600', bg: 'bg-rose-50' },
};

function PaymentsSummary({
  payments,
  formatCurrency,
}: {
  payments: DashboardExtras['paymentSummary'];
  formatCurrency: (v: number) => string;
}) {
  const totalPayments = payments.reduce((s, p) => s + p.total, 0);

  if (payments.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">No payments today</p>;
  }

  return (
    <div className="space-y-2.5">
      {payments.map((p) => {
        const meta = PAYMENT_ICONS[p.method] ?? PAYMENT_ICONS.CASH!;
        const pct = totalPayments > 0 ? Math.round((p.total / totalPayments) * 100) : 0;
        return (
          <div key={p.method} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
              <svg className={`w-4 h-4 ${meta.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={meta.icon} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-primary capitalize">{p.method.toLowerCase()}</span>
                <span className="text-xs font-bold text-text-primary tabular-nums">{formatCurrency(p.total)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                  className={`h-full rounded-full ${meta.color.replace('text-', 'bg-')}`}
                />
              </div>
            </div>
            <span className="text-[11px] text-text-muted tabular-nums w-8 text-right">{pct}%</span>
          </div>
        );
      })}
      <div className="pt-2 mt-1 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs text-text-muted">{payments.reduce((s, p) => s + p.count, 0)} transactions</span>
        <span className="text-sm font-bold text-text-primary tabular-nums">{formatCurrency(totalPayments)}</span>
      </div>
    </div>
  );
}

/* ─── Financial Snapshot ─────────────────────────────────── */

function FinancialSnapshot({
  financials,
  totalRevenue,
  formatCurrency,
}: {
  financials: DashboardExtras['financials'];
  totalRevenue: number;
  formatCurrency: (v: number) => string;
}) {
  const rows = [
    { label: 'Subtotal', value: financials.totalSubtotal, icon: 'M9 7h6m-6 4h6m-6 4h4', color: 'text-text-primary' },
    { label: 'Discounts Given', value: -financials.totalDiscount, icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z', color: 'text-red-500' },
    { label: 'Taxes Collected', value: financials.totalTax, icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z', color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <svg className={`w-4 h-4 ${row.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={row.icon} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs text-text-muted">{row.label}</span>
          </div>
          <span className={`text-sm font-semibold tabular-nums ${row.value < 0 ? 'text-red-500' : 'text-text-primary'}`}>
            {row.value < 0 ? `−${formatCurrency(Math.abs(row.value))}` : formatCurrency(row.value)}
          </span>
        </div>
      ))}
      <div className="pt-3 mt-1 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">Net Revenue</span>
          <span className="text-lg font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Alerts Panel ───────────────────────────────────────── */

function AlertsPanel({ extras }: { extras: DashboardExtras }) {
  const alerts: { type: 'warning' | 'error' | 'info'; title: string; detail: string; icon: string }[] = [];

  if (extras.lowStockItems.length > 0) {
    for (const item of extras.lowStockItems.slice(0, 3)) {
      alerts.push({
        type: 'warning',
        title: `Low Stock: ${item.name}`,
        detail: `${item.currentStock} ${item.unit} left (min: ${item.minStock})`,
        icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
      });
    }
    if (extras.lowStockItems.length > 3) {
      alerts.push({
        type: 'warning',
        title: `+${extras.lowStockItems.length - 3} more low stock items`,
        detail: 'Check inventory for details',
        icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
      });
    }
  }

  if (extras.pendingServiceRequests > 0) {
    alerts.push({
      type: 'error',
      title: `${extras.pendingServiceRequests} Service Request${extras.pendingServiceRequests > 1 ? 's' : ''}`,
      detail: 'Customers waiting for assistance',
      icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    });
  }

  if (extras.pendingPayments > 0) {
    alerts.push({
      type: 'info',
      title: `${extras.pendingPayments} Pending Payment${extras.pendingPayments > 1 ? 's' : ''}`,
      detail: 'Awaiting confirmation',
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    });
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
          <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-text-primary">All Clear</p>
        <p className="text-xs text-text-muted mt-0.5">No alerts at the moment</p>
      </div>
    );
  }

  const typeStyle = {
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-500' },
    error:   { bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-500' },
    info:    { bg: 'bg-sky-50', border: 'border-sky-200', iconColor: 'text-sky-500' },
  };

  return (
    <div className="space-y-2.5 max-h-64 overflow-y-auto scrollbar-thin">
      {alerts.map((alert, idx) => {
        const style = typeStyle[alert.type];
        return (
          <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border ${style.bg} ${style.border}`}>
            <div className="shrink-0 mt-0.5">
              <svg className={`w-4.5 h-4.5 ${style.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={alert.icon} />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary leading-tight">{alert.title}</p>
              <p className="text-[11px] text-text-muted mt-0.5">{alert.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Low Performers Panel ───────────────────────────────── */

function LowPerformersPanel({
  items,
  formatCurrency,
}: {
  items: DashboardExtras['lowPerformingItems'];
  formatCurrency: (v: number) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">No sales data available today</p>;
  }

  const maxQty = Math.max(...items.map(i => i.quantity), 1);

  return (
    <div className="space-y-2.5">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-text-primary truncate">{item.itemName}</span>
              <span className="text-[11px] text-text-muted tabular-nums shrink-0 ml-2">{item.quantity} sold</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-red-300"
                style={{ width: `${(item.quantity / maxQty) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-semibold text-text-primary tabular-nums shrink-0">{formatCurrency(item.revenue)}</span>
        </div>
      ))}
    </div>
  );
}


