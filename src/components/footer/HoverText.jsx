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

// A non-breaking space keeps its width when a plain space would collapse inside
// an inline-block char box.
const NBSP = ' ';

export default function HoverText({ text }) {
  const chars = String(text).split('');

  return (
    <>
      <span className="hover-text" aria-hidden="true">
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
