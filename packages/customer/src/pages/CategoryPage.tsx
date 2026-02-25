import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantService } from '../services/restaurantService';
import { useCartStore } from '../state/cartStore';
import { FloatingCartButton, MenuSkeleton, ItemDetailDrawer, DietBadge, getDietType } from '../components';
import { getCategoryIcon, getCategoryImage } from '../utils/categoryData';
import { formatPrice } from '../utils/formatPrice';
import type { MenuItem, SelectedCustomization } from '../types';
import { resolveImg } from '../utils/resolveImg';

export default function CategoryPage() {
  const { restaurant, isLoading: isContextLoading, error } = useRestaurant();
  const { restaurantSlug, tableId, categoryId: initialCategoryId } = useParams<{
    restaurantSlug: string;
    tableId: string;
    categoryId: string;
  }>();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategoryId || null);
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'non-veg'>('all');
  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateItemQuantity = useCartStore((s) => s.updateItemQuantity);

  const getCartQuantity = useCallback(
    (menuItemId: string) =>
      cartItems.filter((ci) => ci.menuItem.id === menuItemId).reduce((sum, ci) => sum + ci.quantity, 0),
    [cartItems]
  );

  const isItemInCart = useCallback(
    (menuItemId: string) => cartItems.some((ci) => ci.menuItem.id === menuItemId),
    [cartItems]
  );

  // Fetch data
  const { data: categories = [], isLoading: isCategoriesLoading } = useQuery({
    queryKey: ['categories', restaurant?.id],
    queryFn: () => restaurantService.getCategories(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  const { data: menuItems = [], isLoading: isMenuLoading } = useQuery({
    queryKey: ['menu', restaurant?.id],
    queryFn: () => restaurantService.getMenuItems(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  // Auto-select first category if none selected
  const activeCategoryId = selectedCategory || categories[0]?.id || null;

  const activeCategory = categories.find((cat) => cat.id === activeCategoryId);

  const categoryItems = useMemo(() => {
    if (!activeCategoryId) return [];
    return menuItems.filter((item) => {
      if (item.categoryId !== activeCategoryId) return false;
      if (dietFilter === 'all') return true;
      return getDietType(item.tags, item.dietType) === dietFilter;
    });
  }, [menuItems, activeCategoryId, dietFilter]);

  const handleItemSelect = useCallback(
    (item: MenuItem) => navigate(`/r/${restaurantSlug}/t/${tableId}/item/${item.id}`),
    [navigate, restaurantSlug, tableId]
  );

  const handleQuickAdd = useCallback(
    (item: MenuItem) => {
      if (item.customizationGroups && item.customizationGroups.length > 0) {
        setDrawerItem(item);
      } else {
        addItem(item, 1, [], undefined);
      }
    },
    [addItem]
  );

  const handleDrawerAddToCart = useCallback(
    (item: MenuItem, quantity: number, customizations: SelectedCustomization[], specialInstructions?: string) => {
      addItem(item, quantity, customizations, specialInstructions);
    },
    [addItem]
  );

  const handleDecrementItem = useCallback(
    (item: MenuItem) => {
      const cartItem = cartItems.find((ci) => ci.menuItem.id === item.id);
      if (cartItem) {
        if (cartItem.quantity <= 1) {
          removeItem(cartItem.id);
        } else {
          updateItemQuantity(cartItem.id, cartItem.quantity - 1);
        }
      }
    },
    [cartItems, removeItem, updateItemQuantity]
  );

  const fmtPrice = useCallback(
    (price: number) => formatPrice(price, restaurant?.currency || 'USD'),
    [restaurant?.currency]
  );

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (isContextLoading || isCategoriesLoading || isMenuLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="h-14 border-b border-gray-100 flex items-center gap-3 px-4">
          <div className="skeleton w-9 h-9 rounded-full" />
          <div className="skeleton h-5 w-32" />
        </div>
        <MenuSkeleton />
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────────
  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="card p-6 text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
          <p className="text-text-secondary">{error?.message || 'Unable to load menu.'}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 safe-top">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(`/r/${restaurantSlug}/t/${tableId}/menu`)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition-all flex-shrink-0"
          >
            <svg className="w-5 h-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-text-primary truncate">
              {activeCategory?.name || 'Menu'}
            </h1>
          </div>
          <button
            onClick={() => navigate(`/r/${restaurantSlug}/t/${tableId}/menu`)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>

        {/* Veg / Non-Veg Filter */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-100">
          {(['all', 'veg', 'non-veg'] as const).map((filter) => {
            const isActive = dietFilter === filter;
            const label = filter === 'all' ? 'All' : filter === 'veg' ? 'Veg' : 'Non-Veg';
            const dotColor = filter === 'veg' ? 'bg-emerald-600' : filter === 'non-veg' ? 'bg-red-600' : '';
            return (
              <button
                key={filter}
                onClick={() => setDietFilter(filter)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-secondary border-gray-200 hover:border-primary/30'
                }`}
              >
                {filter !== 'all' && (
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : dotColor}`} />
                )}
                {label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ─── Sidebar + Grid Layout ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left category sidebar */}
        <aside className="w-20 flex-shrink-0 bg-gray-50 border-r border-gray-100 overflow-y-auto hide-scrollbar">
          <div className="py-2">
            {categories.map((cat) => {
              const isActive = activeCategoryId === cat.id;
              const image = getCategoryImage(cat.name, cat.image);
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex flex-col items-center gap-1.5 py-3 px-1 relative transition-colors ${
                    isActive ? 'bg-white' : 'hover:bg-gray-100'
                  }`}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-r-full" />
                  )}
                  {/* Category image */}
                  <div className={`w-14 h-14 rounded-xl overflow-hidden border-2 ${
                    isActive ? 'border-primary/30' : 'border-transparent'
                  }`}>
                    {image ? (
                      <img src={image} alt={cat.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <span className="text-2xl">{getCategoryIcon(cat.name)}</span>
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold leading-tight text-center line-clamp-2 px-0.5 ${
                    isActive ? 'text-primary' : 'text-text-secondary'
                  }`}>
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right content: item grid */}
        <div className="flex-1 overflow-y-auto pb-28 lg:pb-8">
          {categoryItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="text-5xl mb-4">🍽️</div>
              <h3 className="text-base font-semibold text-text-primary mb-1">No items yet</h3>
              <p className="text-sm text-text-secondary">This category is empty</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-0">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-r border-gray-100 p-3 flex flex-col"
                >
                  {/* Item image */}
                  <button
                    onClick={() => item.isAvailable && handleItemSelect(item)}
                    className="relative w-full aspect-square rounded-xl overflow-hidden bg-gray-50 mb-2.5 group"
                  >
                    {item.image ? (
                      <img
                        src={resolveImg(item.image)}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-4xl opacity-30">🍽️</span>
                      </div>
                    )}
                    {!item.isAvailable && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-black/50 px-2 py-0.5 rounded-full">Sold Out</span>
                      </div>
                    )}
                  </button>

                  {/* ADD / quantity button */}
                  {item.isAvailable && (
                    <div className="flex justify-center -mt-6 mb-1 relative z-10">
                      {isItemInCart(item.id) ? (
                        <div className="flex items-center bg-primary rounded-lg shadow-md overflow-hidden">
                          <button
                            onClick={() => handleDecrementItem(item)}
                            className="w-8 h-8 flex items-center justify-center text-white hover:bg-primary-hover transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                            </svg>
                          </button>
                          <span className="px-2 text-sm font-bold text-white min-w-[24px] text-center">
                            {getCartQuantity(item.id)}
                          </span>
                          <button
                            onClick={() => handleQuickAdd(item)}
                            className="w-8 h-8 flex items-center justify-center text-white hover:bg-primary-hover transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleQuickAdd(item)}
                          className="px-6 py-1.5 bg-white border-2 border-primary rounded-lg text-primary text-sm font-bold shadow-sm hover:bg-primary hover:text-white active:scale-95 transition-all"
                        >
                          ADD
                        </button>
                      )}
                    </div>
                  )}

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-1">
                      {item.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] font-medium text-text-muted bg-gray-100 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Name */}
                  <div className="flex items-center gap-1.5">
                    <DietBadge tags={item.tags} dietType={item.dietType} size="sm" />
                    <h3
                      className="text-sm font-semibold text-text-primary leading-tight line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => item.isAvailable && handleItemSelect(item)}
                    >
                      {item.name}
                    </h3>
                  </div>

                  {/* Price */}
                  <p className="text-sm font-bold text-text-primary mt-auto pt-1.5">
                    {fmtPrice(item.price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Cart Button */}
      <FloatingCartButton />

      {/* Item customization drawer */}
      <ItemDetailDrawer
        item={drawerItem}
        currency={restaurant?.currency || 'USD'}
        isOpen={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        onAddToCart={handleDrawerAddToCart}
      />
    </div>
  );
}
