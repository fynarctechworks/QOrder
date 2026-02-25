import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantService } from '../services/restaurantService';
import { useCartStore, selectTotalItems } from '../state/cartStore';
import {
  MenuSkeleton,
  FloatingCartButton,
  ItemDetailDrawer,
  DietBadge,
  getDietType,
} from '../components';
import { getCategoryIcon, getCategoryImage } from '../utils/categoryData';
import { formatPrice } from '../utils/formatPrice';
import type { MenuItem, SelectedCustomization } from '../types';
import { resolveImg } from '../utils/resolveImg';

export default function MenuPage() {
  const { restaurant, table, isLoading: isContextLoading, error } = useRestaurant();
  const { restaurantSlug, tableId } = useParams<{ restaurantSlug: string; tableId: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'non-veg'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const totalCartItems = useCartStore(selectTotalItems);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateItemQuantity = useCartStore((s) => s.updateItemQuantity);

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

  // Diet filter helper
  const matchesDietFilter = useCallback(
    (item: MenuItem) => {
      if (dietFilter === 'all') return true;
      return getDietType(item.tags, item.dietType) === dietFilter;
    },
    [dietFilter]
  );

  // Derived data
  const popularItems = useMemo(
    () => menuItems.filter((item) => item.isAvailable && matchesDietFilter(item)).slice(0, 8),
    [menuItems, matchesDietFilter]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return menuItems.filter(
      (item) =>
        matchesDietFilter(item) &&
        (item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.tags?.some((t) => t.toLowerCase().includes(q)))
    );
  }, [menuItems, searchQuery, matchesDietFilter]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    navigate(`/r/${restaurantSlug}/t/${tableId}/category/${categoryId}`);
  }, [navigate, restaurantSlug, tableId]);

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

  const fmtPrice = useCallback(
    (price: number) => formatPrice(price, restaurant?.currency || 'USD'),
    [restaurant?.currency]
  );

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (isContextLoading || isCategoriesLoading || isMenuLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-white px-5 pt-10 pb-4">
          <div className="skeleton h-5 w-40 mb-2" />
          <div className="skeleton h-8 w-56 mb-4" />
          <div className="skeleton h-12 w-full rounded-2xl" />
        </div>
        <MenuSkeleton />
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="card p-6 text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
          <p className="text-text-secondary">{error.message || 'Unable to load menu. Please try again.'}</p>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="card p-6 text-center max-w-sm">
          <h2 className="text-lg font-semibold text-text-primary mb-2">Restaurant Not Found</h2>
          <p className="text-text-secondary">The restaurant you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-8">
      {/* ─── Header ─────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 safe-top">
        {/* Primary colored top section */}
        <div className="bg-primary">
          <div className="px-5 pt-4 pb-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 font-medium tracking-wide uppercase">Now Serving</p>
              <h1 className="text-lg font-extrabold text-white tracking-tight truncate" style={{ fontFamily: "'Modern Negra', serif" }}>
                {restaurant.name}
              </h1>
              {table && (
                <p className="text-sm text-white/70 font-medium">
                  Table {table.number}
                </p>
              )}
            </div>

            {/* Cart icon */}
            <button
              onClick={() => navigate(`/r/${restaurantSlug}/t/${tableId}/cart`)}
              aria-label="View cart"
              className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/15 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {totalCartItems > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-white text-primary text-[10px] font-bold rounded-full px-1">
                  {totalCartItems > 99 ? '99+' : totalCartItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="bg-background px-5 pt-4 pb-3">
          <div className={`flex items-center gap-3 bg-surface-elevated rounded-xl px-4 py-3 border border-surface-border shadow-soft transition-all duration-200 ${isSearchFocused ? 'ring-2 ring-primary/20 border-primary/40' : ''}`}>
            <svg className="w-5 h-5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={`Search for dishes...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              aria-label="Search for dishes"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-0.5">
                <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Veg / Non-Veg Filter */}
          <div className="flex items-center gap-2 mt-3">
            {(['all', 'veg', 'non-veg'] as const).map((filter) => {
              const isActive = dietFilter === filter;
              const label = filter === 'all' ? 'All' : filter === 'veg' ? 'Veg' : 'Non-Veg';
              const dotColor = filter === 'veg' ? 'bg-emerald-600' : filter === 'non-veg' ? 'bg-red-600' : '';
              return (
                <button
                  key={filter}
                  onClick={() => setDietFilter(filter)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                    isActive
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface-elevated text-text-secondary border-surface-border hover:border-primary/30'
                  }`}
                >
                  {filter !== 'all' && (
                    <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-white' : dotColor}`} />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ─── Main Content ───────────────────────────────────────────────────────── */}
      <main>
        {/* ─── Home View ───────────────────────────────────────────────────────── */}
        {!searchQuery.trim() && (
          <>
            {/* Category Grid */}
            {categories.length > 0 && (
              <section className="px-5 pt-4 pb-2">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {categories.map((cat) => {
                    const image = getCategoryImage(cat.name, cat.image);

                    return (
                      <button
                        key={cat.id}
                        onClick={() => handleCategoryClick(cat.id)}
                        className="rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-md active:scale-[0.97]"
                        style={{ backgroundColor: '#f0f4ee' }}
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden mb-2 bg-white/60 mx-auto">
                          {image ? (
                            <img
                              src={image}
                              alt={cat.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-2xl">{getCategoryIcon(cat.name)}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-text-primary leading-tight line-clamp-2">
                          {cat.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Divider */}
            <div className="mx-5 my-4 border-t border-surface-border" />

            {/* Popular Items */}
            {popularItems.length > 0 && (
              <section className="px-5 pb-4">
                <h2 className="text-lg font-extrabold text-text-primary mb-3">Popular Dishes</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {popularItems.map((item) => {
                    const cartItem = cartItems.find((ci) => ci.menuItem.id === item.id);

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemSelect(item)}
                        className="bg-surface-elevated rounded-2xl border border-surface-border/60 overflow-hidden text-left group transition-shadow duration-200 hover:shadow-card"
                      >
                        {/* Image */}
                        <div className="relative w-full aspect-[4/3] bg-surface overflow-hidden">
                          {item.image ? (
                            <img
                              src={resolveImg(item.image)}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-3xl opacity-30">🍽️</span>
                            </div>
                          )}
                          {/* Quantity stepper / Add button */}
                          {item.isAvailable && (
                            cartItem ? (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute bottom-2 right-2 flex items-center bg-primary rounded-lg shadow-md overflow-hidden"
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (cartItem.quantity <= 1) removeItem(cartItem.id);
                                    else updateItemQuantity(cartItem.id, cartItem.quantity - 1);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center text-white hover:bg-primary-hover transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                                  </svg>
                                </button>
                                <span className="px-1.5 text-xs font-bold text-white min-w-[20px] text-center">
                                  {cartItem.quantity}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickAdd(item);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center text-white hover:bg-primary-hover transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickAdd(item);
                                }}
                                className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center bg-primary text-white rounded-lg shadow-md hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                              </div>
                            )
                          )}
                          {!item.isAvailable && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="text-white text-xs font-bold bg-black/50 px-2 py-0.5 rounded-full">Sold Out</span>
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="p-3">
                          <div className="flex items-center gap-1.5">
                            <DietBadge tags={item.tags} dietType={item.dietType} size="sm" />
                            <h3 className="text-sm font-semibold text-text-primary line-clamp-1 leading-tight">
                              {item.name}
                            </h3>
                          </div>
                          <p className="text-xs text-text-muted line-clamp-1 mt-0.5">{item.description}</p>
                          <p className="text-sm font-bold text-primary mt-1.5">{fmtPrice(item.price)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* ─── Search Results View ─────────────────────────────────────────── */}
        {searchQuery.trim() && (
          <div className="px-5 pt-4 pb-4">
            <p className="text-sm text-text-secondary mb-2">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "<span className="font-semibold text-text-primary">{searchQuery}</span>"
            </p>
            {searchResults.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">No items found</h3>
                <p className="text-text-secondary text-sm">Try a different search term</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-hover transition-colors"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 items-start">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="bg-surface-elevated rounded-2xl border border-surface-border/60 overflow-hidden"
                  >
                    <button
                      onClick={() => item.isAvailable && handleItemSelect(item)}
                      className="relative w-full aspect-[4/3] bg-surface group"
                    >
                      {item.image ? (
                        <img src={resolveImg(item.image)} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl opacity-30">🍽️</span>
                        </div>
                      )}
                      {!item.isAvailable && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-white text-xs font-bold bg-black/50 px-2 py-0.5 rounded-full">Sold Out</span>
                        </div>
                      )}
                    </button>
                    <div className="p-2">
                      <div className="flex items-center gap-1.5">
                        <DietBadge tags={item.tags} dietType={item.dietType} size="sm" />
                        <h3 className="text-sm font-semibold text-text-primary leading-tight line-clamp-1">{item.name}</h3>
                      </div>
                      <p className="text-sm font-bold text-primary mt-1 mb-2">{fmtPrice(item.price)}</p>
                      {item.isAvailable && (
                        <button
                          onClick={() => handleQuickAdd(item)}
                          className="w-full py-1.5 bg-white border-2 border-primary rounded-xl text-primary text-xs font-bold shadow-sm hover:bg-primary hover:text-white active:scale-95 transition-all"
                        >
                          ADD
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

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