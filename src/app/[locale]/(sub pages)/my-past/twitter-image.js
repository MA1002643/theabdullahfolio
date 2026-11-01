// twitter:image is only emitted by this file convention — the sibling
// opengraph-image feeds og:image alone, and sectionMetadata replaces the
// root twitter object (see src/lib/og/meta.js). Re-exporting keeps one
// composition source.
export { default, alt, size, contentType } from './opengraph-image';
