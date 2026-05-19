'use client';

import { useEffect, useState } from 'react';

// Mostly amethyst (the void-page signature) with a small ember
// minority so the field still feels like a continuation of the
// global FireFliesBackground (which is all ember orange).
const AMETHYST = 'rgba(252, 131, 255, 0.55)'; // amethyst-neon
const AMETHYST_DIM = 'rgba(252, 131, 255, 0.35)';
const EMBER = 'rgba(255, 109, 5, 0.5)';       // neon-700

const ORB_COUNT = 22;
const AMETHYST_RATIO = 0.8; // 80% amethyst, 20% ember

function makeOrbs() {
  return Array.from({ length: ORB_COUNT }, (_, i) => {
    const isAmethyst = Math.random() < AMETHYST_RATIO;
    const tint = isAmethyst
      ? Math.random() < 0.5
        ? AMETHYST
        : AMETHYST_DIM
      : EMBER;
    return {
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      // Size 6–16px — larger than the previous 1–4px dots so
      // the radial glow reads as a glowing orb, not a pixel.
      size: 6 + Math.random() * 10,
      // 5–11s full lifecycle. Longer than the global firefly's
      // 3.5–7s so the 404 orbs feel slower / lonelier than the
      // hero's bustling fireflies — "you've drifted further out
      // where time runs differently".
      lifeDur: 5 + Math.random() * 6,
      // Stagger delays across the full life range so the field
      // is in different lifecycle phases at any given moment —
      // no synchronised "all bright at the same instant" pulse.
      lifeDelay: -(Math.random() * 6),
      tint,
    };
  });
}

/**
 * Amethyst firefly orbs layered above the global
 * FireFliesBackground. Each orb uses the existing
 * `firefly-life` keyframe (defined in globals.css) so its
 * breathing rhythm is in sympathy with the rest of the site's
 * ambient particles — but tinted amethyst (with a sprinkle of
 * ember) so the 404 reads as a stranger, sparser pocket of
 * the same universe rather than a separate decorative scheme.
 *
 * Generated client-side only — Math.random on the server would
 * produce a different value tree than on the client, which
 * would trigger a hydration mismatch warning.
 */
export default function FloatingParticles() {
  const [orbs, setOrbs] = useState([]);

  useEffect(() => {
    setOrbs(makeOrbs());
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      {orbs.map((o) => (
        <div
          key={o.id}
          className="not-found-orb"
          style={{
            top: o.top,
            left: o.left,
            width: `${o.size}px`,
            height: `${o.size}px`,
            '--life-dur': `${o.lifeDur}s`,
            '--life-delay': `${o.lifeDelay}s`,
            '--orb-color': o.tint,
          }}
        />
      ))}
    </div>
  );
}
