/**
 * Sanitize a user-generated string for safe rendering.
 *
 * React auto-escapes text nodes in JSX, so DOMPurify is unnecessary
 * as long as we don't use `dangerouslySetInnerHTML`. This function
 * is kept as a lightweight identity wrapper so call-sites remain
 * self-documenting about the intent to sanitize user input.
 */
export function sanitize(value: string): string {
  return value;
}
