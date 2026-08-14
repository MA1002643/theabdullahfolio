// GLSL for the Ember Passage — kept out of the component so the component is
// only WebGL plumbing, matching how homeScenePlateShader.js is split from
// HomeSceneLivePlate. GLSL ES 1.00, so a plain 'webgl' context runs it.
//
// Three programs, and the order they run in is the whole colour story.
//
//   VEIL   one fullscreen triangle. A radial darkness that closes over the
//          outgoing page and opens again on the destination, so the route swap
//          happens behind something that looks like deep space rather than a
//          black rectangle.
//
//   EMBER  gl.POINTS, additive. The swarm.
//
//   TINT   one fullscreen triangle that turns the other two into a colour.
//
// VEIL and EMBER do not draw in colour at all. They accumulate BRIGHTNESS into
// an offscreen buffer — one channel, 0..1 — and TINT multiplies the site's
// ember through it once, at the end. Everything on screen is therefore
// `ink * brightness` for some brightness, which makes "the mark is exactly the
// homepage headline's orange" a property of the renderer rather than something
// tuned into it.
//
// It is not decoration. Drawing the swarm in colour, additively, cannot hold a
// hue at these densities, for TWO independent reasons:
//
//   CLIPPING     ~90k sprites overlap dozens deep inside the glyph. Red reaches
//                1.0 long before the stack is finished, green keeps climbing
//                behind it, and the body of the monogram renders flat YELLOW
//                while its sparse edges stay orange. Measured, before this
//                split: (255, 255, 10) through the strokes.
//
//   QUANTISATION the framebuffer is 8-bit, and every add rounds to 1/255. The
//                faint passes contribute a fraction of one step per sprite, and
//                the SMALL channels are the ones that round away: measured in
//                isolation, 100 additive draws of this ember at the bloom
//                pass's alpha land on (100, 0, 0) — pure red, where the ratio
//                says (100, 43, 2). Not a subtle drift. The green channel never
//                accumulates at all, and the mark ends up deeper than its own
//                colour no matter what the uniform says.
//
// Accumulating brightness sidesteps both. There is only one channel to clip, so
// over-driving the swarm costs DETAIL (a flat-topped mark) and never HUE; and
// the ink is applied in a single multiply against a value that has already
// finished accumulating, so it rounds once instead of ninety thousand times.
//
// The important idea is that NOTHING about an ember is simulated. Its position
// at any moment is a pure function of (start, target, seed, uT) evaluated here
// in the vertex shader. That means:
//   - no ping-pong float textures, so no OES_texture_float dependency and none
//     of the mobile precision problems that come with it
//   - no per-frame buffer uploads: one static buffer, one draw call
//   - the swarm is deterministic and instantly seekable to any point in time,
//     so a dropped frame never accumulates error
//
// NOTE: this file is a template literal. A backtick anywhere inside the shader
// source — including in a comment — terminates the string and breaks the build.

// Ember counts. The swarm is allocated at MAX_EMBERS in emberField.js and a
// PREFIX of that buffer is drawn, so these are pure draw-call parameters.
export const EMBERS_DESKTOP = 90000;
export const EMBERS_TABLET = 58000;
// Purely "fewer because the GPU is smaller". These used to carry a second job —
// they were picked for matched BRIGHTNESS, since a tier drawing fewer embers
// renders a dimmer mark — which made the cheap tier less cheap than it wanted to
// be. emberSwarm.js buys that back with alpha now (see `tierGain`), which costs
// nothing, so these are free to be whatever the weakest GPU can afford.
export const EMBERS_MOBILE = 40000;

// The glow pass redraws a fraction of the swarm much larger and much fainter.
// Additive overdraw is the cost driver, so this stays a minority of the swarm.
export const GLOW_FRACTION = 0.34;

// A third, much wider and much fainter pass over a small slice of the swarm.
// This is where the "lit from within" halo comes from, and it is deliberately
// NOT bought by turning the core pass up: the core pass is already near the
// point where additive stacking clips every channel and the mark goes cream, so
// extra energy there costs colour. Spent on a broad soft pool instead, it reads
// as glow while the mark keeps its hue. A twelfth of the swarm at ~1% alpha,
// which is a small fraction of the glow pass's own fill cost.
export const BLOOM_FRACTION = 0.12;

export const MAX_DPR = 1.75;
export const MAX_PIXELS = 2_600_000;

export const VEIL_VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const VEIL_FRAG = `
precision mediump float;
uniform vec2  uRes;
uniform vec2  uMark;
uniform float uCover;      // 0..1 how closed the veil is
uniform float uVeilLevel;  // the darkness's own light, as a fraction of the ember
uniform float uBloom;      // 0..1 how lit the pool behind the mark is

void main() {
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float d = distance(fc, uMark) / max(uRes.y, 1.0);

  // Lit at the centre, black at the edges: the swarm converges into a space
  // with some depth to it rather than onto a flat black card. A FRACTION of the
  // ember's brightness, not a colour of its own — TINT gives it the same ember
  // the mark is made of, so even the darkness behind the mark belongs to it.
  float lit = mix(uVeilLevel, 0.0, smoothstep(0.05, 0.95, d));

  // The light the mark casts INTO that space. Two lobes — a tight pool right
  // under the glyph and a wide, very faint wash — so the mark sits in light it
  // is emitting rather than on top of a dark card. This is the cheapest glow in
  // the whole overlay: it rides a fullscreen pass that was already being drawn,
  // where the same halo made of embers would be millions of additive fragments.
  float pool = exp(-d * d * 210.0) * 0.30 + exp(-d * d * 26.0) * 0.10;
  lit += pool * uBloom;

  // The centre seals slightly LAST, so the veil closes inward around the point
  // the mark is about to occupy.
  //
  // ALPHA is the one thing this pass still owns outright: it is how much of the
  // outgoing page is hidden, which is a coverage question rather than a lighting
  // one. The embers add none of it — light falling on a page does not occlude
  // it — so during the scatter the swarm brightens the destination it is
  // uncovering instead of punching holes in it.
  float a = clamp(uCover * (1.18 - 0.18 * (1.0 - smoothstep(0.0, 0.7, d))), 0.0, 1.0);
  gl_FragColor = vec4(vec3(lit * a), a);
}
`;

// The colour, applied once. Reads the brightness field the other two programs
// accumulated and multiplies the site's ember through it — so the ONLY colour
// this overlay can produce is uInk at some brightness, plus the page showing
// through where the veil has not closed.
export const TINT_VERT = VEIL_VERT;

export const TINT_FRAG = `
precision mediump float;
uniform sampler2D uField;
uniform vec2 uRes;
uniform vec3 uInk;   // #ff6d05 — the homepage headline's own stroke colour

void main() {
  vec4 f = texture2D(uField, gl_FragCoord.xy / uRes);
  gl_FragColor = vec4(uInk * f.r, f.a);
}
`;

export const EMBER_VERT = `
attribute vec2 aStart;    // viewport-normalised 0..1
attribute vec2 aTarget;   // emblem (1024) space
attribute vec3 aSeed;     // three per-ember randoms

uniform vec2  uRes;         // drawing buffer, device px
uniform float uT;           // 0..1 master progress
uniform float uTime;        // seconds, for jitter
uniform vec2  uOrigin;      // where the visitor clicked, device px, y down
uniform float uSpan;        // furthest any point sits from uOrigin
uniform vec2  uMark;        // mark centre, device px, y down
uniform vec2  uFieldOrigin; // top-left of the emblem square, device px
uniform float uFieldSize;   // side of that square, device px
uniform float uScale;       // device px per CSS px, times mark-size factor
uniform float uSizeMul;     // 1 for the core pass, larger for the glow pass
uniform float uAlphaMul;

// How dim a LOOSE ember is, as a fraction of a landed one. See passagePalette.js.
// This is the whole of what used to be a two-colour palette: the cool end and
// the hot end were always the same ember, so what separates them is a number.
uniform float uDrift;

varying float vLit;
varying float vAlpha;
varying float vGlint;

void main() {
  vec2 startPx = aStart * uRes;
  vec2 targetPx = uFieldOrigin + ((aTarget - vec2(296.0, 306.0)) / 428.0) * uFieldSize;

  // Embers nearest the CLICK lift first, so the disintegration visibly answers
  // the button the visitor pressed rather than starting everywhere at once.
  float dOrigin = distance(startPx, uOrigin) / max(uSpan, 1.0);
  float delay = dOrigin * 0.20 + aSeed.x * 0.12;

  // Delay + window must sum to no more than the convergence deadline, or the
  // last embers are still in flight when the mark is supposed to be readable.
  float conv = smoothstep(delay, delay + 0.42, uT);
  conv = conv * conv * (3.0 - 2.0 * conv);          // extra ease at both ends
  float scat = smoothstep(0.80, 1.0, uT);

  // Curl-ish swirl that decays to exactly zero at convergence, so embers arrive
  // ON their targets instead of orbiting them.
  float ang = aSeed.y * 6.2831853 + uTime * (0.7 + aSeed.z * 1.4);
  float swirl = (1.0 - conv) * (40.0 + 210.0 * aSeed.z) * uScale;
  vec2 drift = vec2(cos(ang), sin(ang)) * swirl;

  // Embers rise. Gently, and only while they are still loose.
  drift.y -= (1.0 - conv) * (30.0 + 90.0 * aSeed.y) * uScale;

  vec2 pos = mix(startPx, targetPx, conv) + drift;

  // Once landed the mark BREATHES: a small per-ember jitter keeps it alive as a
  // swarm holding a shape, not a still image of a logo.
  float live = conv * (1.0 - scat);
  pos += vec2(
    sin(uTime * 3.3 + aSeed.x * 24.0),
    cos(uTime * 2.9 + aSeed.y * 24.0)
  ) * 2.6 * uScale * live;

  // Blown outward from the mark's centre, accelerating.
  vec2 outDir = normalize(targetPx - uMark + vec2(0.0001, 0.0001));
  pos += outDir * scat * scat * (420.0 + 820.0 * aSeed.z) * uScale;

  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = max((0.9 + 2.0 * aSeed.z) * uScale * uSizeMul, 1.0);

  // An ember cools as it drifts and runs hot as it lands — the swarm brightens
  // into the shape, which is what makes the convergence read as an arrival
  // rather than as a crossfade between two states.
  //
  // A BRIGHTNESS, not a colour. It used to be a mix between a cool colour and a
  // hot one, which is the same thing said in a way that lets the two ends drift
  // apart; said this way they cannot, because there is only one ember and this
  // is how much of it is showing. There is no accent hue mixed in on top for
  // the same reason — a minority burning a contrasting colour is visible as
  // exactly that, foreign specks inside a monogram that is meant to be one
  // colour. Shine is a glint, which is more of this number, not another hue.
  vLit = mix(uDrift, 1.0, pow(conv, 1.6) * (0.35 + 0.65 * aSeed.z));

  // Shine. A landed ember catches the light for a moment and lets it go, and
  // because the phase is per-ember the glints fire scattered across the mark
  // rather than pulsing it as a whole. Raised to a high power so each one is a
  // brief flash rather than a slow throb: at any instant only a small
  // percentage of the swarm is lit this way, which is what separates "shiny"
  // from "brighter". Zero until the ember has landed (live), so nothing
  // twinkles while the page is still coming apart.
  float glint = sin(uTime * 2.1 + aSeed.x * 43.0 + aSeed.y * 17.0);
  vGlint = pow(max(glint, 0.0), 14.0) * live;

  float appear = smoothstep(0.0, 0.08, uT);
  vAlpha =
    appear * (1.0 - scat) * uAlphaMul * (0.45 + 0.55 * conv) *
    (1.0 + 0.85 * vGlint);
}
`;

export const EMBER_FRAG = `
precision mediump float;
uniform float uSpec;   // 1 on the core pass, 0 on the two blurred passes
varying float vLit;
varying float vAlpha;
varying float vGlint;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);

  // TWO lobes rather than one. The old single gaussian gave every ember the
  // same soft edge at every radius, which reads as smoke lit from inside; a
  // wide skirt with a much tighter bright centre on top of it is what the eye
  // reads as a hard, shiny point of light. Premultiplied, to match the additive
  // blend.
  float skirt = exp(-r2 * 9.0);
  float core  = exp(-r2 * 54.0);
  float a = (skirt * 0.72 + core * 0.42) * vAlpha;

  // The specular pinpoint: an ember MID-GLINT burns its innermost few pixels
  // harder. This used to lift toward WHITE, which is how shine is usually done
  // and is exactly the wrong instrument here — white is all three channels at
  // once, so every glinting sprite was a small deposit of green and blue into a
  // glyph where sprites stack dozens deep. Confining it to the tight lobe did
  // not save it; the tight lobes overlap too. As brightness it survives the
  // move to a single channel unchanged, because a hotter ember and a whiter one
  // look identical when the colour is applied afterwards.
  //
  // Gated off for the glow and bloom passes: their sprites are 10x and 22x
  // larger, so the same point-coord radius covers a huge area of screen and the
  // pinpoint would become a blown disc instead of a highlight.
  float lit = vLit * (1.0 + core * uSpec * 1.6 * vGlint);

  // RGB is the brightness this ember contributes, premultiplied. ALPHA is zero:
  // an ember is light, and light does not hide the page it falls on. The veil
  // owns coverage (see VEIL_FRAG).
  gl_FragColor = vec4(vec3(lit * a), 0.0);
}
`;
