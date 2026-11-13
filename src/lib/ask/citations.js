// Turns the model's streamed prose into text and citation events (issue #41).
//
// The model cites a fact by writing its id in double brackets, "[[P2]]"
// (src/lib/ask/corpus.js). The marker can arrive split across any number of
// stream deltas — "[", "[P", "2]", "]" — so this is an incremental parser:
// it holds back only what COULD still become a marker and releases
// everything else at once, so prose streams with no added delay.
//
//   push("He built AfaaqX [[P")  → [{text: "He built AfaaqX "}]
//   push("2]].")                 → [{cite: "P2"}, {text: "."}]
//
// A marker whose id is not citable (`isCitable` — the registry) is dropped
// silently: a hallucinated id must not reach the visitor as a broken source,
// nor as visible bracket noise. Bracket text that is not id-shaped at all
// ("[[a b c]]", or "[[" never closed) is not a citation and is emitted as
// written. Splitting the same input differently always yields the same events
// once adjacent text is merged (the fast-check property in
// tests/property/askCitations.property.test.js).

const ID_SHAPE = /^[A-Za-z][A-Za-z0-9]*(?::[A-Za-z0-9_-]+)?$/;
// The longest id the registry mints is well under this; a "[[" followed by
// more than this many characters without "]]" is not a marker.
const MAX_MARKER = 48;

export function createCitationParser(isCitable) {
  let buffer = '';

  const drain = (final) => {
    const out = [];
    const text = (t) => {
      if (!t) return;
      const last = out[out.length - 1];
      if (last?.type === 'text') last.text += t;
      else out.push({ type: 'text', text: t });
    };

    for (;;) {
      const open = buffer.indexOf('[[');
      if (open === -1) {
        // A lone trailing "[" may be the first half of "[[": hold it.
        if (!final && buffer.endsWith('[')) {
          text(buffer.slice(0, -1));
          buffer = '[';
        } else {
          text(buffer);
          buffer = '';
        }
        return out;
      }
      text(buffer.slice(0, open));
      buffer = buffer.slice(open);
      const close = buffer.indexOf(']]', 2);
      if (close === -1) {
        if (!final && buffer.length <= MAX_MARKER) return out; // wait for more
        // Never closed (or too long to be one): plain text.
        text(buffer.slice(0, 2));
        buffer = buffer.slice(2);
        continue;
      }
      const id = buffer.slice(2, close).trim();
      if (ID_SHAPE.test(id)) {
        if (isCitable(id)) out.push({ type: 'cite', id });
        // Unknown but id-shaped: dropped.
      } else {
        text(buffer.slice(0, close + 2));
      }
      buffer = buffer.slice(close + 2);
    }
  };

  return {
    /** Feeds one delta; returns the events it completes. */
    push(chunk) {
      buffer += chunk;
      return drain(false);
    },
    /** Flushes whatever is held back at the end of the stream. */
    end() {
      return drain(true);
    },
  };
}
