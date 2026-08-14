// The GLSL and the baked mask behind HomeSceneLivePlate — kept out of the
// component so the component is only WebGL plumbing and the scene maths lives
// here, beside the rig constants it reads.
//
// TWO PASSES, because the page has two moving things and they want opposite
// treatment:
//
//   WATER  a fullscreen quad that RESAMPLES the plate through a perspective
//          ripple. It invents nothing — the constraint the withdrawn video
//          tier failed, when a generated loop drew a second lantern beside
//          each real post — but it moves the reflections properly, which the
//          row-shear it replaces never could.
//
//   FIRE   one small quad per lantern that warps that lantern's photographed
//          flame AND adds turbulent fbm fire licking up out of it. /projects
//          gets its convincing flames from a 1.8-5 MB generated video; this is
//          the same result for no bytes, and unlike a video it cannot drift or
//          repeat. Separate quads rather than a loop in the fullscreen pass
//          because the flames cover well under 1% of the frame: paying 13
//          bounding-box tests on every pixel of the hero to find them would be
//          the whole cost of the effect.
//
// Written to GLSL ES 1.00 so a plain `webgl` context runs it unchanged.

import {
  IW,
  IH,
  WATER_TOP,
  POST_KEEPOUTS,
  causewayCentre,
  causewayHalf,
  FIRE_BOX,
} from './homeSceneLights';

// Re-exported so the component keeps importing its quad geometry from the same
// module as the shader that consumes it. The numbers themselves moved to the
// rig, because the video bake cuts its flame windows to this box too and a
// second copy is exactly the drift this codebase keeps designing out.
export { FIRE_BOX };

// ── Shared ──────────────────────────────────────────────────────────────────
// Value noise and fbm. `fract(sin())` hashing is cheap and its banding is
// invisible under four octaves of fire, which is the only thing that uses it.
const NOISE = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
`;

// ── Water lives in the video tier now ───────────────────────────────────────
// A procedural water pass used to sit here and has been deleted rather than
// left switched off. Every version of it — travelling bands, crest glints,
// spreading rings — was STRUCTURE INVENTED AND LAID OVER a photograph, and each
// one read as an effect rather than as the lake. HomeSceneVideo carries the
// water's real character instead. The mask bake at the bottom of this file
// survives, because bake-causeway-water.mjs needs the same geometry.

// ── Fire ────────────────────────────────────────────────────────────────────
// The warp box (FIRE_BOX, in the rig) is interpolated into the shader rather
// than written twice, because JS also sizes the quad from it — and a quad
// smaller than the box would silently clip the effect at a straight edge, which
// is a maddening bug to find by eye.

export const FIRE_VERT = `
attribute vec2 aPos;   // unit quad, -1..1

uniform vec4 uBox;     // centre u, centre v, half-u, half-v (plate uv)
uniform vec2 uOrigin;  // the flame's own centre — NOT the box centre, which is
                       // offset because the warp box reaches further above the
                       // flame than below it
uniform vec2 uRUV;     // r/IW, r/IH — one unit of the detected core radius
uniform vec2 uRes;
uniform vec3 uProj;
uniform vec2 uIWH;

varying vec2 vUv;
varying vec2 vLocal;   // in units of r, measured from the flame centre: +x
                       // right, +y UP

void main() {
  vec2 uv = uBox.xy + aPos * uBox.zw;
  vUv = uv;
  vLocal = vec2((uv.x - uOrigin.x) / uRUV.x, (uOrigin.y - uv.y) / uRUV.y);
  vec2 screen = uv * uIWH * uProj.x + uProj.yz;
  gl_Position = vec4(screen.x / uRes.x * 2.0 - 1.0, 1.0 - screen.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

export const FIRE_FRAG = `
precision highp float;

varying vec2 vUv;
varying vec2 vLocal;

uniform sampler2D uPlate;
uniform float uTime;
uniform vec2  uRUV;
uniform vec4  uAnim;    // level, lean, lift, phase
uniform vec4  uShape;   // halfR, tipR, baseR, gain
uniform float uPlateAlpha;
uniform float uFade;    // 0 when the source is too small on screen to animate

const float BOX_HALF = ${FIRE_BOX.half.toFixed(3)};
const float BOX_TOP = ${FIRE_BOX.top.toFixed(3)};
const float BOX_BOT = ${FIRE_BOX.bottom.toFixed(3)};
const float BOX_F = ${FIRE_BOX.feather.toFixed(3)};

${NOISE}

void main() {
  float lx = vLocal.x;
  float ly = vLocal.y;

  float mx = 1.0 - smoothstep(BOX_HALF - BOX_F, BOX_HALF, abs(lx));
  float my = (1.0 - smoothstep(BOX_TOP - BOX_F, BOX_TOP, ly))
           * (1.0 - smoothstep(BOX_BOT - BOX_F, BOX_BOT, -ly));
  float box = mx * my;
  if (box < 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float halfR = uShape.x;
  float tipR = uShape.y;
  float baseR = uShape.z;

  // Height up the flame: 0 at the wick, 1 at the tip.
  float h = clamp((ly + baseR) / (tipR + baseR), 0.0, 1.0);

  // Turbulence that SCROLLS UPWARD: subtracting time from the vertical noise
  // coordinate makes the field rise through the flame, so a disturbance is born
  // at the wick and arrives at the tip a moment later. That lag is the entire
  // difference between something burning and a shape wobbling, and it is what
  // the previous two-radial-gradients relight had no way to express.
  float drift = fbm(vec2(lx * 2.2, ly * 2.2 - uTime * 1.9 + uAnim.w));

  // The centreline leans and wanders, anchored at the wick — a flame pivots
  // about its base. A rigid sideways offset reads as the whole lantern sliding.
  float sway = uAnim.y * 0.20 * pow(h, 1.7) + (drift - 0.5) * 0.30 * h;

  // ── 1. Move the photographed flame ────────────────────────────────────────
  // Sampling from LOWER in the plate pulls its own pixels upward, so the real
  // flame's tongues and dark striations do the licking. Nothing here draws a
  // flame shape; this half only moves the one the photograph already has.
  float rise = uAnim.z * (0.08 + 0.16 * h) * uFade;
  vec2 suv = vec2(vUv.x - sway * uRUV.x * 0.55 * uFade, vUv.y + rise * uRUV.y);
  vec3 base = texture2D(uPlate, suv).rgb;

  // Only the warm part is allowed to pulse. Breathing the dark glass with it
  // would read as the housing itself glowing on and off.
  float warmth = clamp((base.r - base.b) * 2.2, 0.0, 1.0);
  base *= mix(1.0, uAnim.x, warmth);

  // ── 2. Add fire licking out of it ─────────────────────────────────────────
  // Skipped entirely in the light-only variant (uFireGain 0), where the plate's
  // own photographed flame is the ONLY thing on screen and just breathes.
  if (uShape.w <= 0.0) {
    gl_FragColor = vec4(base * uPlateAlpha * box, box);
    return;
  }
  // An envelope that tapers toward the tip, with the noise MULTIPLYING it
  // rather than adding — so turbulence can carve tongues out of the flame but
  // can never paint fire outside it.
  float w = halfR * (1.0 - 0.72 * h * h);
  float dx = (lx - sway) / max(w, 1e-4);
  float env = max(0.0, 1.0 - dx * dx) * (1.0 - smoothstep(0.42, 1.04, h));

  float n = fbm(vec2(lx * 3.4, ly * 3.4 - uTime * 2.6 + uAnim.w * 1.7));
  // The noise's influence grows with height: solid and steady at the wick,
  // breaking into separate tongues near the tip, which is how fire is shaped.
  float dens = clamp(env * (1.0 + (n - 0.5) * 2.2 * h), 0.0, 1.0) * uAnim.x;

  vec3 fire = mix(vec3(1.0, 0.30, 0.05), vec3(1.0, 0.72, 0.26), smoothstep(0.10, 0.50, dens));
  fire = mix(fire, vec3(1.0, 0.95, 0.84), smoothstep(0.45, 0.88, dens));

  // Weighted toward the TOP of the flame. The plate's own core is already at
  // or near 255 — adding there only clips, which flattens the flicker into a
  // smooth blob. The glass above the core is dark, and that is where added
  // light reads as the flame licking higher.
  vec3 col = base + fire * dens * uShape.w * uFade * (0.22 + 0.9 * h);

  gl_FragColor = vec4(col * uPlateAlpha * box, box);
}
`;
