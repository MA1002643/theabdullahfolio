'use client';

import { m } from 'framer-motion';
import { useRevealShown } from './reveal';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { distance, dur, ease, stagger } from '@/lib/motion/caseStudy';

// The overview facts plate's entrance (issue #31, owner request 2026-11-23):
// the plate rises exactly as it always did, and then its ledger is WRITTEN.
// For each fact in reading order a hot filament draws across the slot above
// it, the label and the fire-ramped value pour up out of their masks, and
// the filament cools to transparent. The resting plate is visually identical
// to before — the filament is positioned over the row gap (no layout), ends
// invisible, and the values wear the same gold→ember ramp they always did.
//
// Two structural rules carried from elsewhere on this page:
// - The ramp RIDES the moving element. `.cs-facts__fill` (the gradient the
//   stylesheet used to put on the <dd>) sits on the mask's inner span — the
//   thing that translates — because a parent `background-clip: text` over
//   moving children rasterises once and paints wrong on real GPUs (the About
//   tilt-card bug). A clip on the mover itself is the ChapterHeading pattern.
// - Transform-only masks, never opacity, for anything that is text: a
//   contrast audit never meets a half-faded label. The plate itself keeps
//   its old rise-and-fade — it is a frame, not words.
//
// And the §6 rules: one state (`shown`, the chapter's reveal scope) bound to
// `animate`, with per-value delays — the filament's draw and its later cool
// are two delays on one flip, like the heading's rise-then-cool. No controls,
// no MotionValues. Static mode therefore renders the landed page from props
// (text risen, filament transparent); reduced motion collapses every duration
// to zero; a no-JS reader is covered by the `<noscript>` rule CaseStudy.jsx
// emits for `[data-cs-rise]`, and their filaments simply stay hot, like the
// molten headings.

/** The filament draws in at the eyebrow ember (#ffaa2a, the ramp's 70% stop)… */
const HOT = 'rgba(255, 170, 42, 0.9)';
/** …and burns out to the same hue at zero alpha, so the rest state adds nothing. */
const COOLED = 'rgba(255, 170, 42, 0)';

/* The plate keeps its old slot in the chapter rhythm (it was `order` 2)… */
const PLATE_AT = 2 * stagger.line;
/* …and the writing starts inside the tail of the plate's own rise. */
const ITEMS_AT = PLATE_AT + 2 * stagger.line;
/* One fact's figure — filament, label, value — before the next begins. */
const ITEM_STEP = 2 * stagger.item;
/* An authored plate can grow; late facts still land inside the entrance. */
const MAX_STEP = 7;

export default function FactsPlate({ facts, label }) {
  const shown = useRevealShown();
  const reduced = useReducedMotion();
  const rise = (delay, duration = dur.slow) =>
    reduced ? { duration: 0 } : { duration, ease: ease.out, delay };
  return (
    <m.dl
      data-cs-rise=""
      aria-label={label}
      className="abt-frame cs-card cs-facts"
      initial={{ opacity: 0, y: distance.rise }}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : distance.rise }}
      transition={rise(PLATE_AT)}
    >
      {facts.map((fact, i) => {
        const at = ITEMS_AT + Math.min(i, MAX_STEP) * ITEM_STEP;
        return (
          <div key={fact.id} className="cs-facts__item">
            <dt className="cs-facts__label">
              <m.span
                aria-hidden="true"
                data-cs-rise=""
                className="cs-facts__filament"
                initial={{ scaleX: 0, backgroundColor: HOT }}
                animate={{ scaleX: shown ? 1 : 0, backgroundColor: shown ? COOLED : HOT }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        scaleX: { duration: dur.base, ease: ease.out, delay: at },
                        backgroundColor: { duration: dur.slow, ease: ease.inOut, delay: at + dur.base },
                      }
                }
              />
              <span className="cs-mask">
                <m.span
                  data-cs-rise=""
                  className="cs-mask__inner"
                  initial={{ y: '105%' }}
                  animate={{ y: shown ? '0%' : '105%' }}
                  transition={rise(at + stagger.item)}
                >
                  {fact.label}
                </m.span>
              </span>
            </dt>
            <dd className="cs-facts__value" translate={fact.translate}>
              <span className="cs-mask">
                <m.span
                  data-cs-rise=""
                  className="cs-mask__inner cs-facts__fill"
                  initial={{ y: '105%' }}
                  animate={{ y: shown ? '0%' : '105%' }}
                  transition={rise(at + 2 * stagger.item, dur.hero)}
                >
                  {fact.href ? (
                    <a href={fact.href} target="_blank" rel="noopener noreferrer" className="cs-link">
                      {fact.value}
                    </a>
                  ) : (
                    fact.value
                  )}
                </m.span>
              </span>
            </dd>
          </div>
        );
      })}
    </m.dl>
  );
}
