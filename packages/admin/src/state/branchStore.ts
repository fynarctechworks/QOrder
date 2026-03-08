import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BranchStoreState {
  /** Currently selected branch ID, or null for "All branches" */
  activeBranchId: string | null;
  /** Cached branch name for display */
  activeBranchName: string | null;

  setActiveBranch: (branchId: string | null, branchName?: string | null) => void;
  clearBranch: () => void;
}

export const useBranchStore = create<BranchStoreState>()(
  persist(
    (set) => ({
      activeBranchId: null,
      activeBranchName: null,

      setActiveBranch: (branchId, branchName = null) => {
        set({ activeBranchId: branchId, activeBranchName: branchName });
      },

      clearBranch: () => {
        set({ activeBranchId: null, activeBranchName: null });
      },
    }),
    {
      name: 'branch-storage',
    }
  )
);
