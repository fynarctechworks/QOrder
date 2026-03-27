import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBranchStore } from '../state/branchStore';
import { branchService } from '../services/branchService';

export default function BranchSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { activeBranchId, activeBranchName, setActiveBranch } = useBranchStore();
  const queryClient = useQueryClient();

  /** Switch branch and refetch all data with the new X-Branch-Id header */
  const switchBranch = useCallback(
    (branchId: string | null, branchName: string | null) => {
      setActiveBranch(branchId, branchName);
      setIsOpen(false);
      // Invalidate every cached query so pages refetch with the new header
      queryClient.invalidateQueries();
    },
    [setActiveBranch, queryClient],
  );

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: branchService.getAll,
    staleTime: 60_000,
  });

  // If the persisted branch no longer exists in the fetched list, reset to first branch
  // Also auto-select the first active branch if nothing is selected yet
  useEffect(() => {
    if (isLoading || branches.length === 0) return;
    const activeBranches = branches.filter((b) => b.isActive);
    if (activeBranchId) {
      const stillExists = activeBranches.some((b) => b.id === activeBranchId);
      if (!stillExists) {
        const first = activeBranches[0];
        switchBranch(first?.id ?? null, first?.name ?? null);
      }
    } else {
      const first = activeBranches[0];
      if (first) switchBranch(first.id, first.name);
    }
  }, [isLoading, branches, activeBranchId, switchBranch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Don't render while loading or if there are no branches
  if (isLoading) return null;
  if (branches.length === 0) return null;

  const displayName = activeBranchName || 'All Branches';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface-secondary rounded-lg hover:bg-surface-tertiary transition-colors border border-border"
      >
        {/* Branch icon */}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        <span className="max-w-[120px] truncate">{displayName}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-[calc(100vw-2rem)] sm:w-56 bg-surface rounded-xl shadow-lg border border-border z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* All branches option */}
          <button
            onClick={() => switchBranch(null, null)}
            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-surface-secondary transition-colors ${
              !activeBranchId ? 'text-primary font-semibold bg-primary/5' : 'text-text-primary'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            All Branches
            {!activeBranchId && (
              <svg className="w-4 h-4 ml-auto text-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <div className="h-px bg-border my-1" />

          {isLoading ? (
            <div className="px-4 py-3 text-sm text-text-muted text-center">Loading...</div>
          ) : (
            branches
              .filter((b) => b.isActive)
              .map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => switchBranch(branch.id, branch.name)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-surface-secondary transition-colors ${
                    activeBranchId === branch.id
                      ? 'text-primary font-semibold bg-primary/5'
                      : 'text-text-primary'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      branch.isActive ? 'bg-primary' : 'bg-gray-400'
                    }`}
                  />
                  <span className="truncate">{branch.name}</span>
                  <span className="text-xs text-text-muted ml-auto">{branch.code}</span>
                  {activeBranchId === branch.id && (
                    <svg className="w-4 h-4 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))
          )}
        </div>
      )}
    </div>
  );
}
