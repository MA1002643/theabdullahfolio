// Composed meta descriptions for `/projects/[id]` (issue #32, W7).
//
// ── Why these are composed rather than taken from the data ──────────────────
// Every project page used `project.description` as its meta description, and
// those are FOUR-WORD card subtitles — "Cinematic scroll-driven portfolio
// rebuild", 36 characters. As a SERP description that is close to useless:
// Google pads or replaces anything that short with scraped page text, so the
// one string the site got to choose was thrown away.
//
// The obvious fix — lengthen `project.description` — is wrong and would be a
// regression. That field is load-bearing twice over: it is the `/projects` card
// subtitle, deliberately four words "to match the listing's card rhythm" (see
// data.js), and it is the `/projects/[id]` headline subtitle rendered by
// ProjectIntro. Stretching it to 150 characters would break both layouts.
//
// So the meta description is COMPOSED from facts the record already carries —
// name, the short description, category, creation date, and whether the source
// is public. Nothing is invented (P4), nothing existing is disturbed, and a new
// project gets a correct description with no extra field to write.
//
// The 110–160 character window is what tests/unit/metadataContract.test.js
// enforces, and it is not arbitrary: Google truncates desktop descriptions
// around 155–160 characters, and under about 110 it tends to substitute its own
// text. `assertDescriptionFits` — now in `src/lib/seo/descriptionWindow.js`, see
// the note at the foot of this file — is exercised for all eleven projects by
// that test, so a new project with an unusually long name cannot silently ship
// a truncated description.

import { DEFAULT_LOCALE } from '@/i18n/locales';
import { intlTag } from '@/i18n/format';
import { localizeCategory, localizeProject } from '@/i18n/data';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * "July 2025" from an ISO `YYYY-MM-DD` date.
 *
 * Parsed by splitting rather than with `new Date()`: `new Date('2025-07-20')`
 * is interpreted as UTC midnight and then rendered in the LOCAL zone, so a
 * build machine anywhere west of Greenwich reports the previous month for any
 * date landing on the 1st. Splitting the string cannot drift.
 *
 * @param {string} iso An ISO date string.
 * @returns {string} "Month YYYY", or an empty string if unparseable.
 */
function monthYear(iso) {
  if (typeof iso !== 'string') return '';
  const [year, month] = iso.split('-');
  const index = Number(month) - 1;
  if (!year || !MONTHS[index]) return '';
  return `${MONTHS[index]} ${year}`;
}

/**
 * Lower-case the first character of a sentence, UNLESS it opens an acronym.
 *
 * The naive `charAt(0).toLowerCase() + slice(1)` turns "AI-powered recipe
 * discovery platform" into "aI-powered…", which is how this function came to
 * exist — the bug was caught by measuring the eleven real descriptions rather
 * than by reading the code, which looked obviously correct.
 *
 * The rule that works: only lower-case the first character when the SECOND one
 * is already lower-case. "Cinematic" → "cinematic"; "AI-powered" is left alone,
 * and so would be "UK", "API" or any other leading acronym.
 *
 * @param {string} text Sentence to de-capitalise.
 * @returns {string} The sentence, safe to embed mid-sentence.
 */
function lowerFirstUnlessAcronym(text) {
  if (text.length < 2) return text.toLowerCase();
  const second = text.charAt(1);
  // `toLowerCase() !== second` is true only for a genuine upper-case letter —
  // a digit or a hyphen compares equal to itself and correctly counts as "not
  // lower-case", leaving the first character untouched.
  const secondIsLower =
    second.toLowerCase() === second && second.toUpperCase() !== second;
  return secondIsLower ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/**
 * "a" or "an", chosen from the following word's first sound.
 *
 * Needed because the categories include "AI": "A AI project" was what the first
 * cut emitted. A vowel test is sufficient here and only here — the category set
 * is closed (Web, System, AI, Mobile), so there is no "an hour" / "a unicorn"
 * case to get wrong.
 *
 * Returned CAPITALISED because it always opens the second sentence. The first
 * attempt capitalised the whole string's first character instead, which
 * silently rewrote the project NAMES that open it — `culina` became `Culina`
 * and `theabdullahfolio` became `Theabdullahfolio`. Those are repository names;
 * their casing is meaningful (this repo also has an `AfaaqX`), so the sentence
 * that must not be touched is the first one and the capital belongs here.
 *
 * @param {string} word The word the article precedes.
 * @returns {'A'|'An'} The correct article, sentence-capitalised.
 */
function article(word) {
  return /^[aeiou]/i.test(String(word)) ? 'An' : 'A';
}

/**
 * The meta description for one project page.
 *
 * @param {object} project A `projectsData` record.
 * @returns {string} A description sentence, targeting 110–160 characters.
 */
export function projectMetaDescription(project) {
  const clause = lowerFirstUnlessAcronym(String(project.description ?? ''));
  const when = monthYear(project.date);

  // Public and private projects get different closing clauses, because the
  // useful fact differs: for a public repo it is that the source is readable,
  // and for a private one it is honest to say so rather than imply a link that
  // does not exist.
  //
  // "Public repository", not "Open source", and the distinction is not
  // pedantry. `project.private` is a VISIBILITY flag: it says the source can be
  // read, and nothing at all about the licence that says what may be done with
  // it. Nothing in `projectsData` carries licence data, so "open source" was an
  // unverified claim on every public project — and a false one on this very
  // repository, whose LICENSE is "All rights reserved". It also went out as a
  // meta description, which is the worst place to be wrong: it is what a search
  // engine quotes, so the claim travels further than the page does.
  const provenance = project.private
    ? 'Private repository, tracked live from its GitHub board'
    : 'Public repository, tracked live from its GitHub board';

  // No "by Muhammad Abdullah" here, deliberately. The title template already
  // stamps "· Muhammad Abdullah" onto every one of these pages, so repeating it
  // in the description spends ~20 of the 160 available characters restating
  // what the adjacent line in the same SERP entry already says. Dropping it is
  // what brought the longest of these (muhammadabdullah-portfolio, 180
  // characters) inside the window.
  const started = when ? `, started ${when}` : '';

  // The project NAME opens the string and is never re-cased — see `article`.
  return (
    `${project.name} — ${clause}. ` +
    `${article(project.category)} ${project.category} build${started}. ` +
    `${provenance}.`
  );
}

/**
 * The meta description in the reader's language (issue #82).
 *
 * English returns `projectMetaDescription(project)` untouched, byte for byte.
 * Every other locale composes the SAME facts — name, short description,
 * category, start month, visibility — through one ProjectDetail template
 * (`meta.dated` / `meta.undated`) rather than by translating the English
 * sentence's pieces: word order, the article rule (`article()` is an English
 * rule) and the capitalisation fix (`lowerFirstUnlessAcronym`) are all English
 * grammar, so none of them is applied here. The project NAME still opens the
 * sentence and is never translated or re-cased.
 *
 * Translators are passed in rather than fetched, so this module stays free of
 * `next-intl/server` and of src/app/data.js — it is still imported by the
 * detail route alone (sitemapDrift.test.js checks that).
 *
 * @param {object} project A `projectsData` record.
 * @param {{locale: string, t: Function, dataT: Function}} options
 *   `t` — the ProjectDetail translator; `dataT` — `getDataT(locale)`.
 * @returns {string}
 */
export function localizedProjectMetaDescription(project, { locale, t, dataT } = {}) {
  if (!locale || locale === DEFAULT_LOCALE || !t) return projectMetaDescription(project);
  const { description } = localizeProject(project, dataT);
  const values = {
    name: project.name,
    description: String(description ?? ''),
    category: localizeCategory(project.category, dataT),
    visibility: project.private ? 'private' : 'public',
  };
  const when = localMonthYear(project.date, locale);
  return when ? t('meta.dated', { ...values, when }) : t('meta.undated', values);
}

/**
 * "julio de 2025" / "يوليو ٢٠٢٥" — `monthYear` for any locale, via Intl.
 * Split-parsed and formatted in UTC for the same no-drift reason `monthYear`
 * gives above.
 */
function localMonthYear(iso, locale) {
  if (typeof iso !== 'string') return '';
  const [year, month] = iso.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return '';
  return new Intl.DateTimeFormat(intlTag(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

// `assertDescriptionFits` moved to `src/lib/seo/descriptionWindow.js` and is
// deliberately NOT re-exported from here. A re-export would restore the import
// edge the move exists to remove: `noteMeta.js` needs the window too, and
// reaching it through this module would make every note page render from the
// project description composer — which `sitemapDrift.test.js` fails on, because
// it would re-stamp all twenty-odd URLs for a change only eleven can see.
