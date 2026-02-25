/** Map currency codes to their most natural locale for number formatting. */
const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP',
  AUD: 'en-AU', CAD: 'en-CA', SGD: 'en-SG', AED: 'ar-AE', CNY: 'zh-CN',
  KRW: 'ko-KR', BRL: 'pt-BR', MXN: 'es-MX', CHF: 'de-CH', THB: 'th-TH',
};

/**
 * Format a number as currency.
 * Defaults to INR when no currency code is given.
 * The locale is automatically derived from the currency code.
 * Pass `minimumFractionDigits: 0` for whole-number display (analytics).
 */
export const formatCurrency = (
  value: number,
  opts?: { minimumFractionDigits?: number; currency?: string }
): string => {
  const { currency = 'INR', ...rest } = opts ?? {};
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...rest,
  }).format(value);
};
