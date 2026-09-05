'use client';

import { useCallback, useRef } from 'react';
import { useGuestbookPrefs } from './useGuestbookPrefs';

// Synthesised UI blips for the guestbook (issue #40 Phase 4) — Web Audio
// oscillators, no samples, no library. Four cues: focus, send, reaction,
// error. OFF by default; the command palette flips the pref; and `play` is
// only ever invoked from user-gesture handlers, so nothing can autoplay —
// the AudioContext itself isn't even constructed until the first enabled,
// gesture-driven play call.
//
// One module-level context shared across consumers: browsers cap live
// AudioContexts, and a page needs exactly one.
let sharedCtx = null;

// Each cue is 1–2 partials: { f: Hz, type, dur s, gain, at: start offset s }.
// Tuned as short, soft, rounded blips — felt more than heard.
const CUES = {
  focus: [{ f: 660, type: 'sine', dur: 0.06, gain: 0.035 }],
  send: [
    { f: 523, type: 'sine', dur: 0.08, gain: 0.05 },
    { f: 784, type: 'sine', dur: 0.1, gain: 0.045, at: 0.07 },
  ],
  reaction: [{ f: 880, type: 'triangle', dur: 0.09, gain: 0.05 }],
  error: [{ f: 196, type: 'square', dur: 0.13, gain: 0.03 }],
};

export function useUiSound() {
  const { sound } = useGuestbookPrefs();
  const enabledRef = useRef(sound);
  enabledRef.current = sound;

  return useCallback((cue) => {
    if (!enabledRef.current) return;
    const partials = CUES[cue];
    if (!partials) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      sharedCtx = sharedCtx || new Ctx();
      // resume() fails ASYNCHRONOUSLY — a NotAllowedError under autoplay
      // policy arrives as a promise rejection, which the try/catch around
      // this block never sees. Swallow it on the promise itself (wrapped, so
      // an engine handing back a non-promise cannot throw here either). No
      // await: Web Audio starts queued nodes the moment the context runs, so
      // the cue is scheduled now and simply plays when — or never, if —
      // resume goes through. Same handling as the footer's pluckSynth.
      if (sharedCtx.state === 'suspended') {
        Promise.resolve(sharedCtx.resume()).catch(() => {});
      }

      const now = sharedCtx.currentTime;
      for (const p of partials) {
        const osc = sharedCtx.createOscillator();
        const gain = sharedCtx.createGain();
        osc.type = p.type;
        osc.frequency.value = p.f;
        const start = now + (p.at || 0);
        // Attack/decay envelope — the 10ms ramp in avoids the click a raw
        // oscillator start would make.
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(p.gain, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + p.dur);
        osc.connect(gain);
        gain.connect(sharedCtx.destination);
        osc.start(start);
        osc.stop(start + p.dur + 0.03);
      }
    } catch {
      // Audio is decoration — a blocked or failed context must never surface.
    }
  }, []);
}
