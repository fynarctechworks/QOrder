import { memo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem, SelectedCustomization, SelectedOption } from '../types';
import { useUIStore } from '../state/uiStore';
import { DietBadge } from './DietBadge';
import { resolveImg } from '../utils/resolveImg';
import { useTranslation } from 'react-i18next';

interface ItemDetailDrawerProps {
  item: MenuItem | null;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    customizations: SelectedCustomization[],
    specialInstructions?: string
  ) => void;
}

function ItemDetailDrawerComponent({
  item,
  currency,
  isOpen,
  onClose,
  onAddToCart,
}: ItemDetailDrawerProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, SelectedOption[]>
  >({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showInstructions, setShowInstructions] = useState(false);
  const { t } = useTranslation();

  // Reset state when item changes
  useEffect(() => {
    if (item) {
      setQuantity(1);
      setSpecialInstructions('');
      setValidationErrors([]);
      setShowInstructions(false);

      // Initialize with default options
      const defaults: Record<string, SelectedOption[]> = {};
      item.customizationGroups.forEach((group) => {
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
  }, [item]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);

  const calculateTotal = useCallback(() => {
    if (!item) return 0;
    const basePrice = item.price;
    const customizationTotal = Object.values(selectedOptions)
      .flat()
      .reduce((sum, opt) => sum + opt.priceModifier, 0);
    return (basePrice + customizationTotal) * quantity;
  }, [item, selectedOptions, quantity]);

  const handleOptionToggle = (
    groupId: string,
    option: SelectedOption,
    maxSelections: number
  ) => {
    setSelectedOptions((prev) => {
      const currentSelections = prev[groupId] || [];
      const isSelected = currentSelections.some((s) => s.id === option.id);

      if (isSelected) {
        return { ...prev, [groupId]: currentSelections.filter((s) => s.id !== option.id) };
      }
      if (maxSelections === 1) {
        return { ...prev, [groupId]: [option] };
      }
      if (currentSelections.length >= maxSelections) return prev;
      return { ...prev, [groupId]: [...currentSelections, option] };
    });
    setValidationErrors([]);
  };

  const validateSelections = (): boolean => {
    if (!item) return false;
    const errors: string[] = [];
    item.customizationGroups.forEach((group) => {
      const selections = selectedOptions[group.id] || [];
      if (group.required && selections.length < group.minSelections) {
        errors.push(t('menu.selectAtLeast', { min: group.minSelections, name: group.name }));;
      }
    });
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleAddToCart = () => {
    if (!item || !validateSelections()) return;
    const customizations: SelectedCustomization[] = Object.entries(selectedOptions)
      .filter(([, options]) => options.length > 0)
      .map(([groupId, options]) => {
        const group = item.customizationGroups.find((g) => g.id === groupId);
        return { groupId, groupName: group?.name || '', options };
      });
    onAddToCart(item, quantity, customizations, specialInstructions.trim() || undefined);
    onClose();
  };

  // Sync drawer open state to global UI store so FloatingCartButton hides
  const setDrawerOpen = useUIStore((s) => s.setDrawerOpen);
  useEffect(() => {
    setDrawerOpen(isOpen);
    return () => setDrawerOpen(false);
  }, [isOpen, setDrawerOpen]);

  if (!item) return null;

  const hasCustomizations = item.customizationGroups.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[10000]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[10001] max-h-[85vh] bg-white rounded-t-3xl overflow-hidden flex flex-col shadow-2xl"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Header: image + item info */}
              <div className="px-5 pt-2 pb-4">
                <div className="flex gap-4">
                  {item.image && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50">
                      <img src={resolveImg(item.image)} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <DietBadge tags={item.tags} dietType={item.dietType} size="sm" />
                      <h2 className="text-base font-bold text-gray-900 leading-tight line-clamp-2">
                        {item.name}
                      </h2>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {formatPrice(item.price)}
                    </p>
                    {item.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                  {/* Close button */}
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 flex-shrink-0 self-start hover:bg-gray-200 transition-colors"
                    aria-label="Close"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Divider */}
              {hasCustomizations && <div className="h-2 bg-gray-50" />}

              {/* Customization groups */}
              {item.customizationGroups.map((group) => {
                const isRadio = group.maxSelections === 1;
                return (
                  <div key={group.id} className="px-5 py-4 border-b border-gray-50 last:border-b-0">
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-bold text-gray-900">{group.name}</h3>
                      {group.required ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {t('common.required')}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                          {t('common.optional')}
                        </span>
                      )}
                    </div>
                    {group.maxSelections > 1 && (
                      <p className="text-[11px] text-gray-400 mb-3">
                        {t('menu.selectUpTo', { max: group.maxSelections })}
                      </p>
                    )}
                    {isRadio && (
                      <p className="text-[11px] text-gray-400 mb-3">{t('menu.selectAnyOne')}</p>
                    )}

                    {/* Options */}
                    <div className="space-y-0">
                      {group.options
                        .filter((opt) => opt.isAvailable)
                        .map((option, idx, arr) => {
                          const isSelected = (selectedOptions[group.id] || []).some(
                            (s) => s.id === option.id
                          );
                          return (
                            <button
                              key={option.id}
                              onClick={() =>
                                handleOptionToggle(
                                  group.id,
                                  { id: option.id, name: option.name, priceModifier: option.priceModifier },
                                  group.maxSelections
                                )
                              }
                              className={`w-full flex items-center justify-between py-3 ${
                                idx < arr.length - 1 ? 'border-b border-gray-50' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {/* Radio / checkbox indicator */}
                                <div
                                  className={`w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors ${
                                    isRadio ? 'rounded-full border-2' : 'rounded border-2'
                                  } ${
                                    isSelected
                                      ? 'border-primary bg-primary/100'
                                      : 'border-gray-300 bg-white'
                                  }`}
                                >
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                                <span className={`text-sm ${isSelected ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                  {option.name}
                                </span>
                              </div>
                              {option.priceModifier > 0 && (
                                <span className="text-sm text-gray-500 flex-shrink-0">
                                  +{formatPrice(option.priceModifier)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                );
              })}

              {/* Special instructions (collapsible) */}
              <div className="px-5 py-3">
                <button
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {t('menu.addInstructions')}
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${showInstructions ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <AnimatePresence>
                  {showInstructions && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <textarea
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        placeholder={t('menu.instructionsPlaceholder')}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-primary/40 focus:bg-white resize-none transition-colors"
                        rows={3}
                        maxLength={500}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="mx-5 mb-3 p-3 bg-primary/10 rounded-xl border border-primary/20">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-primary font-medium">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Sticky footer: quantity + add to cart */}
            <div className="border-t border-gray-100 bg-white px-5 py-4 safe-bottom">
              <div className="flex items-center gap-3">
                {/* Quantity stepper */}
                <div className="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => quantity > 1 && setQuantity(quantity - 1)}
                    disabled={quantity <= 1}
                    className="w-9 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                    </svg>
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-gray-900">{quantity}</span>
                  <button
                    onClick={() => quantity < 99 && setQuantity(quantity + 1)}
                    disabled={quantity >= 99}
                    className="w-9 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                {/* Add to cart button */}
                <button
                  onClick={handleAddToCart}
                  className="flex-1 flex items-center justify-between bg-primary hover:bg-primary-hover text-white rounded-xl px-5 py-3 transition-colors active:scale-[0.98]"
                >
                  <span className="text-sm font-bold">{t('cart.addItem')}</span>
                  <span className="text-sm font-bold">{formatPrice(calculateTotal())}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export const ItemDetailDrawer = memo(ItemDetailDrawerComponent);
