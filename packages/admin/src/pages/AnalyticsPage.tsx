import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { analyticsService } from '../services';
import { useSocket } from '../context/SocketContext';
import { useCurrency } from '../hooks/useCurrency';
import type { AnalyticsSummary } from '../types';

/* ═══════════════════════════ Constants ════════════════════════ */

type Period = 'day' | 'week' | 'month';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const CHART_COLORS = {
  primary: '#FF660E',
  orange: '#FF660E',
  sky: '#0EA5E9',
  violet: '#8B5CF6',
  amber: '#F59E0B',
  rose: '#F43F5E',
};

const GRADIENT_ID = 'revenueGradient';
const ORDERS_GRADIENT_ID = 'ordersGradient';

const PIE_COLORS = ['#FF660E', '#0EA5E9', '#8B5CF6', '#F59E0B', '#10B981', '#F43F5E', '#6366F1', '#EC4899'];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type AnalyticsTab = 'overview' | 'advanced';

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #E5E7EB',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  color: '#1F2937',
  fontSize: '13px',
  padding: '10px 14px',
};

/* ═══════════════════════════ Sub-components ══════════════════ */

/** Metric card */
function MetricCard({
  icon,
  label,
  value,
  sub,
  iconBg,
  delay = 0,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  iconBg: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider leading-none">{label}</p>
          <p className={`text-2xl font-bold text-text-primary mt-1.5 leading-none tabular-nums`}>{value}</p>
          {sub && <p className="text-xs text-text-muted mt-1 leading-none">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
}

/** Chart wrapper card */
function ChartCard({
  title,
  subtitle,
  children,
  className = '',
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-6 pb-6 flex-1 flex flex-col">
        {children}
      </div>
    </motion.div>
  );
}

/** Stats skeleton */
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gray-200" />
          <div className="space-y-2.5 flex-1">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-6 w-16 bg-gray-200 rounded" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Charts skeleton */
function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse ${i >= 2 ? '' : ''}`}>
          <div className="h-5 w-32 bg-gray-200 rounded mb-1" />
          <div className="h-3 w-48 bg-gray-100 rounded mb-6" />
          <div className="h-56 bg-gray-50 rounded-xl flex items-end gap-2 px-6 pb-4">
            {Array.from({ length: 7 }).map((_, j) => (
              <div
                key={j}
                className="flex-1 bg-gray-200 rounded-t"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Top items ranked list */
function TopItemsList({ items }: { items: AnalyticsSummary['topItems'] }) {
  const formatCurrency = useCurrency();
  const displayed = items.slice(0, 10);
  const maxQty = Math.max(...displayed.map((i) => i.quantity), 1);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-3">
      {displayed.map((item, idx) => {
        const pct = (item.quantity / maxQty) * 100;
        return (
          <motion.div
            key={item.itemId}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.06 }}
            className="group"
          >
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-base w-6 text-center shrink-0">
                {idx < 3 ? medals[idx] : <span className="text-xs font-bold text-text-muted">#{idx + 1}</span>}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary truncate">{item.itemName}</span>
                  <span className="text-xs text-text-muted tabular-nums shrink-0">{item.quantity} sold</span>
                </div>
              </div>
              <span className="text-sm font-semibold text-text-primary tabular-nums shrink-0 w-20 text-right">
                {formatCurrency(item.revenue)}
              </span>
            </div>
            <div className="ml-9 h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: 0.1 + idx * 0.06 }}
                className="h-full rounded-full"
                style={{
                  background: idx === 0
                    ? 'linear-gradient(90deg, #FF660E, #E55A0B)'
                    : idx === 1
                    ? 'linear-gradient(90deg, #6B7280, #4B5563)'
                    : idx === 2
                    ? 'linear-gradient(90deg, #F59E0B, #D97706)'
                    : 'linear-gradient(90deg, #D1D5DB, #6B7280)',
                }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Peak hours heat bar chart */
function PeakHoursChart({ data }: { data: AnalyticsSummary['hourlyData'] }) {
  const formatCurrency = useCurrency();
  const maxOrders = Math.max(...data.map((h) => h.orders), 1);

  return (
    <div className="flex flex-col justify-end h-full">
      <div className="flex items-end gap-1.5 h-48">
        {data.map((hour, idx) => {
          const intensity = hour.orders / maxOrders;
          const isCurrentHour = new Date().getHours() === hour.hour;
          const isPeak = intensity >= 0.85;

          return (
            <motion.div
              key={hour.hour}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(intensity * 100, 4)}%` }}
              transition={{ duration: 0.5, delay: idx * 0.03 }}
              className="group relative flex-1 cursor-pointer"
            >
              {/* Tooltip on hover */}
              <div className="absolute -top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                <div className="bg-gray-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                  <div className="font-semibold">{hour.orders} orders</div>
                  <div className="text-gray-400">{formatCurrency(hour.revenue)}</div>
                </div>
                <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
              </div>

              <div
                className={`w-full h-full rounded-lg transition-all group-hover:opacity-80 ${
                  isCurrentHour ? 'ring-2 ring-primary ring-offset-2' : ''
                }`}
                style={{
                  background: isPeak
                    ? 'linear-gradient(180deg, #FF660E, #E55A0B)'
                    : `linear-gradient(180deg, rgba(255,102,14,${0.25 + intensity * 0.6}), rgba(255,102,14,${0.15 + intensity * 0.5}))`,
                }}
              />
            </motion.div>
          );
        })}
      </div>
      {/* Hour labels */}
      <div className="flex gap-1.5 mt-3">
        {data.map((hour) => {
          const ampm = hour.hour >= 12 ? 'p' : 'a';
          const h12 = hour.hour > 12 ? hour.hour - 12 : hour.hour === 0 ? 12 : hour.hour;
          return (
            <div key={hour.hour} className="flex-1 text-center">
              <span className="text-[10px] text-text-muted font-medium">
                {h12}{ampm}
              </span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[11px] text-text-muted pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-primary/30" />
          Low
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-primary/60" />
          Medium
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ background: 'linear-gradient(180deg, #FF660E, #E55A0B)' }} />
          Peak
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Page ════════════════════════════ */

export default function AnalyticsPage() {
  const qc = useQueryClient();
  const formatCurrency = useCurrency();
  const [period, setPeriod] = useState<Period>('week');
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const { onNewOrder, onOrderStatusUpdate } = useSocket();

  const { data: analytics, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'summary', period],
    queryFn: () => analyticsService.getSummary({ period }),
    refetchInterval: 15_000,
    staleTime: 0,
  });

  const { data: advanced, isLoading: advLoading, isError: _advError } = useQuery({
    queryKey: ['analytics', 'advanced', dateRange.startDate, dateRange.endDate],
    queryFn: () => analyticsService.getAdvanced(
      dateRange.startDate || dateRange.endDate
        ? { startDate: dateRange.startDate || undefined, endDate: dateRange.endDate || undefined }
        : {}
    ),
    enabled: tab === 'advanced',
    staleTime: 30_000,
  });

  /* ── Real-time: invalidate analytics on any order change ── */
  useEffect(() => {
    const u1 = onNewOrder(() => {
      qc.invalidateQueries({ queryKey: ['analytics'] });
    });
    const u2 = onOrderStatusUpdate(() => {
      qc.invalidateQueries({ queryKey: ['analytics'] });
    });
    return () => { u1(); u2(); };
  }, [onNewOrder, onOrderStatusUpdate, qc]);

  // ── Derived ──


const revenueTrend = useMemo(() => {
    if (!analytics?.dailyRevenue || analytics.dailyRevenue.length < 2) return null;
    const rev = analytics.dailyRevenue;
    const prev = rev[rev.length - 2]?.revenue;
    const curr = rev[rev.length - 1]?.revenue;
    if (prev == null || curr == null) return null;
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    return { pct, up: pct >= 0 };
  }, [analytics]);

  const peakHour = useMemo(() => {
    if (!analytics?.hourlyData?.length) return null;
    const peak = analytics.hourlyData.reduce((a, b) => (b.orders > a.orders ? b : a));
    const ampm = peak.hour >= 12 ? 'PM' : 'AM';
    const h12 = peak.hour > 12 ? peak.hour - 12 : peak.hour === 0 ? 12 : peak.hour;
    return `${h12}:00 ${ampm}`;
  }, [analytics]);

  /* ═════════════════════════ RENDER ═════════════════════════ */

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Analytics</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Track your restaurant performance and trends
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab selector */}
          <div className="inline-flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            {([
              { value: 'overview' as AnalyticsTab, label: 'Overview' },
              { value: 'advanced' as AnalyticsTab, label: 'Advanced' },
            ]).map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  tab === t.value
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Period selector (overview only) */}
          {tab === 'overview' && (
            <div className="inline-flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    period === opt.value
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────── */}
      {tab === 'overview' && (isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700 font-semibold">Failed to load analytics</p>
          <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing.</p>
        </div>
      ) : isLoading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
            label="Total Revenue"
            value={formatCurrency(analytics?.totalRevenue ?? 0, { minimumFractionDigits: 0 })}
            sub={revenueTrend ? `${revenueTrend.up ? '↑' : '↓'} ${Math.abs(revenueTrend.pct).toFixed(1)}% vs yesterday` : undefined}
            iconBg="bg-primary"
            delay={0}
          />
          <MetricCard
            icon="M16 4H18a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M8 2h8v4H8V2M9 12h6M9 16h4"
            label="Total Orders"
            value={String(analytics?.totalOrders ?? 0)}
            sub={`avg ${formatCurrency(analytics?.averageOrderValue ?? 0)} per order`}
            iconBg="bg-sky-500"
            delay={0.05}
          />
          <MetricCard
            icon="M3 3v18h18M7 16l4-4 4 4 5-6"
            label="Avg Order Value"
            value={formatCurrency(analytics?.averageOrderValue ?? 0)}
            iconBg="bg-violet-500"
            delay={0.10}
          />
          <MetricCard
            icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            label="Table Conversion"
            value={`${((analytics?.tableConversionRate ?? 0) * 100).toFixed(1)}%`}
            sub={peakHour ? `Peak at ${peakHour}` : undefined}
            iconBg="bg-amber-500"
            delay={0.15}
          />
        </div>
      ))}

      {/* ── Charts Grid ─────────────────────────────────────── */}
      {tab === 'overview' && (isLoading ? (
        <ChartsSkeleton />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ── Revenue Trend (area chart) ── */}
          <ChartCard
            title="Revenue Trend"
            subtitle={`${analytics?.dailyRevenue?.length ?? 0} day${(analytics?.dailyRevenue?.length ?? 0) !== 1 ? 's' : ''} of data`}
          >
            <div className="h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics?.dailyRevenue ?? []}>
                  <defs>
                    <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(v: number) => {
                      if (v >= 1000) {
                        const kv = v / 1000;
                        return formatCurrency(kv, { minimumFractionDigits: kv % 1 ? 1 : 0 }) + 'k';
                      }
                      return formatCurrency(v, { minimumFractionDigits: 0 });
                    }}
                  />
                  <ReTooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString('en-US', {
                        weekday: 'long', month: 'short', day: 'numeric',
                      })
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2.5}
                    fill={`url(#${GRADIENT_ID})`}
                    dot={false}
                    activeDot={{ r: 5, fill: CHART_COLORS.primary, stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* ── Orders Volume (bar chart) ── */}
          <ChartCard
            title="Daily Orders"
            subtitle="Order volume over time"
          >
            <div className="h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.dailyRevenue ?? []} barSize={28}>
                  <defs>
                    <linearGradient id={ORDERS_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.sky} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_COLORS.sky} stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString('en-US', { weekday: 'short' })
                    }
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    allowDecimals={false}
                  />
                  <ReTooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number) => [value, 'Orders']}
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString('en-US', {
                        weekday: 'long', month: 'short', day: 'numeric',
                      })
                    }
                  />
                  <Bar dataKey="orders" fill={`url(#${ORDERS_GRADIENT_ID})`} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* ── Top Items ── */}
          <ChartCard
            title="Top Selling Items"
            subtitle="Ranked by quantity sold"
          >
            <TopItemsList items={analytics?.topItems ?? []} />
          </ChartCard>

          {/* ── Peak Hours ── */}
          <ChartCard
            title="Peak Hours"
            subtitle="Order distribution throughout the day"
            className="flex flex-col"
          >
            <PeakHoursChart data={analytics?.hourlyData ?? []} />
          </ChartCard>
        </div>
      ))}

      {/* ── Summary Footer ─────────────────────────────────── */}
      {tab === 'overview' && !isLoading && analytics && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              {
                label: 'Best Day',
                value: analytics.dailyRevenue.length
                  ? (() => {
                      const best = analytics.dailyRevenue.reduce((a, b) => (b.revenue > a.revenue ? b : a));
                      return new Date(best.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    })()
                  : '—',
                sub: analytics.dailyRevenue.length
                  ? formatCurrency(analytics.dailyRevenue.reduce((a, b) => (b.revenue > a.revenue ? b : a)).revenue)
                  : '',
              },
              {
                label: 'Top Item',
                value: analytics.topItems[0]?.itemName ?? '—',
                sub: analytics.topItems[0] ? `${analytics.topItems[0].quantity} sold` : '',
              },
              {
                label: 'Peak Hour',
                value: peakHour ?? '—',
                sub: analytics.hourlyData.length
                  ? `${analytics.hourlyData.reduce((a, b) => (b.orders > a.orders ? b : a)).orders} orders`
                  : '',
              },
              {
                label: 'Avg Daily Revenue',
                value: analytics.dailyRevenue.length
                  ? formatCurrency(
                      analytics.dailyRevenue.reduce((s, d) => s + d.revenue, 0) / analytics.dailyRevenue.length,
                      { minimumFractionDigits: 0 }
                    )
                  : '—',
                sub: `across ${analytics.dailyRevenue.length} days`,
              },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className="text-[11px] text-text-muted font-medium uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-semibold text-text-primary mt-1 truncate">{item.value}</p>
                {item.sub && <p className="text-xs text-text-muted mt-0.5">{item.sub}</p>}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ══════════════ Advanced Analytics Tab ══════════════ */}
      {tab === 'advanced' && (
        <>
          {/* Date range picker */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange((d) => ({ ...d, startDate: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange((d) => ({ ...d, endDate: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
            {(dateRange.startDate || dateRange.endDate) && (
              <button
                onClick={() => setDateRange({ startDate: '', endDate: '' })}
                className="px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Reset
              </button>
            )}
            <p className="text-xs text-text-muted ml-auto">
              {!dateRange.startDate && !dateRange.endDate ? 'Showing last 30 days' : 'Custom range'}
            </p>
          </div>

          {advLoading ? (
            <ChartsSkeleton />
          ) : advanced ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* ── Category Revenue (horizontal bar) ── */}
              <ChartCard title="Revenue by Category" subtitle="Category-wise revenue breakdown">
                {advanced.categoryRevenue.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-12">No data available</p>
                ) : (
                  <div className="h-72 -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={advanced.categoryRevenue} layout="vertical" barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                        <XAxis
                          type="number"
                          stroke="#94A3B8"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => {
                            if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                            return String(v);
                          }}
                        />
                        <YAxis
                          type="category"
                          dataKey="categoryName"
                          stroke="#94A3B8"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          width={100}
                        />
                        <ReTooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                        />
                        <Bar dataKey="totalRevenue" fill={CHART_COLORS.primary} radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              {/* ── Payment Methods (pie chart) ── */}
              <ChartCard title="Payment Methods" subtitle="Breakdown by payment type">
                {advanced.paymentMethods.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-12">No data available</p>
                ) : (
                  <div className="h-72 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={advanced.paymentMethods}
                          dataKey="totalAmount"
                          nameKey="method"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          innerRadius={50}
                          paddingAngle={3}
                          label={({ method, percent }: { method: string; percent: number }) =>
                            `${method} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {advanced.paymentMethods.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <ReTooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => [formatCurrency(value), name]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value: string) => (
                            <span className="text-xs text-text-secondary">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              {/* ── Weekday Breakdown (bar chart) ── */}
              <ChartCard title="Orders by Day of Week" subtitle="Weekday performance pattern">
                {advanced.weekdayBreakdown.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-12">No data available</p>
                ) : (
                  <div className="h-64 -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={advanced.weekdayBreakdown.map((d) => ({
                          ...d,
                          day: WEEKDAY_NAMES[d.dayOfWeek] || d.dayName,
                        }))}
                        barSize={32}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                        <ReTooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => [
                            name === 'totalRevenue' ? formatCurrency(value) : value,
                            name === 'totalRevenue' ? 'Revenue' : 'Orders',
                          ]}
                        />
                        <Bar dataKey="totalOrders" fill={CHART_COLORS.sky} radius={[6, 6, 0, 0]} name="totalOrders" />
                        <Bar dataKey="totalRevenue" fill={CHART_COLORS.primary} radius={[6, 6, 0, 0]} name="totalRevenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              {/* ── Order Status Breakdown (donut) ── */}
              <ChartCard title="Order Status" subtitle="Distribution of order statuses">
                {advanced.orderStatusBreakdown.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-12">No data available</p>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const total = advanced.orderStatusBreakdown.reduce((s, o) => s + o.count, 0);
                      const statusColors: Record<string, string> = {
                        pending: '#F59E0B',
                        confirmed: '#0EA5E9',
                        preparing: '#8B5CF6',
                        ready: '#10B981',
                        delivered: '#22C55E',
                        completed: '#059669',
                        cancelled: '#EF4444',
                      };
                      return advanced.orderStatusBreakdown.map((item, idx) => {
                        const pct = total > 0 ? (item.count / total) * 100 : 0;
                        const color = statusColors[item.status] || PIE_COLORS[idx % PIE_COLORS.length];
                        return (
                          <motion.div
                            key={item.status}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-sm font-medium text-text-primary capitalize">{item.status}</span>
                              </div>
                              <span className="text-sm text-text-muted tabular-nums">
                                {item.count} ({pct.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6, delay: 0.1 + idx * 0.05 }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            </div>
                          </motion.div>
                        );
                      });
                    })()}
                  </div>
                )}
              </ChartCard>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
