'use client';

import { SessionProvider } from 'next-auth/react';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import GuestbookWall from './GuestbookWall';
import GuestbookPalette from './GuestbookPalette';
import GrainOverlay from './GrainOverlay';

// Client shell for the guestbook page: owns the Auth.js session context (the
// page itself stays a thin background-and-headline composition, matching
// /about) and mounts the flag-gated elite layer that needs no page-level
// state — the command palette and the grain/vignette finish. The shader and
// headline live in the page (they sit outside the session boundary).
export default function GuestbookApp() {
  return (
    <SessionProvider>
      <GuestbookWall />
      {GUESTBOOK_FLAGS.commandPalette ? <GuestbookPalette /> : null}
      {GUESTBOOK_FLAGS.grain ? <GrainOverlay /> : null}
    </SessionProvider>
  );
}
