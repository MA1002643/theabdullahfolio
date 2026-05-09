// Single source of truth for loader timing. Tune the feel from one place.

export const COUNT_DURATION_MS = 2400;
export const TICK_INTERVAL_MS = 20;
export const INCREMENT_PER_TICK =
  100 / (COUNT_DURATION_MS / TICK_INTERVAL_MS);

export const PAUSE_BEFORE_PULSE_MS = 200;
export const PULSE_DURATION_MS = 400;
export const FADE_OUT_DURATION_MS = 350;

// Reduced-motion: simpler, faster sequence — no pulse, no glow ramp.
export const REDUCED_COUNT_DURATION_MS = 1500;
export const REDUCED_INCREMENT_PER_TICK =
  100 / (REDUCED_COUNT_DURATION_MS / TICK_INTERVAL_MS);

export const EMBER_CORE = '#ff6d05';
