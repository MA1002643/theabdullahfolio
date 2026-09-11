// JSON-LD script tag (issue #32, W2). A server component — it renders a
// <script> whose body is data, so there is nothing for the client to hydrate
// and no reason to ship a byte of it to the browser.
//
// ── Why the escaping is not optional ────────────────────────────────────────
// `<script type="application/ld+json">` has RAW TEXT content. The HTML parser
// does not process entities inside it, and it ends the element at the first
// `</script` it sees — it does NOT understand JSON strings, so a `</script>`
// inside a quoted JSON value closes the tag anyway. `JSON.stringify` escapes
// for JSON, which does not escape `<` at all, so its output is not safe to
// interpolate into raw text.
//
// The consequence is a stored-XSS sink: everything after that point is parsed
// as HTML, so a value containing `</script><img src=x onerror=...>` executes.
//
// This is NOT theoretical on this origin. The guestbook accepts user-authored
// display names and messages, and the ambition of this issue is a connected
// entity graph that pulls real data into schema — live skill names from
// /api/github-skills, project metadata, and plausibly guestbook content in
// future. Any of those becoming a schema value on a page that serialises
// unsafely is a same-origin script execution. Escaping here means no future
// caller has to remember.
//
// The fix is to escape the three characters that can start a problem, using
// JSON's OWN \uXXXX string escapes rather than HTML entities:
//
//   `<`  →  <   — cannot begin `</script` or `<!--`
//   `>`  →  >   — cannot complete `-->`
//   `&`  →  &   — cannot begin an entity a consumer might later decode
//
// Using \uXXXX rather than `&lt;` matters and is the part that is easy to get
// wrong: inside a raw-text element, HTML entities are NOT decoded, so writing
// `&lt;` would leave the literal six characters in the JSON value and CHANGE
// THE DATA a consumer reads. A `<` escape is decoded by the JSON parser
// back to `<`, so the value is preserved exactly while the HTML parser never
// sees a `<` at all. Lossless and safe, where the entity form is lossy.
//
// Also stripped: U+2028/U+2029. Both are valid in JSON strings but are line
// terminators in older JavaScript grammars, so a consumer that `eval`s the
// block (some do) would see a syntax error.

/**
 * Serialise a value for safe embedding in a raw-text `<script>` element.
 *
 * @param {unknown} value JSON-serialisable value.
 * @returns {string} JSON text containing no `<`, `>`, `&` or line separators.
 */
export function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Recursively drop `undefined` and `null` members.
 *
 * Schema consumers treat a present-but-null property as a claim that the value
 * is empty, which is a different statement from not making the claim — and
 * Google's Rich Results Test reports `null` as an error rather than ignoring
 * it. The builders in src/lib/seo/schema.js compose objects from live data
 * (project repos, the skills API) where a field can legitimately be absent, so
 * pruning centrally is what stops `"codeRepository": null` reaching the page.
 *
 * Empty strings and empty arrays are pruned for the same reason. `0` and
 * `false` are NOT — both are meaningful values.
 *
 * @param {unknown} value Value to prune.
 * @returns {unknown} The value with empty members removed.
 */
export function pruneEmpty(value) {
  if (Array.isArray(value)) {
    const items = value.map(pruneEmpty).filter((v) => v !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      const pruned = pruneEmpty(raw);
      if (pruned !== undefined) out[key] = pruned;
    }
    // An object reduced to nothing is itself absent — this is what stops an
    // `author: {}` shell surviving when every field inside it was unknown.
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (value === null || value === undefined || value === '') return undefined;
  return value;
}

/**
 * Renders one JSON-LD block.
 *
 * @param {{data: unknown, id?: string}} props `data` is the graph or node to
 *   emit; `id` sets the script tag's DOM id, which the e2e suite uses to find a
 *   specific block on a page that carries more than one.
 * @returns {JSX.Element|null} The script element, or null when there is nothing
 *   to say.
 */
export default function JsonLd({ data, id }) {
  const pruned = pruneEmpty(data);
  // Nothing worth saying — emit no tag at all rather than an empty one. An
  // empty `<script type="application/ld+json">` is a validation error.
  if (pruned === undefined) return null;

  return (
    <script
      id={id}
      type="application/ld+json"
      // Safe by construction: `serializeJsonLd` guarantees the string contains
      // no `<`, so it cannot close this element early. See the module note.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(pruned) }}
    />
  );
}
