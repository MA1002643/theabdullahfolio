// The locale registry (issue #82). The ONE list every multilingual surface
// reads: routing, the proxy, the language selector, hreflang alternates, the
// sitemap, Open Graph locale tags, the font chain, the translation pipeline and
// the catalogue audit.
//
// Pure data with no imports, deliberately: it is read by the edge proxy, by
// client components (the selector) and by plain Node scripts
// (scripts/i18n-*.mjs), and anything this module imported would be dragged
// into all three.
//
// ── Fields ──────────────────────────────────────────────────────────────────
//   code      The URL segment and the catalogue directory (`/ar`, messages/ar/).
//   endonym   The language's name in itself. The selector shows this and never
//             a flag: Arabic spans 26+ countries and a flag names one of them.
//   english   The English name, used for search in the selector and in prompts.
//   dir       'rtl' for scripts written right to left. Drives <html dir>.
//   hreflang  BCP 47 tag for `<link rel="alternate" hreflang>`. Differs from
//             `code` only where a bare code is ambiguous: `zh` names a
//             macrolanguage, and the catalogue is Simplified Han.
//   og        Open Graph locale (language_TERRITORY, as OG requires).
//   script    Which font chain the root layout composes (see fonts.js).
//   tier      Review PRIORITY. Tier 1 is reviewed first. Since 2026-10-25 it
//             is no longer a statement of launch quality.
//   status    'source' | 'machine' | 'reviewed'. A 'machine' locale shows the
//             "machine-translated, help improve this" notice. Native review
//             flips it to 'reviewed', which is the only thing that removes it.

export const LOCALES = [
  { code: 'en', endonym: 'English', english: 'English', dir: 'ltr', hreflang: 'en', og: 'en_GB', script: 'latin', tier: 1, status: 'source' },
  { code: 'es', endonym: 'Español', english: 'Spanish', dir: 'ltr', hreflang: 'es', og: 'es_ES', script: 'latin', tier: 1, status: 'machine' },
  { code: 'zh', endonym: '中文（简体）', english: 'Chinese (Simplified)', dir: 'ltr', hreflang: 'zh-Hans', og: 'zh_CN', script: 'cjk-sc', tier: 1, status: 'machine' },
  { code: 'ar', endonym: 'العربية', english: 'Arabic', dir: 'rtl', hreflang: 'ar', og: 'ar_AR', script: 'arabic', tier: 1, status: 'machine' },
  { code: 'pt', endonym: 'Português', english: 'Portuguese', dir: 'ltr', hreflang: 'pt', og: 'pt_BR', script: 'latin', tier: 1, status: 'machine' },
  { code: 'fr', endonym: 'Français', english: 'French', dir: 'ltr', hreflang: 'fr', og: 'fr_FR', script: 'latin', tier: 1, status: 'machine' },
  { code: 'de', endonym: 'Deutsch', english: 'German', dir: 'ltr', hreflang: 'de', og: 'de_DE', script: 'latin', tier: 1, status: 'machine' },
  { code: 'ru', endonym: 'Русский', english: 'Russian', dir: 'ltr', hreflang: 'ru', og: 'ru_RU', script: 'latin', tier: 1, status: 'machine' },
  { code: 'ja', endonym: '日本語', english: 'Japanese', dir: 'ltr', hreflang: 'ja', og: 'ja_JP', script: 'cjk-jp', tier: 1, status: 'machine' },
  { code: 'hi', endonym: 'हिन्दी', english: 'Hindi', dir: 'ltr', hreflang: 'hi', og: 'hi_IN', script: 'devanagari', tier: 1, status: 'machine' },
  { code: 'ur', endonym: 'اردو', english: 'Urdu', dir: 'rtl', hreflang: 'ur', og: 'ur_PK', script: 'arabic', tier: 1, status: 'machine' },
  { code: 'ko', endonym: '한국어', english: 'Korean', dir: 'ltr', hreflang: 'ko', og: 'ko_KR', script: 'cjk-kr', tier: 2, status: 'machine' },
  { code: 'it', endonym: 'Italiano', english: 'Italian', dir: 'ltr', hreflang: 'it', og: 'it_IT', script: 'latin', tier: 2, status: 'machine' },
  { code: 'tr', endonym: 'Türkçe', english: 'Turkish', dir: 'ltr', hreflang: 'tr', og: 'tr_TR', script: 'latin', tier: 2, status: 'machine' },
  { code: 'vi', endonym: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr', hreflang: 'vi', og: 'vi_VN', script: 'latin', tier: 2, status: 'machine' },
  { code: 'pl', endonym: 'Polski', english: 'Polish', dir: 'ltr', hreflang: 'pl', og: 'pl_PL', script: 'latin', tier: 2, status: 'machine' },
  { code: 'fa', endonym: 'فارسی', english: 'Persian', dir: 'rtl', hreflang: 'fa', og: 'fa_IR', script: 'arabic', tier: 2, status: 'machine' },
  { code: 'he', endonym: 'עברית', english: 'Hebrew', dir: 'rtl', hreflang: 'he', og: 'he_IL', script: 'hebrew', tier: 2, status: 'machine' },
  { code: 'nl', endonym: 'Nederlands', english: 'Dutch', dir: 'ltr', hreflang: 'nl', og: 'nl_NL', script: 'latin', tier: 2, status: 'machine' },
  { code: 'id', endonym: 'Bahasa Indonesia', english: 'Indonesian', dir: 'ltr', hreflang: 'id', og: 'id_ID', script: 'latin', tier: 2, status: 'machine' },
];

export const DEFAULT_LOCALE = 'en';

export const LOCALE_CODES = LOCALES.map((l) => l.code);

/** The cookie an EXPLICIT language choice writes. Never written implicitly. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// ── The pseudo-locale (CI only) ─────────────────────────────────────────────
// `en-XA` (the conventional pseudo-locale tag) serves every page with each
// catalogue string accented and bracketed — `[Ȧƀǿǿŭŭŧ ḿḗḗ]` — so any plain
// English left on the page was never translatable (tests/i18n/pseudo.spec.js).
// It is deliberately NOT in `LOCALES`: the sitemap, hreflang, the selector,
// the audit and the translator all read that list and never see it. It is
// routed only when the build sets NEXT_PUBLIC_I18N_PSEUDO=1 — CI's build job
// does; Vercel never does — so production has no /en-XA. NEXT_PUBLIC_ because
// the client router must agree with the proxy about which prefixes exist; it
// is a switch, not a secret. Its catalogue is generated, never committed
// (`npm run i18n:pseudo` → messages/en-XA/).
export const PSEUDO_LOCALE = {
  code: 'en-XA', endonym: '[Ƥşḗḗŭŭḓǿǿ]', english: 'Pseudo-locale', dir: 'ltr', hreflang: 'en-XA', og: 'en_GB', script: 'latin', tier: 0, status: 'pseudo',
};

export const PSEUDO_ENABLED = process.env.NEXT_PUBLIC_I18N_PSEUDO === '1';

/** Every locale the ROUTER serves: the public list, plus the pseudo-locale when enabled. */
export const ROUTED_LOCALE_CODES = PSEUDO_ENABLED ? [...LOCALE_CODES, PSEUDO_LOCALE.code] : LOCALE_CODES;

const BY_CODE = new Map(
  (PSEUDO_ENABLED ? [...LOCALES, PSEUDO_LOCALE] : LOCALES).map((l) => [l.code, l]),
);

/** The registry row for a code, falling back to the default locale's row. */
export function localeInfo(code) {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_LOCALE);
}

export function isLocale(code) {
  return BY_CODE.has(code);
}

export function dirFor(code) {
  return localeInfo(code).dir;
}

/**
 * The locale path prefix for a code: '' for the default (English stays
 * unprefixed so every pre-existing URL keeps working), `/xx` otherwise.
 */
export function localePrefix(code) {
  return !code || code === DEFAULT_LOCALE ? '' : `/${code}`;
}

/** A site-relative path in a given locale (`/about` + 'ar' → `/ar/about`). */
export function localizePath(path, code) {
  const prefix = localePrefix(code);
  if (!prefix) return path;
  return path === '/' ? prefix : `${prefix}${path}`;
}

/**
 * The best supported locale for a list of BCP 47 tags (navigator.languages),
 * or null. Exact code first, then the primary subtag (`pt-BR` → `pt`). Chinese
 * is the one special case: a Traditional-script preference (zh-TW, zh-HK,
 * zh-Hant) is NOT matched to the Simplified catalogue, because offering a
 * Taiwanese reader Simplified Han as "your language" reads as a mistake.
 */
export function matchLocale(tags) {
  for (const raw of tags ?? []) {
    if (typeof raw !== 'string' || !raw) continue;
    const tag = raw.toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(tag)) continue;
    const primary = tag.split('-')[0];
    if (isLocale(tag)) return tag;
    if (isLocale(primary)) return primary;
  }
  return null;
}
