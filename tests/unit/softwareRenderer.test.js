import { describe, expect, it } from 'vitest';

import { isSoftwareRenderer, isSoftwareRendererName } from '@/lib/softwareRenderer';

// The project scene draws a still frame on a CPU renderer (2026-10-25: the
// continuous loop starved the main thread and timed /projects/* out on the
// mobile CI runner). This pins which renderer strings count as software, and
// that anything unrecognised keeps the full animated scene.

const SOFTWARE = [
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
  'Google SwiftShader',
  'llvmpipe (LLVM 15.0.7, 256 bits)',
  'softpipe',
  'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
];

const HARDWARE = [
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'Apple GPU',
  'Adreno (TM) 730',
  'Mali-G710',
  'WebKit WebGL',
];

function fakeContext({ renderer, unmasked }) {
  const ext = unmasked === undefined ? null : { UNMASKED_RENDERER_WEBGL: 0x9246 };
  return {
    RENDERER: 0x1f01,
    getParameter: (p) => (p === 0x1f01 ? renderer : p === 0x9246 ? unmasked : null),
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? ext : null),
  };
}

describe('isSoftwareRendererName', () => {
  it.each(SOFTWARE)('treats %s as software', (name) => {
    expect(isSoftwareRendererName(name)).toBe(true);
  });

  it.each(HARDWARE)('treats %s as hardware', (name) => {
    expect(isSoftwareRendererName(name)).toBe(false);
  });

  it('treats a missing string as hardware', () => {
    expect(isSoftwareRendererName(undefined)).toBe(false);
    expect(isSoftwareRendererName(null)).toBe(false);
    expect(isSoftwareRendererName('')).toBe(false);
  });
});

describe('isSoftwareRenderer', () => {
  it('reads the plain RENDERER first (Firefox reports the real one there)', () => {
    expect(isSoftwareRenderer(fakeContext({ renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' }))).toBe(true);
  });

  it('falls back to the debug extension when RENDERER is generic (Chrome, Safari)', () => {
    const gl = fakeContext({ renderer: 'WebKit WebGL', unmasked: SOFTWARE[0] });
    expect(isSoftwareRenderer(gl)).toBe(true);
    expect(isSoftwareRenderer(fakeContext({ renderer: 'WebKit WebGL', unmasked: HARDWARE[0] }))).toBe(false);
  });

  it('keeps the animated scene when nothing can be read', () => {
    expect(isSoftwareRenderer(fakeContext({ renderer: 'WebKit WebGL' }))).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
    const throwing = { RENDERER: 1, getParameter: () => { throw new Error('context lost'); } };
    expect(isSoftwareRenderer(throwing)).toBe(false);
  });
});
