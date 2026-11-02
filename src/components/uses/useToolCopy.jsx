'use client';

import { useEffect, useMemo, useState } from 'react';
import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from 'next-intl';
import { DEFAULT_LOCALE } from '@/i18n/locales';

// The deferred half of the `UsesTools` namespace (issue #82, the 8 kB budget).
//
// The page hands down descriptions for the CURATED tiles only — the set the
// plate server-renders, so first paint is in the reader's language with no
// English flash. A live crawl can surface any of ~100 tools, and shipping
// every description up front put /uses over budget. So the full file for the
// locale is fetched alongside the crawl the plate already waits for, and the
// tiles upgrade in place only once both are in.
//
// English never fetches: describeTool() in lib/uses/toolCopy.js is the same
// English (tests/unit/usesI18n pins the two equal), so a tile the catalogue
// lacks already reads correctly.

const pending = new Map();

/** The locale's full `UsesTools` file, or null (English, or a failed chunk). */
export function loadToolCopy(locale) {
  if (locale === DEFAULT_LOCALE) return Promise.resolve(null);
  if (!pending.has(locale)) {
    pending.set(
      locale,
      import(`../../../messages/${locale}/UsesTools.json`).then(
        (mod) => mod.default ?? null,
        () => null,
      ),
    );
  }
  return pending.get(locale);
}

/**
 * `{ messages }` once the locale's copy is available (immediately in
 * English), else null. Starts loading only when `wanted` — the plate's
 * viewport gate — so a visitor who never scrolls to the stack never fetches.
 */
export function useToolCopy(wanted) {
  const locale = useLocale();
  const english = locale === DEFAULT_LOCALE;
  const [copy, setCopy] = useState(english ? { messages: null } : null);

  useEffect(() => {
    if (!wanted || english) return undefined;
    let cancelled = false;
    loadToolCopy(locale).then((messages) => {
      if (!cancelled) setCopy({ messages });
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, english, locale]);

  return copy;
}

/**
 * Lays the full tool copy over the curated subset the page shipped. Always
 * renders the provider, loaded or not: swapping a bare subtree for a wrapped
 * one would remount the grid and replay its reveal.
 */
export function ToolCopyScope({ messages, children }) {
  const base = useMessages();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const merged = useMemo(
    () =>
      messages?.tools
        ? {
            ...base,
            UsesTools: {
              tools: { ...base.UsesTools?.tools, ...messages.tools },
              generic: { ...base.UsesTools?.generic, ...messages.generic },
            },
          }
        : base,
    [base, messages],
  );
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
