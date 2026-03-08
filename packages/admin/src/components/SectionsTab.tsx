import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { sectionService } from '../services/sectionService';
import type { Section } from '../types';

/* ═══════════════════════ Types ═══════════════════════════ */

interface SectionFormData {
  name: string;
}

const EMPTY_FORM: SectionFormData = { name: '' };

/* ═══════════════════ Create/Edit Modal ═══════════════════ */

function SectionModal({
  isOpen,
  onClose,
  editSection,
}: {
  isOpen: boolean;
  onClose: () => void;
  editSection?: Section | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!editSection;

  const [form, setForm] = useState<SectionFormData>(
    editSection
      ? {
          name: editSection.name,
        }
      : { ...EMPTY_FORM }
  );

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
      };
      return isEdit
        ? sectionService.update(editSection!.id, payload)
        : sectionService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      toast.success(isEdit ? 'Section updated' : 'Section created');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save section');
    },
  });

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">
              {isEdit ? 'Edit Section' : 'Add Section'}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {isEdit ? 'Update section details' : 'Create a new section or zone for your restaurant'}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Ground Floor, Terrace, VIP Lounge"
              autoFocus
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>


        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {mutation.isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════ Delete Confirmation ═══════════════════ */

function DeleteConfirmModal({
  isOpen,
  section,
  onClose,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  section: Section | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (!isOpen || !section) return null;

  const tableCount = section._count?.tables ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">Delete Section</h3>
            <p className="text-xs text-text-muted mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        <div className="px-6 pb-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete <span className="font-semibold text-text-primary">{section.name}</span>?
          </p>
          {tableCount > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-xs text-amber-700">
                {tableCount} table{tableCount !== 1 ? 's' : ''} will be unassigned from this section.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-text-secondary rounded-xl text-sm font-medium hover:bg-gray-200 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════ Section Row ═══════════════════════════ */

function SectionRow({
  section,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  section: Section;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const tableCount = section._count?.tables ?? 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all ${
        section.isActive
          ? 'bg-white border-gray-100 hover:border-gray-200'
          : 'bg-gray-50 border-gray-100 opacity-60'
      }`}
    >
      {/* Drag handle / sort indicator */}
      <div className="text-text-muted shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary truncate">{section.name}</span>
          {!section.isActive && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-gray-200 text-gray-500 uppercase tracking-wide">
              Inactive
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {section.floor != null && (
            <span className="text-xs text-text-muted">
              Floor {section.floor}
            </span>
          )}
          <span className="text-xs text-text-muted">
            {tableCount} table{tableCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Toggle active */}
        <button
          onClick={onToggleActive}
          title={section.isActive ? 'Deactivate' : 'Activate'}
          className={`p-2 rounded-lg transition-all ${
            section.isActive
              ? 'text-primary hover:bg-orange-50'
              : 'text-gray-400 hover:bg-gray-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {section.isActive ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
            )}
          </svg>
        </button>

        {/* Edit */}
        <button
          onClick={onEdit}
          title="Edit"
          className="p-2 rounded-lg text-text-muted hover:bg-gray-100 hover:text-text-primary transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          title="Delete"
          className="p-2 rounded-lg text-text-muted hover:bg-red-50 hover:text-red-500 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

/* ═══════════════════ Main Component ═══════════════════════ */

export default function SectionsTab() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editSection, setEditSection] = useState<Section | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);

  const { data: sections = [], isLoading, isError } = useQuery({
    queryKey: ['sections'],
    queryFn: sectionService.getAll,
  });

  const toggleMutation = useMutation({
    mutationFn: (section: Section) =>
      sectionService.update(section.id, { isActive: !section.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update section');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sectionService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Section deleted');
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete section');
    },
  });

  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4"
      >
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </motion.div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700 font-semibold">Failed to load sections</p>
        <p className="text-red-500 text-sm mt-1">Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      className="space-y-4"
    >
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Sections & Zones</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Organize tables by area, floor, or zone
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-all active:scale-[0.97] shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Section
          </button>
        </div>

        {/* Section list */}
        <div className="px-6 pb-6">
          {sorted.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">No sections yet</p>
              <p className="text-xs text-text-muted mt-1">
                Add sections to organize your restaurant tables by area or floor
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {sorted.map((section) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    onEdit={() => setEditSection(section)}
                    onDelete={() => setDeleteTarget(section)}
                    onToggleActive={() => toggleMutation.mutate(section)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && (
          <SectionModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editSection && (
          <SectionModal
            isOpen={!!editSection}
            editSection={editSection}
            onClose={() => setEditSection(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            isOpen={!!deleteTarget}
            section={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={() => deleteMutation.mutate(deleteTarget!.id)}
            isPending={deleteMutation.isPending}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
