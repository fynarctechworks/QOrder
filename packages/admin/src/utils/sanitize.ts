import DOMPurify from 'dompurify';

/**
 * Sanitize a user-generated string for safe rendering.
 * Strips all HTML tags — output is plain text.
 */
export function sanitize(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
}
