import { describe, expect, it } from 'vitest';
import {
  isValidSignaturePath,
  MAX_SIGNATURE_BYTES,
  PRESET_MARKS,
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
