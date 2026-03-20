import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { menuService } from '../services';
import Modal from '../components/Modal';
import MenuItemForm, { type MenuItemFormData } from '../components/menu/MenuItemForm';
import CategoryForm, { type CategoryFormData } from '../components/menu/CategoryForm';
import { useCurrency } from '../hooks/useCurrency';
import Toggle from '../components/Toggle';
import DietBadge from '../components/DietBadge';
import type { MenuItem, Category } from '../types';
import { resolveImg } from '../utils/resolveImg';
import { useBranchStore } from '../state/branchStore';

/* ═══════════════════════════ Constants ════════════════════════ */

const PAGE_SIZE = 20;

type DietFilter = 'all' | 'veg' | 'non-veg';

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  bestseller: { bg: 'bg-amber-100', text: 'text-amber-700' },
  new:        { bg: 'bg-orange-100', text: 'text-primary' },
  spicy:      { bg: 'bg-red-100', text: 'text-red-700' },
  popular:    { bg: 'bg-violet-100', text: 'text-violet-700' },
  "chef's pick": { bg: 'bg-sky-100', text: 'text-sky-700' },
  limited:    { bg: 'bg-orange-100', text: 'text-orange-700' },
};

function badgeStyle(badge: string) {
  return BADGE_COLORS[badge.toLowerCase()] ?? { bg: 'bg-primary/10', text: 'text-primary' };
}

/* ═══════════════════════════ Helpers ═════════════════════════ */

/** Convert MenuItemFormData (null-based) to Partial<MenuItem> (undefined-based) */
/** Strip temp IDs (tmp-...) so the backend treats them as new records */
const realId = (id?: string) => id && !id.startsWith('tmp-') ? id : undefined;

function toMenuItemData(data: MenuItemFormData): Partial<MenuItem> & { customizationGroups?: any[] } {
  return {
    name: data.name,
    description: data.description || undefined,
    price: Number(data.price),
    discountPrice: data.discountPrice != null ? Number(data.discountPrice) : undefined,
    image: data.imageUrl || undefined,
    categoryId: data.categoryId,
    isAvailable: data.isAvailable,
    prepTime: data.preparationTime ? Number(data.preparationTime) : undefined,
    calories: data.calories != null ? Number(data.calories) : undefined,
    tags: data.tags,
    ingredients: data.ingredients,
    allergens: data.allergens,
    badge: data.badge || undefined,
    dietType: data.dietType || null,
    translations: Object.keys(data.translations).length > 0 ? data.translations : undefined,
    customizationGroups: data.customizationGroups.length > 0
      ? data.customizationGroups.map(g => ({
          id: realId(g.id),
          name: g.name,
          required: g.required,
          minSelections: g.minSelections,
          maxSelections: g.maxSelections,
          options: g.options.map(o => ({
            id: realId(o.id),
            name: o.name,
            priceModifier: Number(o.priceModifier),
            isDefault: o.isDefault,
            isAvailable: o.isAvailable,
          })),
        }))
      : undefined,
  } as any;
}

/* ═══════════════════════════ Sub-components ══════════════════ */

/** Stat mini-card */
function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: number | string; accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4"
    >
      <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center shrink-0 shadow-sm`}>
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider leading-none">{label}</p>
        <p className="text-2xl font-bold text-text-primary mt-1.5 leading-none">{value}</p>
      </div>
    </motion.div>
  );
}

/** Skeleton for stat cards */
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 animate-pulse flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gray-200" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-12 bg-gray-200 rounded" />
            <div className="h-3 w-20 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for item cards */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
          <div className="h-32 bg-gray-200" />
          <div className="p-3 space-y-2">
            <div className="flex justify-between">
              <div className="h-5 w-32 bg-gray-200 rounded" />
              <div className="h-5 w-16 bg-gray-200 rounded" />
            </div>
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-3/4 bg-gray-100 rounded" />
            <div className="flex gap-2 pt-1">
              <div className="h-6 w-16 bg-gray-100 rounded-full" />
              <div className="h-6 w-16 bg-gray-100 rounded-full" />
            </div>
            <div className="flex justify-between pt-3 border-t border-gray-100">
              <div className="h-6 w-11 bg-gray-200 rounded-full" />
              <div className="flex gap-2">
                <div className="h-8 w-8 bg-gray-100 rounded-lg" />
                <div className="h-8 w-8 bg-gray-100 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Empty state */
function EmptyState({ hasSearch, onClear, onAdd }: { hasSearch: boolean; onClear: () => void; onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">
        {hasSearch ? 'No items match your search' : 'No menu items yet'}
      </h3>
      <p className="text-sm text-text-muted mb-6 text-center max-w-xs">
        {hasSearch
          ? 'Try a different search term or clear the filter'
          : 'Start building your menu by adding your first item'}
      </p>
      {hasSearch ? (
        <button onClick={onClear} className="btn-secondary text-sm px-5 py-2.5">
          Clear search
        </button>
      ) : (
        <button onClick={onAdd} className="btn-primary text-sm px-5 py-2.5">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add first item
        </button>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════ Page ════════════════════════════ */

export default function MenuPage() {
  const queryClient = useQueryClient();
  const formatCurrency = useCurrency();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  // ── Filter / pagination / search state ──
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [dietFilter, setDietFilter] = useState<DietFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // ── Modal state ──
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Queries ──
  const { data: allCategories = [], isError: catError } = useQuery({
    queryKey: ['categories', activeBranchId],
    queryFn: menuService.getCategories,
  });

  const { data: allMenuItems = [], isLoading, isError: menuError } = useQuery({
    queryKey: ['menu', activeBranchId],
    queryFn: menuService.getItems,
  });

  const categories = allCategories;
  const menuItems = allMenuItems;

  const isError = catError || menuError;

  // ── Derived ──
  const filtered = useMemo(() => {
    let items = selectedCategory
      ? menuItems.filter((i) => i.categoryId === selectedCategory)
      : menuItems;

    // Diet filter
    if (dietFilter !== 'all') {
      items = items.filter((i) => {
        if (dietFilter === 'veg') return i.dietType === 'VEG';
        if (dietFilter === 'non-veg') return i.dietType === 'NON_VEG';
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description || '').toLowerCase().includes(q) ||
          (i.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    return items;
  }, [menuItems, selectedCategory, dietFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // ── Stats ──
  const stats = useMemo(() => {
    const available = menuItems.filter((i) => i.isAvailable).length;
    const veg = menuItems.filter((i) => i.dietType === 'VEG').length;
    const nonVeg = menuItems.filter((i) => i.dietType === 'NON_VEG').length;
    return {
      total: menuItems.length,
      categories: categories.length,
      available,
      unavailable: menuItems.length - available,
      veg,
      nonVeg,
    };
  }, [menuItems, categories]);

  // ── Category item counts ──
  const catCounts = useMemo(() => {
    const map: Record<string, number> = {};
    menuItems.forEach((i) => {
      map[i.categoryId] = (map[i.categoryId] || 0) + 1;
    });
    return map;
  }, [menuItems]);

  const handleFilterChange = useCallback((catId: string | null) => {
    setSelectedCategory(catId);
    setPage(1);
  }, []);

  const handleDietFilterChange = useCallback((diet: DietFilter) => {
    setDietFilter(diet);
    setPage(1);
  }, []);

  // ── Item mutations ──
  const createItemMutation = useMutation({
    mutationFn: (data: MenuItemFormData) => menuService.createItem(toMenuItemData(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Item created');
      closeItemModal();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create item'),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MenuItemFormData }) =>
      menuService.updateItem(id, toMenuItemData(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Item updated');
      closeItemModal();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: menuService.deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Item deleted');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete item'),
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      menuService.toggleAvailability(id, isAvailable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Availability updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update availability'),
  });

  // ── Category mutations ──
  const createCatMutation = useMutation({
    mutationFn: (data: CategoryFormData) => menuService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category created');
      closeCatModal();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create category'),
  });

  const updateCatMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoryFormData }) =>
      menuService.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category updated');
      closeCatModal();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update category'),
  });

  const deleteCatMutation = useMutation({
    mutationFn: menuService.deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Category deleted');
      setSelectedCategory(null);
    },
    onError: (err: Error) => {
      // Refresh categories in case the entry no longer exists in DB
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.error(err.message || 'Failed to delete category');
    },
  });

  // ── Modal helpers ──
  const openNewItem = () => { setEditingItem(null); setItemModalOpen(true); };
  const openEditItem = (item: MenuItem) => { setEditingItem(item); setItemModalOpen(true); };
  const closeItemModal = () => { setItemModalOpen(false); setEditingItem(null); };

  const openNewCat = () => { setEditingCat(null); setCatModalOpen(true); };
  const openEditCat = (cat: Category) => { setEditingCat(cat); setCatModalOpen(true); };
  const closeCatModal = () => { setCatModalOpen(false); setEditingCat(null); };

  // ── Submit handlers ──
  const handleItemSubmit = (data: MenuItemFormData) => {
    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data });
    } else {
      createItemMutation.mutate(data);
    }
  };

  const handleCatSubmit = (data: CategoryFormData) => {
    if (editingCat) {
      updateCatMutation.mutate({ id: editingCat.id, data });
    } else {
      createCatMutation.mutate(data);
    }
  };

  const isItemMutating = createItemMutation.isPending || updateItemMutation.isPending;
  const isCatMutating = createCatMutation.isPending || updateCatMutation.isPending;

  /* ─── Category name lookup ──────────────────────────────────── */
  const catNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => { m[c.id] = c.name; });
    return m;
  }, [categories]);

  /* ═════════════════════════════ RENDER ═════════════════════════ */

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={openNewCat}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-text-primary rounded-xl text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-[0.97]"
          >
            <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            New Category
          </button>
          <button
            onClick={openNewItem}
            className="btn-primary rounded-xl text-sm px-5 py-2.5 shadow-sm active:scale-[0.97]"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────── */}
      {isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6 text-center">
          <p className="text-red-700 font-semibold">Failed to load menu data</p>
          <p className="text-red-500 text-sm mt-1">Please check your connection and try refreshing.</p>
        </div>
      ) : isLoading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon="M4 6h16M4 10h16M4 14h16M4 18h16"
            label="Total Items"
            value={stats.total}
            accent="bg-violet-500"
          />
          <StatCard
            icon="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
            label="Categories"
            value={stats.categories}
            accent="bg-sky-500"
          />
          <StatCard
            icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            label="Available"
            value={stats.available}
            accent="bg-primary"
          />
          <StatCard
            icon="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            label="Unavailable"
            value={stats.unavailable}
            accent="bg-red-500"
          />
        </div>
      )}

      {/* ── Search + Category Filter Bar ───────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search items by name, description, or tags…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 transition-colors"
            >
              <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => handleFilterChange(null)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
              !selectedCategory
                ? 'bg-primary text-white shadow-sm'
                : 'bg-gray-50 text-text-secondary hover:bg-gray-100 hover:text-text-primary'
            }`}
          >
            All
            <span className={`ml-1.5 w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${!selectedCategory ? 'bg-white/20 text-white' : 'bg-gray-200 text-text-secondary'}`}>
              {menuItems.length}
            </span>
          </button>
          {categories.map((cat) => (
            <div key={cat.id} className="group shrink-0 flex items-center">
              <button
                onClick={() => handleFilterChange(cat.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 flex items-center gap-1 ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-50 text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                }`}
              >
                {cat.name}
                <span className={`ml-0.5 w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${selectedCategory === cat.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-text-secondary'}`}>
                  {catCounts[cat.id] || 0}
                </span>
                {/* Inline Edit / Delete buttons */}
                <span className="hidden group-hover:inline-flex items-center gap-1 ml-1.5 border-l border-current/20 pl-1.5">
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); openEditCat(cat); }}
                    className={`w-5 h-5 rounded-md inline-flex items-center justify-center transition-colors ${
                      selectedCategory === cat.id
                        ? 'hover:bg-white/20'
                        : 'hover:bg-gray-200'
                    }`}
                    title="Edit category"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </span>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteCatTarget({ id: cat.id, name: cat.name });
                    }}
                    className={`w-5 h-5 rounded-md inline-flex items-center justify-center transition-colors ${
                      selectedCategory === cat.id
                        ? 'hover:bg-red-400/30 text-red-200'
                        : 'hover:bg-red-100 text-red-400'
                    }`}
                    title="Delete category"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* Diet Filter */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Diet:</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => handleDietFilterChange('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                dietFilter === 'all'
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              All
              <span className={`ml-1.5 text-[10px] font-bold ${dietFilter === 'all' ? 'text-white/80' : 'text-text-muted'}`}>
                ({menuItems.length})
              </span>
            </button>
            <button
              onClick={() => handleDietFilterChange('veg')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                dietFilter === 'veg'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-text-secondary hover:bg-orange-50 hover:text-primary'
              }`}
            >
              <span className={`w-3.5 h-3.5 flex items-center justify-center rounded-sm border-2 ${
                dietFilter === 'veg' ? 'border-white' : 'border-primary'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  dietFilter === 'veg' ? 'bg-white' : 'bg-primary'
                }`} />
              </span>
              Veg
              <span className={`text-[10px] font-bold ${dietFilter === 'veg' ? 'text-white/80' : 'text-text-muted'}`}>
                ({stats.veg})
              </span>
            </button>
            <button
              onClick={() => handleDietFilterChange('non-veg')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                dietFilter === 'non-veg'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-gray-100 text-text-secondary hover:bg-red-50 hover:text-red-700'
              }`}
            >
              <span className={`w-3.5 h-3.5 flex items-center justify-center rounded-sm border-2 ${
                dietFilter === 'non-veg' ? 'border-white' : 'border-red-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  dietFilter === 'non-veg' ? 'bg-white' : 'bg-red-600'
                }`} />
              </span>
              Non-Veg
              <span className={`text-[10px] font-bold ${dietFilter === 'non-veg' ? 'text-white/80' : 'text-text-muted'}`}>
                ({stats.nonVeg})
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Results summary ────────────────────────────────────── */}
      {!isLoading && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing <span className="font-semibold text-text-secondary">{pageItems.length}</span>{' '}
            of <span className="font-semibold text-text-secondary">{filtered.length}</span> item{filtered.length !== 1 ? 's' : ''}
            {selectedCategory && catNameMap[selectedCategory]
              ? <> in <span className="font-semibold text-text-primary">{catNameMap[selectedCategory]}</span></>
              : null}
          </p>
        </div>
      )}

      {/* ── Menu Items Grid ────────────────────────────────────── */}
      {isLoading ? (
        <GridSkeleton />
      ) : pageItems.length === 0 ? (
        <EmptyState
          hasSearch={!!searchQuery.trim() || !!selectedCategory || dietFilter !== 'all'}
          onClear={() => { setSearchQuery(''); setSelectedCategory(null); setDietFilter('all'); setPage(1); }}
          onAdd={openNewItem}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {pageItems.map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.04 } }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`group bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-200 transition-all duration-300 ${
                  !item.isAvailable ? 'ring-2 ring-red-100' : ''
                }`}
              >
                {/* ─ Image area ─ */}
                <div className="relative h-32 bg-gray-100 overflow-hidden">
                  {item.image ? (
                    <img
                      src={resolveImg(item.image)}
                      alt={item.name}
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                        !item.isAvailable ? 'grayscale opacity-60' : ''
                      }`}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-text-muted gap-1">
                      <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs">No image</span>
                    </div>
                  )}

                  {/* Badge */}
                  {item.badge && (
                    <span className={`absolute top-3 left-3 px-2.5 py-1 text-[11px] font-bold rounded-lg uppercase tracking-wider shadow-sm ${badgeStyle(item.badge).bg} ${badgeStyle(item.badge).text}`}>
                      {item.badge}
                    </span>
                  )}

                  {/* Unavailable overlay */}
                  {!item.isAvailable && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <span className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg uppercase tracking-wider">
                        Unavailable
                      </span>
                    </div>
                  )}

                  {/* Discount tag */}
                  {item.discountPrice != null && (
                    <span className="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-[11px] font-bold rounded-lg shadow-sm">
                      {Math.round(((item.price - item.discountPrice) / item.price) * 100)}% OFF
                    </span>
                  )}

                  {/* Category chip */}
                  {catNameMap[item.categoryId] && (
                    <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/50 backdrop-blur-sm text-white text-[11px] font-medium rounded-lg">
                      {catNameMap[item.categoryId]}
                    </span>
                  )}
                </div>

                {/* ─ Content ─ */}
                <div className="p-3">
                  {/* Name + Price */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-text-primary leading-snug text-sm line-clamp-1">{item.name}</h3>
                    <div className="text-right shrink-0">
                      {item.discountPrice != null ? (
                        <>
                          <span className="font-bold text-primary text-sm">{formatCurrency(item.discountPrice)}</span>
                          <span className="block text-[10px] text-text-muted line-through">{formatCurrency(item.price)}</span>
                        </>
                      ) : (
                        <span className="font-bold text-primary text-sm">{formatCurrency(item.price)}</span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs text-text-secondary line-clamp-2 mb-2 leading-relaxed">{item.description}</p>
                  )}

                  {/* Diet Indicator */}
                  {item.dietType && (
                    <div className="mb-2">
                      <DietBadge type={item.dietType} showLabel />
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted mb-2">
                    {item.prepTime > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {item.prepTime} min
                      </span>
                    )}
                    {item.calories != null && item.calories > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
                        {item.calories} cal
                      </span>
                    )}
                    {(item.allergens || []).length > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-600" title={(item.allergens || []).join(', ')}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {(item.allergens || []).length} allergen{(item.allergens || []).length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {(item.customizationGroups || []).length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                        {(item.customizationGroups || []).length} option{(item.customizationGroups || []).length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Tags */}
                  {(item.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {(item.tags || []).slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-full text-text-secondary font-medium capitalize"
                        >
                          {tag}
                        </span>
                      ))}
                      {(item.tags || []).length > 3 && (
                        <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-full text-text-muted font-medium">+{(item.tags || []).length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
                    {/* Availability toggle */}
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={item.isAvailable}
                        onChange={() => toggleAvailabilityMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                        disabled={toggleAvailabilityMutation.isPending}
                      />
                      <span className={`text-[11px] font-medium ${item.isAvailable ? 'text-primary' : 'text-red-500'}`}>
                        {item.isAvailable ? 'Available' : 'Unavailable'}
                      </span>
                    </div>

                    {/* Edit / Delete */}
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => openEditItem(item)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
                        title="Edit item"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { setDeleteItemTarget({ id: item.id, name: item.name }); }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete item"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${
                  p === page
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-secondary hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-text-secondary hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            Next
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Item Modal ─────────────────────────────────────────── */}
      <Modal open={itemModalOpen} title={editingItem ? 'Edit Menu Item' : 'New Menu Item'} onClose={closeItemModal}>
        <MenuItemForm initial={editingItem} categories={categories} isLoading={isItemMutating} onSubmit={handleItemSubmit} onCancel={closeItemModal} />
      </Modal>

      {/* ── Category Modal ─────────────────────────────────────── */}
      <Modal open={catModalOpen} title={editingCat ? 'Edit Category' : 'New Category'} onClose={closeCatModal}>
        <CategoryForm initial={editingCat} isLoading={isCatMutating} onSubmit={handleCatSubmit} onCancel={closeCatModal} />
      </Modal>

      {/* ── Delete Category Confirmation ─────────────────── */}
      <Modal open={!!deleteCatTarget} title="Confirm Delete" onClose={() => setDeleteCatTarget(null)}>
        <p className="text-sm text-text-secondary mb-6">
          Are you sure you want to delete &ldquo;{deleteCatTarget?.name}&rdquo;? This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setDeleteCatTarget(null)}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (deleteCatTarget) {
                deleteCatMutation.mutate(deleteCatTarget.id);
                setDeleteCatTarget(null);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
          >
            Delete
          </button>
        </div>
      </Modal>

      {/* ── Delete Item Confirmation ────────────────────── */}
      <Modal open={!!deleteItemTarget} title="Confirm Delete" onClose={() => setDeleteItemTarget(null)}>
        <p className="text-sm text-text-secondary mb-6">
          Are you sure you want to delete &ldquo;{deleteItemTarget?.name}&rdquo;? This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setDeleteItemTarget(null)}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (deleteItemTarget) {
                deleteItemMutation.mutate(deleteItemTarget.id);
                setDeleteItemTarget(null);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
