// twitter:image is only emitted by this file convention — the sibling
// opengraph-image feeds og:image alone, and the page's metadata replaces
// the root twitter object (correctly: inheriting it would put the
// HOMEPAGE card on this route). Re-exporting the same poster keeps one
// composition source; generateStaticParams/dynamicParams ride along so
// these eleven render at build time too.
//
// `dynamicParams` is declared here, not re-exported. Next 15 reads route
// segment config statically from the file itself; a re-exported value is
// ignored with a build warning and the default (`true`) applies.
export {
  default,
  alt,
  size,
  contentType,
  generateStaticParams,
} from './opengraph-image';

export const dynamicParams = false;
