'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Eraser, PenLine } from 'lucide-react';
import { useSignaturePad } from '@/hooks/useSignaturePad';
import { wordFill } from '@/lib/fireRamp';
import { onMediaChange } from '@/lib/mediaQuery';

// The signature slot under the compose input (issue #40 Phase 3), laid out
// after the guestbook concept comp: a dashed gold divider seals it off from
// the message row, a header row carries the toggle on the left and the Clear
// action on the right, the ink canvas sits full-width beneath, and a centred
// hint line closes the panel. Optional by design — a text-only message must
// work perfectly, so the whole panel still hides behind the explicit "Add a
// signature" toggle (kept on owner direction) and hands its parent either a
// path string or null.
//
// Drawing is the ONLY input path (owner call, second pass — the preset-mark
// radios are gone): the canvas is hand-driven ink, not ambient animation, so
// it stays available under prefers-reduced-motion; on devices with no
// pointer at all ((any-pointer: none)) there is nothing usable inside, so
// the entire section renders nothing rather than an empty shell. `touch-none`
// is what makes finger-drawing work at all — without it the browser claims
// the gesture for scrolling.
//
// The toggle and the hint speak in the contact intro's ink (owner call):
// the shared gold→ember fire ramp (@/lib/fireRamp), applied PER WORD so the
// line darkens in reading order exactly as the "Step into the circle of
// enchantment…" paragraph does — and per-word clips are the GPU-safe form
// of the fill (the About tilt-card lesson baked into fireRamp itself). The
// toggle still flips solid ember on hover/focus (the site's action colour)
// via `.gb-fire-hover` in globals.css, which has to out-rank the words'
// inline clip styles.

// One label's words, each carrying its own slice of the fire ramp. Spaces
// stay as breakable text nodes OUTSIDE the spans (the ContactIntro pattern)
// so the line still wraps naturally.
function FireWords({ text }) {
  const words = text.split(' ');
  return words.map((w, i) => (
    <Fragment key={`${w}-${i}`}>
      <span className="gb-fire-word" style={wordFill(i, words.length)}>
        {w}
      </span>
      {i < words.length - 1 ? ' ' : ''}
    </Fragment>
  ));
}

export default function SignatureField({ onSignatureChange, resetSignal }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  // Canvas holds ink (comp: the pad's dashed border turns solid ember the
  // moment a stroke lands, so "something is drawn here" reads at a glance).
  const [inked, setInked] = useState(false);
  const [noPointer, setNoPointer] = useState(false);
  const pad = useSignaturePad();
  const emitRef = useRef(onSignatureChange);
  emitRef.current = onSignatureChange;

  useEffect(() => {
    const mq = window.matchMedia('(any-pointer: none)');
    const update = () => setNoPointer(mq.matches);
    update();
    return onMediaChange(mq, update);
  }, []);

  // Parent bumps resetSignal after a successful send — fold the panel away
  // without re-emitting (the parent already cleared its own copy).
  const lastReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal !== lastReset.current) {
      lastReset.current = resetSignal;
      pad.clear();
      setInked(false);
      setOpen(false);
    }
  }, [resetSignal, pad]);

  const toggle = () => {
    if (open) {
      pad.clear();
      setInked(false);
      emitRef.current?.(null);
    }
    setOpen(!open);
  };

  const handlePointerUp = (e) => {
    pad.handlers.onPointerUp(e);
    const d = pad.toPathString();
    setInked(Boolean(d));
    emitRef.current?.(d);
  };
  const clearAll = () => {
    pad.clear();
    setInked(false);
    emitRef.current?.(null);
  };

  // No pointer of any kind → no way to draw → no section. All hooks above
  // have already run, so the early return is order-safe.
  if (noPointer) return null;

  return (
    <div className="border-t border-dashed border-[#f9d174]/15 pt-3">
      {/* Header row (comp's sig-head): the show/hide toggle doubles as the
          section label on the left; the Clear action sits on the right while
          the panel is open. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="gb-fire-hover group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
        >
          {/* Icon can't ride the words' clipped fill (stroke=currentColor
              would go transparent), so it takes the ramp's bright-gold end
              and joins the ember flip by group-hover. */}
          <PenLine
            aria-hidden="true"
            className="h-3.5 w-3.5 text-[#ffd27d] transition-colors duration-300 group-hover:text-[#ff6d05] group-focus-visible:text-[#ff6d05]"
          />
          <span>
            <FireWords
              text={open ? 'Discard signature' : 'Add a signature (optional)'}
            />
          </span>
        </button>

        {open ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#ff6d05]/25 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#fc83ff]/70 transition-[color,border-color,box-shadow] duration-300 hover:border-[#ff6d05]/60 hover:text-[#ff6d05] hover:shadow-[0_0_8px_rgba(255,109,5,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
          >
            <Eraser aria-hidden="true" className="h-3 w-3" />
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mt-3 space-y-3"
        >
          {/* Dashed while waiting for ink, solid ember once a stroke lands
              (comp's #pad / #pad.inked pair). The faint ember→dark wash
              keeps the drawing area readable as a surface without fighting
              the strokes. */}
          <canvas
            ref={pad.canvasRef}
            onPointerDown={pad.handlers.onPointerDown}
            onPointerMove={pad.handlers.onPointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label="Signature drawing area — draw with your mouse, finger, or pen."
            className={`aspect-[5/2] w-full cursor-crosshair touch-none rounded-lg border bg-[linear-gradient(180deg,rgba(255,109,5,0.045),rgba(0,0,0,0.25))] transition-colors duration-300 ${
              inked
                ? 'border-solid border-[#ff6d05]/40'
                : 'border-dashed border-[#f9d174]/20'
            }`}
          />
          <p
            aria-hidden="true"
            className="text-center font-mono text-[10px] tracking-wide"
          >
            <FireWords text="Draw with your finger, trackpad or mouse — stroke weight follows your speed" />
          </p>
        </motion.div>
      ) : null}
    </div>
  );
}
