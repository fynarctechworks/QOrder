import { apiClient } from './apiClient';

interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
  branchId?: string;
}

function buildParams(query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

export const reportService = {
  hourlySales: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { hour: number; orders: number; revenue: number }[] }>(`/reports/hourly-sales?${buildParams(q as Record<string, string | undefined>)}`),

  dailySales: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { date: string; orders: number; revenue: number; avg_order: number }[] }>(`/reports/daily-sales?${buildParams(q as Record<string, string | undefined>)}`),

  weeklySales: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { week: string; orders: number; revenue: number }[] }>(`/reports/weekly-sales?${buildParams(q as Record<string, string | undefined>)}`),

  monthlySales: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { month: string; orders: number; revenue: number }[] }>(`/reports/monthly-sales?${buildParams(q as Record<string, string | undefined>)}`),

  categoryPerformance: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { categoryId: string; categoryName: string; items_sold: number; revenue: number; order_count: number }[] }>(`/reports/category-performance?${buildParams(q as Record<string, string | undefined>)}`),

  itemPerformance: (q: DateRangeQuery & { limit?: string } = {}) =>
    apiClient.get<{ success: boolean; data: { menuItemId: string; itemName: string; categoryName: string; quantity: number; revenue: number; order_count: number }[] }>(`/reports/item-performance?${buildParams(q as Record<string, string | undefined>)}`),

  paymentBreakdown: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { method: string; count: number; total: number }[] }>(`/reports/payment-breakdown?${buildParams(q as Record<string, string | undefined>)}`),

  discountReport: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { discountId: string; discountName: string; usageCount: number; totalSaved: number }[] }>(`/reports/discount-report?${buildParams(q as Record<string, string | undefined>)}`),

  tableUtilization: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { tableId: string; tableName: string; session_count: number; total_revenue: number; avg_session_minutes: number }[] }>(`/reports/table-utilization?${buildParams(q as Record<string, string | undefined>)}`),

  feedbackSummary: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { averages: { avg_overall: number; avg_food: number; avg_service: number; avg_ambience: number; total: number }; distribution: { rating: number; count: number }[] } }>(`/reports/feedback-summary?${buildParams(q as Record<string, string | undefined>)}`),

  revenueComparison: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { current: { revenue: number; orders: number }; previous: { revenue: number; orders: number }; revenueChange: number; ordersChange: number } }>(`/reports/revenue-comparison?${buildParams(q as Record<string, string | undefined>)}`),

  inventoryConsumption: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { ingredientId: string; ingredientName: string; unit: string; total_consumed: number; cost: number }[] }>(`/reports/inventory-consumption?${buildParams(q as Record<string, string | undefined>)}`),

  peakDayAnalysis: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { day_of_week: number; day_name: string; avg_orders: number; avg_revenue: number }[] }>(`/reports/peak-day-analysis?${buildParams(q as Record<string, string | undefined>)}`),

  orderStatusBreakdown: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { status: string; _count: { _all: number } }[] }>(`/reports/order-status?${buildParams(q as Record<string, string | undefined>)}`),

  avgPrepTime: (q: DateRangeQuery = {}) =>
    apiClient.get<{ success: boolean; data: { avg_prep_minutes: number; total_orders: number } }>(`/reports/avg-prep-time?${buildParams(q as Record<string, string | undefined>)}`),

  // ─── Inventory vs Sales Reports ───

  cogsReport: (q: DateRangeQuery = {}) =>
    apiClient.get<{ menuItemId: string; itemName: string; categoryName: string; qty_sold: number; revenue: number; ingredient_cost: number; profit: number; margin_pct: number }[]>(`/reports/cogs?${buildParams(q as Record<string, string | undefined>)}`),

  inventoryVsRevenue: (q: DateRangeQuery = {}) =>
    apiClient.get<{ date: string; revenue: number; cost: number; profit: number; orders: number }[]>(`/reports/inventory-vs-revenue?${buildParams(q as Record<string, string | undefined>)}`),

  stockForecast: (q: DateRangeQuery = {}) =>
    apiClient.get<{ ingredientId: string; ingredientName: string; unit: string; current_stock: number; min_stock: number; daily_usage: number; days_remaining: number; status: string }[]>(`/reports/stock-forecast?${buildParams(q as Record<string, string | undefined>)}`),

  wastageVariance: (q: DateRangeQuery = {}) =>
    apiClient.get<{ ingredientId: string; ingredientName: string; unit: string; expected: number; actual: number; waste: number; variance: number; variance_pct: number; variance_cost: number }[]>(`/reports/wastage-variance?${buildParams(q as Record<string, string | undefined>)}`),

  topProfitableItems: (q: DateRangeQuery & { limit?: string } = {}) =>
    apiClient.get<{ menuItemId: string; itemName: string; categoryName: string; qty_sold: number; selling_price: number; cost_price: number; profit_per_unit: number; total_profit: number; margin_pct: number }[]>(`/reports/top-profitable-items?${buildParams(q as Record<string, string | undefined>)}`),

  // ─── New Reports ───

  salesSummary: (q: DateRangeQuery = {}) =>
    apiClient.get<any>(`/reports/sales-summary?${buildParams(q as Record<string, string | undefined>)}`),

  ordersReport: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/orders-report?${buildParams(q as Record<string, string | undefined>)}`),

  cancelledOrders: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/cancelled-orders?${buildParams(q as Record<string, string | undefined>)}`),

  topSellingItems: (q: DateRangeQuery & { limit?: string } = {}) =>
    apiClient.get<any[]>(`/reports/top-selling-items?${buildParams(q as Record<string, string | undefined>)}`),

  lowPerformingItems: (q: DateRangeQuery & { limit?: string } = {}) =>
    apiClient.get<any[]>(`/reports/low-performing-items?${buildParams(q as Record<string, string | undefined>)}`),

  tableActivity: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/table-activity?${buildParams(q as Record<string, string | undefined>)}`),

  taxReport: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/tax-report?${buildParams(q as Record<string, string | undefined>)}`),

  customerReport: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/customer-report?${buildParams(q as Record<string, string | undefined>)}`),

  repeatCustomers: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/repeat-customers?${buildParams(q as Record<string, string | undefined>)}`),

  qrScanReport: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/qr-scan-report?${buildParams(q as Record<string, string | undefined>)}`),

  qrConversion: (q: DateRangeQuery = {}) =>
    apiClient.get<any>(`/reports/qr-conversion?${buildParams(q as Record<string, string | undefined>)}`),

  tableQrPerformance: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/table-qr-performance?${buildParams(q as Record<string, string | undefined>)}`),

  peakHoursReport: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/peak-hours?${buildParams(q as Record<string, string | undefined>)}`),

  menuPerformance: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/menu-performance?${buildParams(q as Record<string, string | undefined>)}`),

  // Order analysis reports
  ordersSummary: (q: DateRangeQuery = {}) =>
    apiClient.get<any>(`/reports/orders-summary?${buildParams(q as Record<string, string | undefined>)}`),

  orderTypeBreakdown: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/order-type-breakdown?${buildParams(q as Record<string, string | undefined>)}`),

  orderCompletionRate: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/order-completion-rate?${buildParams(q as Record<string, string | undefined>)}`),

  avgOrderValueTrend: (q: DateRangeQuery = {}) =>
    apiClient.get<any[]>(`/reports/avg-order-value-trend?${buildParams(q as Record<string, string | undefined>)}`),
};
