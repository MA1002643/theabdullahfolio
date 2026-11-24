'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { m, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStaticMotion } from '@/components/motion/useStaticMotion';
import { deferredChunk } from '@/lib/deferredChunk';
import { canCreateWebGL } from '@/lib/webglSupport';
import { whenIdle } from '@/lib/whenIdle';

// M2: hero media settle (issue #31). The image is laid out FULL BLEED — the
// article's whole width, since .cs-hero spans it and .cs-page clips at its
// own edge, so a 100vw bleed would be cut — and, over the first 60 % of a
// viewport of scroll, scales down into the content column and gains its
// rounded corners. The column is measured from `.cs-hero__probe`, a
// zero-height twin of `.cs-hero__inner` rendered inside the frame, so the
// target is the page's own CSS, never a width restated here.
//
// Laid out at full bleed and scaled DOWN, rather than laid out framed and
// scaled up, so the state at scroll 0 is the server's own markup: nothing
// moves when hydration lands, and the image is painted at its final pixels on
// first load (it is the route's LCP candidate). Only the wrapper's transform,
// corner radius and bottom margin change afterwards, from one scroll value in
// one hop. The margin exists because a transform never changes layout: the
// shrink would otherwise leave a (1 − target) × height hole before the first
// chapter (~450px on a 1920 screen), so the same progress pulls the page up
// by exactly that much. It is measured from the media's offsetHeight, which
// ignores the element's own margin — reading the frame's height back would
// feed the margin into its own measurement.
//
// Static mode (features never arrived) and reduced motion both render the
// framed end state as plain values: a scroll-linked value would freeze at its
// first reading there, which here is harmless (full bleed) but pointless.

const SETTLE_FRACTION = 0.6;
const RADIUS_PX = 16;

// The hero cinemagraph (owner, 2026-11-19), its own chunk (§5): ambient
// decoration, so it is warmed in idle time after the paint, never on the
// critical path, and only for a visitor who will see it move — reduced
// motion skips the download entirely (the Ember Passage pattern), a browser
// without WebGL never asks, and static mode (the features chunk already
// failed to arrive) is no network to burden further. `optionalChunk` inside
// the loader means a chunk that never arrives renders nothing: the still is
// the page, the motion is a bonus.
const sceneFx = deferredChunk(() => import('./HeroSceneEffect'), 'HeroSceneEffect');
const HeroSceneEffect = dynamic(sceneFx.loader, { ssr: false });

// The live-recording loop (owner, 2026-11-21) supersedes the cinemagraph
// wherever a hero carries `video` sources; `effect` masks remain the rung
// for a hero that only has a still. The component itself is small and ships
// in the route chunk (§5's "below a few kB" rule) — the heavy thing is the
// media file, and that is deferred by mounting nothing until idle time.
import HeroSceneLoop from './HeroSceneLoop';

// Cheap, honest low-power signals (useSceneGate's rule, SceneVideo's rung):
// advisory and absent on Safari, so this only ever downgrades a device that
// positively reports being small — and a multi-megabyte ambient download is
// exactly what Save-Data is asking to be spared.
const wantsLess = () => {
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return (
    !!navigator.connection?.saveData ||
    (typeof mem === 'number' && mem <= 4) ||
    (typeof cores === 'number' && cores <= 4)
  );
};

export default function HeroMedia({
  src,
  alt,
  width,
  height,
  sizesHint = '100vw',
  effect = null,
  video = null,
}) {
  const frameRef = useRef(null);
  const probeRef = useRef(null);
  const mediaRef = useRef(null);
  const geometry = useRef({ target: 1, gap: 0, range: 1 });
  const [target, setTarget] = useState(1);
  const [gap, setGap] = useState(0);
  const reduced = useReducedMotion();
  const isStatic = useStaticMotion();
  const { scrollY } = useScroll();
  const [fx, setFx] = useState(false);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    if (!effect || video || reduced || isStatic || !canCreateWebGL()) return undefined;
    return whenIdle(() => {
      sceneFx.preload();
      setFx(true);
    });
  }, [effect, video, reduced, isStatic]);

  // The recording mounts in idle time only, after the LCP still is long
  // painted; reduced motion and a device asking for less never download a
  // byte of it (the Ember Passage pattern, same as the cinemagraph's gate).
  useEffect(() => {
    if (!video || reduced || isStatic || wantsLess()) return undefined;
    return whenIdle(() => setLoop(true));
  }, [video, reduced, isStatic]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const measure = () => {
      const column = probeRef.current?.clientWidth ?? 0;
      const bleed = frame.clientWidth || 1;
      // 0 means unmeasurable (jsdom, display:none): stay at full bleed rather
      // than scaling the media to nothing.
      const nextTarget = column > 0 ? Math.min(1, column / bleed) : 1;
      const nextGap = Math.max(0, (1 - nextTarget) * (mediaRef.current?.offsetHeight ?? 0));
      geometry.current = {
        target: nextTarget,
        gap: nextGap,
        range: Math.max(1, window.innerHeight * SETTLE_FRACTION),
      };
      setTarget(nextTarget);
      setGap(nextGap);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame.parentElement ?? frame);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // One hop from scroll to each style. The geometry is read from a ref at
  // frame time, so a resize re-targets without rebuilding the transform; and
  // because each measure also re-renders (setTarget/setGap), the transforms
  // re-attach with fresh closures and recompute without waiting for the next
  // scroll event — a mid-page reload settles at once.
  const progress = (y) => Math.min(1, Math.max(0, y / geometry.current.range));
  const scale = useTransform(scrollY, (y) => 1 - (1 - geometry.current.target) * progress(y));
  const radius = useTransform(scrollY, (y) => (RADIUS_PX / geometry.current.target) * progress(y));
  const sink = useTransform(scrollY, (y) => -geometry.current.gap * progress(y));

  const still = reduced || isStatic;

  const inner = (
    <>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizesHint}
        preload
        className="h-auto w-full"
      />
      {/* `reduced` is live state: flipping the preference mid-visit
          unmounts the canvas, not just stops it. */}
      {fx && !reduced ? (
        <HeroSceneEffect src={src} width={width} height={height} effect={effect} />
      ) : null}
      {loop && !reduced ? <HeroSceneLoop sources={video?.sources} /> : null}
    </>
  );

  return (
    <div ref={frameRef} className="cs-bleed">
      <div ref={probeRef} className="cs-hero__probe" aria-hidden="true" />
      {still ? (
        // A plain div, deliberately: nothing animates here, and framer reads
        // a plain `scale` style number only at mount, so the value measured
        // after hydration would never reach the transform (it rendered
        // `transform: none`). Plain React styles re-render deterministically.
        <div
          ref={mediaRef}
          className="cs-hero-media"
          style={{
            transform: `scale(${target})`,
            borderRadius: RADIUS_PX / target,
            marginBottom: -gap,
          }}
        >
          {inner}
        </div>
      ) : (
        <m.div
          ref={mediaRef}
          className="cs-hero-media"
          style={{ scale, borderRadius: radius, marginBottom: sink }}
        >
          {inner}
        </m.div>
      )}
    </div>
  );
}
