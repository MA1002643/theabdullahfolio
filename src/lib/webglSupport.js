// Can this browser give us a WebGL context at all?
//
// Not every browser can. WebGL can be switched off in settings or by policy,
// a driver can be blocklisted with no software fallback, and headless Firefox
// on a CI runner has none ("AllowWebgl2:false restricts context creation").
// three.js does not degrade there: `new WebGLRenderer()` logs an error and
// throws, and under react-three-fiber that throw escaped the Canvas and took
// the whole route down to Next's bare error screen. Every sub-page mounts the
// ambient aurora, so on such a browser no sub-page rendered at all (nightly
// Firefox E2E, 2026-10-25 to 2026-11-06).
//
// So ask first, on a throwaway canvas, and keep the static background when the
// answer is no. The probe context is released at once, because browsers cap
// live WebGL contexts and evict the oldest when the cap is reached.

let cached;

/** For tests: forget the cached answer. */
export function resetWebGLSupportCache() {
  cached = undefined;
}

/**
 * @returns {boolean} true when a WebGL2 or WebGL1 context can be created.
 *   Cached for the page's lifetime. Always false outside a browser.
 */
export function canCreateWebGL() {
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    cached = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
