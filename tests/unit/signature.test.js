import { describe, expect, it } from 'vitest';
import {
  isValidSignaturePath,
  MAX_SIGNATURE_BYTES,
  MAX_SIGNATURE_COMMANDS,
  MAX_SIGNATURE_POINTS,
  PRESET_MARKS,
  SIGNATURE_VIEWBOX,
  rescalePoint,
  rescaleStrokes,
  strokesToPath,
} from '@/lib/guestbook/signature';

// The signature grammar is a security boundary: these strings are untrusted
// input rendered into the DOM. The suite pins BOTH directions — everything
// the pad/presets legitimately produce passes, and every escape hatch out of
// the grammar is rejected.
describe('isValidSignaturePath', () => {
  it('accepts the shapes the signature pad serialises', () => {
    expect(isValidSignaturePath('M 10.5 20.1 L 30 25')).toBe(true);
    expect(isValidSignaturePath('M 0 0 Q 50 10 100 40')).toBe(true);
    expect(isValidSignaturePath('M 1 1 C 10 5 20 35 30 20')).toBe(true);
    // Multi-stroke (several M subpaths) and a closed loop.
    expect(isValidSignaturePath('M 1 1 L 5 5 M 10 10 L 20 20')).toBe(true);
    expect(isValidSignaturePath('M 1 1 L 5 5 Z')).toBe(true);
    // Commas are legal separators.
    expect(isValidSignaturePath('M 10,20 L 30,25')).toBe(true);
    // A dot: zero-length line (rendered as a disc by round caps).
    expect(isValidSignaturePath('M 50 20 L 50 20')).toBe(true);
  });

  it('accepts every preset mark (the fallback must pass its own gate)', () => {
    for (const mark of PRESET_MARKS) {
      expect(isValidSignaturePath(mark.d), mark.id).toBe(true);
    }
  });

  it('rejects non-strings and empties', () => {
    expect(isValidSignaturePath(null)).toBe(false);
    expect(isValidSignaturePath(undefined)).toBe(false);
    expect(isValidSignaturePath(42)).toBe(false);
    expect(isValidSignaturePath('')).toBe(false);
    expect(isValidSignaturePath('   ')).toBe(false);
  });

  it('rejects commands outside M/L/Q/C/Z', () => {
    expect(isValidSignaturePath('M 1 1 A 5 5 0 0 1 10 10')).toBe(false); // arcs
    expect(isValidSignaturePath('m 1 1 l 5 5')).toBe(false); // lowercase
    expect(isValidSignaturePath('M 1 1 H 50')).toBe(false);
    expect(isValidSignaturePath('M 1 1 T 5 5')).toBe(false);
  });

  it('rejects numbers outside the grammar', () => {
    expect(isValidSignaturePath('M -1 1 L 5 5')).toBe(false); // negative
    expect(isValidSignaturePath('M 101 1 L 5 5')).toBe(false); // out of range
    expect(isValidSignaturePath('M 1.234 1 L 5 5')).toBe(false); // 3 decimals
    expect(isValidSignaturePath('M 1e2 1 L 5 5')).toBe(false); // scientific
    expect(isValidSignaturePath('M .5 1 L 5 5')).toBe(false); // bare decimal
  });

  it('rejects malformed command structure', () => {
    expect(isValidSignaturePath('L 5 5')).toBe(false); // must start with M
    expect(isValidSignaturePath('M 1 1')).toBe(false); // no draw command
    expect(isValidSignaturePath('M 1 1 Z')).toBe(false); // Z is not a draw
    expect(isValidSignaturePath('M 1 1 Q 5 5 10')).toBe(false); // missing arg
    expect(isValidSignaturePath('M 1 1 L 5 5 6')).toBe(false); // stray number
  });

  it('rejects anything that smells like markup or CSS', () => {
    expect(isValidSignaturePath('M 1 1 L 5 5 <script>')).toBe(false);
    expect(isValidSignaturePath('M 1 1 L 5 5" onload="x')).toBe(false);
    expect(isValidSignaturePath('url(#x) M 1 1 L 5 5')).toBe(false);
  });

  it('enforces the byte cap', () => {
    // A path just over 4KB of valid-looking commands.
    const big = `M 1 1 ${'L 50 20 '.repeat(600)}`.trim();
    expect(big.length).toBeGreaterThan(MAX_SIGNATURE_BYTES);
    expect(isValidSignaturePath(big)).toBe(false);
  });
});

// The pad's serialiser and its point budget, pinned against the SAME validator
// the route runs: the client must never be able to draw something the server
// rejects. "Far corner" = a pointer captured and dragged off the pad's
// bottom-right, which clamps to the widest numerals the grammar can emit.
describe('strokesToPath + MAX_SIGNATURE_POINTS', () => {
  const bytes = (s) => new TextEncoder().encode(s).length;
  const FAR = { x: 1e6, y: 1e6 }; // off the pad → clamps to 100.0 / 40.0
  const WORST_BYTES_PER_POINT = 26; // `M 100.0 40.0 L 100.0 40.0` + separator

  it('derives the point cap from the byte and command caps', () => {
    expect(MAX_SIGNATURE_POINTS * WORST_BYTES_PER_POINT).toBeLessThanOrEqual(
      MAX_SIGNATURE_BYTES,
    );
    expect(MAX_SIGNATURE_POINTS * 2).toBeLessThanOrEqual(MAX_SIGNATURE_COMMANDS);
  });

  it('the worst case at the cap — every point a far-corner dot — validates', () => {
    const dots = Array.from({ length: MAX_SIGNATURE_POINTS }, () => [FAR]);
    const d = strokesToPath(dots);
    expect(bytes(d)).toBeLessThanOrEqual(MAX_SIGNATURE_BYTES);
    expect(isValidSignaturePath(d)).toBe(true);
  });

  it('a continuous far-corner stroke at the cap validates too', () => {
    const stroke = Array.from({ length: MAX_SIGNATURE_POINTS }, () => FAR);
    const d = strokesToPath([stroke]);
    expect(bytes(d)).toBeLessThanOrEqual(MAX_SIGNATURE_BYTES);
    expect(isValidSignaturePath(d)).toBe(true);
  });

  it('the previous 160-point cap did NOT fit — the regression this pins', () => {
    const dots = Array.from({ length: 160 }, () => [FAR]);
    expect(bytes(strokesToPath(dots))).toBeGreaterThan(MAX_SIGNATURE_BYTES);
    expect(isValidSignaturePath(strokesToPath(dots))).toBe(false);
  });

  it('clamps each axis to its OWN viewbox bound', () => {
    // Below the pad: y must clamp to the 40-tall space, not to 100.
    const d = strokesToPath([[{ x: 10, y: 1e6 }, { x: 20, y: 1e6 }]]);
    expect(d).toBe(`M 10.0 ${SIGNATURE_VIEWBOX.height}.0 L 20.0 ${SIGNATURE_VIEWBOX.height}.0`);
    expect(isValidSignaturePath(d)).toBe(true);
    // Left/above the pad clamps to 0.
    expect(strokesToPath([[{ x: -5, y: -5 }]])).toBe('M 0.0 0.0 L 0.0 0.0');
  });

  it('scales a real pad box into the signature space and smooths through midpoints', () => {
    // A 300×120 css px pad → sx = sy = 1/3.
    const sx = SIGNATURE_VIEWBOX.width / 300;
    const sy = SIGNATURE_VIEWBOX.height / 120;
    const stroke = [
      { x: 30, y: 60 },
      { x: 90, y: 30 },
      { x: 150, y: 90 },
      { x: 210, y: 60 },
    ];
    const d = strokesToPath([stroke], sx, sy);
    expect(d).toBe('M 10.0 20.0 Q 30.0 10.0 40.0 20.0 Q 50.0 30.0 60.0 25.0 L 70.0 20.0');
    expect(isValidSignaturePath(d)).toBe(true);
  });

  it('returns null with nothing to draw', () => {
    expect(strokesToPath([])).toBe(null);
    expect(strokesToPath([[]])).toBe(null);
  });
});

// Resize handling: ink recorded in one css box must mean the same signature
// in another. The pad's fit() rescales strokes through these before redrawing.
describe('rescaleStrokes', () => {
  const PAD = { w: 300, h: 120 };
  const stroke = [
    { x: 30, y: 60 },
    { x: 90, y: 30 },
    { x: 150, y: 90 },
    { x: 210, y: 60 },
  ];
  const pathIn = (strokes, box) =>
    strokesToPath(strokes, SIGNATURE_VIEWBOX.width / box.w, SIGNATURE_VIEWBOX.height / box.h);

  it('scales each axis by its own ratio', () => {
    expect(rescalePoint({ x: 30, y: 60 }, PAD, { w: 600, h: 60 })).toEqual({ x: 60, y: 30 });
    expect(rescaleStrokes([[{ x: 30, y: 60 }]], PAD, { w: 600, h: 60 })).toEqual([[{ x: 60, y: 30 }]]);
  });

  it('keeps the serialised signature invariant across a non-uniform resize', () => {
    const before = pathIn([stroke], PAD);
    for (const box of [{ w: 450, h: 90 }, { w: 150, h: 240 }, { w: 1000, h: 40 }]) {
      const after = pathIn(rescaleStrokes([stroke], PAD, box), box);
      expect(after, `${box.w}×${box.h}`).toBe(before);
    }
  });

  it('is a no-op for the same box and for a hidden (0×0) pad', () => {
    const same = rescaleStrokes([stroke], PAD, { w: 300, h: 120 });
    expect(same[0]).toBe(stroke);
    expect(rescaleStrokes([stroke], PAD, { w: 0, h: 0 })[0]).toBe(stroke);
    expect(rescaleStrokes([stroke], { w: 0, h: 0 }, PAD)[0]).toBe(stroke);
    expect(rescaleStrokes([stroke], null, PAD)[0]).toBe(stroke);
  });
});
