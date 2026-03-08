import { apiClient } from './apiClient';
import type { UserRole } from '../types';

export interface StaffMember {
  id: string;
  email?: string | null;
  username: string;
  name: string;
  role: UserRole;
  roleTitle?: string | null;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  branches?: Array<{ branch: { id: string; name: string } }>;
}

export interface CreateStaffInput {
  email?: string;
  username: string;
  password: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  roleTitle?: string;
  branchIds?: string[];
}

export interface UpdateStaffInput {
  name?: string;
  email?: string | null;
  username?: string;
  password?: string;
  role?: 'ADMIN' | 'MANAGER' | 'STAFF';
  roleTitle?: string | null;
  isActive?: boolean;
}

export const staffService = {
  async list(): Promise<StaffMember[]> {
    return apiClient.get<StaffMember[]>('/staff');
  },

  async create(input: CreateStaffInput): Promise<StaffMember> {
    return apiClient.post<StaffMember>('/staff', input);
  },

  async update(id: string, input: UpdateStaffInput): Promise<StaffMember> {
    return apiClient.patch<StaffMember>(`/staff/${id}`, input);
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await apiClient.post(`/staff/${id}/reset-password`, { newPassword });
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/staff/${id}`);
  },

  async updateBranches(id: string, branchIds: string[]): Promise<void> {
    await apiClient.patch(`/staff/${id}/branches`, { branchIds });
  },
};
