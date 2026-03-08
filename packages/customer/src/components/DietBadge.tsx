import { memo } from 'react';
import { useTranslation } from 'react-i18next';

type DietResult = 'veg' | 'non-veg' | 'egg' | null;

const VEG_TAGS = ['veg', 'vegetarian'];
const NON_VEG_TAGS = ['non-veg', 'non veg', 'nonveg'];

/** Derive diet type from the dedicated dietType field first, then fall back to tags */
export function getDietType(tags?: string[], dietType?: string | null): DietResult {
  // Check dedicated dietType enum first (source of truth from admin)
  if (dietType) {
    const dt = dietType.toUpperCase();
    if (dt === 'NON_VEG') return 'non-veg';
    if (dt === 'VEG') return 'veg';
    if (dt === 'EGG') return 'egg';
  }
  // Fall back to tags
  if (!tags || tags.length === 0) return null;
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.some((t) => NON_VEG_TAGS.includes(t))) return 'non-veg';
  if (lower.some((t) => VEG_TAGS.includes(t))) return 'veg';
  return null;
}

/** Filter out diet-type tags so they don't show as regular pill tags */
export function filterDietTags(tags?: string[]): string[] {
  if (!tags) return [];
  return tags.filter(
    (t) => !VEG_TAGS.includes(t.toLowerCase()) && !NON_VEG_TAGS.includes(t.toLowerCase())
  );
}

interface DietBadgeProps {
  tags?: string[];
  dietType?: string | null;
  /** 'sm' = 14px (for cards), 'md' = 18px (for detail page) */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Veg / Non-Veg indicator in the standard Indian food labeling style:
 * - Green bordered square with green dot = Veg
 * - Red bordered square with red dot = Non-Veg
 */
function DietBadgeComponent({ tags, dietType, size = 'sm', className = '' }: DietBadgeProps) {
  const { t } = useTranslation();
  const diet = getDietType(tags, dietType);
  if (!diet) return null;

  const isVeg = diet === 'veg';
  const isEgg = diet === 'egg';
  const borderColor = isVeg ? 'border-emerald-600' : isEgg ? 'border-amber-600' : 'border-red-600';
  const bgColor = isVeg ? 'bg-emerald-600' : isEgg ? 'bg-amber-600' : 'bg-red-600';
  const label = isVeg ? t('menu.vegetarian') : isEgg ? t('menu.egg') : t('menu.nonVegetarian');
  const dim = size === 'md' ? 'w-[18px] h-[18px]' : 'w-[14px] h-[14px]';
  const dot = size === 'md' ? 'w-[8px] h-[8px]' : 'w-[6px] h-[6px]';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-[3px] border-[1.5px] ${borderColor} ${dim} ${className}`}
      title={label}
    >
      <span className={`rounded-full ${dot} ${bgColor}`} />
    </span>
  );
}

export const DietBadge = memo(DietBadgeComponent);
