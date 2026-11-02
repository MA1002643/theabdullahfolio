// twitter:image is only emitted by this file convention — the sibling
// opengraph-image feeds og:image alone, and sectionMetadata replaces the
// root twitter object (see src/lib/og/meta.js). Re-exporting keeps one
// composition source.
export {
  default,
  alt,
  size,
  contentType,
  generateStaticParams,
} from './opengraph-image';

// Declared, not re-exported: Next reads segment config from this file's own
// source (tests/fitness/routeSegmentConfig.test.js).
export const dynamicParams = false;
