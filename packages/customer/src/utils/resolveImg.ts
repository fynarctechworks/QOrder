const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace('/api', '');

/**
 * Resolve relative upload paths (e.g. `/uploads/...`) to full URLs.
 * Absolute URLs and empty values are returned as-is.
 */
export function resolveImg(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('/uploads')) return `${API_BASE}${url}`;
  return url;
}
