// What colour the Ember Passage burns — ONE colour, everywhere, on every route.
//
// The mark the swarm spells is the same monogram the homepage headline spells
// in letters, so it is lit by the same light and nothing else: `#ff6d05`, the
// stroke `.text-glow-stroke-neon` paints MUHAMMAD ABDULLAH with, plus that
// utility's own three-layer halo around it.
//
// This file used to hold a palette per destination, so the passage arrived in
// the colour of the page it was uncovering. That made the mark a different
// object on every route. It is one object, and it is the site's ember.
//
// So there is ONE hex here and no second colour anywhere in the passage. Every
// other value below is a LEVEL — a fraction of that one ember's brightness —
// which is why they are plain numbers rather than more colours. The swarm never
// receives them as colours either: it accumulates brightness alone and the ink
// is multiplied in once, at the end (see emberSwarmShader.js, TINT_FRAG), so a
// hue shift is not something the renderer is capable of producing.
//
// The DOM half of the passage (the destination label, and the monogram in the
// reduced-motion branch) takes its colour from `.text-glow-stroke-neon` itself
// rather than from this file, so the ember is written down in exactly one place
// for anything CSS can paint. What lives here is only what CSS cannot reach:
// the GL uniforms, and a restatement of that utility's filter for the one
// inline SVG that has no class to carry it.

// `.text-glow-stroke-neon`'s `-webkit-text-stroke` colour (globals.css), and so
// the colour of the homepage hero name. Changing this changes the whole
// passage; changing the hero means changing it in both places, deliberately.
const INK = '#ff6d05';

// A loose ember burns at half light and a landed one at full, which is what
// makes the convergence read as an arrival rather than as a crossfade. This
// used to be a second, darker colour; it is a level because the two ends were
// only ever the same ember at two brightnesses.
const DRIFT_LEVEL = 0.5;

// The darkness the swarm converges into: the same ember with the light almost
// out. Near-black, but not neutral black — the space behind the mark belongs to
// the same fire.
const VEIL_LEVEL = 0.055;

// `.text-glow-stroke-neon`'s `filter`, restated verbatim from globals.css —
// 0.8 / 0.6 / 0.4 of rgba(255,106,0) twice and rgba(255,90,0) once. The only
// consumer is the static branch's <svg>, which cannot inherit the class the way
// the label does.
const GLOW =
  'drop-shadow(0 0 10px rgba(255, 106, 0, 0.8)) ' +
  'drop-shadow(0 0 20px rgba(255, 106, 0, 0.6)) ' +
  'drop-shadow(0 0 30px rgba(255, 90, 0, 0.4))';

const RE_HEX = /^#([0-9a-f]{6})$/i;

const channels = (hex) => {
  const m = RE_HEX.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// '#ff6d05' -> [1, 0.427, 0.020] for gl.uniform3fv.
const toGL = (hex) =>
  new Float32Array(channels(hex).map((c) => c / 255));

// The ink at a fraction of its brightness, as a CSS colour. Dimming all three
// channels by the same factor slides a colour along its own ray from black,
// which leaves hue and saturation untouched by construction — so this is the
// same ember with less light in it, not a second colour chosen to look related.
const dimCss = (hex, k) =>
  'rgb(' + channels(hex).map((c) => Math.round(c * k)).join(', ') + ')';

export const EMBER_PALETTE = {
  ink: INK,
  veil: dimCss(INK, VEIL_LEVEL),
  glow: GLOW,
  gl: {
    ink: toGL(INK),
    driftLevel: DRIFT_LEVEL,
    veilLevel: VEIL_LEVEL,
  },
};
