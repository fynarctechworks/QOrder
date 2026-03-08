import { apiClient } from './apiClient';

export interface CreditAccount {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimit?: number | null;
  balance: number;
  notes?: string | null;
  isActive: boolean;
  customerId?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { transactions: number };
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: 'CHARGE' | 'REPAYMENT';
  method?: string | null;
  orderId?: string | null;
  sessionId?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  accountId: string;
}

export interface CreditSummary {
  totalAccounts: number;
  totalOutstanding: number;
  accountsWithBalance: number;
}

export const creditService = {
  async getAccounts(params?: { search?: string; active?: boolean }): Promise<CreditAccount[]> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.active !== undefined) query.set('active', String(params.active));
    const qs = query.toString();
    return apiClient.get<CreditAccount[]>(`/credit${qs ? `?${qs}` : ''}`);
  },

  async getAccount(id: string): Promise<CreditAccount & { transactions: CreditTransaction[] }> {
    return apiClient.get(`/credit/${id}`);
  },

  async createAccount(data: {
    name: string;
    phone?: string;
    email?: string;
    creditLimit?: number;
    notes?: string;
  }): Promise<CreditAccount> {
    return apiClient.post<CreditAccount>('/credit', data);
  },

  async updateAccount(id: string, data: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    creditLimit?: number | null;
    notes?: string | null;
    isActive?: boolean;
  }): Promise<CreditAccount> {
    return apiClient.patch<CreditAccount>(`/credit/${id}`, data);
  },

  async deleteAccount(id: string): Promise<void> {
    return apiClient.delete(`/credit/${id}`);
  },

  async chargeToAccount(id: string, data: {
    amount: number;
    orderId?: string;
    sessionId?: string;
    notes?: string;
  }): Promise<CreditTransaction> {
    return apiClient.post<CreditTransaction>(`/credit/${id}/charge`, data);
  },

  async recordRepayment(id: string, data: {
    amount: number;
    method?: string;
    reference?: string;
    notes?: string;
  }): Promise<CreditTransaction> {
    return apiClient.post<CreditTransaction>(`/credit/${id}/repayment`, data);
  },

  async getTransactions(id: string, page = 1): Promise<{ transactions: CreditTransaction[]; total: number }> {
    return apiClient.get(`/credit/${id}/transactions?page=${page}`);
  },

  async getSummary(): Promise<CreditSummary> {
    return apiClient.get<CreditSummary>('/credit/summary');
  },
};
