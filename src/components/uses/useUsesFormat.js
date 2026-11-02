'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { intlTag } from '@/i18n/format';

// Number and date formatting for the /uses plates (issue #82), in one place so
// every readout on the page speaks the same digits.
//
//   · `num` — a figure in the locale's own digits, UNGROUPED. The plates have
//     always printed "1391", never "1,391" (a count read at build, typeset as
//     an instrument readout), and grouping would also change English.
//   · `ord` — a two-digit plate/rank ordinal ("03"), same digits.
//   · `countFormat` — the `format` option for useViewportCountUp, so the
//     climbing digits match the resting ones. `undefined` in English keeps the
//     hook's legacy formatter, byte for byte.
//   · `builtAt` — the build stamp. English keeps buildFacts' own `builtAtLabel`
//     ("5 Sep 2026" — Intl's en-GB now says "Sept", which would change the
//     page); every other locale formats `builtAt` with Intl, in UTC so server
//     and client agree. Takes the facts object rather than importing
//     `formatBuiltAt`: buildFacts.js reads the disk, and `node:fs` must never
//     reach this client bundle.
export function useUsesFormat() {
  const locale = useLocale();
  return useMemo(() => {
    const english = locale === DEFAULT_LOCALE;
    const tag = intlTag(locale);
    const plain = new Intl.NumberFormat(tag, { useGrouping: false });
    const two = new Intl.NumberFormat(tag, { useGrouping: false, minimumIntegerDigits: 2 });
    const day = new Intl.DateTimeFormat(tag, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return {
      locale,
      english,
      num: (n) => (english ? String(n) : plain.format(n)),
      ord: (n) => (english ? String(n).padStart(2, '0') : two.format(Number(n))),
      countFormat: english ? undefined : { locale: tag, options: { useGrouping: false } },
      builtAt: (facts) => {
        if (!facts?.builtAtLabel) return null;
        if (english || !facts.builtAt) return facts.builtAtLabel;
        const d = new Date(facts.builtAt);
        return Number.isNaN(d.getTime()) ? facts.builtAtLabel : day.format(d);
      },
    };
  }, [locale]);
}
