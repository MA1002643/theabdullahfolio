// Twitter re-uses the OG card verbatim — same arrangement as every other route.
// `generateStaticParams` and `dynamicParams` both ride along: this is a
// separate metadata-image module, so closing the param set next door does
// nothing for this one. Without the pair it would serve a fallback card on
// demand for any slug.
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
