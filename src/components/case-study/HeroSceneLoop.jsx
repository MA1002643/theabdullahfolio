'use client';

import { useEffect, useRef, useState } from 'react';

// The hero as a live recording (issue #31, owner 2026-11-21): the case-study
// hero was a still with a shader cinemagraph over it, and the owner asked for
// the real thing — the homepage itself moving, lantern flames and lake and
// the navigation orbit actually orbiting. This plays a screen recording of
// the live page, loop-closed at one full orbit label cycle (8 slots at
// 9°/s ≈ 40 s), over the <Image> still.
//
// The still IS this loop's first frame (hero.webp is exported from the
// encoded master), so the video fading in is "the picture starts moving",
// never a swap. Everything errs toward the still, exactly like the
// cinemagraph it replaces: HeroMedia holds the mount gates (reduced motion
// never downloads a byte, nor does a device that asked for less); here,
// any decode or network failure unmounts the video, playback pauses
// off-screen and in hidden tabs, and autoplay refusal (a browser policy,
// e.g. battery saver) withdraws the layer rather than leaving a frozen
// first frame at full opacity.
//
// The resolution rung follows projects/SceneVideo.jsx: one file for every
// device was called out there as a mistake, and `media` on <source> is only
// honoured inside <picture>, so the rung is picked in JS. Within a rung the
// webm/mp4 pair IS left to <source>: codec choice is what it is for.
const DPR_CAP = 2;

const paintedWidth = () =>
  window.innerWidth * Math.min(window.devicePixelRatio || 1, DPR_CAP);

export default function HeroSceneLoop({ sources }) {
  const videoRef = useRef(null);
  const [rung, setRung] = useState(null);
  const [live, setLive] = useState(false);
  const [dead, setDead] = useState(false);

  // Pick the rung once, at mount width. A later resize keeping a now-too-small
  // file is fine (it only ever happened after the download was already made);
  // re-fetching a bigger one mid-view would cost more than it shows.
  useEffect(() => {
    if (!sources?.length) return;
    const need = paintedWidth();
    setRung(sources.find((s) => need <= s.max) ?? sources[sources.length - 1]);
  }, [sources]);

  // Pause whenever not actually being seen (SceneVideo's two ANDed gates),
  // and treat a refused autoplay as "this device does not want it".
  useEffect(() => {
    if (!rung || dead) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;

    let onScreen = true;
    const sync = () => {
      if (onScreen && !document.hidden) {
        const p = el.play?.();
        p?.catch?.((err) => {
          // pause() interrupting play() is routine teardown noise; a policy
          // refusal (NotAllowedError) means this visit never gets autoplay —
          // withdraw to the still rather than sit frozen under it.
          if (err?.name === 'NotAllowedError') setDead(true);
        });
      } else {
        el.pause?.();
      }
    };

    let io;
    if (typeof IntersectionObserver !== 'undefined') {
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
  }, [rung, dead]);

  if (!rung || dead) return null;
  return (
    <video
      ref={videoRef}
      className={`cs-hero-media__fx${live ? ' is-live' : ''}`}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      // Decorative double of the labelled <Image> beneath — hidden entirely.
      aria-hidden
      tabIndex={-1}
      onPlaying={() => setLive(true)}
      // All <source> candidates exhausted, or a mid-stream decode error:
      // the still beneath is the page.
      onError={() => setDead(true)}
    >
      {rung.webm ? <source src={rung.webm} type="video/webm" /> : null}
      {rung.mp4 ? <source src={rung.mp4} type="video/mp4" /> : null}
    </video>
  );
}
