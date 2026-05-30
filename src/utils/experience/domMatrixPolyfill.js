// Pure-JS DOMMatrix polyfill for server-side pdfjs text extraction.
//
// Why this exists: pdfjs-dist (loaded transitively by `pdf-parse`) needs a
// global `DOMMatrix` to do the affine transform math behind text
// positioning. In Node it tries to satisfy that by loading the native
// `@napi-rs/canvas` package via
// `createRequire(import.meta.url)("@napi-rs/canvas")` — see
// node_modules/pdfjs-dist/legacy/build/pdf.mjs around the `if (isNodeJS)`
// block. That runtime-created `require` is invisible to Next/@vercel/nft's
// static tracer, so the package's platform-specific `.node` binary often
// never makes it into the deployed serverless bundle. pdfjs then only
// `warn()`s that it "Cannot polyfill DOMMatrix", and the *next*
// `new DOMMatrix(...)` during extraction throws "DOMMatrix is not defined"
// — which surfaced as an empty Employment side (0%) on /about in
// production while working locally (where the binary is already hoisted).
//
// pdfjs's polyfill is gated on `if (!globalThis.DOMMatrix)`, so defining a
// correct DOMMatrix here *before* pdfjs is imported makes the whole native
// dependency unnecessary: pdfjs keeps ours, the canvas `require` failing
// becomes a harmless warning, and text extraction runs identically on every
// platform. Verified: with the canvas require forced to fail and only this
// polyfill present, `getText()` produces byte-identical output to a run
// with the native binary, and never touches `ImageData`/`Path2D` (those are
// only needed for actual rendering, which text extraction doesn't do).
//
// Only the 2D affine surface pdfjs's text path composes is implemented:
// construction from a [a,b,c,d,e,f] array / matrix-like object / nothing,
// plus multiplySelf, preMultiplySelf, translate, scale, and invertSelf.
class DOMMatrixPolyfill {
  constructor(init) {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    } else if (init && typeof init === "object") {
      this.a = init.a ?? 1;
      this.b = init.b ?? 0;
      this.c = init.c ?? 0;
      this.d = init.d ?? 1;
      this.e = init.e ?? 0;
      this.f = init.f ?? 0;
    }
  }

  // this = this * m  (right-multiply)
  multiplySelf(m) {
    const a = this.a * m.a + this.c * m.b;
    const b = this.b * m.a + this.d * m.b;
    const c = this.a * m.c + this.c * m.d;
    const d = this.b * m.c + this.d * m.d;
    const e = this.a * m.e + this.c * m.f + this.e;
    const f = this.b * m.e + this.d * m.f + this.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  // this = m * this  (left-multiply)
  preMultiplySelf(m) {
    const a = m.a * this.a + m.c * this.b;
    const b = m.b * this.a + m.d * this.b;
    const c = m.a * this.c + m.c * this.d;
    const d = m.b * this.c + m.d * this.d;
    const e = m.a * this.e + m.c * this.f + m.e;
    const f = m.b * this.e + m.d * this.f + m.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  translate(tx = 0, ty = 0) {
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  scale(sx = 1, sy) {
    if (sy == null) sy = sx;
    return this.multiplySelf({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
  }

  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (!det) {
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
      return this;
    }
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const e = -(a * this.e + c * this.f);
    const f = -(b * this.e + d * this.f);
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }
}

// Install the polyfill on `globalThis` if (and only if) no DOMMatrix is
// already present. Idempotent and side-effect-light: callers invoke it
// immediately before importing `pdf-parse` so pdfjs's `if (!globalThis
// .DOMMatrix)` guard sees ours. Leaving a pre-existing real DOMMatrix
// (e.g. a future Node runtime, or a platform where the native binary did
// load) untouched means we never regress an environment that already works.
export function ensureDomMatrixPolyfill() {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = DOMMatrixPolyfill;
  }
}
