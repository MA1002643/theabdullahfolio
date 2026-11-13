'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { usePaletteActions } from '@/components/commandPalette/registry';
import { useGuestbookPrefs } from '@/hooks/useGuestbookPrefs';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import { togglePref } from '@/lib/guestbook/prefs';

// The guestbook's commands for the sitewide ⌘K palette. The palette
// component knows nothing about this page — all guestbook specifics live in
// this config. Since issue #41 they are CONTRIBUTED to the one palette the
// root layout mounts (usePaletteActions) instead of feeding a palette of the
// page's own; that palette supplies the route jumps, so this list has none.

export default function GuestbookPalette() {
  const prefs = useGuestbookPrefs();
  // Labels, sections, hints and search keywords in the visitor's language
  // (issue #82); the shared route jumps word themselves (commandPalette/routes).
  const t = useTranslations('Guestbook');

  const actions = useMemo(() => {
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
  }, [prefs.sound, prefs.motion, t]);

  usePaletteActions('guestbook', actions);
  return null;
}
