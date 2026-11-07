'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { onMediaChange } from '@/lib/mediaQuery';
import { optionalChunk } from '@/lib/optionalChunk';
import { canCreateWebGL } from '@/lib/webglSupport';

// The WebGL canvas is loaded lazily and client-only: Three never enters a
// route's critical bundle, and the import doesn't fire until the conditions
// below are met (loader lifted + motion allowed). Optional (issue #92): the
// chunk is fetched after first paint, so it is the request a flaky connection
// is most likely to drop, and a dropped one used to blank the whole page. Now
// it leaves the static background, which is what reduced motion shows anyway.
const AuroraDust = dynamic(optionalChunk(() => import('./AuroraDust'), 'AuroraDust'), {
  ssr: false,
});

// ── Aurora dust mount ────────────────────────────────────────────────────────
// Gatekeeper for the shared page-background aurora (about, contact, and 404).
// Mounts the canvas only when motion is allowed (`prefers-reduced-motion:
// reduce` keeps the static contact-bg.png fallback each page renders behind
// it) and the intro loader has lifted (defers the heavy Three import past
// first paint / LCP). The layer is fixed, pointer-inert, and composited
// `mix-blend: screen` so it only adds warm light over the dark backdrop —
// sitting above the black overlay (-z-40) but below the content.
//
// `enabled` (default true) is a page's OWN say on top of the OS query — the
// guestbook hands it its manual motion toggle, which reaches framer through
// MotionConfig but could not reach this mount's media query (code review).
// Off, the canvas unmounts and the static image shows, exactly as under the
// OS preference; the query still rules whenever the page says nothing.
//
// A browser that cannot create a WebGL context gets the static image too
// (`canCreateWebGL`): three.js throws there, and the throw used to blank the
// whole route. The probe runs in the effect, after hydration, so the server
// and the first client render agree.
export default function AuroraDustMount({ enabled = true }) {
  const revealed = useLoaderRevealed();
  const [motionOk, setMotionOk] = useState(false);
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    setWebgl(canCreateWebGL());
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionOk(!mq.matches);
    apply();
    return onMediaChange(mq, apply);
  }, []);

  if (!enabled || !motionOk || !revealed || !webgl) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-30"
      style={{ mixBlendMode: 'screen', opacity: 0.72, pointerEvents: 'none' }}
    >
      <AuroraDust />
    </div>
  );
}
