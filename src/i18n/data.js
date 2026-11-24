import { DEFAULT_LOCALE } from './locales';
import { intlTag } from './format';

// Localised views of src/app/data.js (issue #82).
//
// `data.js` stays the English source of record (it also feeds the sitemap, the
// JSON-LD graph and the CV PDF, none of which are translated), and its English
// is mirrored into `messages/en/Data.json` by scripts/i18n-data.mjs. These
// helpers lay a locale's translations over a record by stable key — project
// id, journey id, a slug of a fixed label — and leave every non-prose field
// (dates, links, slugs, repo names) exactly as it is.
//
// Each takes a `t` from `useTranslations('Data')` / `getTranslations('Data')`,
// so they work identically in Client and Server Components. In English they
// return the record untouched: the English the site renders is still the
// literal in data.js, byte for byte.

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const isEnglish = (t) => !t || t.__locale === DEFAULT_LOCALE;

/** A translated field, or the English fallback when the key is missing. */
function field(t, key, fallback) {
  return t.has(key) ? t(key) : fallback;
}

/**
 * Bind a translator to its locale so the helpers can short-circuit English.
 * next-intl's `t` does not expose its locale, so callers pass it once here.
 */
export function dataTranslator(t, locale) {
  const bound = (...args) => t(...args);
  bound.has = (key) => t.has(key);
  bound.raw = (key) => t.raw(key);
  bound.__locale = locale;
  return bound;
}

export function localizeProject(project, t) {
  if (isEnglish(t) || !project) return project;
  return {
    ...project,
    description: field(t, `projects.${project.id}.description`, project.description),
  };
}

/**
 * A project's `caseStudy` (issue #31) with its prose in the reader's language.
 * Keys mirror scripts/i18n-data.mjs: chapter TYPE, then each entry's `id`.
 * Everything that is not prose (srcs, hrefs, sizes, `derive`) is untouched,
 * and a missing translation falls back to the English literal field by field.
 */
export function localizeCaseStudy(project, t) {
  const cs = project?.caseStudy;
  if (!cs || isEnglish(t)) return cs ?? null;
  const base = `caseStudies.${project.id}`;
  const f = (key, fallback) => (fallback == null ? fallback : field(t, `${base}.${key}`, fallback));
  const list = (entries, at, keys) =>
    entries?.map((entry) => {
      const out = { ...entry };
      for (const k of keys) if (entry[k] != null) out[k] = f(`${at}.${entry.id}.${k}`, entry[k]);
      return out;
    });
  return {
    ...cs,
    role: f('role', cs.role),
    thesis: f('thesis', cs.thesis),
    hero: cs.hero ? { ...cs.hero, alt: f('heroAlt', cs.hero.alt) } : cs.hero,
    chapters: cs.chapters.map((c) => {
      const at = `chapters.${c.type}`;
      return {
        ...c,
        title: f(`${at}.title`, c.title),
        body: f(`${at}.body`, c.body),
        facts: list(c.facts, `${at}.facts`, ['label', 'value']),
        steps: c.steps?.map((s) => ({
          ...s,
          title: f(`${at}.steps.${s.id}.title`, s.title),
          body: f(`${at}.steps.${s.id}.body`, s.body),
          media: s.media ? { ...s.media, alt: f(`${at}.steps.${s.id}.alt`, s.media.alt) } : s.media,
        })),
        items: list(c.items, `${at}.items`, ['title', 'body', 'label', 'alt', 'caption']),
      };
    }),
  };
}

export function localizeCategory(category, t) {
  if (isEnglish(t)) return category;
  return field(t, `categories.${category}`, category);
}

/**
 * The timeline's printed date span in the reader's language. English keeps
 * the hand-written `dateLabel` ("APR 2023 — JUL 2024"); every other locale
 * composes it from the machine `start`/`end` fields with `Intl`, so month
 * names, ordering and the open-ended arrow all follow the locale. Year-only
 * labels (the two college entries) stay year-only.
 */
export function journeyDateLabel(entry, locale) {
  if (!locale || locale === DEFAULT_LOCALE) return entry.dateLabel;
  const tag = intlTag(locale);
  const yearOnly = /^\d{4}\s*—\s*\d{4}$/.test(entry.dateLabel ?? '');
  const fmt = new Intl.DateTimeFormat(tag, yearOnly ? { year: 'numeric' } : { month: 'short', year: 'numeric' });
  const toDate = (ym) => {
    const [y, m] = String(ym).split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, 1));
  };
  const start = entry.start ? fmt.format(toDate(entry.start)) : '';
  if (!entry.end) return `${start} →`;
  const end = fmt.format(toDate(entry.end));
  return start === end ? start : `${start} — ${end}`;
}

export function localizeJourneyEntry(entry, t, locale) {
  if (isEnglish(t) || !entry) return entry;
  const base = `journey.${entry.id}`;
  return {
    ...entry,
    title: field(t, `${base}.title`, entry.title),
    description: field(t, `${base}.description`, entry.description),
    dateLabel: journeyDateLabel(entry, locale ?? t.__locale),
    tags: entry.tags.map((tag) => field(t, `${base}.tags.${slug(tag)}`, tag)),
  };
}

export function localizeMachineRow(row, t) {
  if (isEnglish(t) || !row) return row;
  const base = `uses.machine.${slug(row.label)}`;
  return {
    ...row,
    label: field(t, `${base}.label`, row.label),
    value: field(t, `${base}.value`, row.value),
    ...(row.note ? { note: field(t, `${base}.note`, row.note) } : {}),
    ...(row.hrefLabel ? { hrefLabel: field(t, `${base}.hrefLabel`, row.hrefLabel) } : {}),
  };
}

export function localizeBenchRow(row, t) {
  if (isEnglish(t) || !row) return row;
  const base = `uses.bench.${slug(row.role)}`;
  return {
    ...row,
    role: field(t, `${base}.role`, row.role),
    detail: field(t, `${base}.detail`, row.detail),
  };
}
