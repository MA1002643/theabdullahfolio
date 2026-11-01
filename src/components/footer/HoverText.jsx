// Per-character "swap" hover text for the footer link columns (issue #30).
//
// The elite move borrowed from studio sites (e.g. trionn.com): on hover each
// glyph rolls up and out of the line while a fresh copy rolls up into its place
// from below — softened with a micro-blur and fired in a left-to-right stagger
// so the word re-typesets itself letter by letter. Here the outgoing copy is the
// column's resting grey and the incoming copy is a dimmed brand orange (the
// active-link hue, softened — see .hover-text__clone in globals.css), so the
// reveal doubles as a crisp per-letter colour lift (paired with the underline).
//
// Architecture note: rather than two absolutely-stacked full-word layers (which
// only align on a single unwrapped line), the face + clone are stacked INSIDE
// each character box. That keeps the whole thing flowing as normal inline text,
// so a long value like the contact email still wraps character-by-character
// (matching the old `break-all`) while every glyph keeps its own swap.
//
// Motion is transform/opacity/filter only (GPU, no layout, no CLS) and the
// per-char stagger is a pure CSS transition-delay driven by `--i`; there is no
// hover state in JS, so it works before hydration and costs nothing at rest.
// Under prefers-reduced-motion the roll collapses to a plain colour lift
// (see .hover-swap rules in globals.css).
//
// Accessibility: the animated glyphs are decorative (aria-hidden); the real,
// unsplit string is exposed once via an sr-only node, so the link's accessible
// name is always correct regardless of any aria-label on the parent anchor.

import { glyphUnits } from '@/components/ui/textSegments';

// A non-breaking space keeps its width when a plain space would collapse inside
// an inline-block char box.
const NBSP = ' ';

export default function HoverText({ text }) {
  // Script-aware split (issue #82): grapheme clusters — and whole WORDS for
  // Arabic-script and Devanagari text, whose letters lose their joined forms
  // in separate inline-block boxes, so those languages roll word by word.
  // See src/components/ui/textSegments.js.
  const chars = glyphUnits(text);

  // dir="auto": every glyph is its own inline-block, and inline-blocks are
  // neutral to the bidi algorithm, so in a right-to-left page they line up
  // right to left whatever script they hold — "CV" read "VC" in the Arabic
  // index. The run takes its direction from its own first letter instead:
  // a Latin label rolls left to right, an Arabic one right to left.
  return (
    <>
      <span className="hover-text" aria-hidden="true" dir="auto">
        {chars.map((char, i) => (
          <span
            key={i}
            className="hover-text__char"
            style={{ '--i': i }}
          >
            <span className="hover-text__face">
              {char === ' ' ? NBSP : char}
            </span>
            <span className="hover-text__clone" aria-hidden="true">
              {char === ' ' ? NBSP : char}
            </span>
          </span>
        ))}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
