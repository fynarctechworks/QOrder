import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { reportService } from '../services/reportService';
import { useCurrency } from '../hooks/useCurrency';

const REPORT_CATEGORIES = [
  {
    label: 'Sales',
    items: [
      { key: 'salesSummary', label: 'Sales Summary', type: 'bar' },
      { key: 'daily', label: 'Daily Sales', type: 'line' },
      { key: 'monthly', label: 'Monthly Sales', type: 'bar' },
      { key: 'hourly', label: 'Hourly Sales', type: 'bar' },
      { key: 'weekly', label: 'Weekly Sales', type: 'bar' },
    ],
  },
  {
    label: 'Orders',
    items: [
      { key: 'ordersSummary', label: 'Orders Summary', type: 'bar' },
      { key: 'orderTypeBreakdown', label: 'Order Type Breakdown', type: 'pie' },
      { key: 'ordersReport', label: 'Orders Report', type: 'bar' },
      { key: 'orderStatus', label: 'Order Status', type: 'pie' },
      { key: 'orderCompletionRate', label: 'Order Completion Rate', type: 'bar' },
      { key: 'avgOrderValueTrend', label: 'Avg Order Value Trend', type: 'line' },
      { key: 'cancelledOrders', label: 'Cancelled Orders', type: 'bar' },
    ],
  },
  {
    label: 'Menu',
    items: [
      { key: 'item', label: 'Item Sales', type: 'bar' },
      { key: 'category', label: 'Category Sales', type: 'pie' },
      { key: 'topSelling', label: 'Top Selling Items', type: 'bar' },
      { key: 'lowPerforming', label: 'Low Performing Items', type: 'bar' },
    ],
  },
  {
    label: 'Tables',
    items: [
      { key: 'table', label: 'Table-wise Sales', type: 'bar' },
      { key: 'tableActivity', label: 'Table Activity', type: 'bar' },
    ],
  },
  {
    label: 'Payment & Financial',
    items: [
      { key: 'payment', label: 'Payment Methods', type: 'pie' },
      { key: 'discount', label: 'Discount Report', type: 'bar' },
      { key: 'taxReport', label: 'Tax Report', type: 'line' },
      { key: 'revenue', label: 'Revenue Comparison', type: 'bar' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { key: 'customerReport', label: 'Customer Report', type: 'bar' },
      { key: 'repeatCustomers', label: 'Repeat Customers', type: 'bar' },
    ],
  },
  {
    label: 'QR System',
    items: [
      { key: 'qrScans', label: 'QR Scan Report', type: 'bar' },
      { key: 'qrConversion', label: 'QR Conversion', type: 'bar' },
      { key: 'tableQrPerf', label: 'Table QR Performance', type: 'bar' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { key: 'peakHours', label: 'Peak Hours', type: 'bar' },
      { key: 'peak', label: 'Peak Day Analysis', type: 'bar' },
      { key: 'menuPerformance', label: 'Menu Performance', type: 'bar' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'feedback', label: 'Feedback Summary', type: 'bar' },
      { key: 'prepTime', label: 'Avg Prep Time', type: 'bar' },
      { key: 'inventory', label: 'Inventory Consumption', type: 'bar' },
    ],
  },
  {
    label: 'Inventory vs Sales',
    items: [
      { key: 'cogs', label: 'Cost of Goods Sold', type: 'bar' },
      { key: 'invVsRev', label: 'Inventory Cost vs Revenue', type: 'line' },
      { key: 'stockForecast', label: 'Stock Forecast', type: 'bar' },
      { key: 'wastage', label: 'Wastage / Variance', type: 'bar' },
      { key: 'topProfit', label: 'Top Profitable Items', type: 'bar' },
    ],
  },
];

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

/* ═══ Column definitions for tabular view & Excel export ═══ */
interface ColDef { header: string; key: string; format?: 'currency' | 'number' | 'percent' | 'text'; }

const TABLE_COLUMNS: Record<string, ColDef[]> = {
  hourly:    [{ header: 'Hour', key: 'hour', format: 'text' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }],
  daily:     [{ header: 'Date', key: 'date', format: 'text' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Avg Order', key: 'avg_order', format: 'currency' }],
  weekly:    [{ header: 'Week', key: 'week', format: 'text' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }],
  monthly:   [{ header: 'Month', key: 'month', format: 'text' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }],
  category:  [{ header: 'Category', key: 'categoryName', format: 'text' }, { header: 'Items Sold', key: 'items_sold', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Orders', key: 'order_count', format: 'number' }],
  item:      [{ header: 'Item', key: 'itemName', format: 'text' }, { header: 'Category', key: 'categoryName', format: 'text' }, { header: 'Qty Sold', key: 'quantity', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Orders', key: 'order_count', format: 'number' }],
  payment:   [{ header: 'Method', key: 'method', format: 'text' }, { header: 'Transactions', key: 'count', format: 'number' }, { header: 'Total Amount', key: 'total', format: 'currency' }],
  discount:  [{ header: 'Discount', key: 'discountName', format: 'text' }, { header: 'Times Used', key: 'usageCount', format: 'number' }, { header: 'Total Saved', key: 'totalSaved', format: 'currency' }],
  table:     [{ header: 'Table', key: 'tableName', format: 'text' }, { header: 'Sessions', key: 'session_count', format: 'number' }, { header: 'Revenue', key: 'total_revenue', format: 'currency' }, { header: 'Avg Duration (min)', key: 'avg_session_minutes', format: 'number' }],
  peak:      [{ header: 'Day', key: 'day_name', format: 'text' }, { header: 'Avg Orders', key: 'avg_orders', format: 'number' }, { header: 'Avg Revenue', key: 'avg_revenue', format: 'currency' }],
  orderStatus: [{ header: 'Status', key: 'status', format: 'text' }, { header: 'Count', key: 'count', format: 'number' }],
  inventory: [{ header: 'Ingredient', key: 'ingredientName', format: 'text' }, { header: 'Unit', key: 'unit', format: 'text' }, { header: 'Consumed', key: 'total_consumed', format: 'number' }, { header: 'Cost', key: 'cost', format: 'currency' }],
  // Special reports (non-array) — columns used only for Excel export
  revenue:   [{ header: 'Period', key: 'period', format: 'text' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Orders', key: 'orders', format: 'number' }],
  feedback:  [{ header: 'Rating', key: 'rating', format: 'text' }, { header: 'Count', key: 'count', format: 'number' }],
  prepTime:  [{ header: 'Metric', key: 'metric', format: 'text' }, { header: 'Value', key: 'value', format: 'text' }],
  // Inventory vs Sales reports
  cogs:          [{ header: 'Item', key: 'itemName', format: 'text' }, { header: 'Category', key: 'categoryName', format: 'text' }, { header: 'Qty Sold', key: 'qty_sold', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Ingredient Cost', key: 'ingredient_cost', format: 'currency' }, { header: 'Profit', key: 'profit', format: 'currency' }, { header: 'Margin %', key: 'margin_pct', format: 'percent' }],
  invVsRev:      [{ header: 'Month', key: 'date', format: 'text' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Inv. Cost', key: 'cost', format: 'currency' }, { header: 'Profit', key: 'profit', format: 'currency' }, { header: 'Orders', key: 'orders', format: 'number' }],
  stockForecast: [{ header: 'Ingredient', key: 'ingredientName', format: 'text' }, { header: 'Unit', key: 'unit', format: 'text' }, { header: 'Current Stock', key: 'current_stock', format: 'number' }, { header: 'Min Stock', key: 'min_stock', format: 'number' }, { header: 'Daily Usage', key: 'daily_usage', format: 'number' }, { header: 'Days Remaining', key: 'days_remaining', format: 'number' }, { header: 'Status', key: 'status', format: 'text' }],
  wastage:       [{ header: 'Ingredient', key: 'ingredientName', format: 'text' }, { header: 'Unit', key: 'unit', format: 'text' }, { header: 'Expected', key: 'expected', format: 'number' }, { header: 'Actual', key: 'actual', format: 'number' }, { header: 'Waste', key: 'waste', format: 'number' }, { header: 'Variance', key: 'variance', format: 'number' }, { header: 'Variance %', key: 'variance_pct', format: 'percent' }, { header: 'Variance Cost', key: 'variance_cost', format: 'currency' }],
  topProfit:     [{ header: 'Item', key: 'itemName', format: 'text' }, { header: 'Category', key: 'categoryName', format: 'text' }, { header: 'Qty Sold', key: 'qty_sold', format: 'number' }, { header: 'Sell Price', key: 'selling_price', format: 'currency' }, { header: 'Cost Price', key: 'cost_price', format: 'currency' }, { header: 'Profit/Unit', key: 'profit_per_unit', format: 'currency' }, { header: 'Total Profit', key: 'total_profit', format: 'currency' }, { header: 'Margin %', key: 'margin_pct', format: 'percent' }],
  // New reports
  salesSummary:  [{ header: 'Metric', key: 'metric', format: 'text' }, { header: 'Value', key: 'value', format: 'text' }],
  ordersReport:  [{ header: 'Order #', key: 'orderNumber', format: 'text' }, { header: 'Status', key: 'status', format: 'text' }, { header: 'Customer', key: 'customerName', format: 'text' }, { header: 'Table', key: 'tableName', format: 'text' }, { header: 'Items', key: 'items', format: 'number' }, { header: 'Subtotal', key: 'subtotal', format: 'currency' }, { header: 'Tax', key: 'tax', format: 'currency' }, { header: 'Discount', key: 'discount', format: 'currency' }, { header: 'Total', key: 'total', format: 'currency' }],
  cancelledOrders: [{ header: 'Order #', key: 'orderNumber', format: 'text' }, { header: 'Customer', key: 'customerName', format: 'text' }, { header: 'Table', key: 'tableName', format: 'text' }, { header: 'Items', key: 'items', format: 'number' }, { header: 'Total', key: 'total', format: 'currency' }],
  topSelling:    [{ header: 'Item', key: 'itemName', format: 'text' }, { header: 'Category', key: 'categoryName', format: 'text' }, { header: 'Qty Sold', key: 'quantity', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Orders', key: 'order_count', format: 'number' }],
  lowPerforming: [{ header: 'Item', key: 'itemName', format: 'text' }, { header: 'Category', key: 'categoryName', format: 'text' }, { header: 'Qty Sold', key: 'quantity', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Orders', key: 'order_count', format: 'number' }],
  tableActivity: [{ header: 'Table', key: 'tableName', format: 'text' }, { header: 'Sessions', key: 'sessions', format: 'number' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Avg Duration (min)', key: 'avg_duration_min', format: 'number' }, { header: 'Revenue', key: 'total_revenue', format: 'currency' }, { header: 'Turnover Rate', key: 'turnover_rate', format: 'number' }],
  taxReport:     [{ header: 'Date', key: 'date', format: 'text' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Subtotal', key: 'subtotal', format: 'currency' }, { header: 'Tax', key: 'tax', format: 'currency' }, { header: 'Total', key: 'total', format: 'currency' }, { header: 'Eff. Tax Rate %', key: 'effective_tax_rate', format: 'percent' }],
  customerReport: [{ header: 'Name', key: 'name', format: 'text' }, { header: 'Phone', key: 'phone', format: 'text' }, { header: 'Visits', key: 'totalVisits', format: 'number' }, { header: 'Total Spend', key: 'totalSpend', format: 'currency' }, { header: 'Avg Order', key: 'avgOrderValue', format: 'currency' }],
  repeatCustomers: [{ header: 'Name', key: 'name', format: 'text' }, { header: 'Phone', key: 'phone', format: 'text' }, { header: 'Visits', key: 'totalVisits', format: 'number' }, { header: 'Total Spend', key: 'totalSpend', format: 'currency' }, { header: 'Avg Order', key: 'avgOrderValue', format: 'currency' }],
  qrScans:       [{ header: 'Date', key: 'date', format: 'text' }, { header: 'Scans', key: 'scans', format: 'number' }, { header: 'Unique Tables', key: 'unique_tables', format: 'number' }, { header: 'Sessions with Orders', key: 'sessions_with_orders', format: 'number' }, { header: 'Conversion %', key: 'conversion_rate', format: 'percent' }],
  qrConversion:  [{ header: 'Metric', key: 'metric', format: 'text' }, { header: 'Value', key: 'value', format: 'text' }],
  tableQrPerf:   [{ header: 'Table', key: 'tableName', format: 'text' }, { header: 'Scans', key: 'scans', format: 'number' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Conversion %', key: 'conversion_rate', format: 'percent' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Avg Order', key: 'avg_order_value', format: 'currency' }],
  peakHours:     [{ header: 'Hour', key: 'hour', format: 'text' }, { header: 'Avg Orders', key: 'avg_orders', format: 'number' }, { header: 'Avg Revenue', key: 'avg_revenue', format: 'currency' }, { header: 'Total Orders', key: 'total_orders', format: 'number' }, { header: 'Total Revenue', key: 'total_revenue', format: 'currency' }],
  menuPerformance: [{ header: 'Category', key: 'categoryName', format: 'text' }, { header: 'Total Items', key: 'total_items', format: 'number' }, { header: 'Available', key: 'available_items', format: 'number' }, { header: 'Avg Price', key: 'avg_price', format: 'currency' }, { header: 'Items Sold', key: 'items_sold', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }],
  // Order analysis reports
  ordersSummary: [{ header: 'Metric', key: 'metric', format: 'text' }, { header: 'Value', key: 'value', format: 'text' }],
  orderTypeBreakdown: [{ header: 'Order Type', key: 'order_type', format: 'text' }, { header: 'Count', key: 'count', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }, { header: 'Avg Order Value', key: 'avg_order_value', format: 'currency' }],
  orderCompletionRate: [{ header: 'Status', key: 'status', format: 'text' }, { header: 'Count', key: 'count', format: 'number' }, { header: 'Percentage', key: 'percentage', format: 'percent' }],
  avgOrderValueTrend: [{ header: 'Date', key: 'date', format: 'text' }, { header: 'Avg Order Value', key: 'avg_order_value', format: 'currency' }, { header: 'Orders', key: 'orders', format: 'number' }, { header: 'Revenue', key: 'revenue', format: 'currency' }],
};

/** Normalize special (non-array) report data into tabular rows */
function normalizeToRows(reportKey: string, data: any): any[] {
  if (Array.isArray(data)) return data;

  if (reportKey === 'revenue') {
    return [
      { period: 'Current Period', revenue: data.current?.revenue ?? 0, orders: data.current?.orders ?? 0 },
      { period: 'Previous Period', revenue: data.previous?.revenue ?? 0, orders: data.previous?.orders ?? 0 },
      { period: 'Change %', revenue: `${(data.revenueChange ?? 0).toFixed(1)}%`, orders: `${(data.ordersChange ?? 0).toFixed(1)}%` },
    ];
  }
  if (reportKey === 'feedback') {
    const rows: any[] = [];
    if (data.averages) {
      rows.push(
        { rating: 'Average Overall', count: Number(data.averages.avg_overall ?? 0).toFixed(1) },
        { rating: 'Avg Food', count: Number(data.averages.avg_food ?? 0).toFixed(1) },
        { rating: 'Avg Service', count: Number(data.averages.avg_service ?? 0).toFixed(1) },
        { rating: 'Avg Ambience', count: Number(data.averages.avg_ambience ?? 0).toFixed(1) },
        { rating: 'Total Reviews', count: Number(data.averages.total ?? 0) },
      );
    }
    if (data.distribution) {
      data.distribution.forEach((d: any) => rows.push({ rating: `${d.rating} Stars`, count: d.count }));
    }
    return rows;
  }
  if (reportKey === 'prepTime') {
    return [
      { metric: 'Average Prep Time', value: `${Number(data.avg_prep_minutes ?? 0).toFixed(1)} min` },
      { metric: 'Total Orders', value: String(Number(data.total_orders ?? 0)) },
    ];
  }
  if (reportKey === 'salesSummary') {
    return [
      { metric: 'Total Revenue', value: data.total_revenue },
      { metric: 'Total Orders', value: data.total_orders },
      { metric: 'Average Order Value', value: data.avg_order_value },
      { metric: 'Total Items Sold', value: data.total_items_sold },
      { metric: 'Total Tax', value: data.total_tax },
      { metric: 'Total Discount', value: data.total_discount },
      { metric: 'Highest Order', value: data.highest_order },
      { metric: 'Lowest Order', value: data.lowest_order },
    ];
  }
  if (reportKey === 'qrConversion') {
    return [
      { metric: 'Total QR Scans', value: data.total_scans },
      { metric: 'Scans with Orders', value: data.scans_with_orders },
      { metric: 'Conversion Rate', value: data.total_scans > 0 ? `${((data.scans_with_orders / data.total_scans) * 100).toFixed(1)}%` : '0%' },
      { metric: 'Total Orders', value: data.total_orders },
      { metric: 'Total Revenue', value: data.total_revenue },
      { metric: 'Avg Time to First Order', value: `${Number(data.avg_time_to_order_min ?? 0).toFixed(1)} min` },
    ];
  }
  if (reportKey === 'ordersSummary') {
    return [
      { metric: 'Total Orders', value: data.total_orders },
      { metric: 'Completed Orders', value: data.completed_orders },
      { metric: 'Cancelled Orders', value: data.cancelled_orders },
      { metric: 'Active Orders', value: data.active_orders },
      { metric: 'Total Revenue', value: data.total_revenue },
      { metric: 'Avg Order Value', value: data.avg_order_value },
      { metric: 'Avg Orders/Day', value: data.avg_orders_per_day },
      { metric: 'Completion Rate', value: `${data.completion_rate}%` },
      { metric: 'Cancellation Rate', value: `${data.cancellation_rate}%` },
    ];
  }
  return [];
}

/** Download data as an Excel file */
function downloadExcel(reportLabel: string, columns: ColDef[], rows: any[], formatCurrency: (v: number) => string) {
  const header = columns.map(c => c.header);
  const body = rows.map(row =>
    columns.map(col => {
      const v = row[col.key];
      if (v == null) return '';
      if (col.format === 'currency' && typeof v === 'number') return formatCurrency(v);
      if (col.format === 'number' && typeof v === 'number') return Number(v.toFixed(2));
      return String(v);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  // Auto-size columns
  ws['!cols'] = columns.map((_, i) => ({
    wch: Math.max(header[i]?.length ?? 0, ...body.map(r => String(r[i] ?? '').length)) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportLabel.slice(0, 31));
  XLSX.writeFile(wb, `${reportLabel.replace(/\s+/g, '_')}_Report.xlsx`);
}

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
  cogs: (f, t, b) => reportService.cogsReport({ startDate: f, endDate: t, branchId: b }),
  invVsRev: (f, t, b) => reportService.inventoryVsRevenue({ startDate: f, endDate: t, branchId: b }),
  stockForecast: (f, t) => reportService.stockForecast({ startDate: f, endDate: t }),
  wastage: (f, t, b) => reportService.wastageVariance({ startDate: f, endDate: t, branchId: b }),
  topProfit: (f, t, b) => reportService.topProfitableItems({ startDate: f, endDate: t, branchId: b }),
  // New reports
  salesSummary: (f, t, b) => reportService.salesSummary({ startDate: f, endDate: t, branchId: b }),
  ordersReport: (f, t, b) => reportService.ordersReport({ startDate: f, endDate: t, branchId: b }),
  cancelledOrders: (f, t, b) => reportService.cancelledOrders({ startDate: f, endDate: t, branchId: b }),
  topSelling: (f, t, b) => reportService.topSellingItems({ startDate: f, endDate: t, branchId: b }),
  lowPerforming: (f, t, b) => reportService.lowPerformingItems({ startDate: f, endDate: t, branchId: b }),
  tableActivity: (f, t, b) => reportService.tableActivity({ startDate: f, endDate: t, branchId: b }),
  taxReport: (f, t, b) => reportService.taxReport({ startDate: f, endDate: t, branchId: b }),
  customerReport: (f, t) => reportService.customerReport({ startDate: f, endDate: t }),
  repeatCustomers: (f, t) => reportService.repeatCustomers({ startDate: f, endDate: t }),
  qrScans: (f, t, b) => reportService.qrScanReport({ startDate: f, endDate: t, branchId: b }),
  qrConversion: (f, t, b) => reportService.qrConversion({ startDate: f, endDate: t, branchId: b }),
  tableQrPerf: (f, t, b) => reportService.tableQrPerformance({ startDate: f, endDate: t, branchId: b }),
  peakHours: (f, t, b) => reportService.peakHoursReport({ startDate: f, endDate: t, branchId: b }),
  menuPerformance: (f, t, b) => reportService.menuPerformance({ startDate: f, endDate: t, branchId: b }),
  // Order analysis reports
  ordersSummary: (f, t, b) => reportService.ordersSummary({ startDate: f, endDate: t, branchId: b }),
  orderTypeBreakdown: (f, t, b) => reportService.orderTypeBreakdown({ startDate: f, endDate: t, branchId: b }),
  orderCompletionRate: (f, t, b) => reportService.orderCompletionRate({ startDate: f, endDate: t, branchId: b }),
  avgOrderValueTrend: (f, t, b) => reportService.avgOrderValueTrend({ startDate: f, endDate: t, branchId: b }),
};

export default function ReportsPage() {
  const formatCurrency = useCurrency();
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(todayStr);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const reportMeta = useMemo(() => {
    if (!activeReport) return null;
    for (const cat of REPORT_CATEGORIES) {
      for (const item of cat.items) {
        if (item.key === activeReport) return item;
      }
    }
    return REPORT_CATEGORIES[0]!.items[0]!;
  }, [activeReport]);

  const { data: result, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['report', activeReport, fromDate, toDate],
    queryFn: () => FETCHER_MAP[activeReport!]!(fromDate, toDate),
    enabled: !!activeReport,
  });

  const reportData = result ?? [];

  const columns = activeReport ? (TABLE_COLUMNS[activeReport] ?? []) : [];
  const tableRows = useMemo(() => activeReport ? normalizeToRows(activeReport, reportData) : [], [activeReport, reportData]);
  const hasData = Array.isArray(reportData) ? reportData.length > 0 : !!reportData;

  const handleDownload = useCallback(() => {
    if (!hasData || columns.length === 0 || !reportMeta) return;
    downloadExcel(reportMeta.label, columns, tableRows, formatCurrency);
  }, [hasData, columns, tableRows, reportMeta, formatCurrency]);

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

      <div className="flex gap-6 items-start">
        {/* Sidebar */}
        <div className="w-56 shrink-0 space-y-1 hidden lg:block">
          {REPORT_CATEGORIES.map(cat => {
            const isExpanded = expandedCategory === cat.label;
            const hasActive = cat.items.some(i => i.key === activeReport);
            return (
              <div key={cat.label}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.label)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    hasActive
                      ? 'bg-primary/5 text-primary'
                      : 'text-text-primary hover:bg-gray-50'
                  }`}
                >
                  <span>{cat.label}</span>
                  <svg
                    className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="ml-2 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-2">
                    {cat.items.map(item => (
                      <button key={item.key} onClick={() => setActiveReport(item.key)}
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          activeReport === item.key
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-text-secondary hover:bg-gray-50'
                        }`}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile selector */}
        <select value={activeReport ?? ''} onChange={e => setActiveReport(e.target.value)}
          className="lg:hidden w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4">
          {REPORT_CATEGORIES.map(c => (
            <optgroup key={c.label} label={c.label}>
              {c.items.map(i => (
                <option key={i.key} value={i.key}>{i.label}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Chart / Table Area */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 min-h-[500px] sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto">
          {!activeReport ? (
            <div className="flex items-center justify-center h-80">
              <div className="text-center space-y-3">
                <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-text-muted text-sm">Select a report from the sidebar to get started</p>
              </div>
            </div>
          ) : (<>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-text-primary">{reportMeta?.label}</h2>
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button onClick={() => setViewMode('chart')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'chart' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
                  }`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  Chart
                </button>
                <button onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
                  }`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Table
                </button>
              </div>
              {/* Download Button */}
              <button onClick={handleDownload} disabled={!hasData || isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-text-secondary hover:bg-gray-50 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Export Excel
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-80">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-80">
              <div className="text-center space-y-3">
                <p className="text-red-500">Failed to load report: {error?.message}</p>
                <button className="btn-primary text-sm px-4 py-2" onClick={() => refetch()}>Retry</button>
              </div>
            </div>
          ) : !reportData || (Array.isArray(reportData) && reportData.length === 0) ? (
            <div className="flex items-center justify-center h-80 text-text-muted text-sm">
              No data available for this period
            </div>
          ) : viewMode === 'table' ? (
            <ReportTable columns={columns} rows={tableRows} formatCurrency={formatCurrency} />
          ) : (
            <ReportChart reportKey={activeReport!} data={reportData} chartType={reportMeta!.type} formatCurrency={formatCurrency} />
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}

function ReportTable({ columns, rows, formatCurrency }: {
  columns: { header: string; key: string; format?: string }[];
  rows: Record<string, any>[];
  formatCurrency: (v: number) => string;
}) {
  const formatCell = (value: any, format?: string) => {
    if (value == null || value === '') return '—';
    if (typeof value === 'string') return value;
    switch (format) {
      case 'currency': return formatCurrency(Number(value));
      case 'number': return Number(value).toLocaleString();
      case 'percent': return `${Number(value).toFixed(1)}%`;
      default: return String(value);
    }
  };

  return (
    <div className="overflow-auto max-h-[420px] rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2.5 text-left text-xs font-semibold text-text-secondary whitespace-nowrap">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2 whitespace-nowrap text-text-primary">
                  {formatCell(row[col.key], col.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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

  if (reportKey === 'salesSummary' && !Array.isArray(data)) {
    return <SalesSummaryCard data={data} formatCurrency={formatCurrency} />;
  }

  if (reportKey === 'qrConversion' && !Array.isArray(data)) {
    return <QrConversionCard data={data} formatCurrency={formatCurrency} />;
  }

  // ── Orders Summary: metric cards ──
  if (reportKey === 'ordersSummary' && !Array.isArray(data)) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Total Orders', value: data.total_orders, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Completed', value: data.completed_orders, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Cancelled', value: data.cancelled_orders, color: 'text-red-500', bg: 'bg-red-50' },
            { label: 'Active', value: data.active_orders, color: 'text-violet-600', bg: 'bg-violet-50' },
            { label: 'Avg Orders/Day', value: data.avg_orders_per_day, color: 'text-sky-600', bg: 'bg-sky-50' },
            { label: 'Avg Order Value', value: formatCurrency(data.avg_order_value || 0), color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-4 ${s.bg}`}>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-4 bg-green-50">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Completion Rate</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{data.completion_rate}%</p>
          </div>
          <div className="rounded-xl p-4 bg-red-50">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Cancellation Rate</p>
            <p className="text-3xl font-bold mt-1 text-red-500">{data.cancellation_rate}%</p>
          </div>
        </div>
        <div className="rounded-xl p-4 bg-gray-50">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Total Revenue</p>
          <p className="text-3xl font-bold mt-1 text-text-primary">{formatCurrency(data.total_revenue || 0)}</p>
        </div>
      </div>
    );
  }

  // ── Order Type Breakdown: pie chart with type labels ──
  if (reportKey === 'orderTypeBreakdown' && Array.isArray(data)) {
    const TYPE_LABELS: Record<string, string> = { DINE_IN: 'Dine In', TAKEAWAY: 'Takeaway', QSR: 'QSR' };
    const labeled = data.map((d: any) => ({ ...d, label: TYPE_LABELS[d.order_type] || d.order_type }));
    return (
      <div className="space-y-4">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={labeled} dataKey="count" nameKey="label" cx="50%" cy="50%"
              outerRadius={120} innerRadius={50} paddingAngle={3}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {labeled.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number, name: string) => [v, name]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-3 gap-3">
          {labeled.map((d: any, i: number) => (
            <div key={d.order_type} className="rounded-xl border border-gray-100 p-3 text-center">
              <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <p className="text-sm font-semibold text-text-primary">{d.label}</p>
              <p className="text-lg font-bold text-text-primary">{d.count}</p>
              <p className="text-xs text-text-muted">{formatCurrency(d.revenue)}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Order Completion Rate: horizontal bar chart ──
  if (reportKey === 'orderCompletionRate' && Array.isArray(data)) {
    const STATUS_COLORS: Record<string, string> = {
      COMPLETED: '#22c55e', CANCELLED: '#ef4444', PENDING: '#f59e0b',
      PREPARING: '#f97316', READY: '#06b6d4', PAYMENT_PENDING: '#6366f1',
    };
    const colored = data.map((d: any) => ({ ...d, fill: STATUS_COLORS[d.status] ?? '#94a3b8' }));
    return (
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 50)}>
        <BarChart data={colored} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={90} />
          <Tooltip formatter={(v: number, name: string) => [name === 'percentage' ? `${v}%` : v, name === 'percentage' ? 'Percentage' : 'Count']} />
          <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
            {colored.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Avg Order Value Trend: line chart ──
  if (reportKey === 'avgOrderValueTrend' && Array.isArray(data)) {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={data} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [name.includes('Order Value') ? formatCurrency(v) : v, name]} />
          <Legend />
          <Line type="monotone" dataKey="avg_order_value" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} name="Avg Order Value" />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ── Tax Report: dual line chart (subtotal + tax) ──
  if (reportKey === 'taxReport' && Array.isArray(data)) {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={data} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} />
          <Legend />
          <Line type="monotone" dataKey="subtotal" stroke="#6366f1" strokeWidth={2} name="Subtotal" dot={{ r: 2 }} />
          <Line type="monotone" dataKey="tax" stroke="#ef4444" strokeWidth={2} name="Tax" dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ── Peak Hours: bar with two series ──
  if (reportKey === 'peakHours' && Array.isArray(data)) {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h) => `${h}:00`} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [name.includes('Revenue') ? formatCurrency(v) : v, name]} labelFormatter={(h) => `${h}:00`} />
          <Legend />
          <Bar dataKey="avg_orders" fill="#6366f1" radius={[4, 4, 0, 0]} name="Avg Orders" />
          <Bar dataKey="avg_revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Avg Revenue" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Table Activity: stacked bar chart ──
  if (reportKey === 'tableActivity' && Array.isArray(data)) {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data.slice(0, 30)} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="tableName" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [name.includes('Revenue') ? formatCurrency(v) : v, name]} />
          <Legend />
          <Bar dataKey="sessions" fill="#6366f1" radius={[4, 4, 0, 0]} name="Sessions" />
          <Bar dataKey="orders" fill="#22c55e" radius={[4, 4, 0, 0]} name="Orders" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── QR Scans: combo chart ──
  if (reportKey === 'qrScans' && Array.isArray(data)) {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="scans" fill="#6366f1" radius={[4, 4, 0, 0]} name="Scans" />
          <Bar dataKey="sessions_with_orders" fill="#22c55e" radius={[4, 4, 0, 0]} name="With Orders" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Table QR Performance: multi-bar ──
  if (reportKey === 'tableQrPerf' && Array.isArray(data)) {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data.slice(0, 30)} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="tableName" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="scans" fill="#6366f1" radius={[4, 4, 0, 0]} name="Scans" />
          <Bar dataKey="orders" fill="#22c55e" radius={[4, 4, 0, 0]} name="Orders" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Menu Performance: grouped bar ──
  if (reportKey === 'menuPerformance' && Array.isArray(data)) {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="categoryName" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [name.includes('Revenue') || name.includes('Price') ? formatCurrency(v) : v, name]} />
          <Legend />
          <Bar dataKey="items_sold" fill="#6366f1" radius={[4, 4, 0, 0]} name="Items Sold" />
          <Bar dataKey="total_items" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Total Items" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const chartData = Array.isArray(data) ? data : [];
  if (chartData.length === 0) {
    return <div className="flex items-center justify-center h-80 text-text-muted text-sm">No data available</div>;
  }

  // ── Inventory vs Revenue: dual bar chart (revenue + cost + profit) ──
  if (reportKey === 'invVsRev') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={chartData} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} />
          <Legend />
          <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name="Revenue" />
          <Bar dataKey="cost" fill="#ef4444" radius={[4, 4, 0, 0]} name="Inv. Cost" />
          <Bar dataKey="profit" fill="#22c55e" radius={[4, 4, 0, 0]} name="Profit" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Stock Forecast: horizontal color-coded bars ──
  if (reportKey === 'stockForecast') {
    const STATUS_COLORS: Record<string, string> = {
      OUT_OF_STOCK: '#ef4444',
      LOW_STOCK: '#f59e0b',
      REORDER_SOON: '#f97316',
      OK: '#22c55e',
    };
    const colored = chartData.map((d: any) => ({
      ...d,
      days_remaining: Math.min(d.days_remaining, 90),
      fill: STATUS_COLORS[d.status] ?? '#6366f1',
    }));
    return (
      <ResponsiveContainer width="100%" height={Math.max(380, colored.length * 32)}>
        <BarChart data={colored} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: 'Days', position: 'insideBottom', offset: -5 }} />
          <YAxis dataKey="ingredientName" type="category" tick={{ fontSize: 10 }} width={90} />
          <Tooltip formatter={(v: number) => [`${v.toFixed(0)} days`, 'Remaining']} />
          <Bar dataKey="days_remaining" name="Days Remaining" radius={[0, 4, 4, 0]}>
            {colored.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── COGS: dual bar (revenue vs ingredient cost) ──
  if (reportKey === 'cogs') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={chartData.slice(0, 20)} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="itemName" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]} />
          <Legend />
          <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name="Revenue" />
          <Bar dataKey="ingredient_cost" fill="#ef4444" radius={[4, 4, 0, 0]} name="Ingredient Cost" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Wastage: dual bar (expected vs actual) ──
  if (reportKey === 'wastage') {
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={chartData.slice(0, 20)} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="ingredientName" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="expected" fill="#6366f1" radius={[4, 4, 0, 0]} name="Expected" />
          <Bar dataKey="actual" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Actual" />
          <Bar dataKey="waste" fill="#ef4444" radius={[4, 4, 0, 0]} name="Waste" />
        </BarChart>
      </ResponsiveContainer>
    );
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
    cogs: { labelKey: 'itemName', valueKey: 'profit', valueName: 'Profit' },
    invVsRev: { labelKey: 'date', valueKey: 'revenue', valueName: 'Revenue' },
    stockForecast: { labelKey: 'ingredientName', valueKey: 'days_remaining', valueName: 'Days Remaining' },
    wastage: { labelKey: 'ingredientName', valueKey: 'variance', valueName: 'Variance' },
    topProfit: { labelKey: 'itemName', valueKey: 'total_profit', valueName: 'Total Profit' },
    // New reports
    topSelling: { labelKey: 'itemName', valueKey: 'quantity', valueName: 'Qty Sold' },
    lowPerforming: { labelKey: 'itemName', valueKey: 'quantity', valueName: 'Qty Sold' },
    tableActivity: { labelKey: 'tableName', valueKey: 'total_revenue', valueName: 'Revenue' },
    taxReport: { labelKey: 'date', valueKey: 'tax', valueName: 'Tax' },
    customerReport: { labelKey: 'name', valueKey: 'totalSpend', valueName: 'Total Spend' },
    repeatCustomers: { labelKey: 'name', valueKey: 'totalVisits', valueName: 'Visits' },
    qrScans: { labelKey: 'date', valueKey: 'scans', valueName: 'Scans' },
    tableQrPerf: { labelKey: 'tableName', valueKey: 'scans', valueName: 'Scans' },
    peakHours: { labelKey: 'hour', valueKey: 'avg_revenue', valueName: 'Avg Revenue' },
    menuPerformance: { labelKey: 'categoryName', valueKey: 'revenue', valueName: 'Revenue' },
    ordersReport: { labelKey: 'orderNumber', valueKey: 'total', valueName: 'Total' },
    cancelledOrders: { labelKey: 'orderNumber', valueKey: 'total', valueName: 'Total' },
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

function SalesSummaryCard({ data, formatCurrency }: { data: any; formatCurrency: (v: number) => string }) {
  const metrics = [
    { label: 'Total Revenue', value: formatCurrency(Number(data.total_revenue ?? 0)), color: 'text-primary' },
    { label: 'Total Orders', value: String(Number(data.total_orders ?? 0)), color: 'text-sky-600' },
    { label: 'Avg Order Value', value: formatCurrency(Number(data.avg_order_value ?? 0)), color: 'text-violet-600' },
    { label: 'Items Sold', value: String(Number(data.total_items_sold ?? 0)), color: 'text-amber-600' },
    { label: 'Total Tax', value: formatCurrency(Number(data.total_tax ?? 0)), color: 'text-red-600' },
    { label: 'Total Discount', value: formatCurrency(Number(data.total_discount ?? 0)), color: 'text-emerald-600' },
    { label: 'Highest Order', value: formatCurrency(Number(data.highest_order ?? 0)), color: 'text-indigo-600' },
    { label: 'Lowest Order', value: formatCurrency(Number(data.lowest_order ?? 0)), color: 'text-rose-600' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
      {metrics.map((m) => (
        <div key={m.label} className="bg-gray-50 rounded-xl p-5 text-center">
          <p className="text-[11px] text-text-muted font-medium uppercase tracking-wide">{m.label}</p>
          <p className={`text-2xl font-bold mt-1.5 ${m.color}`}>{m.value}</p>
        </div>
      ))}
    </div>
  );
}

function QrConversionCard({ data, formatCurrency }: { data: any; formatCurrency: (v: number) => string }) {
  const conversionRate = data.total_scans > 0 ? ((data.scans_with_orders / data.total_scans) * 100).toFixed(1) : '0';
  const metrics = [
    { label: 'Total QR Scans', value: String(Number(data.total_scans ?? 0)) },
    { label: 'Scans with Orders', value: String(Number(data.scans_with_orders ?? 0)) },
    { label: 'Conversion Rate', value: `${conversionRate}%`, highlight: true },
    { label: 'Total Orders', value: String(Number(data.total_orders ?? 0)) },
    { label: 'Total Revenue', value: formatCurrency(Number(data.total_revenue ?? 0)) },
    { label: 'Avg Time to Order', value: `${Number(data.avg_time_to_order_min ?? 0).toFixed(1)} min` },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
      {metrics.map((m) => (
        <div key={m.label} className={`rounded-xl p-5 text-center ${m.highlight ? 'bg-primary/10' : 'bg-gray-50'}`}>
          <p className="text-[11px] text-text-muted font-medium uppercase tracking-wide">{m.label}</p>
          <p className={`text-2xl font-bold mt-1.5 ${m.highlight ? 'text-primary' : 'text-text-primary'}`}>{m.value}</p>
        </div>
      ))}
    </div>
  );
}
