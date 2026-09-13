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
// text. `assertDescriptionFits` below is exercised for all eleven projects by
// that test, so a new project with an unusually long name cannot silently ship
// a truncated description.

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
  const provenance = project.private
    ? 'Private repository, tracked live from its GitHub board'
    : 'Open source, tracked live from its GitHub board';

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
 * Whether a description sits inside the window search engines render whole.
 *
 * Exported so the contract test can report WHICH project is out of bounds and
 * by how much, rather than just failing.
 *
 * @param {string} description The description to measure.
 * @returns {{ok: boolean, length: number}} Result and measured length.
 */
export function assertDescriptionFits(description) {
  const length = String(description ?? '').length;
  return { ok: length >= 110 && length <= 160, length };
}
