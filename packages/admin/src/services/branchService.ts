import { apiClient } from './apiClient';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tables: number;
    sections: number;
    users: number;
    orders: number;
  };
  users?: Array<{
    id: string;
    user: {
      id: string;
      name: string;
      email?: string | null;
      username: string;
      role: string;
      roleTitle?: string | null;
      isActive: boolean;
    };
  }>;
}

export interface CreateBranchInput {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
}

export const branchService = {
  async getAll(): Promise<Branch[]> {
    return apiClient.get<Branch[]>('/branches');
  },

  async getById(id: string): Promise<Branch> {
    return apiClient.get<Branch>(`/branches/${id}`);
  },

  async getMyBranches(): Promise<Branch[]> {
    return apiClient.get<Branch[]>('/branches/my');
  },

  async create(data: CreateBranchInput): Promise<Branch> {
    return apiClient.post<Branch>('/branches', data);
  },

  async update(id: string, data: UpdateBranchInput): Promise<Branch> {
    return apiClient.patch<Branch>(`/branches/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/branches/${id}`);
  },

  async assignUsers(branchId: string, userIds: string[]): Promise<void> {
    await apiClient.post(`/branches/${branchId}/users`, { userIds });
  },

  async removeUsers(branchId: string, userIds: string[]): Promise<void> {
    await apiClient.delete(`/branches/${branchId}/users`, { userIds });
  },
};
