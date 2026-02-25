import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantService } from '../services/restaurantService';
import { useCartStore } from '../state/cartStore';
import { formatPrice } from '../utils/formatPrice';
import { resolveImg } from '../utils/resolveImg';
import {
  areRequiredModifiersSatisfied,
  getModifierValidationErrors,
  calculateItemTotal,
  buildCustomizations,
} from '../utils/itemDetailHelpers';
import { DietBadge, getDietType, filterDietTags } from '../components/DietBadge';
import type { MenuItem, SelectedOption, CustomizationGroup as CustomizationGroupType } from '../types';

/* ─── Sub-components (co-located to keep risk low) ─────────────────────────── */

/** Hero image section with back/share buttons and mobile overlay. */
function HeroSection({
  item,
  onBack,
}: {
  item: MenuItem;
  onBack: () => void;
}) {
  return (
    <div className="relative w-full lg:w-1/2 lg:sticky lg:top-0 lg:h-screen">
      {item.image ? (
        <div className="relative w-full aspect-[4/3] lg:aspect-auto lg:h-full overflow-hidden">
          <img
            src={resolveImg(item.image)}
            alt={item.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent lg:hidden" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-transparent h-24 lg:h-20" />
        </div>
      ) : (
        <div className="w-full aspect-[4/3] lg:aspect-auto lg:h-screen bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center">
          <span className="text-7xl opacity-20">🍽️</span>
        </div>
      )}

      <button
        onClick={onBack}
        aria-label="Go back"
        className="absolute top-4 left-4 safe-top w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md border border-white/20 text-white hover:bg-black/40 active:scale-95 transition-all z-10"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        aria-label="Share"
        className="absolute top-4 right-4 safe-top w-10 h-10 hidden lg:flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md border border-white/20 text-white hover:bg-black/40 active:scale-95 transition-all z-10"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>

      <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 lg:hidden">
        {!item.isAvailable && (
          <span className="inline-block mb-2 px-3 py-1 bg-primary/90 text-white text-xs font-bold rounded-full backdrop-blur-sm">
            Currently Unavailable
          </span>
        )}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {item.badge && item.isAvailable && (
            <span className="inline-block px-3 py-1 bg-white/90 text-primary text-xs font-bold rounded-full backdrop-blur-sm">
              {item.badge}
            </span>
          )}
          {item.category?.name && (
            <span className="inline-block px-3 py-1 bg-white/60 text-gray-800 text-xs font-semibold rounded-full backdrop-blur-sm">
              {item.category.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DietBadge tags={item.tags} dietType={item.dietType} size="md" />
          <h1 className="text-2xl font-extrabold text-white tracking-tight leading-tight drop-shadow-lg">
            {item.name}
          </h1>
        </div>
      </div>
    </div>
  );
}

/** Single customization group with radio/checkbox options. */
function CustomizationGroup({
  group,
  selectedOptions,
  onToggle,
  fmtPrice,
}: {
  group: CustomizationGroupType;
  selectedOptions: SelectedOption[];
  onToggle: (groupId: string, option: SelectedOption, maxSelections: number) => void;
  fmtPrice: (price: number) => string;
}) {
  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            {group.name}
          </h3>
          {group.maxSelections > 1 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Select up to {group.maxSelections}
            </p>
          )}
        </div>
        {group.required && (
          <span className="text-[10px] text-primary font-bold px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 uppercase tracking-wider">
            Required
          </span>
        )}
      </div>
      <div className="space-y-2">
        {group.options
          .filter((opt) => opt.isAvailable)
          .map((option) => {
            const isSelected = selectedOptions.some((s) => s.id === option.id);
            const isSingleSelect = group.maxSelections === 1;

            return (
              <button
                key={option.id}
                onClick={() =>
                  onToggle(
                    group.id,
                    { id: option.id, name: option.name, priceModifier: option.priceModifier },
                    group.maxSelections
                  )
                }
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl transition-all duration-150 ${
                  isSelected
                    ? 'bg-primary/5 border-[1.5px] border-primary shadow-sm shadow-primary/5'
                    : 'bg-white border-[1.5px] border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                }`}
              >
                <div className={`w-5 h-5 ${isSingleSelect ? 'rounded-full' : 'rounded-md'} border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`flex-1 text-left text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                  {option.name}
                </span>
                {option.priceModifier > 0 && (
                  <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-gray-400'}`}>
                    +{fmtPrice(option.priceModifier)}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}

/** Mobile fixed-bottom call-to-action bar. */
function MobileBottomCTA({
  isInCart,
  isAvailable,
  canAddToCart,
  quantity,
  total,
  fmtPrice,
  onQuantityChange,
  onRemove,
  onAddToCart,
  onGoToCart,
}: {
  isInCart: boolean;
  isAvailable: boolean;
  canAddToCart: boolean;
  quantity: number;
  total: number;
  fmtPrice: (price: number) => string;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
  onAddToCart: () => void;
  onGoToCart: () => void;
}) {
  return createPortal(
    <div className="fixed bottom-0 inset-x-0 z-[9998] lg:hidden safe-bottom">
      <div className="bg-white/90 backdrop-blur-xl border-t border-gray-200/60 px-5 py-3.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        {isInCart ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
              <button
                onClick={() => {
                  if (quantity <= 1) onRemove();
                  else onQuantityChange(quantity - 1);
                }}
                aria-label="Decrease quantity"
                className="w-10 h-11 flex items-center justify-center text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>
              <span className="px-3 text-sm font-bold text-gray-900 min-w-[32px] text-center">{quantity}</span>
              <button
                onClick={() => onQuantityChange(quantity + 1)}
                aria-label="Increase quantity"
                className="w-10 h-11 flex items-center justify-center text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <button
              onClick={onGoToCart}
              className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover active:scale-[0.98] transition-all shadow-lg shadow-primary/25"
            >
              Go to Cart · {fmtPrice(total)}
            </button>
          </div>
        ) : (
          <button
            onClick={onAddToCart}
            disabled={!isAvailable || !canAddToCart}
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
              !isAvailable || !canAddToCart
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/25'
            }`}
          >
            {!isAvailable
              ? 'Currently Unavailable'
              : !canAddToCart
                ? 'Select Required Options'
                : `Add to Cart · ${fmtPrice(total)}`}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ─── Main Page Component ──────────────────────────────────────────────────── */

export default function ItemDetailPage() {
  const { itemId, restaurantSlug, tableId } = useParams<{
    itemId: string;
    restaurantSlug: string;
    tableId: string;
  }>();
  const navigate = useNavigate();
  const { restaurant, isLoading: isContextLoading } = useRestaurant();
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateItemQuantity = useCartStore((s) => s.updateItemQuantity);
  const updateItemCustomizations = useCartStore((s) => s.updateItemCustomizations);
  const cartItems = useCartStore((s) => s.items);

  // Check if this item is already in cart
  const cartItem = itemId ? cartItems.find((ci) => ci.menuItem.id === itemId) : undefined;
  const isInCart = !!cartItem;

  const [quantity, setQuantity] = useState(1);

  // Handle quantity change — also update cart if item is already in cart
  const handleQuantityChange = useCallback((newQuantity: number) => {
    setQuantity(newQuantity);
    if (cartItem) {
      updateItemQuantity(cartItem.id, newQuantity);
    }
  }, [cartItem, updateItemQuantity]);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, SelectedOption[]>
  >({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Fetch menu items
  const { data: menuItems = [], isLoading: isMenuLoading } = useQuery({
    queryKey: ['menu', restaurant?.id],
    queryFn: () => restaurantService.getMenuItems(restaurant!.id),
    enabled: !!restaurant?.id,
  });

  // Find current item
  const item: MenuItem | undefined = menuItems.find((m) => m.id === itemId);

  // Initialize defaults when item loads — prefer cart item's customizations if in cart
  const cartItemId = cartItem?.id ?? null;
  useEffect(() => {
    if (item) {
      if (cartItem) {
        // Restore selections from existing cart item
        const restored: Record<string, SelectedOption[]> = {};
        cartItem.selectedCustomizations.forEach((group) => {
          restored[group.groupId] = group.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceModifier: o.priceModifier,
          }));
        });
        setSelectedOptions(restored);
        if (cartItem.specialInstructions) {
          setSpecialInstructions(cartItem.specialInstructions);
        }
      } else {
        const defaults: Record<string, SelectedOption[]> = {};
        (item.customizationGroups ?? []).forEach((group) => {
          const defaultOptions = group.options
            .filter((opt) => opt.isDefault && opt.isAvailable)
            .map((opt) => ({
              id: opt.id,
              name: opt.name,
              priceModifier: opt.priceModifier,
            }));
          if (defaultOptions.length > 0) {
            defaults[group.id] = defaultOptions;
          }
        });
        setSelectedOptions(defaults);
      }
    }
  }, [item, cartItemId]);

  // Sync quantity with cart when item is in cart
  useEffect(() => {
    if (cartItem) {
      setQuantity(cartItem.quantity);
    }
  }, [cartItem]);

  const fmtPrice = useCallback(
    (price: number) => formatPrice(price, restaurant?.currency ?? 'USD'),
    [restaurant?.currency]
  );

  const effectivePrice = useMemo(
    () => (item?.discountPrice != null ? item.discountPrice : item?.price ?? 0),
    [item?.discountPrice, item?.price]
  );

  const total = useMemo(
    () => (item ? calculateItemTotal(effectivePrice, selectedOptions, quantity) : 0),
    [item, effectivePrice, selectedOptions, quantity]
  );

  const canAddToCart = useMemo(() => {
    if (!item) return false;
    if (!item.isAvailable) return false;
    return areRequiredModifiersSatisfied(item.customizationGroups ?? [], selectedOptions);
  }, [item, selectedOptions]);

  const hasPrepTime = item?.prepTime != null && item.prepTime > 0;
  const hasCalories = item?.calories != null && item.calories > 0;
  const dietType = getDietType(item?.tags, item?.dietType);
  const displayTags = filterDietTags(item?.tags);
  const hasTags = displayTags.length > 0;
  const hasAllergens = item?.allergens != null && item.allergens.length > 0;
  const hasIngredients = item?.ingredients != null && item.ingredients.length > 0;

  const handleOptionToggle = (
    groupId: string,
    option: SelectedOption,
    maxSelections: number
  ) => {
    setSelectedOptions((prev) => {
      const currentSelections = prev[groupId] || [];
      const isSelected = currentSelections.some((s) => s.id === option.id);

      let next: Record<string, SelectedOption[]>;
      if (isSelected) {
        next = {
          ...prev,
          [groupId]: currentSelections.filter((s) => s.id !== option.id),
        };
      } else if (maxSelections === 1) {
        next = { ...prev, [groupId]: [option] };
      } else if (currentSelections.length >= maxSelections) {
        return prev;
      } else {
        next = { ...prev, [groupId]: [...currentSelections, option] };
      }

      // Sync to cart if item is already in cart
      if (cartItem && item) {
        const customizations = buildCustomizations(next, item.customizationGroups ?? []);
        updateItemCustomizations(cartItem.id, customizations, specialInstructions.trim() || undefined);
      }

      return next;
    });
    setValidationErrors([]);
  };

  const validateSelections = useCallback((): boolean => {
    if (!item) return false;
    const errors = getModifierValidationErrors(item.customizationGroups ?? [], selectedOptions);
    setValidationErrors(errors);
    return errors.length === 0;
  }, [item, selectedOptions]);

  const handleAddToCart = useCallback(() => {
    if (!item || !validateSelections()) return;
    const customizations = buildCustomizations(selectedOptions, item.customizationGroups ?? []);
    addItem(item, quantity, customizations, specialInstructions.trim() || undefined);
  }, [item, validateSelections, selectedOptions, quantity, addItem, specialInstructions]);

  const handleRemoveFromCart = useCallback(() => {
    if (!itemId || !cartItem) return;
    removeItem(cartItem.id);
    setQuantity(1);
  }, [itemId, cartItem, removeItem]);

  const handleGoToCart = useCallback(() => {
    navigate(`/r/${restaurantSlug}/t/${tableId}/cart`);
  }, [navigate, restaurantSlug, tableId]);

  // Loading
  if (isContextLoading || isMenuLoading) {
    return (
      <div className="min-h-screen bg-white">
        {/* Skeleton hero */}
        <div className="w-full aspect-[4/3] lg:aspect-[21/9] skeleton" />
        <div className="px-5 py-6 space-y-4">
          <div className="skeleton h-8 w-3/4 rounded-lg" />
          <div className="skeleton h-5 w-1/3 rounded-lg" />
          <div className="skeleton h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // Item not found
  if (!item) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 safe-top">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gray-50 flex items-center justify-center">
              <span className="text-4xl">🍽️</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Item Not Found</h2>
            <p className="text-gray-500 text-sm">The item you're looking for doesn't exist.</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-6 px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-hover transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32 lg:pb-0">
      {/* ─── Hero Image Section ─────────────────────────────────────────────── */}
      <div className="relative w-full lg:flex lg:gap-0 lg:items-start">
        <HeroSection item={item} onBack={() => navigate(-1)} />

        {/* ─── Content Panel ───────────────────────────────────────────────── */}
        <div className="relative lg:w-1/2 lg:min-h-screen lg:overflow-y-auto">
          {/* Curved top overlap on mobile */}
          <div className="relative -mt-5 lg:mt-0 bg-white rounded-t-3xl lg:rounded-none pt-6 lg:pt-8 z-10">
            <div className="px-5 lg:px-8 xl:px-10">
              {/* ─── Header Info ──────────────────────────────────────────── */}
              <div className="mb-5">
                {/* Desktop: badge + category */}
                <div className="hidden lg:flex items-center gap-2 flex-wrap mb-2">
                  {item.badge && item.isAvailable && (
                    <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">
                      {item.badge}
                    </span>
                  )}
                  {item.category?.name && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                      {item.category.name}
                    </span>
                  )}
                </div>
                <div className="hidden lg:flex items-center gap-2.5 mb-2">
                  <DietBadge tags={item.tags} dietType={item.dietType} size="md" />
                  <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight leading-tight">
                    {item.name}
                  </h1>
                </div>

                {/* Price row */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl lg:text-3xl font-extrabold text-gray-900">
                    {fmtPrice(effectivePrice)}
                  </span>
                  {item.discountPrice != null && item.discountPrice < item.price && (
                    <span className="text-lg text-gray-400 line-through font-medium">
                      {fmtPrice(item.price)}
                    </span>
                  )}
                  {!item.isAvailable && (
                    <span className="hidden lg:inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full border border-primary/20">
                      Unavailable
                    </span>
                  )}
                </div>

                {/* Description */}
                {item.description && (
                  <p className="text-gray-500 leading-relaxed text-[15px]">
                    {item.description}
                  </p>
                )}
              </div>

              {/* ─── Quick Info Pills ────────────────────────────────────── */}
              {(hasPrepTime || hasCalories || hasTags || dietType) && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {/* Diet type label */}
                  {dietType && (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                      dietType === 'veg'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}>
                      <DietBadge tags={item.tags} dietType={item.dietType} size="sm" />
                      <span className="text-xs font-semibold">{dietType === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}</span>
                    </div>
                  )}
                  {/* Prep time */}
                  {hasPrepTime && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-full">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-semibold text-gray-500">{item.prepTime} min</span>
                    </div>
                  )}
                  {/* Calories */}
                  {hasCalories && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-full">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                      </svg>
                      <span className="text-xs font-semibold text-gray-500">{item.calories} cal</span>
                    </div>
                  )}
                  {/* Tags (excluding diet tags) */}
                  {displayTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* ─── Allergens Warning ───────────────────────────────────── */}
              {hasAllergens && (
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 mb-5">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-800 mb-0.5">Allergen Info</p>
                    <p className="text-xs text-amber-700 leading-relaxed">{item.allergens?.join(', ')}</p>
                  </div>
                </div>
              )}

              {/* ─── Ingredients ──────────────────────────────────────────── */}
              {hasIngredients && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Ingredients</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {item.ingredients?.map((ingredient) => (
                      <span
                        key={ingredient}
                        className="px-3 py-1.5 bg-gray-50 text-gray-600 text-xs font-medium rounded-lg border border-gray-100"
                      >
                        {ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Divider ─────────────────────────────────────────────── */}
              {(item.customizationGroups ?? []).length > 0 && (
                <div className="h-px bg-gray-100 my-6" />
              )}

              {/* ─── Customization Groups ────────────────────────────────── */}
              {(item.customizationGroups ?? []).map((group) => (
                <CustomizationGroup
                  key={group.id}
                  group={group}
                  selectedOptions={selectedOptions[group.id] || []}
                  onToggle={handleOptionToggle}
                  fmtPrice={fmtPrice}
                />
              ))}

              {/* ─── Special Instructions ────────────────────────────────── */}
              {item.allowSpecialInstructions !== false && (
                <div className="mb-8">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
                    Special Instructions
                  </h3>
                  <div className="relative">
                    <textarea
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      placeholder="Any allergies or special requests? Let us know..."
                      className="w-full p-4 rounded-xl border-[1.5px] border-gray-100 bg-gray-50/50 text-sm text-gray-700 placeholder-gray-400 resize-none h-24 focus:outline-none focus:border-primary focus:bg-white focus:shadow-sm transition-all"
                      maxLength={500}
                    />
                    <span className="absolute bottom-3 right-3 text-[10px] text-gray-300 font-medium">
                      {specialInstructions.length}/500
                    </span>
                  </div>
                </div>
              )}

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="mb-5 p-3.5 bg-primary/10 rounded-xl border border-primary/20">
                  {validationErrors.map((error, i) => (
                    <p key={i} className="text-xs text-primary font-semibold flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </p>
                  ))}
                </div>
              )}

              {/* ─── Desktop: Add to Cart Bar ────────────────────────────── */}
              <div className="hidden lg:block pb-10">
                {isInCart ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                      <button
                        onClick={() => {
                          if (quantity <= 1) {
                            handleRemoveFromCart();
                          } else {
                            handleQuantityChange(quantity - 1);
                          }
                        }}
                        className="w-11 h-12 flex items-center justify-center text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                      </button>
                      <span className="px-4 text-sm font-bold text-gray-900 min-w-[40px] text-center">{quantity}</span>
                      <button
                        onClick={() => handleQuantityChange(quantity + 1)}
                        className="w-11 h-12 flex items-center justify-center text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                    <button
                      onClick={handleGoToCart}
                      className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
                    >
                      Go to Cart · {fmtPrice(total)}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleAddToCart}
                    disabled={!item.isAvailable || !canAddToCart}
                    className={`w-full py-4 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                      !item.isAvailable || !canAddToCart
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20'
                    }`}
                  >
                    {!item.isAvailable
                      ? 'Currently Unavailable'
                      : !canAddToCart
                        ? 'Select Required Options'
                        : `Add to Cart · ${fmtPrice(total)}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Mobile: Fixed Bottom CTA ──────────────────────────────────────── */}
      <MobileBottomCTA
        isInCart={isInCart}
        isAvailable={item.isAvailable}
        canAddToCart={canAddToCart}
        quantity={quantity}
        total={total}
        fmtPrice={fmtPrice}
        onQuantityChange={handleQuantityChange}
        onRemove={handleRemoveFromCart}
        onAddToCart={handleAddToCart}
        onGoToCart={handleGoToCart}
      />
    </div>
  );
}
