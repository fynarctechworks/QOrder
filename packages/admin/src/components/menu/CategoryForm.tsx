import { useState, useEffect, useRef, type FormEvent } from 'react';
import { menuService } from '../../services/menuService';
import type { Category, TranslationsMap } from '../../types';
import TranslationsEditor from './TranslationsEditor';

export interface CategoryFormData {
  name: string;
  description: string;
  image: string;
  isActive: boolean;
  kotStation: 'KITCHEN' | 'BEVERAGE';
  translations: TranslationsMap;
}

interface CategoryFormProps {
  initial?: Category | null;
  isLoading: boolean;
  onSubmit: (data: CategoryFormData) => void;
  onCancel: () => void;
}

interface FieldErrors {
  name?: string;
  image?: string;
}

const EMPTY: CategoryFormData = {
  name: '',
  description: '',
  image: '',
  isActive: true,
  kotStation: 'KITCHEN',
  translations: {},
};

function fromCategory(cat: Category): CategoryFormData {
  return {
    name: cat.name,
    description: cat.description || '',
    image: cat.image || '',
    isActive: cat.isActive,
    kotStation: cat.kotStation || 'KITCHEN',
    translations: cat.translations || {},
  };
}

export default function CategoryForm({
  initial,
  isLoading,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [form, setForm] = useState<CategoryFormData>(
    initial ? fromCategory(initial) : EMPTY
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>(initial?.image || '');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initial ? fromCategory(initial) : EMPTY);
    setPreview(initial?.image || '');
    setErrors({});
  }, [initial]);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, image: 'Please select an image file' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, image: 'Image must be less than 5MB' }));
      return;
    }

    setUploading(true);
    setErrors((prev) => ({ ...prev, image: undefined }));
    try {
      const { imageUrl } = await menuService.uploadImage(file);
      setForm((f) => ({ ...f, image: imageUrl }));
      setPreview(imageUrl);
    } catch {
      setErrors((prev) => ({ ...prev, image: 'Failed to upload image' }));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setForm((f) => ({ ...f, image: '' }));
    setPreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  const apiBase = (import.meta.env.VITE_API_URL ||
    (import.meta.env.PROD ? 'https://api.infynarc.com/api' : 'http://localhost:3000/api')).replace('/api', '');

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Name <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }));
            setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          className={`input w-full ${errors.name ? 'border-error' : ''}`}
          placeholder="e.g. Appetizers"
        />
        {errors.name && (
          <p className="text-xs text-error mt-1">{errors.name}</p>
        )}
      </div>

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Category Image
        </label>
        {preview ? (
          <div className="relative w-full h-36 rounded-xl overflow-hidden border border-surface-border bg-surface">
            <img
              src={preview.startsWith('/uploads') ? `${apiBase}${preview}` : preview}
              alt="Category preview"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
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
            className="w-full h-36 rounded-xl border-2 border-dashed border-surface-border hover:border-primary/50 bg-surface flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-text-tertiary">Uploading…</span>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
                <span className="text-xs text-text-tertiary">Click to upload image</span>
              </>
            )}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
          }}
        />
        {errors.image && (
          <p className="text-xs text-error mt-1">{errors.image}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Description
        </label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          className="input w-full resize-none"
          placeholder="Optional description"
        />
      </div>

      {/* Translations */}
      <TranslationsEditor
        translations={form.translations}
        onChange={(t) => setForm((f) => ({ ...f, translations: t }))}
        fields={[
          { key: 'name', label: 'Name' },
          { key: 'description', label: 'Description', multiline: true },
        ]}
      />

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) =>
            setForm((f) => ({ ...f, isActive: e.target.checked }))
          }
          className="checkbox checkbox-primary"
        />
        <span className="text-sm text-text-primary">Active</span>
      </label>

      {/* KOT Station */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          KOT Station
        </label>
        <select
          value={form.kotStation}
          onChange={(e) => setForm((f) => ({ ...f, kotStation: e.target.value as 'KITCHEN' | 'BEVERAGE' }))}
          className="input w-full"
        >
          <option value="KITCHEN">Kitchen</option>
          <option value="BEVERAGE">Beverage</option>
        </select>
        <p className="text-xs text-text-tertiary mt-1">Items in this category will be printed on the selected station's KOT</p>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-surface-elevated">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary px-5"
          disabled={isLoading || uploading}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary px-5" disabled={isLoading || uploading}>
          {isLoading
            ? 'Saving…'
            : initial
              ? 'Update Category'
              : 'Create Category'}
        </button>
      </div>
    </form>
  );
}
