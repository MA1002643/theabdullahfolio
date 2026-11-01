import { describe, expect, it } from 'vitest';

import { formatAgeFor, localDigits, localNumber } from '@/components/home/localeFormat';
import { formatAge } from '@/utils/formatAge';

// The maintenance header's locale-aware formatters (issue #82). The contract
// is asymmetric on purpose: English must be byte-identical to the hand-rolled
// formatters the strip was tuned around, and every other locale goes through
// Intl.

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('formatAgeFor', () => {
  it.each([5e3, 125e3, 3 * 3600e3 + 4 * 60e3, 2 * 86400e3 + 3600e3])(
    'is formatAge itself in English (%i ms)',
    (ms) => {
      expect(formatAgeFor(ago(ms), NOW, 'en')).toBe(formatAge(ago(ms), NOW));
    },
  );

  it('uses Intl.RelativeTimeFormat elsewhere', () => {
    const expected = new Intl.RelativeTimeFormat('fr', { style: 'short', numeric: 'auto' }).format(
      -2,
      'minute',
    );
    expect(formatAgeFor(ago(125e3), NOW, 'fr')).toBe(expected);
  });

  it('returns empty for an unparseable date in any locale', () => {
    expect(formatAgeFor('not a date', NOW, 'en')).toBe('');
    expect(formatAgeFor('not a date', NOW, 'de')).toBe('');
  });
});

describe('localNumber / localDigits', () => {
  it('leave English untouched — raw numbers, no grouping', () => {
    expect(localNumber(1234, 'en')).toBe(1234);
    expect(localDigits('1234', 'en')).toBe('1234');
  });

  it("write each digit in the locale's own set", () => {
    // Persian's CLDR default is extended Arabic-Indic digits.
    const fa = new Intl.NumberFormat('fa', { useGrouping: false }).format(1234);
    expect(localDigits('1234', 'fa')).toBe(fa);
    expect(localDigits('#12', 'fa')).toBe(`#${new Intl.NumberFormat('fa').format(12)}`);
    expect(localNumber(7, 'fa')).toBe(new Intl.NumberFormat('fa').format(7));
  });
});
