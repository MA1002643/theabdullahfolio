'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';

// The WebGL canvas is loaded lazily and client-only: Three never enters this
// route's critical bundle, and the import doesn't fire until the conditions
// below are met (loader lifted + motion allowed).
const AuroraBackground = dynamic(() => import('./AuroraBackground'), {
  ssr: false,
});

// ── Aurora mount ────────────────────────────────────────────────────────────
// Gatekeeper for the contact-page aurora background. Mounts the canvas only when
// motion is allowed (`prefers-reduced-motion: reduce` keeps the static
// contact-bg.png fallback) and the intro loader has lifted (defers the heavy
// Three import past first paint / LCP). The layer is fixed, pointer-inert, and
// composited `mix-blend: screen` so it only adds warm light over the dark
// backdrop — sitting above the black overlay (-z-40) but below the content.
export default function AuroraMount() {
  const revealed = useLoaderRevealed();
  const [motionOk, setMotionOk] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionOk(!mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  if (!motionOk || !revealed) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-30"
      style={{ mixBlendMode: 'screen', opacity: 0.72, pointerEvents: 'none' }}
    >
      <AuroraBackground />
    </div>
  );
}
