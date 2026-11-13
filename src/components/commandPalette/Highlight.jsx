// The matched characters of a palette label, marked (issue #41).
//
// `ranges` are [start, end) offsets into `text` from src/lib/palette/match.js.
// A <mark> per range, styled as a COLOUR change only: a bolder weight would
// widen the glyphs and make the row reflow under the caret with every
// keystroke. The accessible name is unchanged — a <mark> is read as its text.
export default function Highlight({ text, ranges }) {
  if (!ranges?.length) return text;
  const parts = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="bg-transparent text-[#ff6d05]">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
