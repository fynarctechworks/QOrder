import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { reportService } from '../services/reportService';
import { useCurrency } from '../hooks/useCurrency';

const REPORT_CATEGORIES = [
  {
    label: 'Sales',
    items: [
      { key: 'hourly', label: 'Hourly Sales', type: 'bar' },
      { key: 'daily', label: 'Daily Sales', type: 'line' },
      { key: 'weekly', label: 'Weekly Sales', type: 'bar' },
      { key: 'monthly', label: 'Monthly Sales', type: 'bar' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { key: 'category', label: 'Category Performance', type: 'pie' },
      { key: 'item', label: 'Item Performance', type: 'bar' },
      { key: 'table', label: 'Table Utilization', type: 'bar' },
      { key: 'peak', label: 'Peak Day Analysis', type: 'bar' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { key: 'payment', label: 'Payment Breakdown', type: 'pie' },
      { key: 'discount', label: 'Discount Report', type: 'bar' },
      { key: 'revenue', label: 'Revenue Comparison', type: 'bar' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'feedback', label: 'Feedback Summary', type: 'bar' },
      { key: 'orderStatus', label: 'Order Status', type: 'pie' },
      { key: 'prepTime', label: 'Avg Prep Time', type: 'bar' },
      { key: 'inventory', label: 'Inventory Consumption', type: 'bar' },
    ],
  },
];

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const todayStr = today.toISOString().slice(0, 10);

type ReportKey = string;

const FETCHER_MAP: Record<ReportKey, (from: string, to: string, branchId?: string) => Promise<any>> = {
  hourly: (f, t, b) => reportService.hourlySales({ startDate: f, endDate: t, branchId: b }),
  daily: (f, t, b) => reportService.dailySales({ startDate: f, endDate: t, branchId: b }),
  weekly: (f, t, b) => reportService.weeklySales({ startDate: f, endDate: t, branchId: b }),
  monthly: (f, t, b) => reportService.monthlySales({ startDate: f, endDate: t, branchId: b }),
  category: (f, t, b) => reportService.categoryPerformance({ startDate: f, endDate: t, branchId: b }),
  item: (f, t, b) => reportService.itemPerformance({ startDate: f, endDate: t, branchId: b }),
  payment: (f, t, b) => reportService.paymentBreakdown({ startDate: f, endDate: t, branchId: b }),
  discount: (f, t, b) => reportService.discountReport({ startDate: f, endDate: t, branchId: b }),
  table: (f, t, b) => reportService.tableUtilization({ startDate: f, endDate: t, branchId: b }),
  feedback: (f, t, b) => reportService.feedbackSummary({ startDate: f, endDate: t, branchId: b }),
  revenue: (f, t, b) => reportService.revenueComparison({ startDate: f, endDate: t, branchId: b }),
  inventory: (f, t, b) => reportService.inventoryConsumption({ startDate: f, endDate: t, branchId: b }),
  peak: (f, t, b) => reportService.peakDayAnalysis({ startDate: f, endDate: t, branchId: b }),
  orderStatus: (f, t, b) => reportService.orderStatusBreakdown({ startDate: f, endDate: t, branchId: b }),
  prepTime: (f, t, b) => reportService.avgPrepTime({ startDate: f, endDate: t, branchId: b }),
};

export default function ReportsPage() {
  const formatCurrency = useCurrency();
  const [activeReport, setActiveReport] = useState('hourly');
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(todayStr);

  const reportMeta = useMemo(() => {
    for (const cat of REPORT_CATEGORIES) {
      for (const item of cat.items) {
        if (item.key === activeReport) return item;
      }
    }
    return REPORT_CATEGORIES[0]!.items[0]!;
  }, [activeReport]);

  const { data: result, isLoading } = useQuery({
    queryKey: ['report', activeReport, fromDate, toDate],
    queryFn: () => FETCHER_MAP[activeReport]!(fromDate, toDate),
  });

  const reportData = result ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Reports</h1>
        <p className="text-sm text-text-muted mt-0.5">Comprehensive business reports and analytics</p>
      </div>

      {/* Date Range */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>
        <div className="flex gap-1.5 ml-auto">
          {[
            { label: 'Today', fn: () => { setFromDate(todayStr); setToDate(todayStr); } },
            { label: '7D', fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); setFromDate(d.toISOString().slice(0, 10)); setToDate(todayStr); } },
            { label: '30D', fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); setFromDate(d.toISOString().slice(0, 10)); setToDate(todayStr); } },
            { label: 'MTD', fn: () => { setFromDate(monthStart); setToDate(todayStr); } },
          ].map(q => (
            <button key={q.label} onClick={q.fn}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 shrink-0 space-y-4 hidden lg:block">
          {REPORT_CATEGORIES.map(cat => (
            <div key={cat.label}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5">{cat.label}</p>
              <div className="space-y-0.5">
                {cat.items.map(item => (
                  <button key={item.key} onClick={() => setActiveReport(item.key)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                      activeReport === item.key
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:bg-gray-50'
                    }`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile selector */}
        <select value={activeReport} onChange={e => setActiveReport(e.target.value)}
          className="lg:hidden w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4">
          {REPORT_CATEGORIES.flatMap(c => c.items).map(i => (
            <option key={i.key} value={i.key}>{i.label}</option>
          ))}
        </select>

        {/* Chart Area */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 min-h-[500px]">
          <h2 className="text-lg font-semibold text-text-primary mb-4">{reportMeta.label}</h2>

          {isLoading ? (
            <div className="flex items-center justify-center h-80">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : !reportData || (Array.isArray(reportData) && reportData.length === 0) ? (
            <div className="flex items-center justify-center h-80 text-text-muted text-sm">
              No data available for this period
            </div>
          ) : (
            <ReportChart reportKey={activeReport} data={reportData} chartType={reportMeta.type} formatCurrency={formatCurrency} />
          )}
        </div>
      </div>
    </div>
  );
}

function ReportChart({ reportKey, data, chartType, formatCurrency }: {
  reportKey: string; data: any; chartType: string; formatCurrency: (v: number) => string;
}) {
  // Normalize data depending on report type
  if (reportKey === 'revenue' && !Array.isArray(data)) {
    return <RevenueComparisonCard data={data} formatCurrency={formatCurrency} />;
  }

  if (reportKey === 'feedback' && !Array.isArray(data)) {
    return <FeedbackCard data={data} />;
  }

  if (reportKey === 'prepTime' && !Array.isArray(data)) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="text-center">
          <p className="text-5xl font-bold text-primary">{Number(data.avg_prep_minutes ?? 0).toFixed(1)}</p>
          <p className="text-sm text-text-muted mt-2">Average Prep Time (minutes)</p>
        </div>
      </div>
    );
  }

  const chartData = Array.isArray(data) ? data : [];
  if (chartData.length === 0) {
    return <div className="flex items-center justify-center h-80 text-text-muted text-sm">No data available</div>;
  }

  // Determine chart keys
  const { labelKey, valueKey, valueName } = getChartKeys(reportKey, chartData);

  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <PieChart>
          <Pie data={chartData} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%"
            outerRadius={140} innerRadius={60} paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => valueName.includes('revenue') || valueName.includes('amount') || valueName.includes('spend') || valueName.includes('total')
            ? formatCurrency(v) : v.toLocaleString()} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Line type="monotone" dataKey={valueKey} stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} name={valueName} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar chart
  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart data={chartData} margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) =>
          valueName.toLowerCase().includes('revenue') || valueName.toLowerCase().includes('amount') || valueName.toLowerCase().includes('total') || valueName.toLowerCase().includes('spend')
            ? formatCurrency(v) : v.toLocaleString()} />
        <Bar dataKey={valueKey} fill="#6366f1" radius={[4, 4, 0, 0]} name={valueName} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function getChartKeys(reportKey: string, data: any[]): { labelKey: string; valueKey: string; valueName: string } {
  const sample = data[0] ?? {};
  const keys = Object.keys(sample);

  const mappings: Record<string, { labelKey: string; valueKey: string; valueName: string }> = {
    hourly: { labelKey: 'hour', valueKey: 'revenue', valueName: 'Revenue' },
    daily: { labelKey: 'date', valueKey: 'revenue', valueName: 'Revenue' },
    weekly: { labelKey: 'week', valueKey: 'revenue', valueName: 'Revenue' },
    monthly: { labelKey: 'month', valueKey: 'revenue', valueName: 'Revenue' },
    category: { labelKey: 'categoryName', valueKey: 'revenue', valueName: 'Revenue' },
    item: { labelKey: 'itemName', valueKey: 'revenue', valueName: 'Revenue' },
    payment: { labelKey: 'method', valueKey: 'total', valueName: 'Total' },
    discount: { labelKey: 'discountName', valueKey: 'totalSaved', valueName: 'Total Saved' },
    table: { labelKey: 'tableName', valueKey: 'total_revenue', valueName: 'Revenue' },
    peak: { labelKey: 'day_name', valueKey: 'avg_revenue', valueName: 'Avg Revenue' },
    orderStatus: { labelKey: 'status', valueKey: 'count', valueName: 'Orders' },
    inventory: { labelKey: 'ingredientName', valueKey: 'cost', valueName: 'Total Cost' },
  };

  if (mappings[reportKey]) return mappings[reportKey];

  // Fallback: use first string key as label, first number key as value
  const labelKey = keys.find(k => typeof sample[k] === 'string') ?? keys[0] ?? 'key';
  const valueKey = keys.find(k => typeof sample[k] === 'number') ?? keys[1] ?? keys[0] ?? 'value';
  return { labelKey, valueKey, valueName: valueKey };
}

function RevenueComparisonCard({ data, formatCurrency }: { data: any; formatCurrency: (v: number) => string }) {
  const items = [
    { label: 'Current Period', value: data.current?.revenue ?? 0 },
    { label: 'Previous Period', value: data.previous?.revenue ?? 0 },
    { label: 'Growth', value: data.revenueChange ?? 0, isPercentage: true },
  ];
  return (
    <div className="grid grid-cols-3 gap-4 mt-8">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-50 rounded-xl p-6 text-center">
          <p className="text-xs text-text-muted font-medium uppercase">{item.label}</p>
          {'isPercentage' in item ? (
            <p className={`text-3xl font-bold mt-2 ${Number(item.value) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {Number(item.value) >= 0 ? '+' : ''}{Number(item.value).toFixed(1)}%
            </p>
          ) : (
            <p className="text-3xl font-bold text-text-primary mt-2">{formatCurrency(Number(item.value))}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function FeedbackCard({ data }: { data: any }) {
  const dist = data.distribution ?? [];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-5xl font-bold text-primary">{Number(data.averages?.avg_overall ?? 0).toFixed(1)}</p>
          <p className="text-sm text-text-muted mt-1">Average Rating</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-text-primary">{Number(data.averages?.total ?? 0)}</p>
          <p className="text-sm text-text-muted mt-1">Total Reviews</p>
        </div>
      </div>
      {dist.length > 0 && (
        <div className="space-y-2 max-w-sm mx-auto">
          {dist.map((d: any) => (
            <div key={d.rating} className="flex items-center gap-3">
              <span className="text-sm font-medium w-8">{d.rating} ★</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${data.averages?.total ? (d.count / Number(data.averages.total)) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-text-muted w-8 text-right">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
