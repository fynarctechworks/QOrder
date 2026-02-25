/**
 * Format a numeric price as a localised currency string.
 *
 * Works both as a plain function and inside `useCallback`:
 *   - Plain:   `formatPrice(9.99, 'USD')`
 *   - Hook:    `useCallback((p: number) => formatPrice(p, restaurant?.currency), [restaurant?.currency])`
 */
export const formatPrice = (price: number, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);
