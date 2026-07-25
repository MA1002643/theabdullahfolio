// Single source of truth for the responsive `sizes` a certificate image is
// rendered at, keyed on aspect ratio.
//
// BOTH the carousel's <Image> (Carousel.jsx) and the preloader
// (preloadCerts.js) must hand next/image the IDENTICAL `sizes` string: the
// preloader warms `/_next/image?url=...&w=<picked>` where `<picked>` is chosen
// from the srcSet using `sizes`. If the two strings diverge the browser can
// pick a different width, the warmed URL won't match the carousel's request,
// and the whole preload silently degrades to a cache miss — no error, just a
// slow page again. Centralising the mapping means a sizing change happens once
// and both paths move together, instead of the same expression living copied in
// two files with nothing guarding their equality.
//
// WHY THIS EXACT SHAPE: a card's rendered width is
//   min(--cert-w-cap, aspectRatio × --cert-cap)
// — the SAME min() Carousel.jsx uses for the card box (see imgW there). The
// card is almost always HEIGHT-bound (the --cert-cap height cap × aspect ratio
// is narrower than the vw width cap), so declaring the width cap alone (e.g.
// "70vw") massively overstates the real width: on a 2560px display 70vw ≈
// 1792px even though the card only paints ~700px, which made next/image request
// a 1920-wide asset. Mirroring the true min() here means the browser targets
// the real painted width, so the carousel self-limits to ~1080/1200 without
// needing a global images.deviceSizes cap in next.config — that cap would clamp
// EVERY next/image site-wide (full-bleed 100vw backgrounds included) and soften
// them on large/high-DPR screens. The container CSS vars drive the numbers:
//   mobile (<768px):  --cert-w-cap 90vw, --cert-cap 56vh
//   desktop (>=768px):--cert-w-cap 70vw, --cert-cap 68vh
// This is the exact painted size (not a conservative undershoot), so the
// browser still picks a candidate >= width×DPR — sharp, just not oversized.
//
// NOTE on quality: there is intentionally no shared `quality` here. Neither the
// carousel nor the preloader sets it, so both inherit the same next/image
// default by omission — a stronger zero-drift guarantee than a shared constant,
// which is why it isn't mirrored the way `sizes` must be.
export const certSizes = (ar) => {
  // Round so Carousel and preloadCerts, given the same ar, emit a byte-identical
  // string (cache-hit contract). 4 dp is ~0.01% error — absorbed by the DPR
  // headroom when the browser rounds up to the next srcSet candidate.
  const a = Number(ar).toFixed(4);
  return (
    `(max-width: 767.98px) min(90vw, calc(${a} * 56vh)), ` +
    `min(70vw, calc(${a} * 68vh))`
  );
};
