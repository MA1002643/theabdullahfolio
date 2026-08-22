'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { usePointerCapability } from '@/hooks/usePointerCapability';

// First-visit affordance tip for the orbital navigation (issue #105).
//
// A peer of <Navigation/> mounted in the same hero row (app/page.js), so it
// shares the orbit's coordinate space without tangling with the ring's own
// geometry. It surfaces ONCE per visitor: `localStorage` (not
// sessionStorage — surviving tab close is the point) remembers any dismissal,
// and every way out persists it, because every way out means the message
// landed: the × button, Esc, or — the quiet one — the visitor driving the
// ring (or, below 480px, tapping a column button) before reading it. That
// last signal arrives as the `interacted` prop, raised by the page when
// Navigation reports any wheel/drag/scrub/arrow-key input.
//
// THE COPY LEADS WITH THE LAPTOP. Owner-reported: a generic "scroll, drag,
// or press ← →" line told a first-time visitor nothing about the site's
// signature gesture — resting the cursor on the laptop and moving it up and
// down. So the tip now says that first, in full sentences, and SHOWS it: a
// small animated pictogram of a cursor gliding up and down over a laptop
// plays beside the words (static under reduced motion). And it only claims
// what the visitor's hardware can do — `usePointerCapability`'s live
// `(hover: hover) and (pointer: fine)` query picks the wording, so a
// touch-only tablet is told to slide and drag, never to hover, and an iPad
// that gains a trackpad mid-session gains the hover wording with it.
const STORAGE_KEY = 'nav-orbit-tip:dismissed';

// The buttons stagger in over ~2.1s after the loader lifts; the tip waits
// them out so it points at a ring that is visibly THERE, and lands as the
// composition settles rather than competing with it.
const SHOW_DELAY_MS = 2600;

// Below 480px the orbit collapses to the two fixed columns
// (navigation/index.jsx), so the spin wording would describe an affordance
// that does not exist — the tip switches to the columns' own. Live query:
// crossing the boundary re-words the tip rather than stranding stale copy.
const COLUMNS_QUERY = '(max-width: 479.98px)';

const readDismissed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Storage unavailable (private mode, blocked) — show the tip; it just
    // won't be remembered, which pesters less than never informing at all.
    return false;
  }
};

const persistDismissed = () => {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    /* best-effort — an unpersisted dismissal only means one more showing */
  }
};

// The gesture, drawn: a cursor glides up and down over a laptop glyph,
// between two faint chevrons marking the travel. Pure inline SVG — no asset
// — sized to sit beside two short lines of copy. Decorative (`aria-hidden`
// on the wrapper); the sr-only sentence carries the meaning. Under reduced
// motion the cursor simply rests mid-travel: the picture still explains,
// only the demonstration loop is dropped.
const ScrubPictogram = ({ animate }) => (
  <svg
    width="46"
    height="44"
    viewBox="0 0 46 44"
    fill="none"
    className="shrink-0"
  >
    {/* laptop: open screen + base wedge, in the ring's own amber */}
    <rect
      x="9"
      y="8"
      width="22"
      height="14"
      rx="1.5"
      stroke="#ffaa2a"
      strokeOpacity="0.65"
      strokeWidth="1.5"
    />
    <path
      d="M 6 27 L 34 27 L 37 31 L 3 31 Z"
      stroke="#ffaa2a"
      strokeOpacity="0.65"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* travel chevrons: where the cursor is being invited to go */}
    <path
      d="M 37.5 6 L 40.5 3 L 43.5 6"
      stroke="#ffbb55"
      strokeOpacity="0.5"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M 37.5 38 L 40.5 41 L 43.5 38"
      stroke="#ffbb55"
      strokeOpacity="0.5"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* the cursor, riding its demonstration loop */}
    <motion.g
      animate={animate ? { y: [-8, 8] } : { y: 0 }}
      transition={
        animate
          ? {
              duration: 1.3,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut',
            }
          : { duration: 0 }
      }
    >
      <path
        d="M 36 16 L 36 27.2 L 38.6 24.9 L 40.3 28.6 L 42 27.8 L 40.4 24.2 L 43.4 23.8 Z"
        fill="#ffffff"
        fillOpacity="0.92"
        stroke="#0a1420"
        strokeWidth="0.75"
      />
    </motion.g>
  </svg>
);

const OrbitTip = ({ interacted }) => {
  const reduceMotion = useReducedMotion();
  const revealed = useLoaderRevealed();
  const canHover = usePointerCapability();
  // 'pending' → waiting out the loader + reveal delay; 'visible' → on
  // screen; 'dismissed' → gone for good (this visit AND, persisted, the
  // next). Starts 'pending' even for returning visitors — localStorage is
  // read in an effect so the SSR and first client render agree.
  const [status, setStatus] = useState('pending');
  const [isColumns, setIsColumns] = useState(false);

  const dismiss = useCallback(() => {
    setStatus((prev) => {
      if (prev !== 'dismissed') persistDismissed();
      return 'dismissed';
    });
  }, []);

  // Returning visitor who already dismissed it: settle 'dismissed' before
  // the show timer can ever arm.
  useEffect(() => {
    if (readDismissed()) setStatus('dismissed');
  }, []);

  // Mode-appropriate wording, live.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(COLUMNS_QUERY);
    const update = () => setIsColumns(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
  }, []);

  // Surface after the loader lifts + the buttons' stagger. Gated on the
  // loader signal (useLoaderRevealed) because a mount-time timer would run
  // out BEHIND the z-9999 intro overlay and announce/appear pre-read.
  useEffect(() => {
    if (!revealed) return undefined;
    const t = window.setTimeout(() => {
      setStatus((prev) => (prev === 'pending' ? 'visible' : prev));
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [revealed]);

  // Silent auto-dismissal: the visitor drove the ring (or tapped a column
  // button) — the affordance is discovered, whether or not the tip had even
  // appeared yet. Persisted like any other dismissal.
  useEffect(() => {
    if (interacted) dismiss();
  }, [interacted, dismiss]);

  // Esc dismisses from anywhere, without demanding focus first. Window-level
  // and only while visible, so it cannot swallow an Esc meant for anything
  // else once the tip is gone.
  useEffect(() => {
    if (status !== 'visible') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, dismiss]);

  const visible = status === 'visible';
  // Which of the three tellings this visitor gets. The hover telling leads
  // with the cursor-on-the-laptop gesture and plays the pictogram; the
  // touch-orbit telling promises only touch gestures; the columns telling
  // describes the columns.
  const mode = isColumns ? 'columns' : canHover ? 'hover' : 'touch';

  const kbd = (label) => (
    <kbd className="rounded border border-[#ffaa2a]/30 bg-white/5 px-1.5 py-0.5 font-sans text-[0.7rem] leading-none text-[#ffbb55]">
      {label}
    </kbd>
  );

  return (
    // The live region exists from first render, EMPTY — assistive tech only
    // announces content INSERTED into an already-present polite region, so
    // rendering region-and-content together on reveal would announce
    // nothing. role="status" already implies aria-live="polite"; stated
    // anyway for engines that treat the pair unevenly. Announced once, on
    // first load, and never steals focus.
    //
    // Bottom-centre of the hero row, pointing at the ring's near arc — but
    // LIFTED below 1180px. The Spotify now-playing card (`fixed bottom-6
    // left-6`, ~370px right edge at desktop size) and the sound control
    // (`fixed right-6`) own the viewport's bottom band, and wherever the
    // hero row's foot runs to the viewport's foot (every phone — the
    // portrait shell is exactly 100svh — and any tablet whose hero fills
    // the screen) a low centred card lands in that band. It clears the
    // card horizontally only once half the viewport exceeds the Spotify
    // card's edge plus half this card's 27rem cap (~216px):
    // 2 × (370 + 216) ≈ 1172, rounded to 1180. Measured overlapping at
    // 430×900 and 768×1024, clean at 1440×900. If either fixed widget's
    // size moves, this boundary moves with it.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute bottom-32 left-1/2 z-50 w-full max-w-[min(92vw,27rem)] -translate-x-1/2 min-[1180px]:bottom-3"
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            // Reduced motion keeps the fade (appearing is not vestibular
            // motion) and drops the rise — the same collapse the nav
            // buttons' own reveal applies (issue #87).
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="pointer-events-auto mx-auto flex w-fit items-center gap-3 rounded-2xl border border-[#ffaa2a]/25 bg-[#050b12]/85 py-2.5 pl-3.5 pr-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
          >
            {mode === 'hover' && (
              <span aria-hidden className="shrink-0">
                <ScrubPictogram animate={!reduceMotion} />
              </span>
            )}
            {/* The visual copy is presentation (a screen reader would spell
                out "leftwards arrow"); the sr-only sentence is the
                announcement. */}
            {mode === 'columns' ? (
              <>
                <span aria-hidden className="text-fire-amber text-xs font-light tracking-wide">
                  Tip: tap a button on either side to explore
                </span>
                <span className="sr-only">
                  Tip: use the buttons on either side of the screen to explore
                  the site.
                </span>
              </>
            ) : mode === 'hover' ? (
              <>
                <span aria-hidden className="flex min-w-0 flex-col gap-0.5 text-left">
                  <span className="text-fire-amber text-xs font-normal leading-snug sm:text-[0.8rem]">
                    Rest your cursor on the laptop, then move or scroll up and
                    down — the ring spins with you.
                  </span>
                  <span className="text-[0.7rem] font-light leading-[1.6] text-[#f9d174]/70">
                    You can also drag the ring, or press {kbd('←')} {kbd('→')}{' '}
                    on a focused button.
                  </span>
                </span>
                <span className="sr-only">
                  Tip: the navigation ring can be rotated. Rest your pointer on
                  the laptop and move or scroll up and down to spin it; you can
                  also drag the ring, or press the left and right arrow keys
                  while a navigation button is focused.
                </span>
              </>
            ) : (
              <>
                <span aria-hidden className="text-fire-amber text-xs font-normal leading-snug sm:text-[0.8rem]">
                  Slide up and down on the laptop — or drag the ring — to spin
                  the navigation.
                </span>
                <span className="sr-only">
                  Tip: the navigation ring can be rotated. Slide up and down on
                  the laptop, or drag the ring itself, to spin it.
                </span>
              </>
            )}
            {/* Focusable in the natural tab order, never autofocused — the
                tip must not yank a keyboard user away from wherever they
                were. */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss navigation tip"
              className="grid h-6 w-6 shrink-0 place-items-center self-start rounded-full text-white/50 transition-colors duration-300 hover:text-[#ff6d05] focus-visible:text-[#ff6d05]"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrbitTip;
