import type { CustomizationGroup, SelectedOption, SelectedCustomization } from '../types';

/**
 * Check whether all required modifier groups have met their minimum selection count.
 */
export function areRequiredModifiersSatisfied(
  groups: CustomizationGroup[],
  selectedOptions: Record<string, SelectedOption[]>
): boolean {
  return (groups ?? []).every((group) => {
    if (!group.required) return true;
    const selections = selectedOptions[group.id] ?? [];
    return selections.length >= group.minSelections;
  });
}

/**
 * Return an array of human-readable validation error strings
 * for modifier groups whose minimum selection count hasn't been met.
 */
export function getModifierValidationErrors(
  groups: CustomizationGroup[],
  selectedOptions: Record<string, SelectedOption[]>
): string[] {
  const errors: string[] = [];

  (groups ?? []).forEach((group) => {
    const selections = selectedOptions[group.id] ?? [];
    if (group.required && selections.length < group.minSelections) {
      errors.push(
        `Please select at least ${group.minSelections} option${group.minSelections > 1 ? 's' : ''} for ${group.name}`
      );
    }
  });

  return errors;
}

/**
 * Calculate the total price for an item including modifier surcharges and quantity.
 */
export function calculateItemTotal(
  basePrice: number,
  selectedOptions: Record<string, SelectedOption[]>,
  quantity: number
): number {
  const customizationTotal = Object.values(selectedOptions)
    .flat()
    .reduce((sum, opt) => sum + opt.priceModifier, 0);
  return (basePrice + customizationTotal) * quantity;
}

/**
 * Convert the selectedOptions map into a SelectedCustomization[] array
 * suitable for the cart store.
 */
export function buildCustomizations(
  selectedOptions: Record<string, SelectedOption[]>,
  groups: CustomizationGroup[]
): SelectedCustomization[] {
  return Object.entries(selectedOptions)
    .filter(([, options]) => options.length > 0)
    .map(([groupId, options]) => {
      const group = (groups ?? []).find((g) => g.id === groupId);
      return {
        groupId,
        groupName: group?.name ?? '',
        options,
      };
    });
}
