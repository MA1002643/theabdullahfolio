'use client';

import { useEffect, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { onMediaChange } from '@/lib/mediaQuery';

/**
 * The scene-layer mount contract, in one place.
 *
 * Every ambient layer in this codebase re-implements the same four gates
 * (loader reveal, reduced motion, low-power downgrade, pause-when-unseen), and
 * the copies had drifted: `SceneVideo` pauses on `visibilitychange`, but the
 * two CANVAS layers — `SceneEmbers` and `SceneSealIgnite` — never did, so a
 * backgrounded tab kept them repainting. This hook is the corrected contract,
 * and the homepage layers share it.
 *
 * The split between `mounted` and `running` is deliberate. Unmounting a paused
 * layer would destroy the element the IntersectionObserver is watching, so the
 * layer could never learn it had come back — the same reason `SceneVideo` keeps
 * its `<video>` in the tree and toggles `play()`/`pause()` instead. So the
 * element stays; only the rAF loop stops.
 *
 * @param {{current: Element|null}} elRef element to observe for on-screen-ness
 * @returns {{mounted: boolean, running: boolean, lite: boolean}}
 *   mounted — render the layer at all (loader lifted, motion allowed)
 *   running — additionally on-screen and in a foreground tab: burn frames
 *   lite    — device asked for less: draw a reduced rig at a lower frame rate
 */
export function useSceneGate(elRef) {
  const revealed = useLoaderRevealed();
  const [motionOk, setMotionOk] = useState(false);
  const [lite, setLite] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    // Cheap, honest low-power signals — both advisory and absent on Safari, so
    // this can only ever downgrade a device that positively reports being
    // small. It never withholds the full rig on missing data. Save-Data is
    // included even though this layer costs no network: a device asking for
    // less data is also, in practice, asking for less battery.
    const mem = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;
    setLite(
      !!navigator.connection?.saveData ||
        (typeof mem === 'number' && mem <= 4) ||
        (typeof cores === 'number' && cores <= 4),
    );

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionOk(!mq.matches);
    apply();
    return onMediaChange(mq, apply);
  }, []);

  const mounted = revealed && motionOk;

  useEffect(() => {
    if (!mounted) return undefined;
    const el = elRef?.current;

    let onScreen = true;
    const sync = () => setSeen(onScreen && !document.hidden);

    let io;
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        ([entry]) => {
          onScreen = entry.isIntersecting;
          sync();
        },
        { threshold: 0 },
      );
      io.observe(el);
    }
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      io?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [mounted, elRef]);

  return { mounted, running: mounted && seen, lite };
}
