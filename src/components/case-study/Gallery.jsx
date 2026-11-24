'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { m, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStaticMotion } from '@/components/motion/useStaticMotion';
import { useDirection } from '@/i18n/useDirection';

// M6: the gallery strip (issue #31).
//
// The server renders, and every visitor first gets, a NATIVE horizontal
// scroll-snap strip: it works on touch, with a keyboard (the strip is a
// focusable region, arrow keys scroll it), without JS, and it never traps
// vertical scrolling.
//
// After mount, and only on a hovering fine pointer at desktop width without
// reduced motion, it upgrades to the pinned version: the section grows tall,
// the strip sticks to the viewport, and vertical scroll moves it sideways in
// the reading direction. Branching AFTER mount, never in the first render,
// keeps the server and client markup identical (the PageTitle hydration
// lesson). Static mode never upgrades: a scroll-linked `x` would freeze at 0
// there and strand every screen past the first.

const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';

export default function Gallery({ items, label }) {
  const reduced = useReducedMotion();
  const isStatic = useStaticMotion();
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP);
    const update = () => setDesktop(mql.matches);
    update();
    mql.addEventListener?.('change', update);
    return () => mql.removeEventListener?.('change', update);
  }, []);

  const pinned = desktop && !reduced && !isStatic;
  return pinned ? <PinnedStrip items={items} label={label} /> : <NativeStrip items={items} label={label} />;
}

function Figure({ item, onFocus, focusable }) {
  return (
    // In the pinned strip the page scroll moves the slides sideways, so each
    // slide takes focus and focusing it scrolls it into view: Tab walks the
    // strip. The native strip leaves this off (the region itself is focusable).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard path through a scroll-driven strip
    <figure className="cs-gallery__item" tabIndex={focusable ? 0 : undefined} onFocus={onFocus}>
      <div className="cs-gallery__media">
        <Image
          src={item.src}
          alt={item.alt}
          width={1440}
          height={900}
          sizes="(min-width: 1024px) 50vw, 85vw"
          className="h-full w-full object-cover object-top"
        />
      </div>
      {item.caption ? <figcaption className="cs-gallery__caption">{item.caption}</figcaption> : null}
    </figure>
  );
}

function NativeStrip({ items, label }) {
  return (
    // A scrollable region must be reachable by keyboard (axe
    // `scrollable-region-focusable`), and a focusable region needs a name.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-focusable (axe scrollable-region-focusable)
    <div className="cs-gallery__native" role="region" aria-label={label} tabIndex={0}>
      {items.map((item) => (
        <Figure key={item.id} item={item} />
      ))}
    </div>
  );
}

function PinnedStrip({ items, label }) {
  const sectionRef = useRef(null);
  const stripRef = useRef(null);
  const travel = useRef(0);
  const [height, setHeight] = useState(null);
  const { sign } = useDirection();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, (p) => -sign * p * travel.current);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const measure = () => {
      // The track is `width: max-content`; it travels until its far edge
      // meets the far edge of the sticky viewport it sits in.
      const viewport = strip.parentElement?.clientWidth ?? strip.clientWidth;
      travel.current = Math.max(0, strip.scrollWidth - viewport);
      setHeight(window.innerHeight + travel.current);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // A keyboard user tabbing onto a screen scrolls the page to where that
  // screen is in view, so focus is never on something off to the side.
  const focusItem = (i) => {
    const section = sectionRef.current;
    if (!section || items.length < 2) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    const range = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (i / (items.length - 1)) * range, behavior: 'auto' });
  };

  return (
    <div ref={sectionRef} className="cs-gallery__pinned" style={height ? { height } : undefined}>
      <div className="cs-gallery__sticky" role="region" aria-label={label}>
        <m.div ref={stripRef} className="cs-gallery__track" style={{ x }}>
          {items.map((item, i) => (
            <Figure key={item.id} item={item} focusable onFocus={() => focusItem(i)} />
          ))}
        </m.div>
      </div>
    </div>
  );
}
