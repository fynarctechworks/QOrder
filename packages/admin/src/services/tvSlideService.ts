import { apiClient } from './apiClient';

export interface TVSlide {
  id: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  branchId: string | null;
  createdAt: string;
}

export const tvSlideService = {
  async list(): Promise<TVSlide[]> {
    return apiClient.get<TVSlide[]>('/tv-slides');
  },

  async upload(file: File, branchId?: string | null): Promise<TVSlide> {
    const formData = new FormData();
    formData.append('image', file);
    if (branchId) formData.append('branchId', branchId);
    return apiClient.upload<TVSlide>('/tv-slides', formData);
  },

  async reorder(slideIds: string[]): Promise<void> {
    return apiClient.patch('/tv-slides/reorder', { slideIds });
  },

  async toggleActive(id: string, isActive: boolean): Promise<TVSlide> {
    return apiClient.patch<TVSlide>(`/tv-slides/${id}`, { isActive });
  },

  async remove(id: string): Promise<void> {
    return apiClient.delete(`/tv-slides/${id}`);
  },
};
