'use client';

import { useEffect, useMemo, useState } from 'react';
import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from 'next-intl';
import { DEFAULT_LOCALE } from '@/i18n/locales';

// The deferred half of the `Privacy` namespace (issue #82, the 8 kB budget).
//
// Every page carries `Privacy.notice`, because the notice can be on screen at
// first paint. The preference centre's copy (`prefs`, `categories`) is only
// ever read once a visitor opens the dialog, yet it was the largest slice of
// the global set: in the longer locales it alone held /uses, /about and
// /journey over budget. So the dialog fetches the locale's `Privacy` file on
// demand, the way the /uses stack plate fetches `UsesTools` (useToolCopy.jsx).
//
// When to fetch: on open, and earlier for an UNDECIDED visitor — that visitor
// is looking at the notice, whose Preferences button is the likeliest way in,
// so the copy is usually there before the click. A returning visitor with a
// stored decision fetches nothing until they ask for the dialog.
//
// A provider that already holds `Privacy.prefs` (the component tests, or any
// future route that hands it down) is used as it is, with no fetch.

const pending = new Map();

/** The locale's full `Privacy` file, or null when its chunk failed to load. */
export function loadPrivacyCopy(locale) {
  if (!pending.has(locale)) {
    pending.set(
      locale,
      import(`../../../messages/${locale}/Privacy.json`).then(
        (mod) => mod.default ?? null,
        () => null,
      ),
    );
  }
  return pending.get(locale);
}

/**
 * `{ ready, messages }`. `ready` turns true once the dialog's copy is
 * available; `messages` is the fetched file to lay over the provider's, or
 * null when the provider already had it. A failed fetch falls back to English
 * and then to ready-with-nothing, so a consent control is never left unable
 * to open: next-intl then prints key paths, but Decline and Accept still work.
 */
export function usePrivacyCopy(wanted) {
  const locale = useLocale();
  const shipped = useMessages()?.Privacy?.prefs != null;
  const [copy, setCopy] = useState(null);

  useEffect(() => {
    if (shipped || !wanted) return undefined;
    let cancelled = false;
    loadPrivacyCopy(locale)
      .then((messages) =>
        messages || locale === DEFAULT_LOCALE ? messages : loadPrivacyCopy(DEFAULT_LOCALE),
      )
      .then((messages) => {
        if (!cancelled) setCopy({ locale, messages });
      });
    return () => {
      cancelled = true;
    };
  }, [shipped, wanted, locale]);

  if (shipped) return { ready: true, messages: null };
  // Keyed by locale so a locale switch never shows the previous language.
  return copy?.locale === locale
    ? { ready: true, messages: copy.messages }
    : { ready: false, messages: null };
}

/**
 * Lays the fetched `Privacy` file under the provider's own `Privacy` keys
 * (the shipped notice wins, so an English fallback never replaces a
 * translated string). Always renders the provider, loaded or not, so the
 * dialog is not remounted when the copy arrives.
 */
export function PrivacyCopyScope({ messages, children }) {
  const base = useMessages();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const merged = useMemo(
    () => (messages ? { ...base, Privacy: { ...messages, ...base.Privacy } } : base),
    [base, messages],
  );
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
