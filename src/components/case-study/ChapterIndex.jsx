'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { AnimatePresence } from '@/components/motion/AnimatePresence';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { claimEscape } from '@/lib/escapeKey';
import { distance, dur, ease, stagger } from '@/lib/motion/caseStudy';
import { useEnteredView } from './reveal';

// M11: the chapter index (issue #31).
//
// Wide screens: a sticky list at the reading start. The active chapter is
// marked by ONE indicator that slides between rows by transform (every row is
// the same height, so row n is `n × 100 %` of the indicator's own height);
// nothing reflows when the chapter changes.
//
// The rail enters like everything else on the page (§5 of the case study's
// motion spec): the rows rise once the rail first scrolls into view, one
// `stagger.item` apart, and the indicator fades in after the last row. The
// gate is the same latched `useEnteredView` state the chapters use, bound to
// `animate` (CLAUDE.md §6: whole in static mode), one-shot like every other
// entrance here, instant under reduced motion, and undone for no-JS readers
// by the `[data-cs-rise]` noscript rule CaseStudy.jsx emits.
//
// Narrow screens: a pill, "Chapter 3 of 8", that opens a sheet listing the
// chapters. The sheet is a modal dialog: focus moves into it, Tab stays in it,
// Escape closes it (claimed, so the privacy notice's last-resort Escape leaves
// the press alone), and focus returns to the pill.
//
// A jump scrolls smoothly (instantly under reduced motion, read at the moment
// of the click), writes the real `#chapter-…` fragment so the URL can be
// shared, and moves focus to the chapter's heading so a keyboard or screen
// reader user continues from there. The links are real anchors: without JS,
// or with a modifier key, they behave as links.

export function jumpToChapter(anchor) {
  const section = document.getElementById(anchor);
  if (!section) return false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(history.state, '', `#${anchor}`);
  section.querySelector('h2')?.focus({ preventScroll: true });
  return true;
}

const isModified = (e) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

const ROW = {
  hidden: { opacity: 0, y: distance.rise },
  shown: { opacity: 1, y: 0 },
};

function useActiveChapter(chapters) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        // The LAST chapter whose top has crossed the reading line: a short
        // chapter followed by a tall one hands over as soon as the tall one
        // reaches the line, not when the short one has fully left.
        const index = chapters.findLastIndex((c) => visible.get(c.anchor));
        if (index !== -1) setActive(index);
      },
      { rootMargin: '-35% 0px -60% 0px', threshold: 0 },
    );
    for (const c of chapters) {
      const el = document.getElementById(c.anchor);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [chapters]);
  return active;
}

export default function ChapterIndex({ chapters, labels }) {
  const active = useActiveChapter(chapters);
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const pillRef = useRef(null);
  const sheetRef = useRef(null);
  const railRef = useRef(null);
  const entered = useEnteredView(railRef);

  const onJump = useCallback((e, anchor) => {
    if (isModified(e)) return;
    if (jumpToChapter(anchor)) {
      e.preventDefault();
      setOpen(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    pillRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const sheet = sheetRef.current;
    sheet?.querySelector('a')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        claimEscape(e);
        close();
        return;
      }
      if (e.key !== 'Tab' || !sheet) return;
      const focusable = [...sheet.querySelectorAll('a, button')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const current = chapters[active];
  const move = reduced ? { duration: 0 } : { duration: dur.base, ease: ease.inOut };

  return (
    <nav id="case-study-index" aria-label={labels.nav} className="cs-index">
      {/* Wide screens. The indicator is the list's SIBLING, not its child:
          an <ol> may contain only <li> (axe `list`). */}
      <div ref={railRef} className="cs-index__rail">
        <m.span
          aria-hidden="true"
          data-cs-rise=""
          className="cs-index__indicator"
          initial={{ opacity: 0 }}
          animate={{ y: `${active * 100}%`, opacity: entered ? 1 : 0 }}
          transition={{
            ...move,
            opacity: reduced
              ? { duration: 0 }
              : { duration: dur.base, ease: ease.out, delay: chapters.length * stagger.item },
          }}
        />
        <ol className="cs-index__list">
          {chapters.map((c, i) => (
            <m.li
              key={c.anchor}
              data-cs-rise=""
              initial="hidden"
              animate={entered ? 'shown' : 'hidden'}
              variants={ROW}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: dur.slow, ease: ease.out, delay: i * stagger.item }
              }
            >
              <a
                href={`#${c.anchor}`}
                onClick={(e) => onJump(e, c.anchor)}
                aria-current={i === active ? 'location' : undefined}
                className="cs-index__link"
              >
                {c.title}
              </a>
            </m.li>
          ))}
        </ol>
      </div>

      {/* Narrow screens */}
      <button
        ref={pillRef}
        type="button"
        className="cs-index__pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {/* Precomputed per index on the server: a Server Component cannot
            hand a formatter function to a Client Component. */}
        <span>{labels.positions[active]}</span>
        <span className="cs-index__pill-title">
          {current?.title}
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <m.div
            key="sheet-backdrop"
            className="cs-index__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: dur.base, ease: ease.out }}
            onClick={close}
          >
            <m.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label={labels.nav}
              className="cs-index__sheet"
              initial={{ y: '100%' }}
              animate={{ y: '0%' }}
              exit={{ y: '100%' }}
              transition={reduced ? { duration: 0 } : { duration: dur.base, ease: ease.out }}
              onClick={(e) => e.stopPropagation()}
            >
              <ol>
                {chapters.map((c, i) => (
                  <li key={c.anchor}>
                    <a
                      href={`#${c.anchor}`}
                      onClick={(e) => onJump(e, c.anchor)}
                      aria-current={i === active ? 'location' : undefined}
                      className="cs-index__sheet-link"
                    >
                      {c.title}
                    </a>
                  </li>
                ))}
              </ol>
              <button type="button" className="cs-index__close" onClick={close}>
                {labels.close}
              </button>
            </m.div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </nav>
  );
}
