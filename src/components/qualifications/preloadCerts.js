'use client';

// Pre-warms the /qualifications certificate images into the browser's HTTP
// cache so the carousel paints instantly on arrival and category switches are
// immediate — instead of the cards popping in one by one.
//
// This pairs with images.minimumCacheTTL = 1 year in next.config.mjs (issue
// #84): once a cert is fetched it stays cached, so this one-time warm turns
// every later view (first paint, category switch, revisit) into a cache hit.
//
// KEY DETAIL: the carousel renders through next/image, so the browser actually
// requests `/_next/image?url=...&w=<picked>&q=<default>` — NOT the raw .webp. A naive
// `new Image().src = '/qualifications/foo.webp'` would warm a *different* URL
// and never hit. So we ask next/image itself (getImageProps) for the exact
// srcSet/sizes it would generate, then hand that to a detached Image(): setting
// `.srcset` + `.sizes` makes the browser run the identical responsive
// selection and fetch the matching optimiser candidate.

import { getImageProps } from 'next/image';
import DIMS from './_dimensions.json';
import { certSizes } from './certSizes';

// Every cert, derived from the dimensions manifest (verified 1:1 with the files
// in public/qualifications). width/height give the aspect ratio, which decides
// the same per-card `sizes` string the carousel uses.
const CERTS = Object.entries(DIMS).map(([slug, dim]) => ({
  src: `/qualifications/${slug}.webp`,
  ar: dim?.width && dim?.height ? dim.width / dim.height : 0.71,
}));

// Warm each src at most once per page load. The HTTP cache dedupes across
// loads; this Set dedupes the redundant hover → press → mount triggers within
// a single load.
const warmed = new Set();

const warm = ({ src, ar }) => {
  if (warmed.has(src)) return;
  warmed.add(src);
  const { props } = getImageProps({
    src,
    alt: '',
    fill: true,
    sizes: certSizes(ar),
    // Deliberately NOT setting quality. The carousel's <Image> omits it too, so
    // both inherit the same next/image default — if that default ever changes
    // app-wide, the preloaded URL and the carousel's request move together and
    // stay a cache hit. Hardcoding a value here would pin the preloader and
    // silently drift the moment the carousel's effective quality changed.
  });
  const img = new Image();
  // Low priority: warming must never steal bandwidth from the destination
  // page's own critical resources during the transition. The carousel's centre
  // card is <Image priority>, so the on-screen image still gets HIGH priority
  // when it mounts, regardless of this hint.
  img.fetchPriority = 'low';
  if (props.sizes) img.sizes = props.sizes;
  if (props.srcSet) img.srcset = props.srcSet;
  // srcset+sizes drive the fetch; src is the fallback the browser uses if it
  // ignores srcset (older engines) — kept identical so either path warms.
  img.src = props.src;
};

let started = false;

// Fire-and-forget, idempotent (started guard + per-src Set), so it's safe to
// wire to hover, pointer-down AND mount at once. Call as early as the user
// shows intent to visit /qualifications; the Stone Passage transition then
// gives the fetches ~2s under its cover before the page is revealed.
export function preloadQualificationCerts() {
  if (typeof window === 'undefined' || started) return;
  // Respect data-saver / very slow links: skip the bulk warm and let the
  // carousel lazy-load as before. The visible cards still load; we just don't
  // eagerly pull all 49 on a metered 2G connection.
  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  if (conn && (conn.saveData || /(^|\b)2g$/i.test(conn.effectiveType || ''))) {
    return;
  }
  started = true;
  for (const cert of CERTS) warm(cert);
}
