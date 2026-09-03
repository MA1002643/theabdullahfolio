import { Fragment } from 'react';
import { wordFill } from '@/lib/fireRamp';

// The contact-intro / Architect-paragraph fire ink as a plain, static text
// renderer: every word owns its clipped slice of the shared gold→ember ramp
// (@/lib/fireRamp), so a line or paragraph darkens in reading order exactly
// like those two reveals do — without their animation machinery. Per-word
// clips (never one background-clip:text on the parent) is the documented
// GPU-safe pattern: a single clip on an ancestor rasterises once inside a
// promoted layer and ignores descendant state (the About tilt-card bug).
//
// Words render as plain spans with no wrapper element, so the caller's own
// element keeps full control of layout, sizing and semantics; spaces stay
// bare text nodes between the spans so the copy wraps naturally.
export default function FireText({ text }) {
  const words = String(text).split(' ');
  return words.map((w, i) => (
    <Fragment key={`${i}-${w}`}>
      <span style={wordFill(i, words.length)}>{w}</span>
      {i < words.length - 1 ? ' ' : ''}
    </Fragment>
  ));
}
