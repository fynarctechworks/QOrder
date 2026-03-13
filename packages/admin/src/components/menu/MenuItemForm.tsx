import { useState, useEffect, useRef, type FormEvent, type DragEvent, type ChangeEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { menuService } from '../../services';
import type { MenuItem, Category, CustomizationGroup, CustomizationOption, DietType, TranslationsMap } from '../../types';
import { resolveImg } from '../../utils/resolveImg';
import TranslationsEditor from './TranslationsEditor';

/* ─── Form data types ───────────────────────────────────────────────────── */

export interface MenuItemFormData {
  name: string;
  description: string;
  price: number;
  discountPrice: number | null;
  categoryId: string;
  imageUrl: string;
  isAvailable: boolean;
  preparationTime: number;
  calories: number | null;
  allergens: string[];
  ingredients: string[];
  tags: string[];
  badge: string;
  dietType: DietType | null;
  allowSpecialInstructions: boolean;
  customizationGroups: CustomizationGroup[];
  translations: TranslationsMap;
}

interface MenuItemFormProps {
  initial?: MenuItem | null;
  categories: Category[];
  isLoading: boolean;
  onSubmit: (data: MenuItemFormData) => void;
  onCancel: () => void;
}

interface FieldErrors {
  name?: string;
  price?: string;
  categoryId?: string;
  preparationTime?: string;
  discountPrice?: string;
}

/* ─── Defaults ──────────────────────────────────────────────────────────── */

const EMPTY: MenuItemFormData = {
  name: '',
  description: '',
  price: 0,
  discountPrice: null,
  categoryId: '',
  imageUrl: '',
  isAvailable: true,
  preparationTime: 15,
  calories: null,
  allergens: [],
  ingredients: [],
  tags: [],
  badge: '',
  dietType: null,
  allowSpecialInstructions: true,
  customizationGroups: [],
  translations: {},
};

const BADGE_OPTIONS = ['', 'Bestseller', 'New', 'Spicy', "Chef's Pick", 'Limited'];

function fromItem(item: MenuItem): MenuItemFormData {
  return {
    name: item.name,
    description: item.description,
    price: item.price,
    discountPrice: item.discountPrice ?? null,
    categoryId: item.categoryId,
    imageUrl: item.image || '',
    isAvailable: item.isAvailable,
    preparationTime: item.prepTime ?? 15,
    calories: item.calories ?? null,
    allergens: [...(item.allergens || [])],
    ingredients: [...(item.ingredients || [])],
    tags: [...(item.tags || [])],
    badge: item.badge || '',
    dietType: item.dietType || null,
    allowSpecialInstructions: item.allowSpecialInstructions ?? true,
    customizationGroups: item.customizationGroups
      ? item.customizationGroups.map((g) => ({
          ...g,
          options: g.options.map((o) => ({ ...o })),
        }))
      : [],
    translations: item.translations || {},
  };
}

/* ─── Temp id helper ────────────────────────────────────────────────────── */
const tmpId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* ─── Non-veg detection helper ─────────────────────────────────────────── */
const NON_VEG_KEYWORDS = [
  // Poultry
  'chicken', 'turkey', 'duck', 'quail', 'goose',
  // Meat
  'mutton', 'lamb', 'beef', 'pork', 'veal', 'bacon', 'sausage', 'ham', 'salami', 'pepperoni', 'meat',
  // Seafood & Fish
  'fish', 'prawn', 'shrimp', 'crab', 'lobster', 'salmon', 'tuna', 'cod', 'haddock', 'mackerel', 
  'trout', 'catfish', 'tilapia', 'sardines', 'herring', 'anchovies', 'anchovy', 'oyster', 'clam', 
  'squid', 'octopus', 'mussel', 'scallop', 'calamari', 'mahi-mahi', 'snapper', 'halibut', 'sea bass',
  'swordfish', 'barramundi', 'kingfish', 'seafood',
  // Eggs & Dairy with animal rennet
  'egg',
];

function containsNonVegIngredients(data: MenuItemFormData): boolean {
  // Check item name
  const hasNonVegInName = NON_VEG_KEYWORDS.some((keyword) => 
    data.name.toLowerCase().includes(keyword)
  );

  if (hasNonVegInName) return true;

  // Check description
  const hasNonVegInDescription = NON_VEG_KEYWORDS.some((keyword) => 
    data.description.toLowerCase().includes(keyword)
  );

  if (hasNonVegInDescription) return true;

  // Check ingredients
  const hasNonVegIngredient = data.ingredients.some((ingredient) =>
    NON_VEG_KEYWORDS.some((keyword) => ingredient.toLowerCase().includes(keyword))
  );

  if (hasNonVegIngredient) return true;

  // Check customization options (modifiers)
  const hasNonVegModifier = data.customizationGroups.some((group) =>
    group.options.some((option) =>
      NON_VEG_KEYWORDS.some((keyword) => option.name.toLowerCase().includes(keyword))
    )
  );

  return hasNonVegModifier;
}

/* ─── Collapsible section ───────────────────────────────────────────────── */
function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-elevated transition-colors text-left"
      >
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <svg
          className={`w-4 h-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 py-4 space-y-4 border-t border-surface-border">{children}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function MenuItemForm({
  initial,
  categories,
  isLoading,
  onSubmit,
  onCancel,
}: MenuItemFormProps) {
  const [form, setForm] = useState<MenuItemFormData>(initial ? fromItem(initial) : EMPTY);

  // Chip inputs
  const [tagInput, setTagInput] = useState('');
  const [allergenInput, setAllergenInput] = useState('');
  const [ingredientInput, setIngredientInput] = useState('');

  const [errors, setErrors] = useState<FieldErrors>({});

  // Image upload
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initial ? fromItem(initial) : EMPTY);
    setErrors({});
  }, [initial]);

  // Auto-detect non-veg ingredients and update dietType
  useEffect(() => {
    if (containsNonVegIngredients(form) && form.dietType !== 'NON_VEG') {
      set('dietType', 'NON_VEG');
    }
  }, [form.ingredients, form.customizationGroups]);

  /* ─── Generic setter ────────────────────────────────────────────────── */
  const set = <K extends keyof MenuItemFormData>(key: K, value: MenuItemFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /* ─── Validation ────────────────────────────────────────────────────── */
  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.price < 0) e.price = 'Price must be ≥ 0';
    if (!form.categoryId) e.categoryId = 'Category is required';
    if (form.preparationTime < 0) e.preparationTime = 'Prep time must be ≥ 0';
    if (form.discountPrice != null && form.discountPrice >= form.price)
      e.discountPrice = 'Discount must be less than regular price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    
    // Auto-detect non-veg ingredients and update tags accordingly
    const formData = { ...form };
    
    if (containsNonVegIngredients(formData)) {
      // Remove any veg/vegetarian tags
      formData.tags = formData.tags.filter(
        (tag) => !['veg', 'vegetarian'].includes(tag.toLowerCase())
      );
      
      // Add non-veg tag if not already present
      if (!formData.tags.some((tag) => ['non-veg', 'non veg', 'nonveg'].includes(tag.toLowerCase()))) {
        formData.tags = [...formData.tags, 'non-veg'];
      }
    }
    
    onSubmit(formData);
  };

  /* ─── Chip array helpers ────────────────────────────────────────────── */
  const addChip = (key: 'tags' | 'allergens' | 'ingredients', value: string, setInput: (v: string) => void) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !form[key].includes(trimmed)) {
      set(key, [...form[key], trimmed]);
    }
    setInput('');
  };

  const removeChip = (key: 'tags' | 'allergens' | 'ingredients', value: string) => {
    set(key, form[key].filter((v) => v !== value));
  };

  /* ─── Image upload ──────────────────────────────────────────────────── */
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be < 5 MB'); return; }
    setUploading(true);
    try {
      const { imageUrl } = await menuService.uploadImage(file);
      set('imageUrl', imageUrl);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
  };

  /* ═══ Modifier group helpers ═══════════════════════════════════════════ */
  const addModifierGroup = () => {
    const group: CustomizationGroup = {
      id: tmpId(),
      name: '',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      options: [
        { id: tmpId(), name: '', priceModifier: 0, isDefault: false, isAvailable: true },
      ],
    };
    set('customizationGroups', [...form.customizationGroups, group]);
  };

  const updateModifierGroup = (groupId: string, patch: Partial<CustomizationGroup>) => {
    set(
      'customizationGroups',
      form.customizationGroups.map((g) => (g.id === groupId ? { ...g, ...patch } : g))
    );
  };

  const removeModifierGroup = (groupId: string) => {
    set('customizationGroups', form.customizationGroups.filter((g) => g.id !== groupId));
  };

  const addOption = (groupId: string) => {
    const opt: CustomizationOption = {
      id: tmpId(),
      name: '',
      priceModifier: 0,
      isDefault: false,
      isAvailable: true,
    };
    set(
      'customizationGroups',
      form.customizationGroups.map((g) =>
        g.id === groupId ? { ...g, options: [...g.options, opt] } : g
      )
    );
  };

  const updateOption = (groupId: string, optId: string, patch: Partial<CustomizationOption>) => {
    set(
      'customizationGroups',
      form.customizationGroups.map((g) => {
        if (g.id !== groupId) return g;
        // If setting isDefault to true, uncheck all other options' isDefault
        if (patch.isDefault) {
          return { ...g, options: g.options.map((o) => o.id === optId ? { ...o, ...patch } : { ...o, isDefault: false }) };
        }
        return { ...g, options: g.options.map((o) => (o.id === optId ? { ...o, ...patch } : o)) };
      })
    );
  };

  const removeOption = (groupId: string, optId: string) => {
    set(
      'customizationGroups',
      form.customizationGroups.map((g) =>
        g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optId) } : g
      )
    );
  };

  /* ═══ Chip input renderer ══════════════════════════════════════════════ */
  const renderChipInput = (
    label: string,
    key: 'tags' | 'allergens' | 'ingredients',
    inputValue: string,
    setInput: (v: string) => void,
    placeholder: string
  ) => (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addChip(key, inputValue, setInput); }
          }}
          className="input flex-1"
          placeholder={placeholder}
        />
        <button type="button" onClick={() => addChip(key, inputValue, setInput)} className="btn-secondary px-3 text-sm">
          Add
        </button>
      </div>
      {form[key].length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {form[key].map((val) => (
            <span key={val} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-surface-elevated rounded-full text-text-secondary">
              {val}
              <button type="button" onClick={() => removeChip(key, val)} className="hover:text-error">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

      {/* ───── Name ──────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Name <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className={`input w-full ${errors.name ? 'border-error' : ''}`}
          placeholder="e.g. Margherita Pizza"
        />
        {errors.name && <p className="text-xs text-error mt-1">{errors.name}</p>}
      </div>

      {/* ───── Description ───────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className="input w-full resize-none"
          placeholder="Brief description"
        />
      </div>

      {/* ───── Price + Discount Price ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Price <span className="text-error">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => set('price', parseFloat(e.target.value) || 0)}
            className={`input w-full ${errors.price ? 'border-error' : ''}`}
          />
          {errors.price && <p className="text-xs text-error mt-1">{errors.price}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Discount Price</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.discountPrice ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              set('discountPrice', val === '' ? null : parseFloat(val) || 0);
            }}
            className={`input w-full ${errors.discountPrice ? 'border-error' : ''}`}
            placeholder="Leave empty if none"
          />
          {errors.discountPrice && <p className="text-xs text-error mt-1">{errors.discountPrice}</p>}
        </div>
      </div>

      {/* ───── Category + Badge ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Category <span className="text-error">*</span>
          </label>
          <select
            value={form.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            className={`select w-full ${errors.categoryId ? 'border-error' : ''}`}
          >
            <option value="">Select…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          {errors.categoryId && <p className="text-xs text-error mt-1">{errors.categoryId}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Badge</label>
          <select
            value={form.badge}
            onChange={(e) => set('badge', e.target.value)}
            className="select w-full"
          >
            {BADGE_OPTIONS.map((b) => (
              <option key={b} value={b}>{b || 'None'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ───── Image Upload ──────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">Product Image</label>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-lg transition-colors ${
            dragActive ? 'border-primary bg-primary/5' : 'border-surface-border'
          }`}
        >
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
          {form.imageUrl ? (
            <div className="relative">
              <img src={resolveImg(form.imageUrl)} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => set('imageUrl', '')}
                className="absolute top-2 right-2 w-8 h-8 bg-error text-white rounded-full flex items-center justify-center hover:bg-error/80 transition-colors"
                title="Remove image"
              >×</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full p-8 text-center hover:bg-surface transition-colors"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  <p className="text-sm text-text-secondary">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-12 h-12 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium text-text-primary">Click to upload or drag & drop</p>
                  <p className="text-xs text-text-muted">PNG, JPG, GIF, WEBP (max 5 MB)</p>
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ───── Prep time · Calories · Available ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Prep Time (min)</label>
          <input
            type="number"
            min="0"
            value={form.preparationTime}
            onChange={(e) => set('preparationTime', parseInt(e.target.value) || 0)}
            className={`input w-full ${errors.preparationTime ? 'border-error' : ''}`}
          />
          {errors.preparationTime && <p className="text-xs text-error mt-1">{errors.preparationTime}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Calories</label>
          <input
            type="number"
            min="0"
            value={form.calories ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              set('calories', val === '' ? null : parseInt(val) || 0);
            }}
            className="input w-full"
            placeholder="Optional"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => set('isAvailable', e.target.checked)}
              className="checkbox checkbox-primary"
            />
            <span className="text-sm text-text-primary">Available</span>
          </label>
        </div>
      </div>

      {/* ───── Special Instructions toggle ───────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.allowSpecialInstructions}
            onChange={(e) => set('allowSpecialInstructions', e.target.checked)}
            className="checkbox checkbox-primary"
          />
          <span className="text-sm text-text-primary">Allow Special Instructions</span>
        </label>
        <span className="text-xs text-text-muted">(customer can type requests)</span>
      </div>

      {/* ───── Diet Type selector ───────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">Diet Type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set('dietType', null)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
              !form.dietType
                ? 'border-gray-300 bg-gray-50 text-text-secondary'
                : 'border-gray-200 bg-white text-text-muted hover:border-gray-300'
            }`}
          >
            <span className="text-sm font-medium">None</span>
          </button>
          <button
            type="button"
            onClick={() => set('dietType', 'VEG')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
              form.dietType === 'VEG'
                ? 'border-primary bg-orange-50 text-primary shadow-sm'
                : 'border-gray-200 bg-white text-text-secondary hover:border-orange-200 hover:bg-orange-50/50'
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center rounded-sm border-2 border-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            </span>
            <span className="text-sm font-medium">Veg</span>
          </button>
          <button
            type="button"
            onClick={() => set('dietType', 'NON_VEG')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
              form.dietType === 'NON_VEG'
                ? 'border-red-500 bg-red-50 text-red-700 shadow-sm'
                : 'border-gray-200 bg-white text-text-secondary hover:border-red-200 hover:bg-red-50/50'
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center rounded-sm border-2 border-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            </span>
            <span className="text-sm font-medium">Non-Veg</span>
          </button>
        </div>
        
        {/* Auto-detection notice */}
        {containsNonVegIngredients(form) && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-800">Non-veg ingredients detected</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This item will be automatically tagged as "non-veg" based on ingredients or modifier options.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ───── Translations ───────────────────────────────────────────── */}
      <TranslationsEditor
        translations={form.translations}
        onChange={(t) => set('translations', t)}
        fields={[
          { key: 'name', label: 'Name' },
          { key: 'description', label: 'Description', multiline: true },
          { key: 'badge', label: 'Badge' },
        ]}
      />

      {/* ═══ Tags · Allergens · Ingredients (collapsible) ════════════════ */}
      <Section title="Tags · Allergens · Ingredients" defaultOpen={(form.tags.length + form.allergens.length + form.ingredients.length) > 0}>
        {renderChipInput('Tags', 'tags', tagInput, setTagInput, 'e.g. vegetarian, popular')}
        {renderChipInput('Allergens', 'allergens', allergenInput, setAllergenInput, 'e.g. gluten, dairy, nuts')}
        {renderChipInput('Ingredients', 'ingredients', ingredientInput, setIngredientInput, 'e.g. tomato sauce, mozzarella')}
      </Section>

      {/* ═══ Modifier Groups (collapsible) ═══════════════════════════════ */}
      <Section title={`Modifier Groups (${form.customizationGroups.length})`} defaultOpen={form.customizationGroups.length > 0}>
        {form.customizationGroups.map((group) => (
          <div key={group.id} className="border border-surface-border rounded-lg p-4 space-y-3 bg-surface/50">
            {/* Group header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-3">
                <input
                  type="text"
                  value={group.name}
                  onChange={(e) => updateModifierGroup(group.id, { name: e.target.value })}
                  className="input w-full text-sm font-medium"
                  placeholder="Group name (e.g. Size, Toppings)"
                />
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={group.required}
                      onChange={(e) =>
                        updateModifierGroup(group.id, {
                          required: e.target.checked,
                          minSelections: e.target.checked ? Math.max(1, group.minSelections) : 0,
                        })
                      }
                      className="checkbox checkbox-primary"
                    />
                    <span className="text-xs text-text-primary">Required</span>
                  </label>
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span>Min</span>
                    <input
                      type="number"
                      min="0"
                      value={group.minSelections}
                      onChange={(e) => updateModifierGroup(group.id, { minSelections: parseInt(e.target.value) || 0 })}
                      className="input w-14 text-xs text-center py-1"
                    />
                    <span>Max</span>
                    <input
                      type="number"
                      min="1"
                      value={group.maxSelections}
                      onChange={(e) => updateModifierGroup(group.id, { maxSelections: parseInt(e.target.value) || 1 })}
                      className="input w-14 text-xs text-center py-1"
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeModifierGroup(group.id)}
                className="text-error hover:text-error/80 p-1"
                title="Remove group"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Options */}
            <div className="space-y-2 pl-1">
              {group.options.map((opt) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.name}
                    onChange={(e) => updateOption(group.id, opt.id, { name: e.target.value })}
                    className="input flex-1 text-sm py-1.5"
                    placeholder="Option name"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-muted">+$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={opt.priceModifier}
                      onChange={(e) => updateOption(group.id, opt.id, { priceModifier: parseFloat(e.target.value) || 0 })}
                      className="input w-20 text-sm py-1.5 text-center"
                    />
                  </div>
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-text-secondary whitespace-nowrap" title="Default selection">
                    <input
                      type="checkbox"
                      checked={opt.isDefault}
                      onChange={(e) => updateOption(group.id, opt.id, { isDefault: e.target.checked })}
                      className="checkbox checkbox-primary"
                    />
                    Def
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-text-secondary whitespace-nowrap" title="Available">
                    <input
                      type="checkbox"
                      checked={opt.isAvailable}
                      onChange={(e) => updateOption(group.id, opt.id, { isAvailable: e.target.checked })}
                      className="checkbox checkbox-primary"
                    />
                    On
                  </label>
                  <button
                    type="button"
                    onClick={() => removeOption(group.id, opt.id)}
                    className="text-error/60 hover:text-error p-0.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addOption(group.id)}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Option
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addModifierGroup}
          className="w-full py-2.5 border-2 border-dashed border-surface-border rounded-lg text-sm font-medium text-text-secondary hover:border-primary hover:text-primary transition-colors"
        >
          + Add Modifier Group
        </button>
      </Section>

      {/* ═══ Actions ════════════════════════════════════════════════════════ */}
      <div className="flex justify-end gap-3 pt-2 border-t border-surface-elevated sticky bottom-0 bg-white pb-1">
        <button type="button" onClick={onCancel} className="btn-secondary px-5" disabled={isLoading}>Cancel</button>
        <button type="submit" className="btn-primary px-5" disabled={isLoading}>
          {isLoading ? 'Saving…' : initial ? 'Update Item' : 'Create Item'}
        </button>
      </div>
    </form>
  );
}
