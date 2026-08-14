'use client';
import { useEffect, useRef, useState } from 'react';
import { useSceneGate } from '@/hooks/useSceneGate';
import {
  IW,
  IH,
  PLATE_OPACITY,
  FLAME_HALF_R,
  FLAME_TIP_R,
  FLAME_BASE_R,
  flameSources,
  coverProjection,
  flameFlicker,
  flameLean,
  flameLift,
} from './homeSceneLights';
import { FIRE_VERT, FIRE_FRAG, FIRE_BOX } from './homeScenePlateShader';

// The flames, alive — THE FALLBACK TIER. A WebGL pass that moves each lantern's
// OWN photographed flame; nothing is ever drawn over the picture.
//
// ── WHY THIS IS NO LONGER THE DEFAULT ───────────────────────────────────────
// It used to be the only flame tier, on the reasoning that /projects buys its
// fire with a 1.8-5 MB video and the LCP-critical entry route cannot spend
// that. The premise was right and the conclusion was wrong: the homepage was
// ALREADY shipping a clip for its lake, and the flames were missing from it
// only because they live inside the post keep-outs, which exist to stop the
// model swimming the housings. Cutting flame-sized windows back into that same
// mask costs 33 KB, not another megabyte (bake-causeway-water.mjs § 5-6).
//
// So HomeSceneVideo carries the flames now, and this layer runs only when that
// clip cannot play. It is still the right thing to run then — procedural in the
// one way that cannot look synthetic, by RESAMPLING the photograph rather than
// painting onto it — but it is honestly the weaker of the two. What it cannot
// do is BURN: it moves a photograph of a flame, so the tongue leans and rises
// but never changes shape. Measured on the shipped loop, the filmed flames move
// at 17.3 temporal std against 0.02 for the frozen plate this warps.
//
// The relight this replaced drew two additive radial gradients per lantern,
// because the only size the rig carried was `r`, a detected core RADIUS.
// Measured off the plate, the flames are tongues about 1.8x taller than they
// are wide (FLAME_HALF_R and friends in the rig), so what that actually drew
// was a glowing blob over a frozen flame. A circle is not a flame at any
// tuning. An fbm fire pass was then tried on top of the warp and rejected too:
// at the size these flames occupy on screen, synthetic detail reads as noise
// laid over a photograph. Both variants below therefore add nothing at all.
//
// ── AND WHY IT NO LONGER DOES THE WATER ─────────────────────────────────────
// It used to. A procedural wave field lived in this file — travelling bands,
// crest glints, spreading rings — and every version was rejected, because they
// share one flaw: they are STRUCTURE INVENTED AND LAID OVER a photograph, so
// they read as an effect rather than as the lake. HomeSceneVideo carries the
// water now. Two findings from that work are worth keeping:
//
//   1. Displacement alone cannot animate this lake. Measured on the running
//      page, displacing the near water by 8px changed the frame by a mean of
//      0.77 of 255 — the water is smooth dark navy, so nearly every pixel the
//      warp swapped was the colour of the one it replaced.
//   2. A layer that REPLACES plate pixels must pre-multiply by the plate's
//      opacity and composite at CSS opacity 1 (PLATE_OPACITY in the rig).
//      Stacking a second 0.9 on the plate's own is what made the row-shear
//      tier band, and the video tier holds the same invariant by baking the
//      0.9 into its encode.
//
// ── WHY NOT THREE.JS ────────────────────────────────────────────────────────
// It is already a dependency, but nothing else on this route pulls it in, and
// this is one small quad per lantern and a single program. Raw WebGL keeps the
// entry route's bundle exactly where it is.

// ── Which flame treatment ───────────────────────────────────────────────────
//   'light' — the plate's own flame is not moved at all. Only its brightness
//             breathes, and only on the warm pixels, so the dark glass never
//             pulses. An enclosed flame in still air genuinely barely moves.
//   'warp'  — additionally leans and lifts the flame's OWN pixels, so the
//             tongue rises. Measured at 1.92 frame-to-frame against 0.54 for
//             'light'. Still nothing synthetic drawn over it.
const FLAME_VARIANT = 'warp';

// How hard the synthetic fire is added over the photographed flame.
const FIRE_GAIN = 0;

// A source smaller than this on screen has no flame to move; between the two it
// ramps, so a distant post fades out of the effect instead of popping.
const FADE_MIN_PX = 2.5;
const FADE_FULL_PX = 7.0;

// 60fps for the full tier. The other scene layers throttle to 30 because they
// are CPU canvas fills; this is one fullscreen quad plus a dozen tiny ones on
// the GPU, and flowing water is the one effect here that visibly suffers at 30.
const FRAME_MS = 16;
const FRAME_MS_LITE = 50;

const compile = (gl, type, src) => {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // Surfaced rather than swallowed: a shader that fails to compile makes the
    // whole layer silently do nothing, which is very hard to tell apart from
    // "the effect is just subtle".
    console.error('[HomeSceneLivePlate] shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
};

const link = (gl, vertSrc, fragSrc, attribs) => {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[HomeSceneLivePlate] link failed:', gl.getProgramInfoLog(p));
    return null;
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i += 1) {
    const name = gl.getActiveUniform(p, i).name.replace('[0]', '');
    u[name] = gl.getUniformLocation(p, name);
  }
  const a = {};
  for (const name of attribs) a[name] = gl.getAttribLocation(p, name);
  return { p, u, a };
};

const texture = (gl) => {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  // CLAMP + LINEAR + no mipmaps: legal for a non-power-of-two texture in
  // WebGL1, which the 2560x1440 plate is. Clamping also means a warp that
  // strays off the edge repeats the border rather than wrapping the far side
  // of the picture in.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
};

const HomeSceneLivePlate = ({ onUnsupported }) => {
  const canvasRef = useRef(null);
  const { mounted, running, lite } = useSceneGate(canvasRef);
  const [plate, setPlate] = useState(null);

  // Reuse the browser's already-decoded plate: same URL the <img> resolved, so
  // this is a cache hit and never a second network request.
  useEffect(() => {
    if (!mounted) return undefined;
    const el = document.querySelector('img.home-backdrop');
    const src = el?.currentSrc || el?.src;
    if (!src) return undefined;
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setPlate(img);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  useEffect(() => {
    if (!running || !plate) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl =
      canvas.getContext('webgl', { alpha: true, antialias: false, depth: false }) ||
      canvas.getContext('experimental-webgl', { alpha: true, antialias: false, depth: false });
    if (!gl) {
      // No WebGL: tell the parent so it can mount the 2D fallback instead of
      // leaving the page with a dead canvas over it.
      onUnsupported?.();
      return undefined;
    }

    const fire = link(gl, FIRE_VERT, FIRE_FRAG, ['aPos']);
    if (!fire) {
      onUnsupported?.();
      return undefined;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const plateTex = texture(gl);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, plate);

    // Pre-multiplied output, so the blend takes the colour as-is and weights
    // only the destination. Everything this layer emits is already scaled by
    // its own coverage and by PLATE_OPACITY.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const sources = flameSources();

    let proj = null;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      if (!canvas.width || !canvas.height) return;
      proj = coverProjection(canvas.width, canvas.height);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const frameMs = lite ? FRAME_MS_LITE : FRAME_MS;
    let raf = 0;
    let last = 0;
    let lost = false;
    const t0 = performance.now();

    const onLost = (e) => {
      // Default behaviour is to make the context permanently dead; preventing
      // it at least leaves the door open, and stopping the loop means we are
      // not calling into a dead context every frame in the meantime.
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (lost || now - last < frameMs) return;
      last = now;
      const t = (now - t0) / 1000;

      const cw = canvas.width;
      const ch = canvas.height;
      if (!cw || !ch || !proj) return;
      const { scale, ox, oy } = proj;

      gl.clear(gl.COLOR_BUFFER_BIT);

      // ── Fire ────────────────────────────────────────────────────────────
      gl.useProgram(fire.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(fire.a.aPos);
      gl.vertexAttribPointer(fire.a.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, plateTex);
      gl.uniform1i(fire.u.uPlate, 0);
      gl.uniform2f(fire.u.uRes, cw, ch);
      gl.uniform3f(fire.u.uProj, scale, ox, oy);
      gl.uniform2f(fire.u.uIWH, IW, IH);
      gl.uniform1f(fire.u.uTime, t);
      gl.uniform1f(fire.u.uPlateAlpha, PLATE_OPACITY);

      for (let n = 0; n < sources.length; n += 1) {
        const s = sources[n];
        const rU = s.r / IW;
        const rV = s.r / IH;

        // The box reaches further above the flame than below, so its centre is
        // not the flame's centre. Small margin so the feather never meets the
        // quad edge, which would clip it to a straight line.
        const halfU = rU * FIRE_BOX.half * 1.06;
        const halfV = rV * ((FIRE_BOX.top + FIRE_BOX.bottom) / 2) * 1.06;
        const boxV = s.v - rV * ((FIRE_BOX.top - FIRE_BOX.bottom) / 2);

        // Seeds match the ones HomeSceneGlow uses for the same source, so a
        // lantern's light and its flame breathe together. Uncorrelated light
        // and flame is a subtle but real tell.
        const seed = s.i + 61;
        const fade = Math.min(
          1,
          Math.max(0, (s.r * scale - FADE_MIN_PX) / (FADE_FULL_PX - FADE_MIN_PX)),
        );
        if (fade <= 0) continue;

        gl.uniform4f(fire.u.uBox, s.u, boxV, halfU, halfV);
        gl.uniform2f(fire.u.uOrigin, s.u, s.v);
        gl.uniform2f(fire.u.uRUV, rU, rV);
        gl.uniform4f(
          fire.u.uAnim,
          // Never gutters to nothing: an enclosed flame is starved of draught,
          // and one that drops to zero reads as a bulb failing.
          0.78 + 0.44 * flameFlicker(seed, t),
          flameLean(seed, t),
          flameLift(seed, t),
          n * 3.7,
        );
        gl.uniform4f(fire.u.uShape, FLAME_HALF_R, FLAME_TIP_R, FLAME_BASE_R, FIRE_GAIN);
        // uFade scales the WARP only (fire is off in both variants), so the
        // light-only treatment is this uniform going to zero — brightness is
        // applied to the sampled pixel independently and survives it.
        gl.uniform1f(fire.u.uFade, FLAME_VARIANT === 'warp' ? fade : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.deleteTexture(plateTex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(fire.p);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [running, lite, plate, onUnsupported]);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      // Between the plate (-z-50) and the ambient glow (-z-[45]): this layer
      // REPLACES plate pixels, so it must sit directly on the plate and below
      // anything additive.
      //
      // NO opacity class, deliberately. The plate's 0.9 is pre-multiplied into
      // the shader output instead — see PLATE_OPACITY. Adding it back here is
      // exactly the bug the row-shear tier shipped with.
      className="home-backdrop pointer-events-none -z-[46]"
      aria-hidden
    />
  );
};

export default HomeSceneLivePlate;
