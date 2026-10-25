// Is this WebGL context drawn by the CPU?
//
// A browser with no usable GPU (blocklisted driver, VM, remote desktop, and
// every headless CI runner) still hands out WebGL, rasterised in software by
// SwiftShader, llvmpipe or Windows' Basic Render Driver. A continuously
// animated scene then runs on the main thread: /projects/1 measured 3.9 fps
// with 7.9 s of every 8 s spent in long tasks (2026-10-25), and each click or
// keypress queued behind 250-640 ms frames. That is what timed the project
// pages out on the mobile CI runner. A scene that knows can draw a still
// frame instead.

// Renderer strings as browsers report them, e.g.
//   "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)"
//   "llvmpipe (LLVM 15.0.7, 256 bits)"
//   "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)"
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render driver|software rasterizer/i;

/**
 * @param {string | null | undefined} renderer the context's renderer string.
 * @returns {boolean} true only when the string names a software rasteriser;
 *   an unknown or missing string is treated as hardware.
 */
export function isSoftwareRendererName(renderer) {
  return typeof renderer === 'string' && SOFTWARE.test(renderer);
}

/**
 * @param {WebGLRenderingContext | WebGL2RenderingContext | null | undefined} gl
 * @returns {boolean}
 */
export function isSoftwareRenderer(gl) {
  if (!gl) return false;
  try {
    // Firefox reports the real (sanitised) renderer here; Chrome and Safari
    // say only "WebKit WebGL", so fall back to the debug extension, which
    // Firefox flags as deprecated and is therefore not asked first.
    const plain = gl.getParameter(gl.RENDERER);
    if (isSoftwareRendererName(plain)) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? isSoftwareRendererName(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : false;
  } catch {
    return false;
  }
}
