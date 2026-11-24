'use client';

import { useEffect, useRef, useState } from 'react';

// The hero cinemagraph (owner, 2026-11-19): the case-study hero was a still,
// and the owner asked for the scene to live — the lake to ripple, the fog to
// drift, the lanterns to breathe. This draws the SAME image on a WebGL canvas
// over the <Image>, displacing and tinting only inside hand-authored masks
// (`hero.effect` in data.js); where every mask is zero the shader returns the
// exact texel, so the canvas is pixel-identical to the still beneath it and
// the fade-in is invisible as a transition.
//
// It is a deferred chunk (CLAUDE.md §5), reached only through HeroMedia's
// import(), warmed in idle time, and it must FAIL SAFE at every step: no
// WebGL context, a texture that never loads, a lost context, a chunk that
// never arrives — each leaves the static hero exactly as the server sent it.
// The canvas only fades in (`is-live`) after its first frame is on screen.
//
// No framer-motion (§6 does not apply: a rAF loop over a shader uniform, not
// an animation feature), and no work while it cannot be seen: the loop stops
// when the canvas leaves the viewport or the tab is hidden. Reduced motion
// never even downloads this file — HeroMedia holds the gate (the Ember
// Passage pattern), and the CSS hides the canvas as a second belt.
//
// Verified additive-colour lesson (#143, ember swarm): nothing here
// accumulates raw colour over many draws. One pass, and the lantern flicker
// MODULATES the baked glow (col * falloff * ±flicker) instead of adding a
// hue of its own, so the flames brighten and settle without shifting colour.

const MAX_BOX = 4;
const MAX_LIGHT = 4;
const DPR_CAP = 1.75;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// GLSL ES 1.00, WebGL1-safe: constant loop bounds with an early break on the
// uniform counts, value noise + 3-octave fbm, soft-edged box masks.
const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform float uAspect;
uniform vec4 uWater[${MAX_BOX}];
uniform int uWaterCount;
uniform vec4 uMist[${MAX_BOX}];
uniform int uMistCount;
uniform vec3 uLights[${MAX_LIGHT}];
uniform int uLightCount;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
float box(vec2 uv, vec4 b, vec2 feather) {
  vec2 lo = smoothstep(b.xy, b.xy + feather, uv);
  vec2 hi = smoothstep(b.zw, b.zw - feather, uv);
  return lo.x * lo.y * hi.x * hi.y;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;

  float water = 0.0;
  for (int i = 0; i < ${MAX_BOX}; i++) {
    if (i >= uWaterCount) break;
    water = max(water, box(uv, uWater[i], vec2(0.045, 0.035)));
  }

  // Reflection wobble: mostly vertical, carried along x like a slow swell,
  // with a touch of noise so no two crossings repeat. Tiny amplitudes: the
  // lake breathes, it does not churn.
  vec2 duv = uv;
  float ripple =
    sin(uv.x * 108.0 + t * 1.35) * 0.35 +
    sin(uv.x * 61.0 - t * 0.85 + uv.y * 42.0) * 0.4 +
    (noise(vec2(uv.x * 24.0, t * 0.35 + uv.y * 10.0)) - 0.5) * 1.3;
  duv.y += ripple * 0.0034 * water;
  duv.x += (noise(vec2(uv.y * 30.0, t * 0.22)) - 0.5) * 0.0022 * water;

  vec3 col = texture2D(uTex, duv).rgb;

  // Faint lantern-light glints sliding over the ripples.
  float glint = fbm(vec2(uv.x * 85.0, uv.y * 50.0 - t * 0.45));
  glint = smoothstep(0.74, 0.92, glint);
  col += vec3(1.0, 0.62, 0.24) * glint * 0.045 * water;

  float mist = 0.0;
  for (int i = 0; i < ${MAX_BOX}; i++) {
    if (i >= uMistCount) break;
    mist = max(mist, box(uv, uMist[i], vec2(0.06, 0.04)));
  }
  // Two fog layers drifting at different speeds; the cool haze is mixed in,
  // never added, so the scene's own colour grading survives underneath.
  float fogA = fbm(uv * vec2(3.0, 7.0) + vec2(t * 0.016, t * 0.004));
  float fogB = fbm(uv * vec2(5.2, 11.0) - vec2(t * 0.031, 0.0) + 7.3);
  float fog = smoothstep(0.35, 0.82, fogA * 0.65 + fogB * 0.35);
  col = mix(col, vec3(0.5, 0.58, 0.7) * (0.55 + 0.45 * fog), mist * fog * 0.13);

  for (int i = 0; i < ${MAX_LIGHT}; i++) {
    if (i >= uLightCount) break;
    vec3 L = uLights[i];
    vec2 d = (uv - L.xy) * vec2(1.0, uAspect);
    float fall = exp(-dot(d, d) / (L.z * L.z) * 3.0);
    float fi = float(i);
    float flicker =
      (noise(vec2(t * 1.7 + fi * 13.7, fi * 7.1)) - 0.5) +
      (noise(vec2(t * 4.3 + fi * 3.1, 2.0 + fi)) - 0.5) * 0.5;
    col += col * fall * flicker * 0.32;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`HeroSceneEffect shader: ${log}`);
  }
  return shader;
}

/** Flatten up to `max` tuples of `size` numbers into a padded Float32Array. */
function pack(tuples, size, max) {
  const out = new Float32Array(size * max);
  const n = Math.min(tuples?.length ?? 0, max);
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < size; k += 1) out[i * size + k] = tuples[i][k] ?? 0;
  }
  return { out, n };
}

export default function HeroSceneEffect({ src, width, height, effect }) {
  const canvasRef = useRef(null);
  const [live, setLive] = useState(false);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !effect || !src) return undefined;

    let gl;
    let raf = 0;
    let disposed = false;
    let inView = true;
    let pageVisible = typeof document === 'undefined' ? true : !document.hidden;
    const start = performance.now();

    const fail = () => {
      if (!disposed) setDead(true);
    };

    try {
      gl =
        canvas.getContext('webgl', { alpha: false, antialias: false }) ||
        canvas.getContext('experimental-webgl', { alpha: false, antialias: false });
    } catch {
      gl = null;
    }
    if (!gl || gl.isContextLost()) {
      fail();
      return undefined;
    }

    let program;
    let uTime;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
      }
      gl.useProgram(program);

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const water = pack(effect.water, 4, MAX_BOX);
      const mist = pack(effect.mist, 4, MAX_BOX);
      const lights = pack(effect.lights, 3, MAX_LIGHT);
      gl.uniform4fv(gl.getUniformLocation(program, 'uWater'), water.out);
      gl.uniform1i(gl.getUniformLocation(program, 'uWaterCount'), water.n);
      gl.uniform4fv(gl.getUniformLocation(program, 'uMist'), mist.out);
      gl.uniform1i(gl.getUniformLocation(program, 'uMistCount'), mist.n);
      gl.uniform3fv(gl.getUniformLocation(program, 'uLights'), lights.out);
      gl.uniform1i(gl.getUniformLocation(program, 'uLightCount'), lights.n);
      gl.uniform1f(gl.getUniformLocation(program, 'uAspect'), (height ?? 1000) / (width ?? 1600));
      gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
      uTime = gl.getUniformLocation(program, 'uTime');
    } catch {
      fail();
      return undefined;
    }

    // The still itself, as the texture: NPOT-safe (clamp + linear, no mips).
    let textureReady = false;
    const image = new window.Image();
    image.decoding = 'async';
    image.onload = () => {
      if (disposed) return;
      try {
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        textureReady = true;
        schedule();
      } catch {
        fail();
      }
    };
    image.onerror = fail;
    image.src = src;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    let first = true;
    const frame = () => {
      raf = 0;
      if (disposed || !textureReady) return;
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (first) {
        first = false;
        setLive(true);
      }
      schedule();
    };
    function schedule() {
      if (!disposed && !raf && inView && pageVisible && textureReady) {
        raf = requestAnimationFrame(frame);
      }
    }

    // No work while it cannot be seen.
    let io;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        schedule();
      });
      io.observe(canvas);
    }
    const onVisibility = () => {
      pageVisible = !document.hidden;
      schedule();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // A lost context is not restored; the still beneath carries on.
    const onLost = (e) => {
      e.preventDefault();
      fail();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    // No loseContext() here: a canvas has ONE context for life, and React's
    // dev StrictMode re-runs this effect on the SAME element — a context
    // deliberately lost in the first cleanup comes back lost to the second
    // mount, which read as "no WebGL" and withdrew the canvas for good. On a
    // real unmount the element is discarded and its context goes with it.
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      image.onload = null;
      image.onerror = null;
    };
  }, [src, width, height, effect]);

  if (dead) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`cs-hero-media__fx${live ? ' is-live' : ''}`}
    />
  );
}
