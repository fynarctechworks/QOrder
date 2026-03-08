import { apiClient } from './apiClient';
import type { Section } from '../types';

export const sectionService = {
  async getAll(): Promise<Section[]> {
    return apiClient.get<Section[]>('/sections');
  },

  async getById(id: string): Promise<Section> {
    return apiClient.get<Section>(`/sections/${id}`);
  },

  async create(data: { name: string; floor?: number | null; sortOrder?: number }): Promise<Section> {
    return apiClient.post<Section>('/sections', data);
  },

  async update(id: string, data: { name?: string; floor?: number | null; sortOrder?: number; isActive?: boolean }): Promise<Section> {
    return apiClient.patch<Section>(`/sections/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete(`/sections/${id}`);
  },
};
