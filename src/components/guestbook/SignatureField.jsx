'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Eraser, PenLine } from 'lucide-react';
import { useSignaturePad } from '@/hooks/useSignaturePad';
import { wordFill } from '@/lib/fireRamp';
import { PRESET_MARKS, SIGNATURE_VIEWBOX } from '@/lib/guestbook/signature';
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
// Drawing is the PRIMARY input path: the canvas is hand-driven ink, not
// ambient animation, so it stays available under prefers-reduced-motion.
// But a canvas is not focusable and has no keyboard model, so on its own it
// shut out every keyboard-only visitor whose device still reports a pointer
// (code review) — an aria-label names a control, it does not make one
// operable. The four preset marks from signature.js are therefore offered
// beneath the pad as real buttons (Tab-reachable, Space/Enter-operable, no
// custom key handling to get wrong): the one signature path a keyboard can
// take, and on devices with no pointer at all ((any-pointer: none)) the ONLY
// thing the panel renders, in place of a pad nobody could draw on. The two
// inputs are exclusive — choosing a mark clears the ink, a stroke drops the
// mark — so what the parent holds is always exactly one of them. `touch-none`
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

// The preset marks as a row of toggle buttons — the reaction bar's
// aria-pressed pattern, so a screen reader hears "Flourish, toggle button,
// pressed" and the group needs no roving focus. Each renders its own path
// in the signature's 100×40 space, so what the visitor picks is exactly the
// glyph their card will carry.
function PresetMarks({ selected, onSelect, labelId, label }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
      <span
        id={labelId}
        className="font-mono text-[10px] uppercase tracking-[0.16em]"
      >
        <FireWords text={label} />
      </span>
      <div role="group" aria-labelledby={labelId} className="flex items-center gap-1.5">
        {PRESET_MARKS.map(({ id, label: name, d }) => {
          const pressed = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={pressed}
              aria-label={name}
              title={name}
              className={`inline-flex h-8 w-14 items-center justify-center rounded-md border transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05] ${
                pressed
                  ? 'border-[#ff6d05]/60 bg-[#ff6d05]/15 text-[#f9d174]'
                  : 'border-[#ff6d05]/25 text-[#ffd27d]/70 hover:border-[#ff6d05]/60 hover:text-[#ff6d05]'
              }`}
            >
              <svg
                viewBox={`0 0 ${SIGNATURE_VIEWBOX.width} ${SIGNATURE_VIEWBOX.height}`}
                aria-hidden="true"
                className="h-5 w-12 overflow-visible"
              >
                <path
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SignatureField({ onSignatureChange, resetSignal }) {
  const reduceMotion = useReducedMotion();
  const marksLabelId = useId();
  const [open, setOpen] = useState(false);
  // Canvas holds ink (comp: the pad's dashed border turns solid ember the
  // moment a stroke lands, so "something is drawn here" reads at a glance).
  const [inked, setInked] = useState(false);
  // The chosen preset's id, or null. Never set while `inked` is true — the
  // handlers below keep the two exclusive.
  const [mark, setMark] = useState(null);
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
      setMark(null);
      setOpen(false);
    }
  }, [resetSignal, pad]);

  // Drop whatever the visitor has — ink or mark — and tell the parent.
  const clearAll = () => {
    pad.clear();
    setInked(false);
    setMark(null);
    emitRef.current?.(null);
  };

  const toggle = () => {
    if (open) clearAll();
    setOpen(!open);
  };

  const handlePointerUp = (e) => {
    pad.handlers.onPointerUp(e);
    const d = pad.toPathString();
    // Nothing landed (a gesture that never became a stroke): leave whatever
    // is chosen alone rather than wiping a selected mark with a null.
    if (!d) return;
    setMark(null);
    setInked(true);
    emitRef.current?.(d);
  };

  const selectMark = (id) => {
    if (mark === id) {
      clearAll();
      return;
    }
    const preset = PRESET_MARKS.find((m) => m.id === id);
    if (!preset) return;
    pad.clear();
    setInked(false);
    setMark(id);
    emitRef.current?.(preset.d);
  };

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
          {/* No pointer of any kind → no way to draw → no pad; the marks
              below are the whole panel. */}
          {noPointer ? null : (
            <>
              {/* Dashed while waiting for ink, solid ember once a stroke
                  lands (comp's #pad / #pad.inked pair). The faint ember→dark
                  wash keeps the drawing area readable as a surface without
                  fighting the strokes. */}
              <canvas
                ref={pad.canvasRef}
                onPointerDown={pad.handlers.onPointerDown}
                onPointerMove={pad.handlers.onPointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                aria-label="Signature drawing area — draw with your mouse, finger, or pen, or pick a preset mark below."
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
            </>
          )}
          <PresetMarks
            selected={mark}
            onSelect={selectMark}
            labelId={marksLabelId}
            label={noPointer ? 'Pick a mark' : 'Or pick a mark'}
          />
        </motion.div>
      ) : null}
    </div>
  );
}
