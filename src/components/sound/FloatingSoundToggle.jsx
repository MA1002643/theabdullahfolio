'use client';

// Floating sound toggle for routes that render no footer (issue #30 follow-up).
//
// The guitar track now survives navigation (see SoundProvider), which means it
// keeps playing once a visitor taps Home — and the homepage has no footer, so
// without this control there would be no way to pause or resume it there.
//
// It is a PERSISTENT on/off control, not just a stop button: on a footer-less
// route it stays mounted whether the sound is currently on or off (mirroring the
// footer's own SoundControl, which is always visible), so a visitor can turn the
// music on and off as they wish. It reflects the live state — filled orange with
// a pulse ring when on, dimmed with a muted icon when off.
//
// Gated to touch-only surfaces (`!canHover`): that is the device class whose
// sound source is the recorded track this button actually controls. Hover-
// capable devices play the wordmark synth instead, which needs the footer on
// screen — there is nothing on the homepage for a chip to control there.
//
// Positioned bottom-RIGHT to mirror the NowPlaying widget's bottom-left anchor
// (both z-50), so the two never collide.

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSound } from './SoundProvider';

// Every route except `/` lives in the (sub pages) group, which renders the
// footer and its full SoundControl. Keep this in sync if a top-level route is
// ever added outside that group.
const ROUTES_WITHOUT_FOOTER = new Set(['/']);

export default function FloatingSoundToggle() {
  const { soundOn, canHover, toggleSound } = useSound();
  const pathname = usePathname();
  const reduce = useReducedMotion();

  // Present on every footer-less route for touch devices, in BOTH states — the
  // control never removes itself. `canHover` defaults to true on the server /
  // first paint and corrects on mount, so on a real phone the chip animates in
  // once the pointer capability resolves.
  const visible = !canHover && ROUTES_WITHOUT_FOOTER.has(pathname);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Turn the guitar sound off' : 'Turn the guitar sound on'}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          // 44px (h-11) rather than the footer's 36px: this is a standalone
          // control on a touch-only surface, so it meets the minimum tap target.
          // The bottom offset folds in the safe-area inset for notched phones.
          // backdrop-blur keeps the OFF state legible over whatever sits behind
          // it on the homepage. Colours follow the footer's SoundControl: filled
          // orange when live, a dimmed neutral chip when off.
          className={cn(
            'fixed right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md',
            'bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]',
            'transition-colors duration-300',
            soundOn
              ? 'border-[#ff6d05]/60 bg-[#ff6d05]/[0.16] text-[#ff8a1e] shadow-[0_0_20px_-5px_rgba(255,109,5,0.75)]'
              : 'border-white/30 bg-white/[0.06] text-white/75 hover:border-white/45 hover:text-white',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950',
          )}
        >
          {/* Soft pulse ring while live — the same "genuinely on" cue the
              footer's SoundControl uses. Only rendered when on. */}
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
            <Volume2 className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <VolumeX className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} aria-hidden="true" />
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
