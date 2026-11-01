'use client';

import { useCallback, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from './navigation';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from './locales';
import { EVENTS, trackEvent } from '@/lib/seo/analytics';

/**
 * Persist an explicit language choice (issue #82). English DELETES the cookie
 * rather than storing 'en': the default needs no memory, and the cookie exists
 * only to carry a non-default choice onto unprefixed English URLs (src/proxy.js).
 */
export function persistLocaleChoice(code) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    code === DEFAULT_LOCALE
      ? `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
      : `${LOCALE_COOKIE}=${code}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/** Whether the visitor has ever made an explicit choice. */
export function hasLocaleChoice() {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c.startsWith(`${LOCALE_COOKIE}=`));
}

/**
 * Switch the CURRENT page to another locale, keeping the path, query and hash —
 * a visitor reading /projects/3 in English lands on /ar/projects/3, not on the
 * Arabic homepage.
 *
 * A soft navigation, deliberately: `<html lang dir>` and the font chain live in
 * the `[locale]` layout and re-render with the new segment, so there is no
 * need for a full reload that would replay the intro loader.
 *
 * @returns {{ switchTo: (code: string, source: string) => void, pending: boolean, locale: string }}
 */
export function useLocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = useCallback(
    (code, source) => {
      if (!isLocale(code)) return;
      persistLocaleChoice(code);
      if (code === locale) return;
      trackEvent(EVENTS.LOCALE_SWITCH, { from: locale, to: code, source });
      const suffix = window.location.search + window.location.hash;
      startTransition(() => {
        router.replace(`${pathname}${suffix}`, { locale: code, scroll: false });
      });
    },
    [locale, pathname, router],
  );

  return { switchTo, pending, locale };
}
