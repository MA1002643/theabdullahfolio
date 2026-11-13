'use client';

import { useEffect, useMemo, useState } from 'react';
import { createTranslator, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { usePaletteActions } from '@/components/commandPalette/registry';
import { profileGithubUrl } from '@/components/footer/footer-data';
import { useGuestbookPrefs } from '@/hooks/useGuestbookPrefs';
import { togglePref } from '@/lib/guestbook/prefs';
import { intlTag } from '@/i18n/format';
import { DEFAULT_LOCALE } from '@/i18n/locales';

// /uses' commands for the sitewide ⌘K palette — the JourneyPalette seam:
// the palette component knows nothing about this page, and since issue #41
// the page contributes these to the one palette the root layout mounts
// (usePaletteActions) rather than mounting its own. That palette supplies the
// route jumps, so this list has none. Plate jumps land on
// the plate's own `id` (scroll-mt clears the home-button island); reduced
// motion is read with matchMedia AT PERFORM TIME, because the action list is
// memoed once and a perform-time read can never go stale. "Copy my editor
// settings" writes the very lines the EditorFrame renders — one array, so
// what you see is what you copy.
export const USES_PLATES = [
  { slug: 'machine', ordinal: '00', label: 'The machine', keywords: 'hardware laptop macbook display phone' },
  { slug: 'bench', ordinal: '01', label: 'The bench', keywords: 'editor vscode terminal shell fonts settings' },
  { slug: 'stack', ordinal: '02', label: 'The stack', keywords: 'languages frameworks libraries tools live github' },
  { slug: 'pipeline', ordinal: '03', label: 'The pipeline', keywords: 'ci actions vercel deploy workflows cron' },
  { slug: 'instruments', ordinal: '04', label: 'The instruments', keywords: 'tests vitest playwright api routes counts' },
  { slug: 'bom', ordinal: '05', label: 'Bill of materials', keywords: 'package versions dependencies next react' },
];

export const jumpToPlate = (slug) => {
  const el = document.getElementById(`uses-${slug}`);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
};

// Pure builder — exported for the unit suite. `deps` carries every side
// effect so the test can hand in spies, and `t` — the UsesPalette translator
// (issue #82) — so the labels, hints and section headings are the reader's
// language. `ordinal` formats the plate number in the locale's digits; it
// defaults to the literal "00". Search keywords stay English on purpose:
// they are extra match terms, and an English query still finds the action.
// `USES_PLATES[].label` is kept as the English record (and the key into
// `plates`).
export function buildUsesActions({
  t,
  ordinal = (o) => o,
  frameLines,
  motionOn,
  copyText,
  openExternal,
  toggleMotion,
}) {
  return [
    ...USES_PLATES.map((p) => ({
      id: `jump-${p.slug}`,
      label: t('jumpPlate', {
        ordinal: ordinal(p.ordinal),
        label: t(`plates.${p.slug}`),
      }),
      hint: ordinal(p.ordinal),
      section: t('section'),
      keywords: `plate jump scroll ${p.keywords}`,
      perform: () => jumpToPlate(p.slug),
    })),
    {
      id: 'copy-settings',
      label: t('copySettings'),
      hint: 'settings.json',
      section: t('section'),
      keywords: 'vscode clipboard copy json theme dracula',
      perform: () => copyText(frameLines.join('\n')),
    },
    {
      id: 'open-repos',
      label: t('openRepos'),
      hint: 'github.com',
      section: t('section'),
      keywords: 'repos github source code open',
      perform: () => openExternal(`${profileGithubUrl}?tab=repositories`),
    },
    {
      id: 'toggle-motion',
      label: t('toggleMotion'),
      hint: t(motionOn ? 'motionOn' : 'motionOff'),
      section: t('preferences'),
      keywords: 'animation reduce still',
      perform: toggleMotion,
    },
  ];
}

// The palette's own copy is fetched, not shipped (issue #82, the 8 kB
// budget): it is only read once a visitor opens ⌘K, and in the longer
// locales it was what held /uses over. The fetch starts at mount, so it is
// in long before a hand reaches the shortcut; until it is, the sitewide
// palette still offers everything else and only this page's own actions are
// missing.
// A failed chunk falls back to English, and a failed English chunk leaves
// the route jumps alone.
const pending = new Map();

export function loadPaletteCopy(locale) {
  if (!pending.has(locale)) {
    pending.set(
      locale,
      import(`../../../messages/${locale}/UsesPalette.json`).then(
        (mod) => mod.default ?? null,
        () => null,
      ),
    );
  }
  return pending.get(locale);
}

function usePaletteTranslator(locale) {
  const [copy, setCopy] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadPaletteCopy(locale)
      .then((messages) =>
        messages || locale === DEFAULT_LOCALE ? messages : loadPaletteCopy(DEFAULT_LOCALE),
      )
      .then((messages) => {
        if (!cancelled) setCopy({ locale, messages });
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  const messages = copy?.locale === locale ? copy.messages : null;
  return useMemo(
    () =>
      messages
        ? createTranslator({ locale, messages: { UsesPalette: messages }, namespace: 'UsesPalette' })
        : null,
    [locale, messages],
  );
}

const NONE = [];

export default function UsesPalette({ frame }) {
  const prefs = useGuestbookPrefs();
  const locale = useLocale();
  const t = usePaletteTranslator(locale);

  const actions = useMemo(() => {
    if (!t) return NONE;
    const copyText = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(t('copied'));
      } catch {
        toast(t('clipboardUnavailable'));
      }
    };
    const openExternal = (url) => window.open(url, '_blank', 'noopener,noreferrer');
    const two = new Intl.NumberFormat(intlTag(locale), {
      useGrouping: false,
      minimumIntegerDigits: 2,
    });
    return buildUsesActions({
      t,
      ordinal: locale === 'en' ? undefined : (o) => two.format(Number(o)),
      frameLines: frame.lines,
      motionOn: prefs.motion,
      copyText,
      openExternal,
      toggleMotion: () => togglePref('motion'),
    });
  }, [prefs.motion, frame.lines, t, locale]);

  usePaletteActions('uses', actions);
  return null;
}
