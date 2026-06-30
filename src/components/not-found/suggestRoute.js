// Pure, DOM-free route matcher for the 404 page. Lives apart from
// the React tree (no 'use client', no imports) so the matching logic
// can be reasoned about in isolation — same separation the rest of
// this folder follows (GlitchText / ReturnPortal / DidYouMean).

/**
 * The browsable destinations a mistyped URL might be aiming for.
 *
 * Home ("/") is intentionally omitted — the TAKE ME BACK portal
 * already covers it — so this list is only the sub-pages worth
 * recovering a typo *toward*. Order is the tie-break order when two
 * routes are equidistant from the typed segment (first wins), so keep
 * the most likely guesses higher.
 *
 * Keep in sync with `src/app/(sub pages)/*`.
 */
export const KNOWN_ROUTES = [
  { segment: 'about', href: '/about', label: 'About' },
  { segment: 'projects', href: '/projects', label: 'Projects' },
  { segment: 'qualifications', href: '/qualifications', label: 'Qualifications' },
  { segment: 'contact', href: '/contact', label: 'Contact' },
];

/**
 * Classic iterative Levenshtein distance — the minimum number of
 * single-character edits (insert / delete / substitute) to turn `a`
 * into `b`. Two-row variant for O(min) memory; inputs are short route
 * slugs so this is about tidiness, not speed.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} edit distance
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    // Swap rows: this iteration's `curr` becomes next iteration's
    // `prev`, and we reuse the old `prev` array as scratch.
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Lowercased first path segment, with query/hash and surrounding
 * slashes stripped. `/Projcts/12?ref=x` -> `projcts`.
 *
 * First segment (not the full path) is the right unit here: routes
 * are flat, so `/projcts/anything` should still recover toward
 * `/projects`.
 *
 * @param {string} pathname
 * @returns {string}
 */
function firstSegment(pathname) {
  if (!pathname) return '';
  const beforeQueryOrHash = pathname.split(/[?#]/)[0];
  const segments = beforeQueryOrHash.split('/').filter(Boolean);
  return (segments[0] ?? '').toLowerCase();
}

/**
 * Best-effort "did you mean" for a mistyped path. Returns the closest
 * {segment, href, label} from KNOWN_ROUTES, or `null` when nothing is
 * close enough to confidently suggest.
 *
 * Rules, in order:
 *   1. No first segment (root, or all-empty) -> null. Nothing to
 *      recover toward; the portal/chips already cover browsing.
 *   2. Exact segment match -> null. The route EXISTS, so if we still
 *      404'd it's a deeper/missing child (e.g. /projects/999-bad-id),
 *      and "did you mean Projects?" would be redundant and confusing.
 *   3. Otherwise take the smallest edit distance, and accept it only
 *      within a length-relative threshold so "projcts" -> Projects
 *      but "wxyz" -> nothing.
 *
 * @param {string} pathname  Typically `window.location.pathname`.
 * @returns {{segment:string, href:string, label:string} | null}
 */
export function suggestRoute(pathname) {
  const seg = firstSegment(pathname);
  if (!seg) return null;

  let best = null;
  let bestDistance = Infinity;
  for (const route of KNOWN_ROUTES) {
    const distance = levenshtein(seg, route.segment);
    // Strict `<` keeps the earlier (higher-priority) route on ties.
    if (distance < bestDistance) {
      bestDistance = distance;
      best = route;
    }
  }

  if (!best) return null;
  if (bestDistance === 0) return null; // exact match — route exists

  // Accept only "close" misses. The threshold scales with the longer
  // of the two strings (~40%), floored at 1 so single-char typos on
  // short slugs still match, and capped at 4 so a long route name
  // ("qualifications") can't swallow a wildly different segment.
  const longer = Math.max(seg.length, best.segment.length);
  const threshold = Math.min(4, Math.max(1, Math.floor(longer * 0.4)));
  return bestDistance <= threshold ? best : null;
}
