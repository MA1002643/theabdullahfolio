import { describe, expect, it } from 'vitest';

import { formatNumber, formatRelativeMs, intlTag } from '@/i18n/format';
import { journeyDateLabel } from '@/i18n/data';

// Locale-aware formatting (issue #82). Two promises: English stays BRITISH
// English (the site formatted with en-GB before #82, and a URL segment of
// plain `en` must not quietly Americanise it), and every other locale gets its
// own CLDR digits and grammar with nothing hard-coded.

describe('intlTag', () => {
  it('formats English as British English', () => {
    expect(intlTag('en')).toBe('en-GB');
    const date = new Date(Date.UTC(2026, 9, 25));
    expect(new Intl.DateTimeFormat(intlTag('en'), { dateStyle: 'long', timeZone: 'UTC' }).format(date)).toBe(
      '25 October 2026',
    );
  });

  it('uses the registry tag otherwise', () => {
    expect(intlTag('zh')).toBe('zh-Hans');
    expect(intlTag('ar')).toBe('ar');
  });
});

describe('digits follow the locale', () => {
  it('uses extended Arabic-Indic digits in Persian, as its CLDR default says', () => {
    expect(formatNumber(1234, 'fa')).toMatch(/[۰-۹]/);
  });

  it('follows CLDR for Arabic rather than hard-coding a digit set', () => {
    // CLDR's default for bare `ar` is Western digits; regional variants that
    // prefer Arabic-Indic (ar-EG, ar-SA) get them through the same API. The
    // point is that the platform decides — nothing in the site picks digits.
    expect(formatNumber(1234, 'ar')).toBe(new Intl.NumberFormat('ar').format(1234));
  });

  it('keeps Western digits where the CLDR default says so', () => {
    expect(formatNumber(1234, 'hi')).toMatch(/^[0-9,]+$/);
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
});

describe('formatRelativeMs', () => {
  it('speaks each language’s own grammar', () => {
    expect(formatRelativeMs(5 * 60_000, 'en')).toBe('5 minutes ago');
    expect(formatRelativeMs(5 * 60_000, 'es')).toBe('hace 5 minutos');
    expect(formatRelativeMs(2 * 3600_000, 'ja')).toMatch(/2\s?時間前/);
  });

  it('treats a negative delta as the future', () => {
    expect(formatRelativeMs(-3 * 86_400_000, 'en')).toBe('in 3 days');
  });
});

describe('journeyDateLabel', () => {
  const entry = { dateLabel: 'APR 2023 — JUL 2024', start: '2023-04', end: '2024-07' };

  it('keeps the hand-written English label verbatim', () => {
    expect(journeyDateLabel(entry, 'en')).toBe('APR 2023 — JUL 2024');
  });

  it('composes the span from the machine dates elsewhere', () => {
    expect(journeyDateLabel(entry, 'de')).toMatch(/2023 — .*2024/);
    expect(journeyDateLabel(entry, 'de')).not.toBe(entry.dateLabel);
  });

  it('keeps open-ended and year-only spans in their own form', () => {
    expect(journeyDateLabel({ dateLabel: 'SEP 2021 →', start: '2021-09', end: null }, 'fr')).toMatch(/→$/);
    expect(journeyDateLabel({ dateLabel: '2019 — 2021', start: '2019-09', end: '2021-06' }, 'fr')).toBe('2019 — 2021');
  });
});
