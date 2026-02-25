import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsService } from '../services/settingsService';
import { formatCurrency } from '../utils/formatCurrency';

/**
 * Returns a `fmt` function that formats numbers using the restaurant's
 * configured currency (fetched from settings, defaults to INR).
 *
 * Usage:
 *   const fmt = useCurrency();
 *   fmt(12.5)               // "$12.50" or "₹12.50" etc.
 *   fmt(12.5, { minimumFractionDigits: 0 })
 */
export function useCurrency() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 2 * 60 * 1000, // 2 minutes — currency rarely changes; avoids excessive refetching
  });

  const currency = data?.currency ?? 'INR';

  return useCallback(
    (value: number, opts?: { minimumFractionDigits?: number }) =>
      formatCurrency(value, { ...opts, currency }),
    [currency],
  );
}
