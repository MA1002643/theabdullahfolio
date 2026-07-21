'use client';

// Site-wide owner of the footer's guitar audio (issue #30 follow-up).
//
// The <audio> element and the `soundOn` flag used to live inside <Footer />,
// which is mounted in src/app/(sub pages)/layout.js. That layout is torn down
// the moment a visitor navigates to the homepage — `/` sits OUTSIDE the
// (sub pages) route group — so React destroyed the <audio> node mid-play, the
// browser dropped playback, and the toggle silently reset to Off. On a phone or
// keyboard-less tablet (the only surfaces that play the recorded track) that
// read as "the music stops when I tap Home".
//
// Hoisting both the element and the state into a provider mounted in the ROOT
// layout puts them above every layout that can unmount, so the track survives
// every route change. The Footer still renders the visible control — it just
// consumes this context instead of owning the state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePointerCapability } from '@/hooks/usePointerCapability';
import { getPluckSynth } from '@/components/footer/pluckSynth';

// Touch-device audio: a self-hosted acoustic-guitar track that plays when a
// visitor who CAN'T hover (phone / keyboard-less tablet) turns the sound on —
// since there is no cursor to pluck the wordmark there. Hover-capable devices
// play the live synth instead (see FooterWordmark).
const TRACK_SRC = '/audio/guitar-tabla-fusion.mp3';
const TRACK_VOLUME = 0.5; // gentle, ambient — background, not foreground

const SoundContext = createContext(null);

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error('useSound must be used within <SoundProvider>');
  }
  return ctx;
}

export default function SoundProvider({ children }) {
  // Footer guitar audio is opt-in (no surprise sound): OFF by default, toggled
  // by the footer's SoundControl or the floating chip on footer-less routes.
  // Enabling it also unlocks the shared AudioContext from that click gesture
  // (browser autoplay policy).
  const [soundOn, setSoundOn] = useState(false);
  // Ref mirror of the latest `soundOn`. toggleSound reads THIS, not the value
  // captured when the callback was last created, so two taps fired before React
  // re-renders each flip reliably. Reading the state directly would let both
  // taps see the same stale value, compute the same `willOn`, fail to toggle
  // back Off, and fire a duplicate play(). Kept in sync below.
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  // Can the visitor actually PLUCK the wordmark? True for a mouse or an iPad/
  // tablet with a trackpad (a fine, hover-capable pointer); false for a phone or
  // a keyboard-less iPad (coarse, touch-only). This is a live matchMedia signal,
  // not UA sniffing — attaching a Magic Keyboard flips it with no reload. It
  // decides the SOUND SOURCE: a hover-capable device plays the live synth (the
  // visitor plucks the strings by hand), while a touch surface — with no cursor
  // to perform the strings — plays the recorded acoustic-guitar track instead.
  const canHover = usePointerCapability();

  // `autoPlay` = "touch surface with the sound on" → play the recorded track (and
  // run the wordmark's ambient visual strum). The synth is muted here so the two
  // never sound at once (see FooterWordmark).
  const autoPlay = soundOn && !canHover;

  // The recorded track element (touch only). Self-hosted at TRACK_SRC.
  const trackRef = useRef(null);

  const toggleSound = useCallback(() => {
    const willOn = !soundOnRef.current;
    // Advance the ref synchronously so a rapid second tap (before the state
    // update commits) sees the value THIS tap just chose and flips back.
    soundOnRef.current = willOn;
    if (willOn) {
      getPluckSynth().unlock();
      // Start the track from THIS user gesture (autoplay policy) when the visitor
      // can't hover; hover-capable devices leave it paused and use the synth.
      if (!canHover && trackRef.current) {
        trackRef.current.volume = TRACK_VOLUME;
        trackRef.current.play().catch(() => {});
      }
    } else {
      trackRef.current?.pause();
    }
    setSoundOn(willOn);
  }, [canHover]);

  // Keep the track in lockstep with autoPlay — covers a keyboard/trackpad being
  // attached or removed mid-play (canHover flips live) and pausing on sound-off.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    if (autoPlay) {
      el.volume = TRACK_VOLUME;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [autoPlay]);

  const value = useMemo(
    () => ({ soundOn, canHover, autoPlay, toggleSound }),
    [soundOn, canHover, autoPlay, toggleSound],
  );

  return (
    <SoundContext.Provider value={value}>
      {children}
      {/* Recorded acoustic-guitar track for touch surfaces (no cursor to pluck
          the strings). Hidden + decorative; loads only when first played. Lives
          here — not in the footer — so navigating between route groups never
          unmounts it. */}
      <audio ref={trackRef} src={TRACK_SRC} loop preload="none" aria-hidden="true" />
    </SoundContext.Provider>
  );
}
