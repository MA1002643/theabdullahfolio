'use client';

// Footer sound control (issue #30) — a refined take on trionn.com's footer
// sound toggle, in this site's neon-orange. A round speaker button flips the
// guitar's audio on/off, paired with the label "SOUND {ON/OFF} · HOVER THE
// LINES" whose ON/OFF is bound to the same state. When live, an equalizer
// shimmer + a soft pulse ring make it read as genuinely "on".
//
// Presentational + controlled: the parent owns `soundOn` and the toggle (which
// also unlocks the AudioContext from the click gesture); see index.jsx.

import { motion, useReducedMotion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SplitFlapText, FlapItem } from './metaRevealMotion';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950';

// Four bars that shimmer while sound is live; flat + dim when off.
function Equalizer({ active }) {
  const reduce = useReducedMotion();
  const bars = [0, 1, 2, 3];
  const cycles = [
    [0.35, 1, 0.5, 0.8, 0.35],
    [0.8, 0.4, 1, 0.55, 0.8],
    [0.45, 0.9, 0.35, 1, 0.45],
    [1, 0.5, 0.75, 0.4, 1],
  ];
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {bars.map((i) => (
        <motion.span
          key={i}
          className="w-[2px] origin-bottom rounded-full bg-[#ff6d05]"
          style={{ height: '100%', opacity: active ? 1 : 0.35 }}
          animate={
            active && !reduce
              ? { scaleY: cycles[i] }
              : { scaleY: active ? 0.6 : 0.22 }
          }
          transition={
            active && !reduce
              ? { duration: 0.9 + i * 0.12, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
          }
        />
      ))}
    </span>
  );
}

// The trailing instruction, chosen by what the visitor can actually DO:
//   • hover-capable (mouse / trackpad) → the original invitation to play the
//     wordmark by hand (the live synth instrument).
//   • touch-only (phone, keyboard-less iPad) → there is no hover to pluck the
//     strings, so the sound is a recorded calming-guitar track; the copy points
//     at the sound toggle, in the footer's restrained-editorial voice.
function instructionFor(canHover, soundOn) {
  if (canHover) return 'Hover the lines';
  return soundOn ? 'Now playing — a calming guitar' : 'Turn the sound on for a calming guitar';
}

export default function SoundControl({ soundOn, onToggle, canHover = true, revealMode = false }) {
  const reduce = useReducedMotion();
  const instruction = instructionFor(canHover, soundOn);

  // The interactive speaker button — identical markup in both modes; in
  // revealMode it is wrapped in a FlapItem below so it joins the cascade.
  const button = (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={soundOn}
      aria-label={soundOn ? 'Turn footer guitar sound off' : 'Turn footer guitar sound on'}
      className={cn(
        'group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
        soundOn
          ? 'border-[#ff6d05]/60 bg-[#ff6d05]/[0.14] text-[#ff8a1e] shadow-[0_0_20px_-5px_rgba(255,109,5,0.75)]'
          : 'border-white/15 bg-white/[0.03] text-[#8a8a8a] hover:border-white/30 hover:text-white',
        FOCUS_RING,
      )}
    >
      {/* Soft pulse ring while live. */}
      {soundOn && !reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border border-[#ff6d05]/50"
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      {soundOn ? (
        <Volume2 className="h-[1.05rem] w-[1.05rem]" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <VolumeX className="h-[1.05rem] w-[1.05rem]" strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );

  // ON → the About-title neon orange (with a soft glow); OFF → the same hue, a
  // bit dimmed so it reads as inactive. Kept as one token in revealMode (a
  // single FlapItem, not per-glyph) so a later On/Off toggle just swaps the
  // text instead of re-firing the flip.
  const state = (
    <span
      className={cn(
        'tabular-nums transition-colors duration-300',
        soundOn
          ? 'text-[#ff6d05] [text-shadow:0_0_10px_rgba(255,109,5,0.55)]'
          : 'text-[#ff6d05]/55',
      )}
    >
      {soundOn ? 'On' : 'Off'}
    </span>
  );

  const divider = <span aria-hidden="true" className="h-3 w-px bg-[#ff6d05]/30" />;

  // Classes shared by the trailing instruction in both modes: on a phone it drops
  // to its own full-width, centred line (basis-full) beneath the button + state
  // cluster; from `sm` up it flows back inline and left-aligned.
  const instructionClass = 'basis-full text-center sm:basis-auto sm:text-left';

  // The button, state and equalizer live together in one wrapping flex line; the
  // "·" divider and the instruction only re-join that line from `sm` up (the
  // divider would otherwise dangle at the end of the mobile cluster). On a phone
  // the whole cluster centres — `justify-center` — matching the centred reach
  // strip above it; from `sm` it left-aligns as before. A `<button>` is valid
  // phrasing content inside a `<p>`, so the label stays one semantic unit.
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2 text-[0.72rem] font-medium uppercase tracking-[0.2em] text-[#ff6d05] sm:justify-start">
      {revealMode ? (
        <>
          <FlapItem>{button}</FlapItem>
          <SplitFlapText text="Sound" />
          <FlapItem>{state}</FlapItem>
          <FlapItem>
            <Equalizer active={soundOn} />
          </FlapItem>
          <span className="hidden sm:inline-block">
            <FlapItem>{divider}</FlapItem>
          </span>
          <SplitFlapText text={instruction} className={instructionClass} />
        </>
      ) : (
        <>
          {button}
          <span>Sound</span>
          {state}
          <Equalizer active={soundOn} />
          <span className="hidden sm:inline-block">{divider}</span>
          <span className={instructionClass}>{instruction}</span>
        </>
      )}
    </p>
  );
}
