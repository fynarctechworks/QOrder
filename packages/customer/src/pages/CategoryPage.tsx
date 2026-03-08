import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantService } from '../services/restaurantService';
import { useCartStore } from '../state/cartStore';
import { groupOrderService, type GroupOrder } from '../services/groupOrderService';
import { FloatingCartButton, MenuSkeleton, ItemDetailDrawer, DietBadge, getDietType } from '../components';
import { useUIStore } from '../state/uiStore';
import { getCategoryIcon, getCategoryImage } from '../utils/categoryData';
import { formatPrice } from '../utils/formatPrice';
import type { MenuItem, SelectedCustomization } from '../types';
import { resolveImg } from '../utils/resolveImg';
import { useTranslation } from 'react-i18next';
import { translateTag } from '../utils/translateTag';

export default function CategoryPage() {
  const { restaurant, isLoading: isContextLoading, error } = useRestaurant();
  const { t, i18n } = useTranslation();  const { restaurantSlug, tableId, categoryId: initialCategoryId } = useParams<{
    restaurantSlug: string;
    tableId: string;
    categoryId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // ─── Group mode detection ─────────────────────────────────
  const groupCode = searchParams.get('group')?.toUpperCase() || '';
  const isGroupMode = !!groupCode;
  const groupParticipantId = isGroupMode
    ? sessionStorage.getItem(`group:${groupCode}:participantId`) || ''
    : '';

  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    initialCategoryId && initialCategoryId !== 'all' ? initialCategoryId : null
  );
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'non-veg'>('all');
  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null);
  // Track loading per-item so concurrent adds are possible
  const [addingSet, setAddingSet] = useState<Set<string>>(new Set());

  // ─── Regular cart store (only used in non-group mode) ─────
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateItemQuantity = useCartStore((s) => s.updateItemQuantity);

  // ─── Group order data (only fetched in group mode) ────────
  const { data: group } = useQuery<GroupOrder>({
    queryKey: ['groupOrder', groupCode],
    queryFn: () => groupOrderService.getByCode(groupCode),
    enabled: isGroupMode && !!groupCode,
    staleTime: 60000,
  });

  const myGroupCartItems = useMemo(() => {
    if (!isGroupMode || !group || !groupParticipantId) return [];
    const me = group.participants.find((p) => p.id === groupParticipantId);
    return me?.cartItems || [];
  }, [isGroupMode, group, groupParticipantId]);

  // ─── Unified cart helpers ─────────────────────────────────
  const getCartQuantity = useCallback(
    (menuItemId: string) => {
      if (isGroupMode) {
        return myGroupCartItems
          .filter((ci) => ci.menuItemId === menuItemId)
          .reduce((sum, ci) => sum + ci.quantity, 0);
      }
      return cartItems
        .filter((ci) => ci.menuItem.id === menuItemId)
        .reduce((sum, ci) => sum + ci.quantity, 0);
    },
    [isGroupMode, myGroupCartItems, cartItems]
  );

  const isItemInCart = useCallback(
    (menuItemId: string) => {
      if (isGroupMode) {
        return myGroupCartItems.some((ci) => ci.menuItemId === menuItemId);
      }
      return cartItems.some((ci) => ci.menuItem.id === menuItemId);
    },
    [isGroupMode, myGroupCartItems, cartItems]
  );

  // Fetch data
  const { data: categories = [], isLoading: isCategoriesLoading } = useQuery({
    queryKey: ['categories', restaurant?.id, i18n.language],
    queryFn: () => restaurantService.getCategories(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  const { data: menuItems = [], isLoading: isMenuLoading } = useQuery({
    queryKey: ['menu', restaurant?.id, i18n.language],
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

  // ─── Optimistic helpers ────────────────────────────────────
  const optimisticUpdateGroup = useCallback(
    (updater: (old: GroupOrder) => GroupOrder) => {
      const prev = queryClient.getQueryData<GroupOrder>(['groupOrder', groupCode]);
      if (prev) queryClient.setQueryData(['groupOrder', groupCode], updater(prev));
      return prev; // for rollback
    },
    [queryClient, groupCode],
  );

  const rollbackGroup = useCallback(
    (prev: GroupOrder | undefined) => {
      if (prev) queryClient.setQueryData(['groupOrder', groupCode], prev);
    },
    [queryClient, groupCode],
  );

  // ─── Group cart add (optimistic) ──────────────────────────
  const addToGroupCart = useCallback(
    async (item: MenuItem, quantity: number, customizations: SelectedCustomization[], specialInstructions?: string) => {
      if (!groupParticipantId) return;
      const itemId = item.id;

      // Optimistic: update cache immediately
      const prev = optimisticUpdateGroup((old) => ({
        ...old,
        participants: old.participants.map((p) => {
          if (p.id !== groupParticipantId) return p;
          const existing = p.cartItems.find((ci) => ci.menuItemId === itemId && customizations.length === 0);
          if (existing) {
            return {
              ...p,
              cartItems: p.cartItems.map((ci) =>
                ci.id === existing.id
                  ? { ...ci, quantity: ci.quantity + quantity, totalPrice: (ci.quantity + quantity) * ci.unitPrice }
                  : ci
              ),
            };
          }
          // Add new item optimistically with a temp id
          const price = item.discountPrice ?? item.price;
          const tempItem: import('../services/groupOrderService').GroupCartItem = {
            id: `temp-${Date.now()}-${itemId}`,
            menuItemId: itemId,
            quantity,
            unitPrice: price,
            totalPrice: price * quantity,
            notes: specialInstructions,
            modifiers: [],
            menuItem: {
              id: item.id,
              name: item.name,
              price: item.price,
              discountPrice: item.discountPrice ?? undefined,
              image: item.image ?? undefined,
              dietType: item.dietType,
            },
          };
          return { ...p, cartItems: [...p.cartItems, tempItem] };
        }),
      }));

      // Mark loading for this item
      setAddingSet((s) => new Set(s).add(itemId));

      try {
        const modifiers = customizations.flatMap((c) =>
          c.options.map((opt) => ({ modifierId: opt.id }))
        );
        await groupOrderService.addCartItem(groupCode, groupParticipantId, {
          menuItemId: itemId,
          quantity,
          notes: specialInstructions,
          ...(modifiers.length > 0 ? { modifiers } : {}),
        });
        // Sync with server data in background (non-blocking)
        queryClient.invalidateQueries({ queryKey: ['groupOrder', groupCode] });
      } catch (err: any) {
        console.error('Failed to add item:', err);
        rollbackGroup(prev);
      } finally {
        setAddingSet((s) => {
          const next = new Set(s);
          next.delete(itemId);
          return next;
        });
      }
    },
    [groupCode, groupParticipantId, optimisticUpdateGroup, rollbackGroup, queryClient],
  );

  // ─── Group cart remove (optimistic) ───────────────────────
  const handleGroupRemoveItem = useCallback(
    async (menuItemId: string) => {
      const cartItem = myGroupCartItems.find((ci) => ci.menuItemId === menuItemId);
      if (!cartItem || !groupParticipantId) return;

      // Optimistic: update cache immediately
      const prev = optimisticUpdateGroup((old) => ({
        ...old,
        participants: old.participants.map((p) => {
          if (p.id !== groupParticipantId) return p;
          if (cartItem.quantity <= 1) {
            return { ...p, cartItems: p.cartItems.filter((ci) => ci.id !== cartItem.id) };
          }
          return {
            ...p,
            cartItems: p.cartItems.map((ci) =>
              ci.id === cartItem.id
                ? { ...ci, quantity: ci.quantity - 1, totalPrice: (ci.quantity - 1) * ci.unitPrice }
                : ci
            ),
          };
        }),
      }));

      try {
        if (cartItem.quantity <= 1) {
          await groupOrderService.removeCartItem(groupCode, groupParticipantId, cartItem.id);
        } else {
          await groupOrderService.updateCartItem(groupCode, groupParticipantId, cartItem.id, {
            quantity: cartItem.quantity - 1,
          });
        }
        // Sync with server in background
        queryClient.invalidateQueries({ queryKey: ['groupOrder', groupCode] });
      } catch (err: any) {
        console.error('Failed to remove item:', err);
        rollbackGroup(prev);
      }
    },
    [groupCode, groupParticipantId, myGroupCartItems, optimisticUpdateGroup, rollbackGroup, queryClient],
  );

  // ─── Unified quick add ────────────────────────────────────
  const handleQuickAdd = useCallback(
    (item: MenuItem) => {
      if (item.customizationGroups && item.customizationGroups.length > 0) {
        setDrawerItem(item);
      } else if (isGroupMode) {
        addToGroupCart(item, 1, [], undefined);
      } else {
        addItem(item, 1, [], undefined);
      }
    },
    [isGroupMode, addToGroupCart, addItem]
  );

  const handleDrawerAddToCart = useCallback(
    (item: MenuItem, quantity: number, customizations: SelectedCustomization[], specialInstructions?: string) => {
      if (isGroupMode) {
        addToGroupCart(item, quantity, customizations, specialInstructions);
        setDrawerItem(null);
      } else {
        addItem(item, quantity, customizations, specialInstructions);
      }
    },
    [isGroupMode, addToGroupCart, addItem]
  );

  const handleDecrementItem = useCallback(
    (item: MenuItem) => {
      if (isGroupMode) {
        handleGroupRemoveItem(item.id);
        return;
      }
      const cartItem = cartItems.find((ci) => ci.menuItem.id === item.id);
      if (cartItem) {
        if (cartItem.quantity <= 1) {
          removeItem(cartItem.id);
        } else {
          updateItemQuantity(cartItem.id, cartItem.quantity - 1);
        }
      }
    },
    [isGroupMode, handleGroupRemoveItem, cartItems, removeItem, updateItemQuantity]
  );

  const fmtPrice = useCallback(
    (price: number) => formatPrice(price, restaurant?.currency || 'USD'),
    [restaurant?.currency]
  );

  // ─── Back navigation ──────────────────────────────────────
  const handleBack = useCallback(() => {
    if (isGroupMode) {
      navigate(`/group/${groupCode}`);
    } else {
      navigate(`/r/${restaurantSlug}/t/${tableId}/menu`);
    }
  }, [isGroupMode, groupCode, navigate, restaurantSlug, tableId]);

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
          <h2 className="text-lg font-semibold text-text-primary mb-2">{t('common.error')}</h2>
          <p className="text-text-secondary">{error?.message || t('menu.unableToLoadMenu')}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl"
          >
            {t('common.goBack')}
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
            onClick={handleBack}
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
          {isGroupMode ? (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full font-medium flex-shrink-0">
              {groupCode}
            </span>
          ) : (
            <button
              onClick={() => navigate(`/r/${restaurantSlug}/t/${tableId}/menu`)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          )}
        </div>

        {/* Veg / Non-Veg Filter */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-100">
          {(['all', 'veg', 'non-veg'] as const).map((filter) => {
            const isActive = dietFilter === filter;
            const label = filter === 'all' ? t('menu.all') : filter === 'veg' ? t('menu.veg') : t('menu.nonVeg');
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
              <h3 className="text-base font-semibold text-text-primary mb-1">{t('menu.categoryEmpty')}</h3>
              <p className="text-sm text-text-secondary">{t('menu.categoryEmptyDesc')}</p>
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
                    onClick={() => item.isAvailable && (isGroupMode ? setDrawerItem(item) : handleItemSelect(item))}
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
                        <span className="text-white text-xs font-bold bg-black/50 px-2 py-0.5 rounded-full">{t('menu.soldOut')}</span>
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
                            disabled={addingSet.has(item.id)}
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
                          disabled={addingSet.has(item.id)}
                          className="px-6 py-1.5 bg-white border-2 border-primary rounded-lg text-primary text-sm font-bold shadow-sm hover:bg-primary hover:text-white active:scale-95 transition-all disabled:opacity-50"
                        >
                          {addingSet.has(item.id) ? (
                            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          ) : (
                            t('menu.add').toUpperCase()
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-1">
                      {item.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] font-medium text-text-muted bg-gray-100 px-1.5 py-0.5 rounded">
                          {translateTag(tag, t)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Name */}
                  <div className="flex items-center gap-1.5">
                    <DietBadge tags={item.tags} dietType={item.dietType} size="sm" />
                    <h3
                      className="text-sm font-semibold text-text-primary leading-tight line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => item.isAvailable && (isGroupMode ? setDrawerItem(item) : handleItemSelect(item))}
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

      {/* Floating Cart Button — show group version or regular */}
      {isGroupMode ? (
        <FloatingGroupCartButton
          totalItems={myGroupCartItems.reduce((sum, ci) => sum + ci.quantity, 0)}
          thumbnails={myGroupCartItems
            .filter((ci) => ci.menuItem.image)
            .slice(0, 3)
            .map((ci) => resolveImg(ci.menuItem.image)!)}
          onClick={() => navigate(`/group/${groupCode}`)}
        />
      ) : (
        <FloatingCartButton />
      )}

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

/* ─── Floating Group Cart Button ───────────────────────────────────────────── */
function FloatingGroupCartButton({
  totalItems,
  thumbnails,
  onClick,
}: {
  totalItems: number;
  thumbnails: string[];
  onClick: () => void;
}) {
  const isDrawerOpen = useUIStore((s) => s.isDrawerOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [bounce, setBounce] = useState(false);
  const prevItemsRef = useRef(totalItems);

  const shouldShow = totalItems > 0 && !isDrawerOpen;

  useEffect(() => {
    if (shouldShow) {
      const t = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(t);
    } else {
      setIsVisible(false);
    }
  }, [shouldShow]);

  useEffect(() => {
    if (totalItems !== prevItemsRef.current && totalItems > 0) {
      setBounce(true);
      const t = setTimeout(() => setBounce(false), 400);
      prevItemsRef.current = totalItems;
      return () => clearTimeout(t);
    }
    prevItemsRef.current = totalItems;
  }, [totalItems]);

  if (!shouldShow) return null;

  return createPortal(
    <div
      className={`fixed bottom-[4.5rem] left-4 right-4 z-[9999] safe-bottom lg:left-0 lg:right-0 lg:mx-auto lg:max-w-[1280px] lg:px-8 transition-all duration-300 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <button
        onClick={onClick}
        aria-label={`View group cart, ${totalItems} ${totalItems === 1 ? 'item' : 'items'}`}
        className="w-full lg:max-w-md lg:mx-auto flex items-center justify-between pl-3 pr-3 py-2.5 bg-primary text-white rounded-2xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform duration-150"
      >
        <div className="flex items-center gap-3">
          {thumbnails.length > 0 && (
            <div className="flex items-center -space-x-2.5">
              {thumbnails.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className={`w-9 h-9 rounded-full border-2 border-white/30 object-cover transition-transform duration-300 ${
                    bounce ? 'scale-110' : 'scale-100'
                  }`}
                  style={{ zIndex: thumbnails.length - i }}
                />
              ))}
            </div>
          )}
          <div className="text-left">
            <span className="font-bold text-[15px] leading-tight block">Back to Group</span>
            <span className="text-xs text-white/75 font-medium">
              {totalItems} {totalItems === 1 ? 'Item' : 'Items'}
            </span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
    </div>,
    document.body
  );
}
