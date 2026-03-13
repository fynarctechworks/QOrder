import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchService, type Branch, type CreateBranchInput, type UpdateBranchInput } from '../services/branchService';
import { useBranchStore } from '../state/branchStore';
import Modal from '../components/Modal';

export default function BranchesPage() {
  const queryClient = useQueryClient();
  const { activeBranchId, activeBranchName, setActiveBranch } = useBranchStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);

  const switchBranch = useCallback(
    (branchId: string | null, branchName: string | null) => {
      setActiveBranch(branchId, branchName);
      queryClient.invalidateQueries();
    },
    [setActiveBranch, queryClient],
  );

  const { data: branches = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['branches'],
    queryFn: branchService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateBranchInput) => branchService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setIsCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBranchInput }) =>
      branchService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setEditingBranch(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => branchService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setDeletingBranch(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      branchService.update(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-error">Failed to load branches: {error instanceof Error ? error.message : 'Unknown error'}</p>
        <button className="btn-primary text-sm" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Branches</h1>
          <p className="text-sm text-text-muted mt-1">
            Manage your restaurant branches and locations
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Branch
        </button>
      </div>

      {/* Active branch indicator + All Branches toggle */}
      <div className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border">
        <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <div className="flex-1">
          <p className="text-xs text-text-muted">Active Branch</p>
          <p className="text-sm font-semibold text-text-primary">{activeBranchName || 'All Branches'}</p>
        </div>
        {activeBranchId && (
          <button
            onClick={() => switchBranch(null, null)}
            className="text-xs px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-tertiary text-text-secondary transition-colors border border-border"
          >
            View All Branches
          </button>
        )}
      </div>

      {/* Branches grid */}
      {branches.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-border">
          <svg className="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h3 className="text-lg font-semibold text-text-primary mb-1">No branches yet</h3>
          <p className="text-sm text-text-muted mb-4">Create your first branch to get started</p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary"
          >
            Add First Branch
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className={`bg-surface rounded-xl border p-5 transition-shadow hover:shadow-md ${
                activeBranchId === branch.id
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border'
              } ${!branch.isActive ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text-primary text-lg">{branch.name}</h3>
                    {activeBranchId === branch.id && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">Active</span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-text-muted bg-surface-secondary px-2 py-0.5 rounded">
                    {branch.code}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingBranch(branch)}
                    className="btn-icon text-text-muted hover:text-primary"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeletingBranch(branch)}
                    className="btn-icon text-text-muted hover:text-error"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {branch.address && (
                <p className="text-sm text-text-muted mb-2 flex items-start gap-1.5">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {branch.address}
                </p>
              )}

              {branch.phone && (
                <p className="text-sm text-text-muted mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {branch.phone}
                </p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border">
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{branch._count?.tables ?? 0}</p>
                  <p className="text-xs text-text-muted">Tables</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{branch._count?.sections ?? 0}</p>
                  <p className="text-xs text-text-muted">Sections</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{branch._count?.users ?? 0}</p>
                  <p className="text-xs text-text-muted">Staff</p>
                </div>
              </div>

              {/* Toggle active */}
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-muted">
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() =>
                      toggleActiveMutation.mutate({ id: branch.id, isActive: !branch.isActive })
                    }
                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                      branch.isActive ? 'bg-primary' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        branch.isActive ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {branch.isActive && (
                  <button
                    onClick={() => switchBranch(
                      activeBranchId === branch.id ? null : branch.id,
                      activeBranchId === branch.id ? null : branch.name
                    )}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                      activeBranchId === branch.id
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'bg-surface-secondary hover:bg-surface-tertiary text-text-secondary'
                    }`}
                  >
                    {activeBranchId === branch.id ? 'Selected' : 'Select'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Branch Modal */}
      {isCreateOpen && (
        <BranchFormModal
          title="Create Branch"
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          error={createMutation.error?.message}
        />
      )}

      {/* Edit Branch Modal */}
      {editingBranch && (
        <BranchFormModal
          title="Edit Branch"
          branch={editingBranch}
          onClose={() => setEditingBranch(null)}
          onSubmit={(data) =>
            updateMutation.mutate({ id: editingBranch.id, data })
          }
          isLoading={updateMutation.isPending}
          error={updateMutation.error?.message}
        />
      )}

      {/* Delete Confirmation */}
      {deletingBranch && (
        <Modal open={!!deletingBranch} title="Delete Branch" onClose={() => setDeletingBranch(null)}>
          <div className="max-w-sm">
            <p className="text-sm text-text-muted mb-4">
              Are you sure you want to delete <strong>{deletingBranch.name}</strong>? This
              action cannot be undone.
            </p>
            {deleteMutation.error && (
              <p className="text-sm text-error mb-3">{deleteMutation.error.message}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingBranch(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingBranch.id)}
                disabled={deleteMutation.isPending}
                className="btn-danger"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ──────────────── Branch Form Modal ──────────────── */

function BranchFormModal({
  title,
  branch,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  title: string;
  branch?: Branch;
  onClose: () => void;
  onSubmit: (data: CreateBranchInput) => void;
  isLoading: boolean;
  error?: string;
}) {
  const [form, setForm] = useState({
    name: branch?.name || '',
    code: branch?.code || '',
    address: branch?.address || '',
    phone: branch?.phone || '',
    email: branch?.email || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: form.name,
      code: form.code.toUpperCase(),
      ...(form.address ? { address: form.address } : {}),
      ...(form.phone ? { phone: form.phone } : {}),
      ...(form.email ? { email: form.email } : {}),
    });
  };

  // Auto-generate code from name if empty
  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      ...(!branch && !prev.code
        ? {
            code: name
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '-')
              .replace(/-+/g, '-')
              .slice(0, 20),
          }
        : {}),
    }));
  };

  return (
    <Modal open title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="w-full max-w-md">

        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Branch Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="input w-full"
              placeholder="e.g., Main Branch, Downtown"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Branch Code *
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="input w-full font-mono uppercase"
              placeholder="e.g., MAIN, DT-01"
              maxLength={20}
              required
            />
            <p className="text-xs text-text-muted mt-1">
              Short unique identifier. Letters, numbers, hyphens, underscores only.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Address
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="input w-full"
              placeholder="123 Main St, City"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input w-full"
                placeholder="+1 555-1234"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input w-full"
                placeholder="branch@example.com"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving...' : branch ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
