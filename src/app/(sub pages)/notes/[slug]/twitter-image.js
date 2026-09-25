// Twitter re-uses the OG card verbatim — same arrangement as every other route.
// `generateStaticParams` and `dynamicParams` both ride along: this is a
// separate metadata-image module, so closing the param set next door does
// nothing for this one. Without the pair it would serve a fallback card on
// demand for any slug.
export {
  default,
  alt,
  size,
  contentType,
  generateStaticParams,
  dynamicParams,
} from './opengraph-image';
