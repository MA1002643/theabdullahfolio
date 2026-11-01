'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { intlTag } from '@/i18n/format';
import { useRouter } from '@/i18n/navigation';
import CommandPalette from '@/components/commandPalette/CommandPalette';
import { routeActions, routesExcept } from '@/components/commandPalette/routes';
import { usePageTransition } from '@/components/pageTransition/PageTransitionProvider';
import { journeyData } from '@/app/data';
import { resumeUrl } from '@/components/footer/footer-data';

// /journey's action set for the shared CommandPalette — the same seam
// GuestbookPalette cut for issue #40: the palette component knows nothing
// about this page, all journey specifics live in this config. Era jumps
// reuse the EraRail clock's own anchor contract (the `era-<year>` li ids and
// centre-block scrollIntoView), with reduced motion honoured at perform time
// — matchMedia here, not the framer hook, because the action list is memoed
// once and a perform-time read can never go stale.
//
// Route jumps go through the Stone Passage (usePageTransition().navigate) so
// palette navigation looks identical to clicking the nav ring; a missing
// provider degrades to a plain router.push. The route list itself is the
// shared commandPalette/routes.js registry (issue #37) minus this page.

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
  const router = useRouter();
  const { navigate } = usePageTransition();
  const t = useTranslations('Journey');
  const locale = useLocale();

  // Labels, hints and the section heading follow the locale (issue #82); the
  // search keywords stay English on purpose — they are extra match terms, and
  // an English query still finds the action from any locale.
  const actions = useMemo(() => {
    const year = new Intl.NumberFormat(intlTag(locale), { useGrouping: false });
    const go = (href, label) => {
      if (navigate) navigate(href, { label });
      else router.push(href);
    };

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
      ...routeActions(routesExcept('/journey'), go),
    ];
  }, [navigate, router, t, locale]);

  return <CommandPalette actions={actions} />;
}
