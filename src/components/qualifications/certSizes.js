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
// and both paths move together, instead of the same ternary living copied in
// two files with nothing guarding their equality.
//
// Portrait cards (ar < 1) render at 50vw on desktop, landscape at 70vw; both
// 90vw on mobile (<=768px). See the imgW/imgH derivation in Carousel.jsx for
// why these ceilings are deliberately conservative.
//
// NOTE on quality: there is intentionally no shared `quality` here. Neither the
// carousel nor the preloader sets it, so both inherit the same next/image
// default by omission — a stronger zero-drift guarantee than a shared constant,
// which is why it isn't mirrored the way `sizes` must be.
export const certSizes = (ar) =>
  ar < 1 ? '(max-width: 768px) 90vw, 50vw' : '(max-width: 768px) 90vw, 70vw';
