'use client';
import { useEffect, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { onMediaChange } from '@/lib/mediaQuery';

// Ambient scene video for /qualifications (issue #52 follow-up): the living
// version of qualifications-bg.webp — the water ripples and the lantern
// flames flicker while the camera stays locked. Modelled on the reference
// pattern at casadisolare.com (plain full-bleed `<video autoplay loop muted
// playsinline preload="metadata">`, object-fit: cover, no blend tricks).
//
// Layering: the static background Image (-z-50) stays mounted underneath as
// the instant "poster" and the permanent fallback; this video sits at
// -z-[45] with the SAME opacity-80 treatment, and the page's black/80
// dimmer (-z-40) darkens both identically — so the video appearing is a
// seamless "the picture starts moving" moment, never a reload.
//
// Mount gates (mirrors AuroraDustMount's philosophy):
//   • prefers-reduced-motion  — never mount; the still image IS the page.
//   • Save-Data               — a multi-MB ambient loop is exactly what that
//                               flag asks us not to spend (same guard as
//                               preloadCerts' bulk warm).
//   • loader reveal           — defer the video fetch past first paint/LCP;
//                               preload="metadata" keeps even that light.
//   • decode/network error    — unmount; the still image remains.
const SceneVideo = () => {
  const revealed = useLoaderRevealed();
  const [motionOk, setMotionOk] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    setSaveData(!!navigator.connection?.saveData);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionOk(!mq.matches);
    apply();
    return onMediaChange(mq, apply);
  }, []);

  if (!revealed || !motionOk || saveData || failed) return null;

  return (
    <video
      className="fixed left-0 top-0 -z-[45] h-full w-full object-cover object-center opacity-80"
      src="/background/qualifications-water.mp4"
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
      onError={() => setFailed(true)}
    />
  );
};

export default SceneVideo;
