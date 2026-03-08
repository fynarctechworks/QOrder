/**
 * Resolves translated fields from a database entity's `translations` JSON column.
 *
 * Translation JSON shape:
 * {
 *   "hi": { "name": "हिंदी नाम", "description": "हिंदी विवरण" },
 *   "ta": { "name": "தமிழ் பெயர்" },
 *   ...
 * }
 *
 * Falls back to the entity's default (English) field value when no translation exists.
 */

type TranslationsJson = Record<string, Record<string, string>>;

/**
 * Apply translations to an entity in-place. Overwrites `name`, `description`,
 * `badge`, and other translatable string fields with the translated version
 * if one exists for the given language.
 */
export function applyTranslation<T extends Record<string, unknown>>(
  entity: T,
  lang: string | undefined,
  fields: string[] = ['name', 'description'],
): T {
  if (!lang || lang === 'en') return entity;

  const translations = entity.translations as TranslationsJson | null | undefined;
  if (!translations) return entity;

  const langData = translations[lang];
  if (!langData) return entity;

  for (const field of fields) {
    if (langData[field]) {
      (entity as Record<string, unknown>)[field] = langData[field];
    }
  }

  return entity;
}

/**
 * Apply translations to an array of entities.
 */
export function applyTranslations<T extends Record<string, unknown>>(
  entities: T[],
  lang: string | undefined,
  fields: string[] = ['name', 'description'],
): T[] {
  if (!lang || lang === 'en') return entities;
  return entities.map((e) => applyTranslation(e, lang, fields));
}
