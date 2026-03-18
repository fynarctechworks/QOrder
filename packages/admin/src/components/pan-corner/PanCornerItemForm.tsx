import { useState, useEffect, useRef, type FormEvent } from 'react';
import { panCornerService, type PanCornerItemData } from '../../services/panCornerService';
import type { PanCornerCategory, PanCornerItem } from '../../types';

interface Props {
  initial?: PanCornerItem | null;
  categories: PanCornerCategory[];
  isLoading: boolean;
  onSubmit: (data: PanCornerItemData) => void;
  onCancel: () => void;
}

interface FieldErrors {
  name?: string;
  price?: string;
  panCornerCategoryId?: string;
}

const EMPTY = (firstCatId = ''): PanCornerItemData => ({
  panCornerCategoryId: firstCatId,
  name: '',
  description: '',
  price: 0,
  discountPrice: null,
  image: '',
  isAvailable: true,
  isAgeRestricted: false,
  taxRate: null,
});

function fromItem(item: PanCornerItem): PanCornerItemData {
  return {
    panCornerCategoryId: item.panCornerCategoryId,
    name: item.name,
    description: item.description || '',
    price: item.price,
    discountPrice: item.discountPrice ?? null,
    image: item.image || '',
    isAvailable: item.isAvailable,
    isAgeRestricted: item.isAgeRestricted,
    taxRate: item.taxRate ?? null,
    translations: item.translations,
  };
}

export default function PanCornerItemForm({ initial, categories, isLoading, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<PanCornerItemData>(
    initial ? fromItem(initial) : EMPTY(categories[0]?.id)
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState(initial?.image || '');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initial ? fromItem(initial) : EMPTY(categories[0]?.id));
    setPreview(initial?.image || '');
    setErrors({});
    setUploadError('');
  }, [initial, categories]);

  const apiBase = (import.meta.env.VITE_API_URL ||
    (import.meta.env.PROD ? 'https://api.infynarc.com/api' : 'http://localhost:3000/api')).replace('/api', '');

  const set = <K extends keyof PanCornerItemData>(key: K, val: PanCornerItemData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { setUploadError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError('Image must be less than 5MB'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const { imageUrl } = await panCornerService.uploadImage(file);
      set('image', imageUrl);
      setPreview(imageUrl);
    } catch {
      setUploadError('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.price < 0) e.price = 'Price cannot be negative';
    if (!form.panCornerCategoryId) e.panCornerCategoryId = 'Category is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Category <span className="text-error">*</span>
        </label>
        <select
          value={form.panCornerCategoryId}
          onChange={(e) => set('panCornerCategoryId', e.target.value)}
          className={`input w-full ${errors.panCornerCategoryId ? 'border-error' : ''}`}
        >
          <option value="">— Select category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {errors.panCornerCategoryId && <p className="text-xs text-error mt-1">{errors.panCornerCategoryId}</p>}
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Name <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => { set('name', e.target.value); setErrors((prev) => ({ ...prev, name: undefined })); }}
          className={`input w-full ${errors.name ? 'border-error' : ''}`}
          placeholder="e.g. Classic Paan, Cigarette"
        />
        {errors.name && <p className="text-xs text-error mt-1">{errors.name}</p>}
      </div>

      {/* Image */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Image</label>
        {preview ? (
          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-surface-border bg-surface">
            <img
              src={preview.startsWith('/uploads') ? `${apiBase}${preview}` : preview}
              alt="preview"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => { set('image', ''); setPreview(''); if (fileRef.current) fileRef.current.value = ''; }}
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

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className="input w-full resize-none"
          placeholder="Optional description"
        />
      </div>

      {/* Price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Price (₹) <span className="text-error">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => { set('price', parseFloat(e.target.value) || 0); setErrors((prev) => ({ ...prev, price: undefined })); }}
            className={`input w-full ${errors.price ? 'border-error' : ''}`}
          />
          {errors.price && <p className="text-xs text-error mt-1">{errors.price}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Discount Price (₹)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.discountPrice ?? ''}
            onChange={(e) => set('discountPrice', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
            className="input w-full"
            placeholder="Optional"
          />
        </div>
      </div>

      {/* Availability */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isAvailable}
          onChange={(e) => set('isAvailable', e.target.checked)}
          className="checkbox checkbox-primary"
        />
        <span className="text-sm text-text-primary">Available</span>
      </label>

      {/* Age Restricted + Tax Rate */}
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Pan Corner Settings</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isAgeRestricted}
            onChange={(e) => set('isAgeRestricted', e.target.checked)}
            className="checkbox checkbox-primary"
          />
          <div>
            <span className="text-sm text-text-primary">Age Restricted (18+)</span>
            <p className="text-xs text-text-muted">Tobacco, cigarettes — shows 18+ badge</p>
          </div>
        </label>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Tax Rate (%) <span className="text-text-muted font-normal">— overrides restaurant default</span>
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.taxRate ?? ''}
            onChange={(e) => set('taxRate', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
            className="input w-full"
            placeholder="Leave empty to use restaurant default"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-surface-elevated">
        <button type="button" onClick={onCancel} className="btn-secondary px-5" disabled={isLoading || uploading}>
          Cancel
        </button>
        <button type="submit" className="btn-primary px-5" disabled={isLoading || uploading}>
          {isLoading ? 'Saving…' : initial ? 'Update Item' : 'Add Item'}
        </button>
      </div>
    </form>
  );
}
