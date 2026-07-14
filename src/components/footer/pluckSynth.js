// Web Audio "plucked string" synth for the footer wordmark (issue #30).
//
// Each footer string, when hovered, rings a soft plucked note. This is an
// original implementation of a standard synthesis recipe (it ships zero audio
// files and reuses no third-party assets):
//
//   • a sine FUNDAMENTAL at the note frequency, plus quiet 2nd/3rd HARMONICS
//     for body/warmth,
//   • a gentle ~5 Hz VIBRATO (an LFO frequency-modulating the fundamental),
//   • a warm FILTER band (low-pass + high-pass) so it reads as a soft string,
//   • a plucked GAIN ENVELOPE — near-instant attack, long exponential decay.
//
// Notes are chosen from a PENTATONIC scale, so strings plucked in any order
// sound musical — sweep the cursor across the name and it strums.
//
// Browser autoplay policy: an AudioContext can only START from a real user
// gesture, so callers must invoke unlock() from a pointerdown/click before any
// play() will actually sound.

// G-major pentatonic across two octaves (Hz): G3 A3 B3 D4 E4 G4 A4 B4.
export const SCALE = [196, 220, 247, 294, 330, 392, 440, 494];

export function createPluckSynth() {
  let ctx = null;
  let master = null;
  let muted = false;

  const ensureCtx = () => {
    if (ctx) return ctx;
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    return ctx;
  };

  // Create/resume the context from a user gesture (satisfies autoplay policy).
  const unlock = () => {
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };

  // Ring one note at an explicit frequency. intensity (0..1) nudges level,
  // brightness and decay length.
  const play = (freq, intensity = 0.5) => {
    if (muted || !ctx || !master || ctx.state !== 'running') return;
    const t = Math.max(0, Math.min(1, intensity));
    const f = freq;
    const now = ctx.currentTime;

    const peak = 0.05 + 0.09 * t; // ambient level, not a foreground SFX
    const attack = 0.006 + 0.012 * t;
    const decay = 1.4 + 0.7 * t; // longer ring — a relaxed, sustained fingerpick

    // Plucked amplitude envelope.
    const env = ctx.createGain();
    env.gain.setValueAtTime(1e-4, now);
    env.gain.exponentialRampToValueAtTime(peak, now + attack);
    env.gain.exponentialRampToValueAtTime(0.8 * peak, now + attack + 0.18);
    env.gain.exponentialRampToValueAtTime(1e-4, now + attack + decay);

    // Fundamental + quiet harmonics for body.
    const partials = [
      [1, 1.0],
      [2, 0.12],
      [3, 0.05],
    ];
    const oscs = partials.map(([mult, g]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * mult, now);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(g, now);
      o.connect(pg).connect(env);
      return o;
    });

    // Light vibrato on the fundamental (FM).
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.2, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(f * 0.006, now);
    lfo.connect(lfoGain).connect(oscs[0].frequency);

    // Warm tone shaping — a mellower low-pass so the note reads rounded and
    // intimate (a nylon-string feel) rather than a bright, glassy pluck.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1150 + 650 * t, now);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(110, now);

    env.connect(lp).connect(hp).connect(master);

    const stopAt = now + attack + decay + 0.05;
    oscs.forEach((o) => {
      o.start(now);
      o.stop(stopAt);
    });
    lfo.start(now);
    lfo.stop(stopAt);
  };

  const setMuted = (m) => {
    muted = !!m;
  };

  return { unlock, play, setMuted };
}

// Shared singleton — the footer's sound toggle and the wordmark's string-plucker
// live in different React subtrees but must drive the SAME AudioContext + mute
// flag, so they both go through this one instance.
let sharedSynth = null;
export function getPluckSynth() {
  if (!sharedSynth) sharedSynth = createPluckSynth();
  return sharedSynth;
}
