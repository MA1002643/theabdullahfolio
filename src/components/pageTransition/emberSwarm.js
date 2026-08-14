// WebGL plumbing for the Ember Passage. The maths lives in emberSwarmShader.js
// and emberField.js; this file owns the context, the two programs and the static
// attribute buffers, and knows where things sit on screen.
//
// A module-level SINGLETON, deliberately. A page transition is the worst moment
// to compile a shader or upload 2.5 MB of vertex data, so all of it happens once
// during idle time after first paint and the same canvas is re-parented into
// each overlay as it mounts. Moving a canvas between parents preserves its
// context, so every navigation after the first draws on frame one.

import {
  BLOOM_FRACTION,
  EMBERS_DESKTOP,
  EMBERS_MOBILE,
  EMBERS_TABLET,
  EMBER_FRAG,
  EMBER_VERT,
  GLOW_FRACTION,
  MAX_DPR,
  MAX_PIXELS,
  TINT_FRAG,
  TINT_VERT,
  VEIL_FRAG,
  VEIL_VERT,
} from './emberSwarmShader';
import { FIELD_VIEW, buildEmberField } from './emberField';
import { EMBER_PALETTE } from './passagePalette';

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('ember shader: ' + log);
  }
  return sh;
}

function link(gl, vertSrc, fragSrc) {
  const prog = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error('ember program: ' + log);
  }
  return prog;
}

class EmberSwarm {
  constructor() {
    this.ok = false;
    this.tried = false;
    this.canvas = null;
    this.gl = null;
  }

  init() {
    if (this.tried) return this.ok;
    this.tried = true;
    if (typeof document === 'undefined') return false;

    try {
      const field = buildEmberField();
      if (!field) return false;

      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;display:block;';

      const attrs = {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      };
      const gl =
        canvas.getContext('webgl', attrs) ||
        canvas.getContext('experimental-webgl', attrs);
      if (!gl) return false;

      // A lost context (tab backgrounded on mobile, driver reset) must not leave
      // the visitor behind a frozen overlay. Mark it broken; the overlay falls
      // back to the static branch on the next navigation.
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.ok = false;
      });

      this.veil = link(gl, VEIL_VERT, VEIL_FRAG);
      this.ember = link(gl, EMBER_VERT, EMBER_FRAG);
      this.tint = link(gl, TINT_VERT, TINT_FRAG);

      this.veilU = {};
      for (const n of [
        'uRes', 'uMark', 'uCover', 'uVeilLevel', 'uBloom',
      ]) {
        this.veilU[n] = gl.getUniformLocation(this.veil, n);
      }
      this.veilPos = gl.getAttribLocation(this.veil, 'aPos');

      this.emberU = {};
      for (const n of [
        'uRes', 'uT', 'uTime', 'uOrigin', 'uSpan', 'uMark',
        'uFieldOrigin', 'uFieldSize', 'uScale', 'uSizeMul', 'uAlphaMul',
        'uDrift', 'uSpec',
      ]) {
        this.emberU[n] = gl.getUniformLocation(this.ember, n);
      }

      this.tintU = {};
      for (const n of ['uField', 'uRes', 'uInk']) {
        this.tintU[n] = gl.getUniformLocation(this.tint, n);
      }
      this.tintPos = gl.getAttribLocation(this.tint, 'aPos');

      // The brightness field the veil and the swarm accumulate into, and which
      // TINT then colours. Allocated lazily at the first render, because its
      // size follows the drawing buffer.
      this.fieldTex = gl.createTexture();
      this.fieldFbo = gl.createFramebuffer();
      this.fieldW = 0;
      this.fieldH = 0;
      this.emberA = {
        start: gl.getAttribLocation(this.ember, 'aStart'),
        target: gl.getAttribLocation(this.ember, 'aTarget'),
        seed: gl.getAttribLocation(this.ember, 'aSeed'),
      };

      // One oversized triangle covers the viewport with a single primitive.
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );

      // Static, uploaded once. Nothing here changes for the life of the session.
      const mk = (data) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
      };
      this.bufStart = mk(field.starts);
      this.bufTarget = mk(field.targets);
      this.bufSeed = mk(field.seeds);
      this.total = field.count;

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);

      this.canvas = canvas;
      this.gl = gl;
      this.ok = true;
      return true;
    } catch {
      this.ok = false;
      return false;
    }
  }

  // Where everything sits, in CSS pixels. The overlay reads this to place the
  // destination label, so the DOM and the shader cannot drift apart.
  measure() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const wanted = cssW * dpr * cssH * dpr;
    const scale = wanted > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / wanted) : 1;
    const pxRatio = dpr * scale;

    // Sized off the SHORT edge so it stays proportionate in both orientations,
    // then capped against each axis independently. Both caps matter: on a
    // landscape phone the short edge is the HEIGHT, so a short-edge rule alone
    // would run the square past the left and right edges; the height cap keeps
    // the label below it on screen.
    const fieldCss = Math.min(
      Math.min(cssW, cssH) * 0.58,
      cssW * 0.82,
      cssH * 0.6,
      620,
    );

    // Fewer embers where the GPU is weaker. This is a draw-call count over a
    // buffer that is always allocated at full size, so it costs nothing to vary.
    const embers =
      cssW < 640 ? EMBERS_MOBILE : cssW < 1100 ? EMBERS_TABLET : EMBERS_DESKTOP;

    return {
      cssW, cssH, pxRatio,
      w: Math.max(1, Math.round(cssW * pxRatio)),
      h: Math.max(1, Math.round(cssH * pxRatio)),
      fieldCss,
      markX: cssW / 2,
      markY: cssH * 0.46,
      fieldX: cssW / 2 - fieldCss / 2,
      fieldY: cssH * 0.46 - fieldCss / 2,
      embers: Math.min(embers, this.total || embers),
    };
  }

  attach(parent) {
    if (!this.ok || !this.canvas) return;
    parent.appendChild(this.canvas);
  }

  detach() {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  bindEmberAttribs() {
    const gl = this.gl;
    const A = this.emberA;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufStart);
    gl.enableVertexAttribArray(A.start);
    gl.vertexAttribPointer(A.start, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTarget);
    gl.enableVertexAttribArray(A.target);
    gl.vertexAttribPointer(A.target, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSeed);
    gl.enableVertexAttribArray(A.seed);
    gl.vertexAttribPointer(A.seed, 3, gl.FLOAT, false, 0, 0);
  }

  // The offscreen brightness field, matched to the drawing buffer. RGBA8 and
  // NEAREST/CLAMP, which is what makes a non-power-of-two size legal in WebGL 1
  // — and NEAREST is also correct rather than merely permitted, since TINT
  // samples it exactly 1:1 and any filtering would only blur it against itself.
  sizeField(w, h) {
    if (this.fieldW === w && this.fieldH === h) return true;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fieldTex, 0,
    );
    const complete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      // Nothing can be drawn without somewhere to accumulate into, so treat it
      // like a lost context: the overlay demotes to the static branch, which
      // needs no GL at all.
      this.ok = false;
      return false;
    }
    this.fieldW = w;
    this.fieldH = h;
    return true;
  }

  render(state) {
    if (!this.ok) return null;
    const gl = this.gl;
    const layout = this.measure();
    if (this.canvas.width !== layout.w || this.canvas.height !== layout.h) {
      this.canvas.width = layout.w;
      this.canvas.height = layout.h;
    }

    if (!this.sizeField(layout.w, layout.h)) return null;

    const r = layout.pxRatio;
    gl.viewport(0, 0, layout.w, layout.h);

    const markPx = [layout.markX * r, layout.markY * r];
    const originX = (state.originX ?? layout.cssW / 2) * r;
    const originY = (state.originY ?? layout.cssH / 2) * r;
    const span =
      Math.max(
        Math.hypot(originX, originY),
        Math.hypot(layout.w - originX, originY),
        Math.hypot(originX, layout.h - originY),
        Math.hypot(layout.w - originX, layout.h - originY),
      ) || 1;

    // The site's ember — the homepage headline's own `#ff6d05` — which is what
    // every part of this burns, on every route. See passagePalette.js.
    const pal = EMBER_PALETTE.gl;

    // === pass 1: accumulate BRIGHTNESS offscreen ============================
    // Nothing below draws in colour. Both programs write a single 0..1 number
    // per pixel — how much light is there — and the ink arrives in pass 2.
    // Additive throughout, onto a cleared buffer, so the veil and the swarm sum
    // into one field rather than compositing over one another.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE);

    // --- veil: the darkness, and the pool of light the mark casts into it ---
    gl.useProgram(this.veil);
    gl.uniform2f(this.veilU.uRes, layout.w, layout.h);
    gl.uniform2f(this.veilU.uMark, markPx[0], markPx[1]);
    gl.uniform1f(this.veilU.uCover, state.cover);
    gl.uniform1f(this.veilU.uVeilLevel, pal.veilLevel);
    gl.uniform1f(this.veilU.uBloom, state.bloom || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.veilPos);
    gl.vertexAttribPointer(this.veilPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(this.veilPos);

    // --- embers: additive, so they only ever ADD light ---
    gl.useProgram(this.ember);
    const U = this.emberU;
    gl.uniform2f(U.uRes, layout.w, layout.h);
    gl.uniform1f(U.uT, state.t);
    gl.uniform1f(U.uTime, state.time);
    gl.uniform2f(U.uOrigin, originX, originY);
    gl.uniform1f(U.uSpan, span);
    gl.uniform2f(U.uMark, markPx[0], markPx[1]);
    gl.uniform2f(U.uFieldOrigin, layout.fieldX * r, layout.fieldY * r);
    gl.uniform1f(U.uFieldSize, layout.fieldCss * r);
    // Ember sizes and travel distances are relative to the MARK, not the screen,
    // so the swarm reads identically on a phone and a 4K display.
    gl.uniform1f(U.uScale, r * (layout.fieldCss / 460));
    gl.uniform1f(U.uDrift, pal.driftLevel);

    this.bindEmberAttribs();

    // How much a weaker tier has to lean on each ember to end up as bright as a
    // desktop one. Work the accumulation through and the mark's brightness per
    // pixel comes out as (ember count x alpha) and NOTHING else: a sprite's area
    // and the glyph's area both scale with the mark, so they cancel. A phone
    // drawing 40k embers therefore renders the mark at 44% of desktop's light
    // however big the mark is, unless its alpha is raised by exactly the ratio
    // it is short by.
    //
    // This used to be handled by picking the tier COUNTS for matched brightness
    // rather than matched cost, which only ever appeared to work because the old
    // renderer clipped: every tier ran past 1.0 and saturated to the same white,
    // so the difference was invisible until the clipping went. Buying it back
    // with alpha instead is free, where buying it with embers is the one thing
    // the weak-GPU tier exists to avoid — so the counts below are now a pure
    // cost dial, and this is what keeps the mark looking the same on a phone.
    const tierGain = Math.min(EMBERS_DESKTOP / Math.max(layout.embers, 1), 3);

    // Widest and faintest first. The three passes are one light: a broad pool
    // that gives the mark an atmosphere, a mid halo that gives it a body, and
    // the cores that give it its edge. Drawn largest-first only for legibility —
    // additive blending is order-independent.
    //
    // The alphas below are the BRIGHTNESS budget, and they are set so the
    // densest part of the glyph lands just under 1.0. Over-driving them no
    // longer costs colour (that is the point of accumulating brightness), but
    // it still costs the mark's texture: past 1.0 the field flat-tops and the
    // glyph body turns into a solid slab with the embers washed out of it.
    //
    // There is a FLOOR as well as a ceiling. Each add rounds to 1/255, so a pass
    // whose per-sprite contribution falls under half a step contributes nothing
    // at all — the old bloom pass sat right on that edge. Keep every alpha here
    // comfortably above ~0.004 and spend any reduction on the sprite count or
    // size instead.
    //
    // Neither blurred pass draws the specular pinpoint (uSpec 0): at 22x and 10x
    // the sprite size, its radius covers enough screen to read as a blown disc.
    gl.uniform1f(U.uSpec, 0.0);
    gl.uniform1f(U.uSizeMul, 22.0);
    gl.uniform1f(U.uAlphaMul, 0.0055 * tierGain);
    gl.drawArrays(gl.POINTS, 0, Math.floor(layout.embers * BLOOM_FRACTION));

    // Glow pass: a minority of the swarm, much larger and much fainter.
    // Additive overdraw is the whole cost here, which is why it is a fraction
    // rather than the full swarm at a bigger size.
    //
    // WIDER AND FAINTER than it used to be (7 / 0.058), and that pairing is the
    // whole trick. Measured on an M1: this pass, not the cores, is what was
    // washing the mark out. Its sprites are big enough to overlap heavily
    // INSIDE the glyph, so most of its light landed on the glyph body rather
    // than around it. Cutting the alpha while growing the sprite keeps roughly
    // the same light in the frame but spends it on a broad halo, so the glow
    // reads as bigger, not brighter.
    gl.uniform1f(U.uSizeMul, 10.0);
    gl.uniform1f(U.uAlphaMul, 0.0075 * tierGain);
    gl.drawArrays(gl.POINTS, 0, Math.floor(layout.embers * GLOW_FRACTION));

    // Core pass: every ember, small and hot, and the only pass that glints.
    gl.uniform1f(U.uSpec, 1.0);
    gl.uniform1f(U.uSizeMul, 1.0);
    gl.uniform1f(U.uAlphaMul, 0.115 * tierGain);
    gl.drawArrays(gl.POINTS, 0, layout.embers);

    const A = this.emberA;
    gl.disableVertexAttribArray(A.start);
    gl.disableVertexAttribArray(A.target);
    gl.disableVertexAttribArray(A.seed);

    // === pass 2: give all of it the one colour =============================
    // The ink multiplied through the brightness field, once, onto the canvas —
    // so every lit pixel of this overlay is `#ff6d05 x something`, and the
    // alpha the veil accumulated decides how much of the page still shows.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.tint);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.uniform1i(this.tintU.uField, 0);
    gl.uniform2f(this.tintU.uRes, layout.w, layout.h);
    gl.uniform3fv(this.tintU.uInk, pal.ink);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.tintPos);
    gl.vertexAttribPointer(this.tintPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(this.tintPos);

    return layout;
  }
}

let instance = null;

export function getSwarm() {
  if (!instance) instance = new EmberSwarm();
  return instance;
}

// Compile and upload during idle time, so the first click of the session draws
// on frame one like every click after it. Returns a cancel.
export function warmSwarm() {
  if (typeof window === 'undefined') return () => {};
  const supportsIdle = typeof window.requestIdleCallback === 'function';
  const schedule = supportsIdle
    ? (cb) => window.requestIdleCallback(cb, { timeout: 5000 })
    : (cb) => setTimeout(cb, 1400);
  const handle = schedule(() => getSwarm().init());
  return () => {
    if (supportsIdle) window.cancelIdleCallback(handle);
    else clearTimeout(handle);
  };
}

export { FIELD_VIEW };
