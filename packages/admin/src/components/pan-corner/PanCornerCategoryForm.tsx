import { useState, useEffect, useRef, type FormEvent } from 'react';
import { panCornerService, type PanCornerCategoryData } from '../../services/panCornerService';
import type { PanCornerCategory } from '../../types';

interface Props {
  initial?: PanCornerCategory | null;
  isLoading: boolean;
  onSubmit: (data: PanCornerCategoryData) => void;
  onCancel: () => void;
}

const EMPTY: PanCornerCategoryData = {
  name: '',
  description: '',
  image: '',
  isActive: true,
};

function fromCategory(cat: PanCornerCategory): PanCornerCategoryData {
  return {
    name: cat.name,
    description: cat.description || '',
    image: cat.image || '',
    isActive: cat.isActive,
    translations: cat.translations,
  };
}

export default function PanCornerCategoryForm({ initial, isLoading, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<PanCornerCategoryData>(initial ? fromCategory(initial) : EMPTY);
  const [nameError, setNameError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState(initial?.image || '');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initial ? fromCategory(initial) : EMPTY);
    setPreview(initial?.image || '');
    setNameError('');
    setUploadError('');
  }, [initial]);

  const apiBase = (import.meta.env.VITE_API_URL ||
    (import.meta.env.PROD ? 'https://api.infynarc.com/api' : 'http://localhost:3000/api')).replace('/api', '');

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { setUploadError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError('Image must be less than 5MB'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const { imageUrl } = await panCornerService.uploadImage(file);
      setForm((f) => ({ ...f, image: imageUrl }));
      setPreview(imageUrl);
    } catch {
      setUploadError('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim()) { setNameError('Name is required'); return; }
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Name <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
          className={`input w-full ${nameError ? 'border-error' : ''}`}
          placeholder="e.g. Paan, Tobacco, Mukhwas"
        />
        {nameError && <p className="text-xs text-error mt-1">{nameError}</p>}
      </div>

      {/* Image */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Category Image</label>
        {preview ? (
          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-surface-border bg-surface">
            <img
              src={preview.startsWith('/uploads') ? `${apiBase}${preview}` : preview}
              alt="preview"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => { setForm((f) => ({ ...f, image: '' })); setPreview(''); if (fileRef.current) fileRef.current.value = ''; }}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full h-32 rounded-xl border-2 border-dashed border-surface-border hover:border-primary/50 bg-surface flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="text-xs text-text-tertiary">Click to upload image</span>
            )}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
        {uploadError && <p className="text-xs text-error mt-1">{uploadError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="input w-full resize-none"
          placeholder="Optional description"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="checkbox checkbox-primary"
        />
        <span className="text-sm text-text-primary">Active</span>
      </label>

      <div className="flex justify-end gap-3 pt-2 border-t border-surface-elevated">
        <button type="button" onClick={onCancel} className="btn-secondary px-5" disabled={isLoading || uploading}>
          Cancel
        </button>
        <button type="submit" className="btn-primary px-5" disabled={isLoading || uploading}>
          {isLoading ? 'Saving…' : initial ? 'Update Category' : 'Create Category'}
        </button>
      </div>
    </form>
  );
}
