'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import EmberPassageOverlay from './EmberPassageOverlay';
import { warmSwarm } from './emberSwarm';
import { warmEmberField } from './emberField';
import {
  FAILSAFE_MS,
  PUSH_AT_MS,
  REDUCED_COVER_MS,
  REDUCED_MIN_MS,
  REDUCED_REVEAL_MS,
  REVEAL_MS,
  ROUTE_LABELS,
  SHOWCASE_MIN_MS,
} from './constants';

// Orchestrates the "Ember Passage" between pages. TransitionLink (or any
// consumer of usePageTransition) hands navigation over to `navigate`, which
// runs the phase machine:
//
//   idle → covering → holding → revealing → idle
//
// The actual router.push happens once the veil is closed, and the reveal waits
// for BOTH the destination pathname to arrive AND the minimum showcase time to
// elapse — fast routes never scatter a half-formed mark, slow routes keep
// the mark breathing as a de-facto loading indicator.

const TransitionContext = createContext({
  navigate: null,
  transitioning: false,
});

export const usePageTransition = () => useContext(TransitionContext);

// Normalise a path for arrival comparison: strip query/hash/trailing slash.
const cleanPath = (p) => {
  if (typeof p !== 'string') return '';
  const bare = p.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return bare === '' ? '/' : bare;
};

const deriveLabel = (path) => {
  const known = ROUTE_LABELS[path];
  if (known) return known;
  const segment = path.split('/').filter(Boolean).pop() || 'Home';
  return segment
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export default function PageTransitionProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion() ?? false;

  // 'idle' | 'covering' | 'holding' | 'revealing'
  const [phase, setPhase] = useState('idle');
  const [target, setTarget] = useState(null); // { href, label, origin }

  // Refs mirror state so `navigate` stays referentially stable — links all
  // over the tree consume it and shouldn't re-render on every phase change.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // When the overlay mounted — the showcase-minimum clock.
  const startedAtRef = useRef(0);

  // Get the swarm ready during idle time, so the first click of the session draws
  // on frame one like every click after it. A page transition is the worst
  // possible moment to build 90k ember targets or compile a shader.
  //
  // Deliberately TWO idle callbacks rather than one. The field build is tens of ms of
  // typed-array work and the GL setup is another compile; run together they blow
  // straight past the ~50ms an idle slice is meant to use, which is the jank
  // this is supposed to avoid. Scheduled in this order the field is cached by
  // the time the gate asks for it, so the second slice only does GL work.
  //
  // Neither is required: a visitor who clicks before idle fires simply gets the
  // work done under the already-opaque cover, and a browser without WebGL never
  // gets here at all — the overlay's static branch handles both.
  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    const cancelField = warmEmberField();
    const cancelGate = warmSwarm();
    return () => {
      cancelField();
      cancelGate();
    };
  }, [prefersReducedMotion]);

  const navigate = useCallback(
    (href, opts = {}) => {
      if (phaseRef.current !== 'idle') return;
      const dest = cleanPath(href);
      // Same route: no passage to stage. A query/hash-only change is still a
      // real navigation though — hand it straight to the router, sans overlay
      // (the arrival check keys off pathname, which wouldn't change). Only a
      // truly identical destination stays a quiet no-op.
      if (dest === cleanPath(pathnameRef.current)) {
        const current =
          window.location.pathname +
          window.location.search +
          window.location.hash;
        if (href !== current) router.push(href);
        return;
      }
      // `origin` is where on screen the visitor actually pressed. The embers
      // nearest it lift first, so the page visibly comes apart at the button
      // they hit rather than everywhere at once. Optional — callers without a
      // pointer position leave it undefined and the overlay uses the centre.
      setTarget({
        href,
        label: opts.label || deriveLabel(dest),
        origin: opts.origin,
      });
      startedAtRef.current = performance.now();
      setPhase('covering');
    },
    [router],
  );

  // covering → push under the opaque cover → holding.
  useEffect(() => {
    if (phase !== 'covering' || !target) return;
    const pushDelay = prefersReducedMotion ? REDUCED_COVER_MS : PUSH_AT_MS;
    const t = setTimeout(() => {
      router.push(target.href);
      setPhase('holding');
    }, pushDelay);
    return () => clearTimeout(t);
  }, [phase, target, router, prefersReducedMotion]);

  // holding → revealing, once the destination pathname has actually arrived
  // and the monogram has had its minimum time on stage.
  useEffect(() => {
    if (phase !== 'holding' || !target) return;
    if (cleanPath(pathname) !== cleanPath(target.href)) return;
    const minShowcase = prefersReducedMotion ? REDUCED_MIN_MS : SHOWCASE_MIN_MS;
    const elapsed = performance.now() - startedAtRef.current;
    const t = setTimeout(
      () => setPhase('revealing'),
      Math.max(0, minShowcase - elapsed),
    );
    return () => clearTimeout(t);
  }, [phase, pathname, target, prefersReducedMotion]);

  // revealing → idle once the scatter has finished (small buffer so the last
  // embers aren't clipped by the unmount).
  useEffect(() => {
    if (phase !== 'revealing') return;
    const revealMs = prefersReducedMotion ? REDUCED_REVEAL_MS : REVEAL_MS;
    const t = setTimeout(() => {
      setPhase('idle');
      setTarget(null);
    }, revealMs + 120);
    return () => clearTimeout(t);
  }, [phase, prefersReducedMotion]);

  // Failsafe: a passage that can't complete (push failed, route hung) must
  // never strand the visitor behind an opaque overlay. Armed for the whole
  // journey, disarmed when we reach revealing/idle on our own.
  useEffect(() => {
    if (phase !== 'covering' && phase !== 'holding') return;
    const t = setTimeout(() => setPhase('revealing'), FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Lock scroll while the passage owns the screen, same as the intro loader.
  useEffect(() => {
    if (phase === 'idle') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  const value = useMemo(
    () => ({ navigate, transitioning: phase !== 'idle' }),
    [navigate, phase],
  );

  return (
    <TransitionContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {phase !== 'idle' && target && (
          <EmberPassageOverlay
            key="ember-passage"
            phase={phase}
            label={target.label}
            origin={target.origin}
            reduced={prefersReducedMotion}
          />
        )}
      </AnimatePresence>
    </TransitionContext.Provider>
  );
}
