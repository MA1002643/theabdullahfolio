'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { m } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { dur, ease } from '@/lib/motion/caseStudy';
import { Rise } from './reveal';

// M5: pinned walkthrough (issue #31). On a wide screen a sticky media panel
// sits at the reading END, and the steps scroll past at the start; the step
// crossing the middle of the viewport owns the panel. Grid order alone puts
// the panel on the left under right to left, with no extra rule.
//
// The panel holds every step's image at once and switches which one is shown
// with `animate` bound to the active index: a crossfade plus a clip opening
// from the top. Nothing mounts or unmounts on a step change, so an image
// that has loaded never reloads, and in static mode (features never arrived)
// the active image is still recomputed from props on every render.
//
// On a narrow screen, and under reduced motion at any width, the panel is
// hidden by CSS and each step shows its own image inline above its text
// (`.cs-walk` in globals.css): no pinning, nothing to follow.

const SHOWN = { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' };
const HIDDEN = { opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' };

export default function Walkthrough({ steps, counters }) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    // A band one pixel tall at the vertical centre: exactly one step crosses it.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number(entry.target.dataset.step));
        }
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  const transition = reduced ? { duration: 0 } : { duration: dur.slow, ease: ease.out };

  return (
    <div className="cs-walk">
      <ol className="cs-walk__steps">
        {steps.map((step, i) => (
          <li
            key={step.id}
            ref={(el) => (stepRefs.current[i] = el)}
            data-step={i}
            data-active={i === active ? '' : undefined}
            className="cs-walk__step"
          >
            {step.media ? (
              <div className="cs-walk__inline">
                <Image
                  src={step.media.src}
                  alt={step.media.alt}
                  width={1440}
                  height={900}
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="h-auto w-full rounded-xl"
                />
              </div>
            ) : null}
            <Rise order={0}>
              <p className="cs-eyebrow" aria-hidden="true">
                {counters[i]}
              </p>
              <h3 className="cs-walk__title">{step.title}</h3>
              <p className="cs-body">{step.body}</p>
            </Rise>
          </li>
        ))}
      </ol>

      <div className="cs-walk__panel" aria-hidden="true">
        <div className="cs-walk__frame">
          {steps.map((step, i) =>
            step.media ? (
              <m.div
                key={step.id}
                className="cs-walk__slide"
                initial={i === 0 ? SHOWN : HIDDEN}
                animate={i === active ? SHOWN : HIDDEN}
                transition={transition}
              >
                <Image
                  src={step.media.src}
                  alt=""
                  width={1440}
                  height={900}
                  sizes="50vw"
                  className="h-full w-full object-cover object-top"
                />
              </m.div>
            ) : null,
          )}
          <p className="cs-walk__count">
            {counters[active]}
          </p>
        </div>
      </div>
    </div>
  );
}
