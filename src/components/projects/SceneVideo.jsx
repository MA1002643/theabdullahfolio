'use client';
import { useEffect, useRef, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { onMediaChange } from '@/lib/mediaQuery';
import SceneEmbers from './SceneEmbers';

// Ambient scene for /projects: the living version of project-bg.webp — the
// lantern, candle and chandelier flames flicker and dust motes drift while the
// camera stays locked. Sibling of the /qualifications water scene
// (qualifications/SceneVideo.jsx).
//
// Layering: the static background Image (-z-50) stays mounted underneath as
// the instant "poster" and the permanent fallback; this layer sits at -z-[45]
// with the SAME opacity-[0.88] treatment, and the page's .projects-scrim
// (-z-40) darkens both identically — so the video appearing is a seamless
// "the picture starts moving" moment, never a reload. The poster IS this
// clip's own first frame (finish-projects-scene.sh exports it from the
// encoded loop), so the swap cannot pop.
//
// ── THREE TIERS, NOT TWO ────────────────────────────────────────────────
// The old component was video-or-nothing, which made "degrade gracefully"
// mean "degrade to a still". There is a much better middle rung already
// written: SceneEmbers, a procedural canvas that relights the still's own
// lanterns and candles with seeded value noise. It weighs ~0 bytes over the
// wire and loops seamlessly by construction. It had been orphaned — built,
// documented, and imported by nothing — since the video superseded it.
//
//   full    → the encoded loop, resolution-matched (602 KB … 5.0 MB)
//   embers  → SceneEmbers, for Save-Data and low-power devices (0 bytes)
//   still   → nothing mounted; the Image alone (reduced motion, or on error)
//
// ── WHY A RESOLUTION LADDER ─────────────────────────────────────────────
// One 2560x1440 file was being shipped to every device. On a phone that is a
// 5 MB download and a 3.7 Mpx decode to paint ~390 CSS px wide. The variants
// are picked in JS rather than with <source media>, because `media` on
// <source> is only reliably honoured inside <picture> — inside <video> it is
// widely ignored, so the browser would just take the first entry.
const SOURCES = [
  { max: 1280, src: '/background/projects-flames-720.mp4' },
  { max: 1920, src: '/background/projects-flames-1080.mp4' },
  { max: Infinity, src: '/background/projects-flames.mp4' },
];

// The still is object-cover'd, so on any viewport NARROWER than its 16:9 it
// paints height-bound at ~178vh CSS px wide with the sides cropped. This is
// the same max(100vw, 178vh) rule the <Image> `sizes` uses, in JS.
const paintedWidth = () => {
  const css = Math.max(window.innerWidth, window.innerHeight * (16 / 9));
  return css * Math.min(window.devicePixelRatio || 1, 2);
};

// Cheap, honest low-power signals. Both are advisory and absent on Safari, so
// this can only ever downgrade a device that positively reports being small —
// it never withholds the video on missing data.
const isLowPower = () => {
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return (typeof mem === 'number' && mem <= 4) || (typeof cores === 'number' && cores <= 4);
};

const SceneVideo = () => {
  const revealed = useLoaderRevealed();
  const videoRef = useRef(null);
  const [motionOk, setMotionOk] = useState(false);
  const [tier, setTier] = useState('still');
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const ok = !mq.matches;
      setMotionOk(ok);
      if (!ok) {
        setTier('still');
        return;
      }
      if (navigator.connection?.saveData || isLowPower()) {
        setTier('embers');
        return;
      }
      const need = paintedWidth();
      setSrc(SOURCES.find((s) => need <= s.max).src);
      setTier('full');
    };
    apply();
    return onMediaChange(mq, apply);
  }, []);

  const playing = revealed && tier === 'full';

  // ── Pause when not actually being seen ────────────────────────────────
  // Two independent gates, ANDed. The element is position:fixed and covers
  // the viewport, so on this page the observer is effectively always true —
  // it is here so the layer stays correct if it is ever mounted un-fixed, and
  // costs one observer. `visibilitychange` is the one that does real work:
  // it stops a 2560x1440 decode from running against a backgrounded tab.
  useEffect(() => {
    if (!playing) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;

    let onScreen = true;
    const sync = () => {
      if (onScreen && !document.hidden) {
        // play() rejects if the element is torn down mid-call; that is not an
        // error worth surfacing, and letting it reject unhandled logs noise.
        el.play?.().catch(() => {});
      } else {
        el.pause?.();
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0 },
    );
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [playing]);

  if (!revealed || !motionOk) return null;
  if (tier === 'embers') return <SceneEmbers />;
  if (tier !== 'full' || !src) return null;

  return (
    <video
      ref={videoRef}
      // .projects-backdrop (globals.css) supplies fixed + 100lvh sizing shared
      // with the still image and the dimmer, so the mobile URL bar collapsing
      // can't resize this layer and re-zoom the crop.
      className="projects-backdrop -z-[45] object-cover object-center opacity-[0.88]"
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      disablePictureInPicture
      disableRemotePlayback
      // Decorative, like the still Image underneath (alt="") — hidden from
      // assistive tech entirely.
      aria-hidden
      tabIndex={-1}
      // Any decode/network failure drops to the embers tier rather than to a
      // dead still: the procedural layer needs no network and cannot fail the
      // same way.
      onError={() => setTier('embers')}
    />
  );
};

export default SceneVideo;
