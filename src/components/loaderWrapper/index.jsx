'use client';

import { useEffect, useState } from 'react';
import {
  cubicBezier,
  m,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'framer-motion';
import { AnimatePresence } from '@/components/motion/AnimatePresence';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { tweenValue } from '@/lib/motion/tweenValue';
import { useLocale } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { formatNumber } from '@/i18n/format';
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
// The radial wipe's ease-in-out, the curve it had as `[0.65, 0, 0.35, 1]`.
const easeWipe = cubicBezier(0.65, 0, 0.35, 1);

// Both tweens below run through `tweenValue`, not framer's `animate()`: this
// component is in every route's static graph, and importing `animate()` held
// framer's whole animation engine in every first load (issue #200).
// tests/fitness/lazyMotion.test.js keeps engine imports out of the root graph.

export default function LoaderWrapper({ children }) {
  // The intro plays only when a visit ENTERS on the homepage. Measured on
  // production (2026-10-31): a first visit straight to /qualifications put LCP
  // at 4.6 s with the seal and 1.7 s without it on a fast desktop, because
  // each sub-page's headline waits for the reveal (useLoaderRevealed). That
  // visit is the one that sank the Speed Insights score (12.5 s LCP), and it is
  // also the recruiter's path: a link to /cv should open the CV, not a 3 s
  // ceremony in front of it. The homepage's LCP is its H1 at ~0.3 s whether
  // the seal plays or not, so the intro costs it nothing.
  //
  // Read from the pathname on the FIRST render, so the server and the client
  // agree and a sub-page never ships the overlay in its HTML at all. This
  // wrapper lives in the root layout and survives client navigation, so the
  // decision is per full page load: entering on /cv and then clicking Home
  // does not replay it. next-intl's usePathname is locale-free, so /fr is `/`.
  //
  // `window.__loaderDone` covers a REMOUNT in the same page load, which is
  // not a new visit: the motion provider remounts its subtree when the
  // animation chunk never arrives (src/components/motion/MotionFeatures.jsx),
  // and without this a visitor still on `/` would watch the intro again. It is
  // unset on the hydrating render, so that render still matches the server.
  const pathname = usePathname();
  const [enteredOnHome] = useState(
    () => pathname === '/' && !(typeof window !== 'undefined' && window.__loaderDone),
  );
  const [showLoader, setShowLoader] = useState(enteredOnHome);
  // 'building' → 'built' → 'igniting' → 'reveal' → 'done'
  const [phase, setPhase] = useState('building');
  const [farthestCornerPx, setFarthestCornerPx] = useState(0);
  const [displayProgress, setDisplayProgress] = useState('0');

  // useReducedMotion is reactive — resolves on the first client render via
  // matchMedia, so prefers-reduced-motion users get the simpler path even on
  // initial paint. Returns null during SSR; we treat that as "no preference".
  const prefersReducedMotion = useReducedMotion() ?? false;
  const locale = useLocale();

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
    // Entered on a sub-page: no overlay was rendered, so there is no timeline
    // to run. It also leaves `loaderSeen` unwritten — this visitor has not
    // seen the intro, and should get it the first time they land on `/`.
    if (!enteredOnHome) return undefined;
    // Storage can throw when it's disabled or blocked (private mode, hardened
    // privacy settings, cross-origin iframes). A throw here would crash the
    // effect before the timeline starts and strand the overlay, so swallow it and
    // treat the visitor as first-time — the loader simply plays again.
    let hasSeen = null;
    try {
      hasSeen = localStorage.getItem('loaderSeen');
    } catch {
      hasSeen = null;
    }
    const fromSameSite = document.referrer.includes(window.location.hostname);
    if (hasSeen && fromSameSite) {
      setShowLoader(false);
      return;
    }

    const timers = [];
    const finish = () => {
      // Best-effort persist: if the write fails it just means the loader may
      // replay next visit. Must never block dismissing the overlay, so guard it
      // and dismiss regardless.
      try {
        localStorage.setItem('loaderSeen', 'true');
      } catch {
        /* storage unavailable — fine, dismiss anyway */
      }
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
    const controls = tweenValue(progress, 100, {
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
  }, [progress, prefersReducedMotion, enteredOnHome]);

  // Drive the radial wipe once the reveal beat begins.
  useEffect(() => {
    if (phase !== 'reveal' || prefersReducedMotion) return;
    const controls = tweenValue(revealRadius, 150, {
      duration: REVEAL_DURATION_MS / 1000,
      ease: easeWipe,
    });
    return () => controls.stop();
  }, [phase, revealRadius, prefersReducedMotion]);

  const wipeActive =
    (phase === 'reveal' || phase === 'done') && !prefersReducedMotion;
  const overlayMaskStyle = wipeActive
    ? { maskImage, WebkitMaskImage: maskImage }
    : null;

  // The page is INERT while the overlay hides it (issue #92): unfocusable,
  // unclickable and out of the accessibility tree. Without this a keyboard
  // user who pressed Tab during the ~3 s intro moved focus through links they
  // could not see, and a screen reader read a page that was not there yet
  // (tests/a11y/keyboard.spec.js, WCAG 2.4.11). Held until the overlay is
  // removed, NOT released when the reveal begins: the wipe (or the reduced-
  // motion cross-fade) keeps the overlay mostly opaque for REVEAL_DURATION_MS,
  // and Tab in that window would land on controls still hidden behind it.
  // useLoaderRevealed() still flips at the reveal, so entrances are not delayed.
  const covered = showLoader;

  // Broadcast the inert boundary itself, separately from `loaderdone`: that
  // one fires when the reveal BEGINS, while the page is still inert, so a
  // consumer that needs to move focus into the page has to wait for this one.
  // The ⌘K palette is the case (useCommandPalette): its global shortcut works
  // under the loader, but focus() on an inert input is a silent no-op, so an
  // open there would leave the dialog showing with its input unfocused.
  // `window.__loaderCovered` lets a keypress read the current state; the
  // `loaderuncovered` event fires after the commit that removed `inert`, so a
  // listener's focus() lands.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__loaderCovered = covered;
    if (!covered) window.dispatchEvent(new Event('loaderuncovered'));
  }, [covered]);

  return (
    <>
      {/* Page mounts behind the loader from the first render. The overlay
          (z-9999) covers it during the build, and the radial wipe genuinely
          reveals the real page underneath — heavy work like Three.js init can
          also warm up while the seal plays. `display: contents` so the wrapper
          adds no box and changes no layout. `inert` is a boolean prop from
          React 19. The empty-string form React 18 needed is FALSE in 19, so
          it would silently drop the attribute and un-inert the page. */}
      <div style={{ display: 'contents' }} inert={covered}>
        {children}
      </div>

      <AnimatePresence>
        {showLoader && (
          <m.div
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
              <m.div
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
              </m.div>

              {/* Quiet build counter — the inscription is the real progress, so
                  this stays small and bows out the moment the seal is forged. */}
              <m.div
                className="loader-percent mt-7 text-sm font-medium tracking-[0.45em] text-[#ff6d05]"
                style={{
                  fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
                  textShadow: '0 0 10px rgba(255, 109, 5, 0.45)',
                }}
                animate={{ opacity: phase === 'building' ? 0.85 : 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* English keeps its literal "42%"; other locales get their own
                    digits and percent sign ("٤٢٪", "42 %") from Intl (#82). */}
                {locale === DEFAULT_LOCALE
                  ? `${displayProgress}%`
                  : formatNumber(Number(displayProgress) / 100, locale, { style: 'percent' })}
              </m.div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Ember portal ring — sibling to the masked overlay so the mask doesn't
          clip it. The bloom's leading edge, expanding into the wipe. */}
      <AnimatePresence>
        {showLoader && wipeActive && (
          <m.div
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
