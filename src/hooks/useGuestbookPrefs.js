'use client';

import { useSyncExternalStore } from 'react';
import {
  getPrefs,
  getServerPrefs,
  subscribePrefs,
} from '@/lib/guestbook/prefs';

// Live view of the guestbook preference store ({ sound, motion }). Every
// consumer re-renders on any toggle; the store itself handles persistence.
// useSyncExternalStore keeps hydration honest: the server snapshot is the
// defaults, and a stored override applies on the client after mount.
export function useGuestbookPrefs() {
  return useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
}
