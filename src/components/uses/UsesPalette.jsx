'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import CommandPalette from '@/components/commandPalette/CommandPalette';
import { routeActions, routesExcept } from '@/components/commandPalette/routes';
import { profileGithubUrl } from '@/components/footer/footer-data';
import { usePageTransition } from '@/components/pageTransition/PageTransitionProvider';
import { useGuestbookPrefs } from '@/hooks/useGuestbookPrefs';
import { togglePref } from '@/lib/guestbook/prefs';

// /uses' action set for the shared CommandPalette — the JourneyPalette seam:
// the palette component knows nothing about this page. Plate jumps land on
// the plate's own `id` (scroll-mt clears the home-button island); reduced
// motion is read with matchMedia AT PERFORM TIME, because the action list is
// memoed once and a perform-time read can never go stale. "Copy my editor
// settings" writes the very lines the EditorFrame renders — one array, so
// what you see is what you copy. Route jumps go through the Ember Passage via
// usePageTransition().navigate, degrading to router.push without a provider.
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
// effect so the test can hand in spies.
export function buildUsesActions({ frameLines, motionOn, go, copyText, openExternal, toggleMotion }) {
  return [
    ...USES_PLATES.map((p) => ({
      id: `jump-${p.slug}`,
      label: `Jump to ${p.ordinal} ${p.label}`,
      hint: p.ordinal,
      section: 'Uses',
      keywords: `plate jump scroll ${p.keywords}`,
      perform: () => jumpToPlate(p.slug),
    })),
    {
      id: 'copy-settings',
      label: 'Copy my editor settings',
      hint: 'settings.json',
      section: 'Uses',
      keywords: 'vscode clipboard copy json theme dracula',
      perform: () => copyText(frameLines.join('\n')),
    },
    {
      id: 'open-repos',
      label: 'See the repositories on GitHub',
      hint: 'github.com',
      section: 'Uses',
      keywords: 'repos github source code open',
      perform: () => openExternal(`${profileGithubUrl}?tab=repositories`),
    },
    ...routeActions(routesExcept('/uses'), go),
    {
      id: 'toggle-motion',
      label: 'Toggle motion',
      hint: motionOn ? 'on' : 'off',
      section: 'Preferences',
      keywords: 'animation reduce still',
      perform: toggleMotion,
    },
  ];
}

export default function UsesPalette({ frame }) {
  const router = useRouter();
  const { navigate } = usePageTransition();
  const prefs = useGuestbookPrefs();

  const actions = useMemo(() => {
    const go = (href, label) => {
      if (navigate) navigate(href, { label });
      else router.push(href);
    };
    const copyText = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        toast('Editor settings copied');
      } catch {
        toast('Clipboard unavailable — select the frame to copy');
      }
    };
    const openExternal = (url) => window.open(url, '_blank', 'noopener,noreferrer');
    return buildUsesActions({
      frameLines: frame.lines,
      motionOn: prefs.motion,
      go,
      copyText,
      openExternal,
      toggleMotion: () => togglePref('motion'),
    });
  }, [navigate, router, prefs.motion, frame.lines]);

  return <CommandPalette actions={actions} />;
}
