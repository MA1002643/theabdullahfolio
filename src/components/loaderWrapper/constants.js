// Single source of truth for loader timing. Tune the feel from one place.
// Counting is driven by elapsed time, so COUNT_DURATION_MS is the real
// wall-clock duration of the count phase regardless of the easing curve.

export const COUNT_DURATION_MS = 2400;

export const PAUSE_BEFORE_PULSE_MS = 200;
export const PULSE_DURATION_MS = 400;
export const FADE_OUT_DURATION_MS = 350;

// Reduced-motion: simpler, faster sequence — no pulse, no glow ramp.
export const REDUCED_COUNT_DURATION_MS = 1500;

export const EMBER_CORE = '#ff6d05';
