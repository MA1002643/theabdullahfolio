// twitter:image is only emitted by this file convention — the sibling
// opengraph-image feeds og:image alone, and the page's metadata replaces
// the root twitter object (correctly: inheriting it would put the
// HOMEPAGE card on this route). Re-exporting the same poster keeps one
// composition source; generateStaticParams/dynamicParams ride along so
// these eleven render at build time too.
export {
  default,
  alt,
  size,
  contentType,
  generateStaticParams,
  dynamicParams,
} from './opengraph-image';
