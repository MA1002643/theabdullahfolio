// Single source of truth for loader timing. Tune the feel from one place.
//
// The intro is a four-beat story told on one object — the emblem seal:
//   building  → the seal inscribes itself (rings draw, name engraves,
//               diamonds set, the MA flame monogram forms in cool line-art)
//   built     → a brief lock/settle once the line-art is complete
//   igniting  → the flame floods up from its base and a contained ember
//               bloom swells from the core (the "something unique" moment)
//   reveal    → that bloom's light becomes the radial wipe that uncovers
//               the real homepage mounted behind the overlay
//
// BUILD_DURATION_MS is the real wall-clock length of the inscription; the
// per-layer draw delays inside EmblemSeal are tuned to land within it.

export const BUILD_DURATION_MS = 2400;

// Beat between the line-art completing and the flame catching — a held breath.
export const SETTLE_MS = 280;

// Flame flood + core bloom. The radial wipe is kicked off partway through this
// (see REVEAL_LEAD_MS) so the bloom and the page-reveal read as one continuous
// expansion of light rather than two separate steps.
export const IGNITE_MS = 560;
export const REVEAL_LEAD_MS = 200; // into IGNITE before the wipe starts

// Radial wipe that uncovers the homepage.
export const REVEAL_DURATION_MS = 520;

// Reduced-motion: the seal appears already forged (no self-draw, no flame
// flood, no cursor reactivity), holds briefly, then a plain cross-fade reveal.
export const REDUCED_BUILD_DURATION_MS = 900;
export const REDUCED_HOLD_MS = 500;

export const EMBER_CORE = '#ff6d05';
