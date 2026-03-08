import type { TFunction } from 'i18next';

/**
 * Translate a tag/badge/allergen string using i18n.
 * Looks up `tags.<lowercased value>` — falls back to original string if no key found.
 */
export function translateTag(value: string, t: TFunction): string {
  const key = `tags.${value.toLowerCase().trim()}`;
  const translated = t(key, { defaultValue: '' });
  return translated || value;
}
