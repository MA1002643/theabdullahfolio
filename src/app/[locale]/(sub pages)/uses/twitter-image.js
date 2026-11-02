// Twitter re-uses the OG card verbatim. This file exists because
// `sectionMetadata` replaces the root `twitter` metadata object (Next merges
// shallowly), so `twitter:image` is only ever emitted via this file
// convention — same arrangement as every other section route.
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
