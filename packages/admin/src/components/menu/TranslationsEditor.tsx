import { useState } from 'react';
import type { TranslationsMap } from '../../types';

const LANGUAGES = [
  { code: 'hi', label: 'Hindi (हिंदी)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
];

interface TranslationsEditorProps {
  translations: TranslationsMap;
  onChange: (translations: TranslationsMap) => void;
  /** Which fields to show translation inputs for */
  fields: { key: string; label: string; multiline?: boolean }[];
}

export default function TranslationsEditor({ translations, onChange, fields }: TranslationsEditorProps) {
  const [open, setOpen] = useState(false);

  const hasAnyTranslation = Object.values(translations).some((langData) =>
    Object.values(langData).some((v) => v.trim())
  );

  const update = (lang: string, field: string, value: string) => {
    const next = { ...translations };
    if (!next[lang]) next[lang] = {};
    next[lang] = { ...next[lang], [field]: value };
    onChange(next);
  };

  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-elevated hover:bg-surface-border/30 transition-colors"
      >
        <span className="text-sm font-medium text-text-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          Translations
          {hasAnyTranslation && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
              {Object.keys(translations).filter((l) => 
                Object.values(translations[l] || {}).some((v) => v.trim())
              ).length}/{LANGUAGES.length}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-4 border-t border-surface-border">
          <p className="text-xs text-text-tertiary">
            Add translations for each language. Leave blank to use the default (English) value.
          </p>
          {LANGUAGES.map((lang) => (
            <div key={lang.code} className="space-y-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {lang.label}
              </p>
              <div className="grid gap-2">
                {fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-[11px] text-text-tertiary mb-0.5 block">{field.label}</label>
                    {field.multiline ? (
                      <textarea
                        rows={2}
                        value={translations[lang.code]?.[field.key] || ''}
                        onChange={(e) => update(lang.code, field.key, e.target.value)}
                        className="input w-full text-sm resize-none"
                        placeholder={`${field.label} in ${lang.label.split(' ')[0]}`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={translations[lang.code]?.[field.key] || ''}
                        onChange={(e) => update(lang.code, field.key, e.target.value)}
                        className="input w-full text-sm"
                        placeholder={`${field.label} in ${lang.label.split(' ')[0]}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
