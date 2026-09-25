// The length window a meta description has to sit in, and the one measurement
// of it (issue #32).
//
// ── Why this is its own module ──────────────────────────────────────────────
// It lived in `projectMeta.js`, which was correct while the only caller was the
// contract test measuring the eleven project descriptions. `noteMeta.js` is the
// first PRODUCTION caller — a note falls back to a composed description when the
// document's own opening paragraph misses the window — and importing it from
// there made `/notes` and `/notes/[slug]` reach `projectMeta.js`, which
// `sitemapDrift.test.js` caught and was right to.
//
// The alternative it offered was moving `projectMeta.js` to a shared source
// list, and that would have been the wrong repair: a change to how the ELEVEN
// project descriptions are composed would then re-stamp `<lastmod>` on every
// URL on the site — the "too broad" error §10 of docs/seo.md records, arrived
// at from the other direction. A window is not a project fact; it is a fact
// about search engines, and it now lives somewhere that says so.

/** Below this, Google tends to discard the description and scrape its own. */
const FLOOR = 110;

/** Above this, the tail is truncated in the result. */
const CEILING = 160;

/**
 * Whether a description sits inside the window search engines render whole.
 *
 * Returns the measurement rather than a bare boolean so a caller can report
 * WHICH description is out of bounds and by how much — the contract test's
 * failure messages name the route and the length, which is the difference
 * between a useful failure and "expected false to be true".
 *
 * @param {string} description The description to measure.
 * @returns {{ok: boolean, length: number}} Result and measured length.
 */
export function assertDescriptionFits(description) {
  const length = String(description ?? '').length;
  return { ok: length >= FLOOR && length <= CEILING, length };
}
