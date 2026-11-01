// twitter:image is only emitted by this file convention — the sibling
// opengraph-image feeds og:image alone, and the page's metadata replaces
// the root twitter object (correctly: inheriting it would put the
// HOMEPAGE card on this route). Re-exporting the same card keeps one
// composition source and gives X an explicit image instead of a fallback.
export { default, alt, size, contentType } from './opengraph-image';
