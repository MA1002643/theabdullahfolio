// Absolute-URL builder (issue #32, W1). The ONLY place in the codebase that
// joins `ORIGIN` onto a path.
//
// Why it is one function and not an inline template literal at each call site:
// canonicals are the one metadata field where a near-miss is worse than an
// omission. `https://ma.codes/about/` and `https://ma.codes/about` are two
// URLs to Google, as are `//about` and `/about`, and a page that declares the
// wrong one actively de-duplicates itself away. Funnelling every join through
// one normaliser means the trailing-slash and double-slash rules are decided
// once.
//
// The site serves NO trailing slashes (Next's default `trailingSlash: false`),
// so canonicals must not carry one either — except at the root, where `/` IS
// the path and `https://ma.codes` with no path is the correct form.

import { ORIGIN } from './site';

/**
 * Absolute URL for a site-relative path.
 *
 * Idempotent on SCHEME-BEARING inputs: a URL that names its own scheme is
 * returned unchanged, so a caller holding a full URL cannot accidentally
 * produce `https://ma.codes/https://ma.codes/x`.
 *
 * A protocol-relative input (`//about`) is deliberately NOT in that category,
 * though it reads like one. It names no scheme and no origin of its own — a
 * browser resolves it against the current page's scheme and treats the first
 * segment as a HOST, so `//about` becomes `https://about/`. Returning it
 * untouched emitted a canonical pointing at a host this site does not own,
 * which is precisely the failure the normalisation below exists to prevent and
 * the header comment above says cannot happen. It falls through.
 *
 * @param {string} path Site-relative path (`/about`) or a scheme-bearing URL.
 * @returns {string} Absolute URL with no trailing slash (bare origin for `/`).
 */
export function absoluteUrl(path = '/') {
  if (typeof path !== 'string' || path === '') return ORIGIN;
  // A declared scheme (`https:`, `mailto:`, `tel:`) means the caller already
  // holds a complete reference. The pattern requires the scheme at position 0,
  // so a path that merely CONTAINS a colon (`/projects/a:b`) is not mistaken
  // for one and is still normalised.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;

  // Collapse any run of leading slashes to exactly one, so `//about` — which a
  // browser reads as a protocol-relative URL to the host `about` — cannot
  // survive into a canonical. Reachable for those inputs only because the guard
  // above no longer returns them early; whatever arrives here leaves with
  // ORIGIN in front of it, which is what pins the host.
  const withLeadingSlash = `/${path.replace(/^\/+/, '')}`;

  // Strip a trailing slash, but never reduce the root to the empty string.
  const normalised =
    withLeadingSlash.length > 1
      ? withLeadingSlash.replace(/\/+$/, '')
      : withLeadingSlash;

  // The root canonical is the bare origin. `https://ma.codes/` would also be
  // accepted by every consumer, but the bare form is what `metadataBase`
  // resolves to and what the sitemap declares, so all three agree literally.
  return normalised === '/' ? ORIGIN : `${ORIGIN}${normalised}`;
}

/**
 * The `alternates` block for a route's metadata export.
 *
 * Returned as a whole object rather than just the string because Next's
 * metadata merge is SHALLOW (see the note at the top of src/lib/og/meta.js):
 * `alternates` set anywhere below the root replaces the root's entirely. A
 * page that needs to add `languages` later therefore has to build the whole
 * block, and having one builder makes that a change in one place.
 *
 * The `languages` seam is left deliberately open for #82 (multilingual): the
 * shape below is what `alternates.languages` slots into without a rewrite,
 * which is the "design for it, do not build it" instruction from that issue's
 * coordination note.
 *
 * @param {string} path Site-relative route path.
 * @returns {{canonical: string}} Metadata `alternates` block.
 */
export function alternatesFor(path) {
  return { canonical: absoluteUrl(path) };
}
