'use client';

import { useEffect, useState } from 'react';
import {
  AnimatePresence,
  animate as fmAnimate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import EmblemSeal from './EmblemSeal';
import {
  BUILD_DURATION_MS,
  IGNITE_MS,
  REDUCED_BUILD_DURATION_MS,
  REDUCED_HOLD_MS,
  REVEAL_DURATION_MS,
  REVEAL_LEAD_MS,
  SETTLE_MS,
} from './constants';

// easeOutCubic for the build-progress counter: energetic off the start, settles
// deliberately as the seal nears completion.
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export default function LoaderWrapper({ children }) {
  const [showLoader, setShowLoader] = useState(true);
  // 'building' → 'built' → 'igniting' → 'reveal' → 'done'
  const [phase, setPhase] = useState('building');
  const [farthestCornerPx, setFarthestCornerPx] = useState(0);
  const [displayProgress, setDisplayProgress] = useState('0');

  // useReducedMotion is reactive — resolves on the first client render via
  // matchMedia, so prefers-reduced-motion users get the simpler path even on
  // initial paint. Returns null during SSR; we treat that as "no preference".
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Build progress is a motion value so the counter text can update without a
  // React re-render per frame; only the formatted integer goes through setState.
  const progress = useMotionValue(0);
  useMotionValueEvent(progress, 'change', (v) => {
    const next = String(Math.round(Math.min(v, 100)));
    setDisplayProgress((prev) => (prev === next ? prev : next));
  });

  // Radial reveal for the exit wipe — the ignition bloom expands into this.
  const revealRadius = useMotionValue(0);
  const maskImage = useMotionTemplate`radial-gradient(circle at 50% 50%, transparent ${revealRadius}%, black calc(${revealRadius}% + 5%))`;

  const ringDiameter = useTransform(
    revealRadius,
    (r) => `${(r / 100) * farthestCornerPx * 2}px`,
  );
  const ringOpacity = useTransform(
    revealRadius,
    [0, 12, 80, 120, 150],
    [0, 1, 1, 0.55, 0],
  );

  useEffect(() => {
    const update = () => {
      setFarthestCornerPx(
        Math.hypot(window.innerWidth / 2, window.innerHeight / 2),
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Lock body scroll while the loader is up so the page behind it can't be
  // dragged/scrolled during the wipe. Restores prior overflow on unmount.
  useEffect(() => {
    if (!showLoader) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showLoader]);

  // Broadcast loader completion so above-the-fold content can defer its entrance
  // until the page is actually revealed (see useLoaderRevealed). Fires as soon as
  // the reveal begins — the `reveal` wipe phase, or an outright drop of the
  // overlay (`!showLoader`, the repeat-visit skip). `window.__loaderDone` makes
  // it idempotent and lets late-mounting consumers read the already-done state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const revealing = phase === 'reveal' || phase === 'done' || !showLoader;
    if (!revealing) return;
    if (window.__loaderDone) return;
    window.__loaderDone = true;
    window.dispatchEvent(new Event('loaderdone'));
  }, [showLoader, phase]);

  // The four-beat timeline. Repeat visitors arriving from the same site skip
  // straight to the page.
  useEffect(() => {
    const hasSeen = localStorage.getItem('loaderSeen');
    const fromSameSite = document.referrer.includes(window.location.hostname);
    if (hasSeen && fromSameSite) {
      setShowLoader(false);
      return;
    }

    const timers = [];
    const finish = () => {
      localStorage.setItem('loaderSeen', 'true');
      setShowLoader(false);
      setPhase('done');
    };

    if (prefersReducedMotion) {
      // The seal is rendered already forged; hold, then a plain cross-fade.
      progress.set(100);
      timers.push(
        setTimeout(() => {
          setPhase('reveal');
          timers.push(setTimeout(finish, REVEAL_DURATION_MS));
        }, REDUCED_BUILD_DURATION_MS + REDUCED_HOLD_MS),
      );
      return () => timers.forEach(clearTimeout);
    }

    // Counter rides the inscription.
    const controls = fmAnimate(progress, 100, {
      duration: BUILD_DURATION_MS / 1000,
      ease: easeOutCubic,
    });

    const tBuilt = BUILD_DURATION_MS;
    const tIgnite = tBuilt + SETTLE_MS;
    const tReveal = tIgnite + REVEAL_LEAD_MS;
    const tDone = tReveal + REVEAL_DURATION_MS;

    timers.push(setTimeout(() => setPhase('built'), tBuilt));
    timers.push(setTimeout(() => setPhase('igniting'), tIgnite));
    timers.push(setTimeout(() => setPhase('reveal'), tReveal));
    timers.push(setTimeout(finish, tDone));

    return () => {
      controls.stop();
      timers.forEach(clearTimeout);
    };
  }, [progress, prefersReducedMotion]);

  // Drive the radial wipe once the reveal beat begins.
  useEffect(() => {
    if (phase !== 'reveal' || prefersReducedMotion) return;
    const controls = fmAnimate(revealRadius, 150, {
      duration: REVEAL_DURATION_MS / 1000,
      ease: [0.65, 0, 0.35, 1],
    });
    return () => controls.stop();
  }, [phase, revealRadius, prefersReducedMotion]);

  const wipeActive =
    (phase === 'reveal' || phase === 'done') && !prefersReducedMotion;
  const overlayMaskStyle = wipeActive
    ? { maskImage, WebkitMaskImage: maskImage }
    : null;

  return (
    <>
      {/* Page mounts behind the loader from the first render. The overlay
          (z-9999) covers it during the build, and the radial wipe genuinely
          reveals the real page underneath — heavy work like Three.js init can
          also warm up while the seal plays. */}
      {children}

      <AnimatePresence>
        {showLoader && (
          <motion.div
            key="loader-overlay"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
            initial={{ opacity: 1 }}
            animate={{
              opacity:
                prefersReducedMotion && phase === 'reveal' ? 0 : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? REVEAL_DURATION_MS / 1000 : 0,
            }}
            style={overlayMaskStyle}
          >
            <div className="relative flex flex-col items-center justify-center">
              {/* The seal. On the reveal beat it scales up and dissolves into
                  ember light, so the bloom and the page-wipe read as one. */}
              <motion.div
                className="h-[clamp(15rem,42vmin,19rem)] w-[clamp(15rem,42vmin,19rem)]"
                animate={
                  wipeActive
                    ? {
                        scale: 2.6,
                        opacity: 0,
                        filter:
                          'drop-shadow(0 0 70px #ff6d05) drop-shadow(0 0 130px rgba(255,109,5,0.5))',
                      }
                    : { scale: 1, opacity: 1 }
                }
                transition={
                  wipeActive
                    ? {
                        duration: REVEAL_DURATION_MS / 1000,
                        ease: [0.55, 0, 0.45, 1],
                      }
                    : { duration: IGNITE_MS / 1000, ease: 'easeOut' }
                }
              >
                <EmblemSeal phase={phase} reduced={prefersReducedMotion} />
              </motion.div>

              {/* Quiet build counter — the inscription is the real progress, so
                  this stays small and bows out the moment the seal is forged. */}
              <motion.div
                className="loader-percent mt-7 text-sm font-medium tracking-[0.45em] text-[#ff6d05]"
                style={{
                  fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
                  textShadow: '0 0 10px rgba(255, 109, 5, 0.45)',
                }}
                animate={{ opacity: phase === 'building' ? 0.85 : 0 }}
                transition={{ duration: 0.3 }}
              >
                {displayProgress}%
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ember portal ring — sibling to the masked overlay so the mask doesn't
          clip it. The bloom's leading edge, expanding into the wipe. */}
      <AnimatePresence>
        {showLoader && wipeActive && (
          <motion.div
            key="portal-ring"
            className="pointer-events-none fixed left-1/2 top-1/2 z-[10000] rounded-full"
            style={{
              width: ringDiameter,
              height: ringDiameter,
              x: '-50%',
              y: '-50%',
              opacity: ringOpacity,
              border: '1.5px solid rgba(255, 109, 5, 0.85)',
              boxShadow:
                '0 0 24px 2px rgba(255, 109, 5, 0.7), 0 0 80px 8px rgba(255, 109, 5, 0.35), inset 0 0 30px 4px rgba(255, 180, 80, 0.45)',
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </>
  );
}
