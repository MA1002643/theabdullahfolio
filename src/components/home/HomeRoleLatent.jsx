'use client';
import { useEffect, useRef, useState } from 'react';
import { useSceneGate } from '@/hooks/useSceneGate';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { usePointerCapability } from '@/hooks/usePointerCapability';
import { onMediaChange } from '@/lib/mediaQuery';
import { flicker } from './homeSceneLights';
import { createEngraving, meanCoverage, restSeparations } from './homeRoleEngraving';

// The homepage role line, set on a security plate.
//
// "SOFTWARE ENGINEER" is printed the way a value document prints: solid,
// legible intaglio type struck over an engraved ground. The ground is a field
// of one-device-pixel guilloche with a second, near-identical engraving laid
// over it at a slightly finer pitch and a fifth of a degree of rotation, and
// the words are cut into that overlay as a half-pitch displacement — so they
// exist ONLY as the moiré between the two, surfacing out of the fringe field as
// its phase drifts and as the pointer tilts the plate. See homeRoleEngraving.js
// for the model.
//
// ── THE BASE LINE IS NEVER THE LATENT LINE ──────────────────────────────────
// This is the risk the feature is built to manage, and it is managed
// structurally rather than by tuning. The <h2> stays an ordinary heading
// holding an ordinary text node, painted by `.hero-role` in globals.css as
// solid engraving ink at full contrast — it is what assistive technology,
// search, find-in-page and text selection see, it needs no JavaScript, and it
// is untouched by anything below. The canvas is a sibling BEHIND it and never
// draws a single pixel of the words the reader is meant to read.
//
// So the latent layer can only ever add. If the canvas never mounts (reduced
// motion, no context, a GPU reset, JS off) the line is finished and correct;
// nothing has to hand over, because nothing was ever taken away. And the
// engraving keeps a cleared RESERVE around every glyph, so even at full ink the
// hairlines never crowd a letterform.
//
// ── THE TYPE IS NOT TOUCHED ─────────────────────────────────────────────────
// Same four breakpoints (1rem / 1.2 / 1.4 / 1.6), same 300 weight, same 4px
// tracking, same `leading-snug` and `mt-1`; `page.js` still passes them as the
// same Tailwind classes. At a 300 weight that is a ~1.4px stem, which rules out
// every surface treatment there is — but this effect does not want stem area.
// It wants a plate, and it gets sharper as the type gets smaller, because the
// hairline stays one device pixel while everything around it condenses.

// The plate, in em of the ROLE LINE's own font size, so it re-proportions
// itself at every breakpoint.
//
// The vertical pads are EQUAL, and that is load-bearing rather than tidy. The
// latent word is two stacked lines with the printed line living in the gap
// between them, so anything that moves the plate's centre off the printed
// line's centre moves the printed line toward one of the two ghosts. These
// were once 0.85 above and 1.6 below — the plate hung downward to stay clear of
// the hero name — and the visible result was the printed line sitting almost on
// top of the upper ghost with a wide gap under it. Equal pads put the plate's
// centre on the type's centre, which is where the ghost block is hung from, so
// both ghost lines sit the same distance away and take the same edge fade.
//
// Which leaves `PAD_TOP_EM` as the plate's OVERHANG above the heading, and the
// canvas is absolutely positioned, so nothing in layout reserves it. The hero
// name is cleared by `.hero-role`'s 1.3em top margin in globals.css, sized in
// this same unit precisely so it tracks this constant. Raising this number
// without raising that margin prints the engraving under ABDULLAH — which is
// what a flat 4px `mt-1` did, most visibly on a phone.
const PAD_X_EM = 1.25;
const PAD_TOP_EM = 1.225;
const PAD_BOTTOM_EM = 1.225;

// The latent word, set as its own type: heavier and larger than the printed
// line, because a latent image has to be several line-pitches thick to hold a
// phase step at all. Fitted at runtime to a fraction of the printed line's
// measured width, so the two never collide as sizes change.
const LATENT_WEIGHT = 800;
const LATENT_FILL = 0.72;
const LATENT_TRACK_EM = 0.13;
const LATENT_GAP = 0.62; // line gap, as a fraction of cap height
const LATENT_MIN_EM = 1.15;
const LATENT_MAX_EM = 2.4;

// Line spacing, as a fraction of the latent cap height. Tying it to the latent
// type rather than to the viewport keeps a latent stroke a consistent number of
// pitches thick — under about two and the phase step stops reading, over about
// four and the ground turns coarse.
//
// Note what this makes the pitch: constant in CSS pixels, so the FRINGE is the
// same size on every display, while the line inside it stays one DEVICE pixel
// and so gets finer as the display gets denser. That is the correct split. The
// floor, though, has to be in device pixels — no display can resolve a 1px line
// on a 1.4px pitch, and asking for one returns a flat tint instead of line art.
// So a 1x screen renders the finest grating it actually has, and a 2x screen
// renders the design.
const PITCH_OF_CAP = 1 / 13;
const PITCH_MIN = 2.6;
const PITCH_MAX = 6;

// Hairlines are defined in device pixels, and by 2x they already render as a
// sub-pixel stroke. Past that the cost climbs with the square while the
// difference falls below the display's own reconstruction.
const MAX_DPR = 2;

// The clear space held around every printed glyph, in em, and how hard the
// dilation is pushed. This is what stops the ground from crowding a 1.4px stem.
const RESERVE_EM = 0.1;
const RESERVE_GAIN = 2.6;

// How much of each edge the plate spends fading out. Generous, so the ground
// reads as a cartouche rather than as a rectangle with a texture in it.
const FADE_X = 0.3;
const FADE_Y = 0.34;

// The ground's ink, given as the MEAN alpha of the finished plate rather than
// as a peak, and converted to a peak per-plate by dividing out the coverage the
// pitch actually produces. Stated this way it is a real budget: the plate lifts
// the backdrop under the printed line by this much, so it is the number that
// decides the line's contrast, and it stays put when the pitch changes between
// a phone and a desktop. The fringe swings either side of it, and that swing is
// what carries the word.
const INK_DENSITY = 0.086;

// The fringe's own clock: one full sweep of the plate every ~13s, with a slow
// wander on top so it never reads as a metronome. The wander is the causeway's
// own noise function, which is what ties this plate to the scene it sits in.
const DRIFT = 0.075;
const WANDER = 0.22;
const WANDER_SPEED = 0.09;
const WANDER_SEED = 0x41b3;

// The iris turns very slowly at rest, so the ink under the line is never quite
// the ink that was there a minute ago. A full turn takes about four minutes.
const IRIS_DRIFT = 0.004;

// ── THE ARRIVAL: A PRESS COMING INTO REGISTER ───────────────────────────────
// The plate does not fade in. It is PRINTED, and a press starts out of
// register: the three separations land at grossly wrong angles and pitches,
// beat against one another at a period of a few pixels, and then converge.
// Because the moiré period goes as the reciprocal of the misregistration, that
// convergence makes the fringes rush outward and lock — chaos resolving into
// the resting design, which is simply the converged end of the same curve. No
// crossfade is needed between the arrival and the idle state because there is
// no seam: they are one continuous function of `reg`.
//
// Misregistration per separation, in the same units as their resting values.
// The first ink is the reference and never moves; the other two arrive wrong.
const MIS_TILT = [0, 26, -19];
const MIS_PITCH = [0, 0.05, -0.042];
const MIS_PHASE = [0, 0.37, -0.24];

// When each ink reaches the sheet, and how long its own wipe takes.
const INK_AT_MS = [260, 430, 590];
const INK_WIPE_MS = 420;

// The sheet is embossed before it is inked: `chroma` opens from a colourless
// blind impression into full colour over this window.
const CHROMA_FROM_MS = 300;
const CHROMA_MS = 900;

// The registration itself. `REG_MS` is the convergence; the curve below is a
// damped oscillator, so the plates overshoot slightly and settle rather than
// easing politely into place — a real press has mass.
const REG_FROM_MS = 320;
const REG_MS = 1560;
const REG_DAMP = 4.2;
const REG_RING = 7.5;

// The latent word is cut in as registration completes — before the plates have
// fully locked, so it resolves out of the last of the interference.
const LATENT_FROM_MS = 1480;
const LATENT_MS = 980;

// The printed line is struck last, once the ground it sits on is real. That
// timing lives in `hero-role-strike` in globals.css rather than here — CSS owns
// the type's arrival so it cannot be lost along with this loop — and the two
// stay in step by starting together rather than by sharing a number.

// While the plates are out of register the field is far denser than at rest, so
// the ink is held back and released as they lock. Without this the arrival
// flares white before it resolves.
const CHAOS_INK = 0.62;

// The iris spins during the arrival and settles into its slow drift.
const IRIS_SPIN = 0.55;

// The pointer as a tilt. X sweeps the fringe (a bit over one beat across the
// reach, so the word passes through); Y opens and closes the angle between the
// two engravings, which leans and re-spaces the fringe. Both are smoothed —
// a plate has mass, and an unsmoothed fringe reads as a cursor-tracking gimmick.
const TILT_REACH_EM = 3.2;
const TILT_SWEEP = 0.55;
const TILT_FAN = 0.7;
const TILT_TAU = 0.18;

// The two foreground lanterns on the causeway sit either side of this line, so
// each end of the plate answers to the one on its own side. A few percent of
// ink: the plate is a still object that is very slightly alive.
const BREATH = 0.2;
const LANTERN_L = { seed: 0x5f1a, speed: 0.55 };
const LANTERN_R = { seed: 0x2c73, speed: 0.62 };

// 60fps only while the pointer is actually tilting the plate; the idle drift is
// far too slow to need it, and this layer shares the hero with three others.
const FRAME_MS = 16;
const FRAME_MS_IDLE = 33;
const FRAME_MS_LITE = 50;
const MAX_DT = 0.05;

const transformChar = (ch, mode) => {
  if (mode === 'uppercase') return ch.toUpperCase();
  if (mode === 'lowercase') return ch.toLowerCase();
  return ch;
};

const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** The printed words, uppercased and broken into the most balanced two lines. */
const latentLines = (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.map((w) => w.toUpperCase());
  let at = 1;
  let best = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(
      words.slice(0, i).join(' ').length - words.slice(i).join(' ').length,
    );
    if (diff < best) {
      best = diff;
      at = i;
    }
  }
  return [words.slice(0, at).join(' '), words.slice(at).join(' ')].map((l) =>
    l.toUpperCase(),
  );
};

/** Separable box blur, used to dilate the printed glyphs into a reserve. */
const dilate = (src, W, H, r) => {
  if (r < 1) return src;
  const win = r * 2 + 1;
  const mid = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const row = y * W;
    let sum = 0;
    for (let i = -r; i <= r; i += 1) sum += src[row + Math.min(W - 1, Math.max(0, i))];
    for (let x = 0; x < W; x += 1) {
      mid[row + x] = sum / win;
      sum +=
        src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x += 1) {
    let sum = 0;
    for (let i = -r; i <= r; i += 1) sum += mid[Math.min(H - 1, Math.max(0, i)) * W + x];
    for (let y = 0; y < H; y += 1) {
      out[y * W + x] = sum / win;
      sum +=
        mid[Math.min(H - 1, y + r + 1) * W + x] - mid[Math.max(0, y - r) * W + x];
    }
  }
  return out;
};

const HomeRoleLatent = ({ children, className = '' }) => {
  const wrapRef = useRef(null);
  const textRef = useRef(null);
  const canvasRef = useRef(null);
  const { mounted, running, lite } = useSceneGate(wrapRef);
  const canHover = usePointerCapability();

  // The one place this layer steps outside `useSceneGate`. That hook folds
  // reduced-motion into `mounted`, which is right for a layer whose whole
  // content is motion — but this one's content is a still engraving that
  // happens to drift. Under reduced motion it still mounts and paints exactly
  // one frame, phase-aligned so the latent word is at full contrast: the plate
  // is there, the word is legible in it, and nothing ever moves.
  const revealed = useLoaderRevealed();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    return onMediaChange(mq, apply);
  }, []);

  const still = revealed && reduced;
  const show = mounted || still;

  const pointerRef = useRef({ x: 0, y: 0, present: false });

  // The strike is a property of THIS HEADING, not of the effect that happens to
  // be running the plate, so it is tracked per mounted instance rather than per
  // effect run. `useSceneGate` deliberately pauses without unmounting — the
  // element has to survive for the IntersectionObserver to see it come back —
  // so the effect below re-runs on every pause/resume, on a `lite` or
  // pointer-capability change, and on the reduced-motion handover. A flag local
  // to the effect would re-arm the animation on each of those, and the animation
  // opens at `opacity: 0` for 2.25s: the reader would watch an already-printed
  // line vanish and re-print every time they scrolled the hero back into view.
  // Only a real unmount clears this, which is also the only case that gets a
  // fresh <h2> to strike.
  const struckRef = useRef(false);

  useEffect(() => {
    if (!running || !canHover) return undefined;
    const onMove = (e) => {
      pointerRef.current.x = e.clientX;
      pointerRef.current.y = e.clientY;
      pointerRef.current.present = true;
    };
    const onLeave = () => {
      pointerRef.current.present = false;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [running, canHover]);

  useEffect(() => {
    if (!show || (!running && !still)) return undefined;
    const wrap = wrapRef.current;
    const el = textRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !el || !canvas) return undefined;

    const ctx = canvas.getContext('2d');
    const maskCanvas = document.createElement('canvas');
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !maskCtx) return undefined;

    // Everything the loop needs, replaced wholesale by `rebuild`, and null
    // until the first successful measure — which is also the loop's guard.
    let R = null;

    // The two foreground lanterns either side of the line, resolved to a
    // per-column multiplier. Declared up here because the still frame needs it
    // as much as the loop does.
    const fillBreath = (breath, w, t) => {
      const l = flicker(LANTERN_L.seed, t, LANTERN_L.speed);
      const r = flicker(LANTERN_R.seed, t, LANTERN_R.speed);
      for (let x = 0; x < w; x += 1) {
        const u = w > 1 ? x / (w - 1) : 0.5;
        breath[x] = 1 + BREATH * (l * (1 - u) + r * u - 0.5);
      }
    };

    const rebuild = () => {
      R = null;
      const node = el.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;

      const cs = window.getComputedStyle(el);
      const fontPx = parseFloat(cs.fontSize) || 16;
      const family = cs.fontFamily;
      const printFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${family}`;

      const range = document.createRange();
      range.selectNodeContents(el);
      const inkRect = range.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      if (inkRect.width < 1 || inkRect.height < 1) return;

      // Per-character boxes straight from layout, so the reserve lands on the
      // DOM text to the pixel at any tracking, family or size — no font-metric
      // arithmetic, and no letter-spacing drift accumulating across the line.
      const raw = node.nodeValue || '';
      const mode = cs.textTransform;
      const glyphs = [];
      for (let i = 0; i < raw.length; i += 1) {
        if (!raw[i].trim()) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width < 0.01) continue;
        glyphs.push({ ch: transformChar(raw[i], mode), x: r.left - inkRect.left });
      }
      range.detach?.();
      if (!glyphs.length) return;

      const padX = PAD_X_EM * fontPx;
      const padTop = PAD_TOP_EM * fontPx;
      const cssW = inkRect.width + padX * 2;
      const cssH = inkRect.height + padTop + PAD_BOTTOM_EM * fontPx;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const W = Math.max(4, Math.round(cssW * dpr));
      const H = Math.max(4, Math.round(cssH * dpr));

      maskCanvas.width = W;
      maskCanvas.height = H;

      // ── Fit the latent word ─────────────────────────────────────────────
      // To the PRINTED line's measured width, not to a breakpoint: the ghost
      // is a proportion of the thing it sits behind, whatever that measures.
      const lines = latentLines(raw);
      if (!lines.length) return;
      const lineWidth = (line, size, track) => {
        maskCtx.font = `${LATENT_WEIGHT} ${size}px ${family}`;
        let w = 0;
        for (let i = 0; i < line.length; i += 1) w += maskCtx.measureText(line[i]).width;
        return w + track * Math.max(0, line.length - 1);
      };
      let size = fontPx * 1.6;
      for (let pass = 0; pass < 2; pass += 1) {
        const track = LATENT_TRACK_EM * size;
        const widest = Math.max(...lines.map((l) => lineWidth(l, size, track)));
        if (widest < 1) return;
        size = Math.min(
          fontPx * LATENT_MAX_EM,
          Math.max(fontPx * LATENT_MIN_EM, (size * LATENT_FILL * inkRect.width) / widest),
        );
      }
      maskCtx.font = `${LATENT_WEIGHT} ${size}px ${family}`;
      const capM = maskCtx.measureText('H');
      const capH = capM.actualBoundingBoxAscent || size * 0.72;
      const gap = LATENT_GAP * capH;
      const blockH = lines.length * capH + (lines.length - 1) * gap;

      const pitch = Math.min(
        PITCH_MAX,
        Math.max(PITCH_MIN, capH * dpr * PITCH_OF_CAP),
      );

      // ── Mask 1: the latent word ─────────────────────────────────────────
      // Centred on the plate, which sits a little below the printed line — so
      // the ghost hangs behind and under it rather than doubling it.
      maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      maskCtx.clearRect(0, 0, cssW, cssH);
      maskCtx.fillStyle = '#fff';
      maskCtx.textBaseline = 'alphabetic';
      maskCtx.textAlign = 'left';
      const track = LATENT_TRACK_EM * size;
      // Hung from the PRINTED LINE's own centre, not the plate's. With equal
      // pads the two are the same point, but saying so here is what guarantees
      // the printed line lands exactly midway between the two ghost lines —
      // rather than leaving that resting on a pair of padding constants staying
      // equal to each other forever.
      const inkCentreY = padTop + inkRect.height / 2;
      let baseline = inkCentreY - blockH / 2 + capH;
      for (const line of lines) {
        let x = (cssW - lineWidth(line, size, track)) / 2;
        maskCtx.font = `${LATENT_WEIGHT} ${size}px ${family}`;
        for (let i = 0; i < line.length; i += 1) {
          maskCtx.fillText(line[i], x, baseline);
          x += maskCtx.measureText(line[i]).width + track;
        }
        baseline += capH + gap;
      }
      const latentPx = maskCtx.getImageData(0, 0, W, H).data;
      // Raw coverage, 0..1. The step each ink takes is the ink's own business
      // (see REST_LATENT in homeRoleEngraving.js) and the engine multiplies it
      // in — scaling here as well, as this once did, silently halved every
      // step and cost the word most of its contrast. An antialiased mask edge
      // still lands on a partial displacement, which is what keeps the word's
      // outline from tearing the field.
      const latent = new Float32Array(W * H);
      for (let i = 0; i < latent.length; i += 1) latent[i] = latentPx[i * 4 + 3] / 255;

      // ── Mask 2: the printed glyphs, dilated into a reserve ──────────────
      maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      maskCtx.clearRect(0, 0, cssW, cssH);
      maskCtx.font = printFont;
      maskCtx.fillStyle = '#fff';
      const pm = maskCtx.measureText('H');
      const asc = pm.fontBoundingBoxAscent || pm.actualBoundingBoxAscent || fontPx * 0.8;
      const desc = pm.fontBoundingBoxDescent || pm.actualBoundingBoxDescent || fontPx * 0.2;
      // The one number no client rect carries is the BASELINE. Recovered from
      // the font's own ascent plus half of whatever leading the rect holds in
      // excess of the content box — correct whether the engine returned the
      // content area or the full line box, since the excess is zero in the
      // first case.
      const printBase = padTop + Math.max(0, inkRect.height - (asc + desc)) / 2 + asc;
      for (const g of glyphs) maskCtx.fillText(g.ch, padX + g.x, printBase);
      const printPx = maskCtx.getImageData(0, 0, W, H).data;
      const print = new Float32Array(W * H);
      for (let i = 0; i < print.length; i += 1) print[i] = printPx[i * 4 + 3] / 255;
      const spread = dilate(print, W, H, Math.round(RESERVE_EM * fontPx * dpr));

      // ── The gain field: where ink is allowed, and how much ──────────────
      const envX = new Float32Array(W);
      for (let x = 0; x < W; x += 1) {
        const u = W > 1 ? x / (W - 1) : 0.5;
        envX[x] = smoothstep(Math.min(u, 1 - u) / FADE_X);
      }
      const envY = new Float32Array(H);
      for (let y = 0; y < H; y += 1) {
        const v = H > 1 ? y / (H - 1) : 0.5;
        envY[y] = smoothstep(Math.min(v, 1 - v) / FADE_Y);
      }
      const gain = new Float32Array(W * H);
      for (let y = 0; y < H; y += 1) {
        const row = y * W;
        const ey = envY[y];
        if (ey <= 0) continue;
        for (let x = 0; x < W; x += 1) {
          const clear = Math.min(1, spread[row + x] * RESERVE_GAIN);
          const g = envX[x] * ey * (1 - clear);
          // Zeroed rather than left tiny: the inner loop skips on this, so the
          // threshold is also the layer's per-frame cost control.
          gain[row + x] = g > 0.004 ? g : 0;
        }
      }

      const engraving = createEngraving({ W, H, pitch, gain, latent });

      canvas.width = W;
      canvas.height = H;
      canvas.style.left = `${inkRect.left - wrapRect.left - padX}px`;
      canvas.style.top = `${inkRect.top - wrapRect.top - padTop}px`;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      // Colour now varies per pixel — the inks ride an iris sweep and the moiré
      // shows up in hue as well as in density — so the buffer is written in
      // full each frame rather than having its RGB baked once.
      const image = ctx.createImageData(W, H);

      R = {
        engraving,
        image,
        W,
        H,
        emPx: fontPx,
        breath: new Float32Array(W),
        // The peak alpha that lands the intended mean density on THIS plate's
        // grating — see `meanCoverage`. Without it a phone, whose pitch is
        // pinned to the device-pixel floor, prints a ground half again heavier
        // than a desktop's from the same constant.
        ink: INK_DENSITY / meanCoverage(pitch),
      };
    };

    // Under reduced motion the plate is a still print: there is no loop to pick
    // a rebuild up afterwards, so every rebuild has to end in its own frame.
    const paintStill = () => {
      if (!R) return;
      fillBreath(R.breath, R.W, 0);
      // Fully registered, fully inked, and phase-aligned so the one frame a
      // reduced-motion reader gets is the frame where the word is showing.
      // One lock per ink — they are cut at different tilts and pitches, so they
      // do not arrive at the plate's centre together and cannot be brought
      // there by a shared offset.
      const seps = restSeparations();
      const locks = R.engraving.alignAtCentre(seps);
      for (let i = 1; i < seps.length; i += 1) seps[i].phase += locks[i];
      R.engraving.paint(R.image.data, {
        seps,
        ink: R.ink,
        chroma: 1,
        shift: 0,
        breath: R.breath,
      });
      ctx.putImageData(R.image, 0, 0);
    };
    // Every listener this effect adds is removed in `teardown` and every timer
    // it starts is cleared there, so none of them can reach a dead run. One
    // thing can: `document.fonts.ready` is a promise, and a promise has no
    // unsubscribe — a `.then` registered by a run that has since been torn down
    // still fires. It would land on the LIVE canvas, because this layer pauses
    // without unmounting and the element is therefore shared between runs:
    // `rebuild` reassigns `canvas.width`, which CLEARS the bitmap, and rewrites
    // the inline geometry from measurements taken for a run that no longer
    // owns the plate. The flag is read in `refresh` rather than at each call
    // site because that is the single door every rebuild comes through.
    let disposed = false;
    const refresh = () => {
      if (disposed) return;
      rebuild();
      if (still) paintStill();
    };

    // Coalesced, because a ResizeObserver fires on every frame of a window drag
    // and a rebuild rasterises two masks, dilates one of them and re-cuts the
    // plate. The first build is not deferred — only the reactions are.
    let pending = 0;
    const schedule = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(refresh, 120);
    };

    refresh();
    // A fallback face has different advances, so the first plate can be built
    // against metrics the page is about to stop using.
    document.fonts?.ready?.then(refresh).catch(() => {});

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      ro.observe(el);
    } else {
      window.addEventListener('resize', schedule);
    }

    // Zoom, or the window dragged to a display with a different scale factor.
    // A dppx query only ever matches ONE ratio, so it is re-armed after each
    // change — and the hairline is defined in device pixels, so this layer has
    // to rebuild for it rather than let the compositor rescale.
    let stopDpr = () => {};
    const watchDpr = () => {
      stopDpr();
      if (!window.matchMedia) return;
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const onChange = () => {
        schedule();
        watchDpr();
      };
      stopDpr = onMediaChange(mq, onChange);
    };
    watchDpr();

    let lost = false;
    const onLost = (e) => {
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
      refresh();
    };
    canvas.addEventListener('contextlost', onLost);
    canvas.addEventListener('contextrestored', onRestored);

    const teardown = () => {
      disposed = true;
      window.clearTimeout(pending);
      ro?.disconnect();
      if (!ro) window.removeEventListener('resize', schedule);
      stopDpr();
      canvas.removeEventListener('contextlost', onLost);
      canvas.removeEventListener('contextrestored', onRestored);
      // The class is NOT dropped here. It once was, to keep a remount from
      // finding the type already struck — but a remount destroys this <h2> and
      // takes the class with it, so that was never the case this ran in. What
      // it ran in was every pause: teardown fires whenever `running` drops, and
      // re-arming `hero-role-strike` on resume hides a heading that had already
      // arrived. The animation is `both`, so left alone it holds the line at
      // full opacity for as long as the element lives, which is the point of
      // handing the type to CSS in the first place. See `struckRef`.
      R = null;
    };

    // Under reduced motion the frame `refresh` already painted is the whole
    // layer. It still keeps its observers, so a resize or a zoom re-prints the
    // plate — a still image has to stay correct, not just stay still.
    if (still) return teardown;

    const t0 = performance.now();
    let raf = 0;
    let last = 0;
    let first = true;
    let tiltPhase = 0;
    let tiltFan = 0;

    // The plates' resting registration, and the live copy the loop mutates.
    // Allocated once so a frame never touches the allocator.
    const rest = restSeparations();
    const seps = restSeparations();

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (lost || !R) return;

      const active = Math.abs(tiltPhase) > 0.002 || Math.abs(tiltFan) > 0.002;
      const frameMs = lite ? FRAME_MS_LITE : active ? FRAME_MS : FRAME_MS_IDLE;
      if (!first && now - last < frameMs) return;
      const dt = Math.min(MAX_DT, first ? 1 / 60 : (now - last) / 1000);
      last = now;
      first = false;

      const { engraving, image, W, emPx, breath, ink } = R;
      const elapsed = now - t0;
      const t = elapsed / 1000;

      // ── Tilt ────────────────────────────────────────────────────────────
      let wantPhase = 0;
      let wantFan = 0;
      const pointer = pointerRef.current;
      if (canHover && pointer.present) {
        const box = canvas.getBoundingClientRect();
        const reach = TILT_REACH_EM * emPx;
        const dx = (pointer.x - (box.left + box.width / 2)) / (box.width / 2 + reach);
        const dy = (pointer.y - (box.top + box.height / 2)) / (box.height / 2 + reach);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          // Falls off with distance rather than switching at the box edge —
          // a plate catches the light before your hand is over it.
          const near = (1 - Math.abs(dx)) * (1 - Math.abs(dy));
          wantPhase = dx * TILT_SWEEP * near;
          wantFan = dy * TILT_FAN * near;
        }
      }
      const k = 1 - Math.exp(-dt / TILT_TAU);
      tiltPhase += (wantPhase - tiltPhase) * k;
      tiltFan += (wantFan - tiltFan) * k;

      // ── Registration ────────────────────────────────────────────────────
      // A damped oscillator, not an ease: the plates overshoot their marks and
      // ring into place. `reg` is 0 at the start of the convergence and 1 once
      // locked, and EVERY other quantity below is a function of it, which is
      // why the arrival has no seam where it hands over to the idle state.
      const tau = Math.max(0, (elapsed - REG_FROM_MS) / REG_MS);
      const reg =
        tau <= 0
          ? 0
          : 1 -
            Math.exp(-REG_DAMP * tau) *
              (Math.cos(REG_RING * tau) + (REG_DAMP / REG_RING) * Math.sin(REG_RING * tau));
      const off = 1 - reg;

      // The word is cut in as the last of the interference resolves.
      const latentIn = clamp01((elapsed - LATENT_FROM_MS) / LATENT_MS);
      const latentAmt = latentIn * latentIn * (3 - 2 * latentIn);

      const chroma = clamp01((elapsed - CHROMA_FROM_MS) / CHROMA_MS);

      // ── Phase ───────────────────────────────────────────────────────────
      const phase =
        t * DRIFT +
        WANDER * (flicker(WANDER_SEED, t, WANDER_SPEED) - 0.5) +
        tiltPhase;

      // ── The three plates ────────────────────────────────────────────────
      for (let i = 0; i < seps.length; i += 1) {
        const s = seps[i];
        s.tilt = rest[i].tilt * (1 + tiltFan) + MIS_TILT[i] * off;
        s.pitch = rest[i].pitch + MIS_PITCH[i] * off;
        s.latent = rest[i].latent * latentAmt;
        // Only the plates that carry the beat take the drift; the first ink is
        // the reference the others are measured against, and a reference that
        // moves is not one.
        s.phase = (i === 0 ? 0 : phase) + MIS_PHASE[i] * off;
        s.level = clamp01((elapsed - INK_AT_MS[i]) / INK_WIPE_MS);
      }

      fillBreath(breath, W, t);
      engraving.paint(image.data, {
        seps,
        // Held back while the field is dense with misregistration, released as
        // the plates lock. Without this the arrival flares before it resolves.
        ink: ink * (CHAOS_INK + (1 - CHAOS_INK) * reg),
        chroma,
        shift: t * IRIS_DRIFT + IRIS_SPIN * off,
        breath,
      });
      ctx.putImageData(image, 0, 0);

      // Hand the printed line over to CSS on the frame the plate first paints,
      // so the two arrivals share a start. From here the type's whole
      // appearance is a compositor animation that runs to completion on its
      // own — this loop can die on the very next frame and the heading still
      // arrives. See `hero-role-strike` in globals.css. Once per heading, not
      // once per loop: a resumed plate re-prints under type that is already
      // struck, which is the correct order for a second arrival.
      if (!struckRef.current) {
        struckRef.current = true;
        el.classList.add('is-printing');
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      teardown();
    };
  }, [show, running, still, lite, canHover]);

  return (
    <div ref={wrapRef} className="hero-role-plate">
      {show ? <canvas ref={canvasRef} className="hero-role-ground" aria-hidden="true" /> : null}
      <h2 ref={textRef} className={`hero-role ${className}`.trim()}>
        {children}
      </h2>
    </div>
  );
};

export default HomeRoleLatent;
