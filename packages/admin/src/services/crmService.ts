import { apiClient } from './apiClient';

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  totalVisits: number;
  totalSpend: number;
  avgOrderValue: number;
  lastVisitAt: string | null;
  firstVisitAt: string | null;
  createdAt: string;
  _count?: { interactions: number };
}

export interface CustomerInteraction {
  id: string;
  type: string;
  summary: string | null;
  amount: number | null;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  interactions: CustomerInteraction[];
}

export interface CrmInsights {
  totalCustomers: number;
  tagDistribution: { tag: string; count: number }[];
  spendDistribution: { bucket: string; count: number }[];
  churnRisk: number;
}

interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const crmService = {
  async getCustomers(query: {
    page?: number;
    limit?: number;
    search?: string;
    tags?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<PaginatedResult<Customer>> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search) params.set('search', query.search);
    if (query.tags) params.set('tags', query.tags);
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortOrder) params.set('sortOrder', query.sortOrder);
    return apiClient.getRaw(`/crm?${params}`);
  },

  async getCustomer(id: string): Promise<{ success: boolean; data: CustomerDetail }> {
    return apiClient.getRaw(`/crm/${id}`);
  },

  async updateCustomer(id: string, data: { name?: string; email?: string; tags?: string[]; notes?: string }) {
    return apiClient.patch(`/crm/${id}`, data);
  },

  async getInsights(): Promise<{ success: boolean; data: CrmInsights }> {
    return apiClient.getRaw('/crm/insights');
  },

  async getTopCustomers(limit = 10, metric = 'totalSpend'): Promise<{ success: boolean; data: Customer[] }> {
    return apiClient.getRaw(`/crm/top?limit=${limit}&metric=${metric}`);
  },
};
