'use client';

import { m } from 'framer-motion';
import { useRevealShown } from './reveal';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { wordChunks } from '@/components/ui/textSegments';
import { wordFill } from '@/lib/fireRamp';
import { dur, ease, stagger } from '@/lib/motion/caseStudy';

// The chapter heading's entrance (issue #31, owner request 2026-11-22): the
// numeral and the title are POURED IN MOLTEN AND LEFT TO COOL. Each word
// rises out of its own mask already wearing the gold→ember ramp sampled by
// reading order (`wordFill`), and once it lands it cools to the solid title
// ember — so the resting page is the same colour it always was, and the
// entrance is the only moment the heading is liquid.
//
// The rules this obeys, and why:
// - Transform only, no opacity: the mask hides the text (the HeroTitle
//   lesson), so a contrast audit never meets a half-faded heading.
// - Words via `wordChunks`, a pure function of the characters, so Arabic
//   keeps its joins and a CJK title cuts identically on server and client
//   (the /ja/about #418 defect). Each word owns its OWN clip — a single
//   background-clip on the parent would rasterise once in a GPU layer and
//   ignore the words moving inside their masks (the About tilt-card bug).
// - One state (`shown`, from the chapter's reveal scope) bound to `animate`,
//   per-value timing in `transition` (§6): the rise and the later cool are
//   two delays on one flip, never a control started from an effect. Static
//   mode therefore renders the landed, cooled pose from props; reduced
//   motion collapses every duration to zero; a reader with no JS is covered
//   by the <noscript> rule CaseStudy.jsx emits for `[data-cs-rise]` (the
//   un-cooled ramp is pure CSS, so their heading simply stays molten).
//
// The cool's end gradient is the ramp's own last stop (#ff6d05), which is
// `--cs-accent` by construction (`fireRamp.js` mirrors `.text-fire-amber`):
// two equal stops, same `rgb()` form as `rampColor`, so framer interpolates
// stop-for-stop instead of cross-fading.

const COOL = 'linear-gradient(180deg, rgb(255, 109, 5) 0%, rgb(255, 109, 5) 100%)';

const NUM_AT = 0;
const TITLE_AT = stagger.line;
/* A CJK title cuts into one chunk per character; cap the stagger so a long
   heading still lands inside the chapter's entrance rhythm. */
const MAX_STEP = 7;

export default function ChapterHeading({
  as = 'h2',
  id,
  text,
  number,
  className = 'cs-h2',
  numberClassName = 'cs-chapter__num',
}) {
  const Tag = as;
  const shown = useRevealShown();
  const reduced = useReducedMotion();
  const chunks = wordChunks(text);
  return (
    <>
      {number ? (
        <p aria-hidden="true" className={numberClassName}>
          <span className="cs-mask">
            <m.span
              data-cs-rise=""
              className="cs-mask__inner"
              initial={{ y: '105%' }}
              animate={{ y: shown ? '0%' : '105%' }}
              transition={reduced ? { duration: 0 } : { duration: dur.slow, ease: ease.out, delay: NUM_AT }}
            >
              {number}
            </m.span>
          </span>
        </p>
      ) : null}
      <Tag id={id} tabIndex={-1} className={className}>
        {chunks.map(({ word, gap }, i) => {
          const { backgroundImage: hot, ...clip } = wordFill(i, chunks.length);
          const at = TITLE_AT + Math.min(i, MAX_STEP) * stagger.item;
          return (
            <span key={i}>
              {gap}
              <span className="cs-mask">
                <m.span
                  data-cs-rise=""
                  className="cs-mask__inner"
                  style={clip}
                  initial={{ y: '105%', backgroundImage: hot }}
                  animate={{ y: shown ? '0%' : '105%', backgroundImage: shown ? COOL : hot }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          y: { duration: dur.hero, ease: ease.out, delay: at },
                          backgroundImage: { duration: dur.slow, ease: ease.inOut, delay: at + dur.base },
                        }
                  }
                >
                  {word}
                </m.span>
              </span>
            </span>
          );
        })}
      </Tag>
    </>
  );
}
