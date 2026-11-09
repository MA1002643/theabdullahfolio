'use client';

import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import { AnimatePresence } from '@/components/motion/AnimatePresence';
import { Languages, X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { localeInfo, matchLocale } from '@/i18n/locales';
import { hasLocaleChoice, persistLocaleChoice, useLocaleSwitch } from '@/i18n/useLocaleSwitch';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { claimEscape } from '@/lib/escapeKey';

// "This site is also available in Español" (issue #82).
//
// The ONLY thing a browser's language preference ever does on this site. It is
// an offer, never a redirect: Google advises against locale-adaptive redirects,
// and a recruiter who was sent an English link should read it in English
// unless they say otherwise.
//
// Shown once, and only when all of these hold: the browser prefers a locale we
// have, that locale is not the one being read, the visitor has never made an
// explicit choice (no NEXT_LOCALE cookie), and they have not dismissed this
// before. Either button settles it for good — "switch" writes the cookie,
// "keep" writes the cookie for the current locale plus the dismissal flag.
//
// Worded IN THE SUGGESTED LANGUAGE, because the reader it is for may not read
// the current one. That copy is loaded on demand from the suggested locale's
// own catalogue: a dynamic import, so its few hundred bytes are only fetched
// by the visitors who are actually shown the offer.

const DISMISSED_KEY = 'locale-suggestion:dismissed';

const readDismissed = () => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = () => {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Storage blocked: the cookie written alongside still settles the choice.
  }
};

function interpolate(template, values) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

export default function LocaleSuggestion() {
  const locale = useLocale();
  const revealed = useLoaderRevealed();
  const reduceMotion = useReducedMotion();
  const { switchTo } = useLocaleSwitch();
  const [offer, setOffer] = useState(null); // { code, copy }

  useEffect(() => {
    if (!revealed || offer) return undefined;
    if (hasLocaleChoice() || readDismissed()) return undefined;
    const code = matchLocale(navigator.languages ?? [navigator.language]);
    if (!code || code === locale) return undefined;
    let cancelled = false;
    import(`../../../messages/${code}/Locale.json`)
      .then((mod) => {
        if (!cancelled) setOffer({ code, copy: mod.default?.suggestion ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [revealed, locale, offer]);

  const dismiss = () => {
    writeDismissed();
    persistLocaleChoice(locale);
    setOffer(null);
  };

  const accept = () => {
    writeDismissed();
    const { code } = offer;
    setOffer(null);
    switchTo(code, 'suggestion');
  };

  useEffect(() => {
    if (!offer) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      claimEscape(event);
      dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `dismiss` only closes over stable values for the lifetime of an offer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer]);

  const target = offer ? localeInfo(offer.code) : null;
  const here = localeInfo(locale);
  const copy = offer?.copy;

  return (
    <AnimatePresence>
      {offer && copy ? (
        <m.aside
          key="locale-suggestion"
          role="region"
          aria-label={copy.region}
          lang={target.hreflang}
          dir={target.dir}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="locale-suggestion fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] end-4 z-[65] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[#ffcd5b40] bg-[#0d0b09]/95 p-4 text-[#f3e7d3] shadow-[0_18px_48px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md"
        >
          <div className="flex items-start gap-x-3">
            <Languages aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#ffaa2a]" strokeWidth={1.75} />
            <p className="flex-1 text-sm leading-relaxed">
              {interpolate(copy.message, { language: target.endonym })}
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label={interpolate(copy.dismiss, { current: here.endonym })}
              className="-me-1 -mt-1 rounded-md p-1 text-[#a3a3a3] transition-colors hover:text-[#f3e7d3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffaa2a]"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 ps-8">
            <button
              type="button"
              onClick={accept}
              className="rounded-full bg-[#ff6d05] px-3.5 py-1.5 text-sm font-medium text-black transition-colors hover:bg-[#ff8a33] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffaa2a]"
            >
              {interpolate(copy.switch, { language: target.endonym })}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-[#d4d4d4] transition-colors hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffaa2a]"
            >
              {interpolate(copy.dismiss, { current: here.endonym })}
            </button>
          </div>
        </m.aside>
      ) : null}
    </AnimatePresence>
  );
}
