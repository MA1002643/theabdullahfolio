'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { intlTag } from '@/i18n/format';
import { usePaletteActions } from '@/components/commandPalette/registry';
import { journeyData } from '@/app/data';
import { resumeUrl } from '@/components/footer/footer-data';

// /journey's commands for the sitewide ⌘K palette — the same seam
// GuestbookPalette cut for issue #40: the palette component knows nothing
// about this page, all journey specifics live in this config. Since issue #41
// the page no longer mounts a palette of its own: it CONTRIBUTES these
// commands to the one SitePalette mounts (usePaletteActions), which also
// supplies the route jumps, so this list carries none. Era jumps
// reuse the EraRail clock's own anchor contract (the `era-<year>` li ids and
// centre-block scrollIntoView), with reduced motion honoured at perform time
// — matchMedia here, not the framer hook, because the action list is memoed
// once and a perform-time read can never go stale.

// One jump per era, in the page's own newest-first order (journeyData is
// grouped by year, so the Set walk preserves it).
const ERA_YEARS = [...new Set(journeyData.map((m) => m.year))];

const jumpTo = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
};

export default function JourneyPalette() {
  const t = useTranslations('Journey');
  const locale = useLocale();

  // Labels, hints and the section heading follow the locale (issue #82); the
  // search keywords stay English on purpose — they are extra match terms, and
  // an English query still finds the action from any locale.
  const actions = useMemo(() => {
    const year = new Intl.NumberFormat(intlTag(locale), { useGrouping: false });

    return [
      ...ERA_YEARS.map((y) => ({
        id: `jump-${y}`,
        label: t('palette.jumpYear', { year: year.format(y) }),
        hint: t('palette.eraHint'),
        section: t('palette.section'),
        keywords: 'year era timeline scroll go',
        perform: () => jumpTo(`era-${y}`),
      })),
      {
        id: 'jump-atlas',
        label: t('palette.jumpAtlas'),
        section: t('palette.section'),
        keywords: 'overlap atlas bars concurrent grid gantt',
        perform: () => jumpTo('journey-atlas'),
      },
      {
        id: 'open-cv',
        label: t('palette.openCv'),
        hint: t('palette.openCvHint'),
        section: t('palette.section'),
        keywords: 'resume résumé cv paper download pdf',
        // noreferrer as well as noopener — the same policy as the repo's
        // rel="noopener noreferrer" anchors, so the opened page is not sent
        // the referrer either (moot for this same-origin PDF; the policy
        // travels with the call if the target ever moves off-origin).
        perform: () => window.open(resumeUrl, '_blank', 'noopener,noreferrer'),
      },
    ];
  }, [t, locale]);

  usePaletteActions('journey', actions);
  return null;
}
