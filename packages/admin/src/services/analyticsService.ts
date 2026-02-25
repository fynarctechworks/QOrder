import { apiClient } from './apiClient';
import type { AnalyticsSummary } from '../types';

interface AnalyticsQuery {
  startDate?: string;
  endDate?: string;
  period?: 'day' | 'week' | 'month';
}

export const analyticsService = {
  async getSummary(query: AnalyticsQuery = {}): Promise<AnalyticsSummary> {
    const params = new URLSearchParams();
    if (query.startDate) params.set('startDate', query.startDate);
    if (query.endDate) params.set('endDate', query.endDate);
    if (query.period) params.set('period', query.period);

    return apiClient.get<AnalyticsSummary>(`/orders/analytics?${params}`);
  },

  async getDailyRevenue(days: number = 30): Promise<AnalyticsSummary['dailyRevenue']> {
    return apiClient.get(`/orders/analytics/daily-revenue?days=${days}`);
  },

  async getTopItems(limit: number = 5): Promise<AnalyticsSummary['topItems']> {
    return apiClient.get(`/orders/analytics/top-items?limit=${limit}`);
  },

  async getHourlyData(): Promise<AnalyticsSummary['hourlyData']> {
    return apiClient.get('/orders/analytics/hourly');
  },
};
