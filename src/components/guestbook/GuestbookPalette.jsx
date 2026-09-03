'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import CommandPalette from '@/components/commandPalette/CommandPalette';
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
// provider degrades to a plain router.push.
const ROUTES = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Projects', href: '/projects' },
  { label: 'Qualifications', href: '/qualifications' },
  { label: 'Contact', href: '/contact' },
  { label: 'Journey', href: '/journey' },
  { label: 'My Past', href: '/my-past' },
];

export default function GuestbookPalette() {
  const router = useRouter();
  const { navigate } = usePageTransition();
  const prefs = useGuestbookPrefs();

  const actions = useMemo(() => {
    const go = (href, label) => {
      if (navigate) navigate(href, { label });
      else router.push(href);
    };

    const list = [
      {
        id: 'leave-message',
        label: 'Leave a message',
        section: 'Guestbook',
        keywords: 'write sign post compose',
        perform: () => {
          const input = document.getElementById('guestbook-message');
          if (input) {
            input.scrollIntoView({ block: 'center' });
            input.focus();
          } else {
            toast('Sign in to leave a message');
          }
        },
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

    if (GUESTBOOK_FLAGS.sound) {
      list.push({
        id: 'toggle-sound',
        label: 'Toggle UI sounds',
        hint: prefs.sound ? 'on' : 'off',
        section: 'Preferences',
        keywords: 'audio blip mute',
        perform: () => togglePref('sound'),
      });
    }
    list.push({
      id: 'toggle-motion',
      label: 'Toggle motion',
      hint: prefs.motion ? 'on' : 'off',
      section: 'Preferences',
      keywords: 'animation reduce still',
      perform: () => togglePref('motion'),
    });

    return list;
  }, [navigate, router, prefs.sound, prefs.motion]);

  return <CommandPalette actions={actions} />;
}
