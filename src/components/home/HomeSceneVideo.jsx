'use client';
import { useEffect, useRef, useState } from 'react';
import { useSceneGate } from '@/hooks/useSceneGate';

// The lake and the lanterns, filmed.
//
// An ambient loop composited into the shipped plate through two masks
// (bake-causeway-water.mjs): the lake, and a small window around each lantern's
// flame. Every pixel of geometry the eye can check — the causeway, the post
// housings, the trees, the sky — still comes from the still. Only the water and
// the fire come from the video.
//
// That masking is not a refinement, it is the reason this tier exists at all.
// The raw i2v pass would not hold the causeway rigid: measured as per-pixel
// temporal std, the stone came back at 28.6 against 6.0 for the water it was
// meant to be animating, and vidstab's static-camera mode left it at 28.0 — the
// drift is non-rigid, so no stabiliser recovers it. Masked, the same clip
// measures 0.00 mean frame-to-frame difference on the stone, the sky and the
// trees while the water moves at 5.6–6.2. It also encodes for almost nothing,
// because 71% of the frame is now perfectly static: 2.2 MB became 899 KB.
//
// The flame windows are cut inside the post keep-outs, which the LAKE mask
// excludes — so the fire is handed back deliberately, one window at a time,
// rather than by relaxing the rule that keeps the posts rigid. Each flame is
// re-registered onto the wick the plate photographed (the model walks the near
// lanterns up to 51 px) and closed on its own loop, because the 1s crossfade
// that hides the water's seam would show a flame as a double exposure.
//
// This layer therefore REPLACES the procedural tier outright rather than
// stacking with it: HomeSceneLivePlate would paint the plate's frozen flame
// over these, which is why HomeSceneWater mounts strictly one or the other.

// Resolution ladder, picked in JS: `media` on <source> is only reliably
// honoured inside <picture>; inside <video> it is widely ignored, so the
// browser would simply take the first entry.
const SOURCES = [
  { max: 1440, src: '/background/causeway-720.mp4' },
  { max: Infinity, src: '/background/causeway-1080.mp4' },
];

// The plate is object-cover'd, so on any viewport narrower than 16:9 it paints
// height-bound at ~178vh wide — the <Image> `sizes` rule minus its portrait-
// phone branch. Below 640px portrait this layer is banded to 65% of the shell
// exactly like the plate is, so it really paints 115.6svh; the branch is left
// out here on purpose, because this ladder has ONE threshold (1440) and no
// phone crosses it either way: an 866px small viewport bands to 1001 CSS px,
// which still asks for 1080p once the DPR clamp doubles it (2002), exactly as
// 178vh did (3082). Only a 1×, sub-640px-wide portrait window — a narrowed
// desktop, not a phone — would change rung, and that is not what this ladder
// is protecting.
const paintedWidth = () => {
  const css = Math.max(window.innerWidth, window.innerHeight * (16 / 9));
  return css * Math.min(window.devicePixelRatio || 1, 2);
};

const HomeSceneVideo = ({ onFail }) => {
  const videoRef = useRef(null);
  const { mounted, running } = useSceneGate(videoRef);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const need = paintedWidth();
    setSrc(SOURCES.find((s) => need <= s.max).src);
  }, []);

  // Two gates ANDed by the hook: off-screen and backgrounded-tab. The tab one
  // does the real work here — it stops a 1080p decode running against a tab
  // nobody is looking at.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
    if (running) {
      // play() rejects if the element is torn down mid-call; that is not worth
      // surfacing, and an unhandled rejection just logs noise.
      el.play?.().catch(() => {});
    } else {
      el.pause?.();
    }
  }, [running, src]);

  if (!mounted || !src) return null;

  return (
    <video
      ref={videoRef}
      // Under the fire canvas (-z-[46]) and over the plate (-z-50). NO opacity
      // class: this clip is a full-frame composite that REPLACES the plate, so
      // the plate's own 0.9 is baked into the encode instead (see PLATE_OPACITY
      // in bake-causeway-water.mjs). Stacking a second 0.9 here would land at
      // 0.99 x plate and the whole hero would brighten 10% the moment the video
      // started — the still-to-video swap has to be invisible, not a pop.
      className="home-backdrop pointer-events-none -z-[47] object-cover object-center"
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      disablePictureInPicture
      disableRemotePlayback
      // Decorative, like the plate beneath it (alt="") — hidden from AT.
      aria-hidden
      tabIndex={-1}
      // Any decode/network failure drops to the procedural ripple rather than
      // to a dead still: that tier needs no network and cannot fail this way.
      onError={onFail}
    />
  );
};

export default HomeSceneVideo;
