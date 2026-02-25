import { create } from 'zustand';

interface UIState {
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isDrawerOpen: false,
  setDrawerOpen: (open) => set({ isDrawerOpen: open }),
}));
