'use client';

import { useEffect, useMemo, useState } from 'react';
import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { whenIdle } from '@/lib/whenIdle';

// The sitewide palette's own copy (issue #41) is FETCHED, not shipped with
// the page: it is only read once a visitor opens ⌘K, and every route already
// carries the 8 kB client-message budget (tests/fitness/i18nBudget.test.js).
// The same pattern as UsesPalette's copy: one dynamic import per locale,
// memoised; a failed locale falls back to English; a failed English chunk
// leaves the palette with what the global catalogue words (routes, languages).
//
// The fetch starts in idle time after mount — long before a hand reaches the
// shortcut — or at once when `eager` is set (the palette was opened first).

const pending = new Map();

export function loadPaletteSiteCopy(locale) {
  if (!pending.has(locale)) {
    pending.set(
      locale,
      import(`../../../messages/${locale}/PaletteSite.json`).then(
        (mod) => mod.default ?? null,
        () => {
          pending.delete(locale);
          return null;
        },
      ),
    );
  }
  return pending.get(locale);
}

export function usePaletteSiteCopy(locale, eager = false) {
  const [copy, setCopy] = useState(null);
  const [wanted, setWanted] = useState(eager);

  useEffect(() => {
    if (eager) setWanted(true);
    if (wanted || eager) return undefined;
    return whenIdle(() => setWanted(true), 4000);
  }, [eager, wanted]);

  useEffect(() => {
    if (!wanted) return undefined;
    let cancelled = false;
    loadPaletteSiteCopy(locale)
      .then((messages) =>
        messages || locale === DEFAULT_LOCALE ? messages : loadPaletteSiteCopy(DEFAULT_LOCALE),
      )
      .then((messages) => {
        if (!cancelled && messages) setCopy({ locale, messages });
      });
    return () => {
      cancelled = true;
    };
  }, [locale, wanted]);

  const messages = copy?.locale === locale ? copy.messages : null;
  return useMemo(
    () =>
      messages
        ? createTranslator({ locale, messages: { PaletteSite: messages }, namespace: 'PaletteSite' })
        : null,
    [locale, messages],
  );
}
