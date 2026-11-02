'use client';

import { useMemo } from 'react';
import { useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import CommandPalette from '@/components/commandPalette/CommandPalette';
import { routeActions, routesExcept } from '@/components/commandPalette/routes';
import { usePageTransition } from '@/components/pageTransition/PageTransitionProvider';
import { useGuestbookPrefs } from '@/hooks/useGuestbookPrefs';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import { togglePref } from '@/lib/guestbook/prefs';

// The guestbook's action set for the shared CommandPalette. The palette
// component knows nothing about this page — all guestbook specifics live in
// this config, which is exactly the seam the sitewide-palette issue will
// reuse with its own action list.
//
// Route jumps go through the Stone Passage (usePageTransition().navigate) so
// palette navigation looks identical to clicking the nav ring; a missing
// provider degrades to a plain router.push. The route list itself is the
// shared commandPalette/routes.js registry (issue #37) minus this page.

export default function GuestbookPalette() {
  const router = useRouter();
  const { navigate } = usePageTransition();
  const prefs = useGuestbookPrefs();
  // Labels, sections, hints and search keywords in the visitor's language
  // (issue #82); the shared route jumps word themselves (commandPalette/routes).
  const t = useTranslations('Guestbook');

  const actions = useMemo(() => {
    const go = (href, label) => {
      if (navigate) navigate(href, { label });
      else router.push(href);
    };

    const list = [
      {
        id: 'leave-message',
        label: t('palette.leaveMessage'),
        section: t('palette.sectionGuestbook'),
        keywords: t('palette.leaveKeywords'),
        perform: () => {
          const input = document.getElementById('guestbook-message');
          if (input) {
            input.scrollIntoView({ block: 'center' });
            input.focus();
          } else {
            toast(t('palette.signInToLeave'));
          }
        },
      },
      ...routeActions(routesExcept('/guestbook'), go),
    ];

    if (GUESTBOOK_FLAGS.sound) {
      list.push({
        id: 'toggle-sound',
        label: t('palette.toggleSound'),
        hint: t(prefs.sound ? 'palette.on' : 'palette.off'),
        section: t('palette.sectionPreferences'),
        keywords: t('palette.soundKeywords'),
        perform: () => togglePref('sound'),
      });
    }
    list.push({
      id: 'toggle-motion',
      label: t('palette.toggleMotion'),
      hint: t(prefs.motion ? 'palette.on' : 'palette.off'),
      section: t('palette.sectionPreferences'),
      keywords: t('palette.motionKeywords'),
      perform: () => togglePref('motion'),
    });

    return list;
  }, [navigate, router, prefs.sound, prefs.motion, t]);

  return <CommandPalette actions={actions} />;
}
