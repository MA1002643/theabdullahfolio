'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import CommandPalette from '@/components/commandPalette/CommandPalette';
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
// provider degrades to a plain router.push.
const ROUTES = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Projects', href: '/projects' },
  { label: 'Qualifications', href: '/qualifications' },
  { label: 'Contact', href: '/contact' },
  { label: 'Guestbook', href: '/guestbook' },
  { label: 'My Past', href: '/my-past' },
];

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

  const actions = useMemo(() => {
    const go = (href, label) => {
      if (navigate) navigate(href, { label });
      else router.push(href);
    };

    return [
      ...ERA_YEARS.map((year) => ({
        id: `jump-${year}`,
        label: `Jump to ${year}`,
        hint: 'era',
        section: 'Journey',
        keywords: 'year era timeline scroll go',
        perform: () => jumpTo(`era-${year}`),
      })),
      {
        id: 'jump-atlas',
        label: 'Jump to the overlap atlas',
        section: 'Journey',
        keywords: 'overlap atlas bars concurrent grid gantt',
        perform: () => jumpTo('journey-atlas'),
      },
      {
        id: 'open-cv',
        label: 'Open the CV (PDF)',
        hint: 'the paper version',
        section: 'Journey',
        keywords: 'resume résumé cv paper download pdf',
        perform: () => window.open(resumeUrl, '_blank', 'noopener'),
      },
      ...ROUTES.map((r) => ({
        id: `go${r.href.replace('/', '-') || '-home'}`,
        label: r.label,
        hint: r.href,
        section: 'Navigate',
        keywords: 'go jump route page',
        perform: () => go(r.href, r.label),
      })),
    ];
  }, [navigate, router]);

  return <CommandPalette actions={actions} />;
}
