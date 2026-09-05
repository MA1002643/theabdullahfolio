'use client';

import { useEffect, useState } from 'react';

// Scramble-decode for the guestbook headline (issue #40 Phase 4): the text
// resolves out of random glyphs, each letter locking into place left → right.
// Returns the current character array; the caller renders it however it
// likes.
//
// Contract details that matter:
//   • The INITIAL state is the real text — that is what the server renders
//     and what hydration compares, so there is no mismatch and no SEO cost;
//     the scramble only begins client-side once `enabled` goes true (loader
//     lifted, motion allowed).
//   • `enabled: false` (reduced motion, killed flag) pins the real text and
//     never animates — the decode is cosmetic, never load-bearing.
//   • Bump `playKey` to replay (a new message hitting the wall).
//   • Spaces stay spaces throughout so words never collapse mid-decode.

const GLYPHS = '#@$%&*+=<>/|~^ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PREROLL_MS = 200; // all-glyph churn before the first letter locks
const LOCK_PER_CHAR_MS = 55; // cascade cadence
const SHUFFLE_MS = 40; // glyph churn rate (~25fps — reads as flicker, not strobe)

export function useScramble(text, { playKey = 0, enabled = true } = {}) {
  const [chars, setChars] = useState(() => Array.from(text));

  useEffect(() => {
    const finalChars = Array.from(text);
    if (!enabled) {
      setChars(finalChars);
      return undefined;
    }

    let raf;
    let lastShuffle = 0;
    const t0 = performance.now();
    // When the LAST letter locks — derived from time alone, so the loop's end
    // condition never depends on side effects inside a state updater (which
    // React may double-invoke).
    const totalMs = PREROLL_MS + (finalChars.length - 1) * LOCK_PER_CHAR_MS;

    const frame = (now) => {
      const elapsed = now - t0;
      const shuffle = now - lastShuffle >= SHUFFLE_MS;
      if (shuffle) lastShuffle = now;

      setChars((prev) =>
        finalChars.map((c, i) => {
          if (c === ' ') return ' ';
          if (elapsed >= PREROLL_MS + i * LOCK_PER_CHAR_MS) return c;
          // Between shuffles keep the previous glyph steady.
          if (!shuffle && prev[i] !== undefined) return prev[i];
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }),
      );

      if (elapsed < totalMs) {
        raf = requestAnimationFrame(frame);
      } else {
        setChars(finalChars);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text, playKey, enabled]);

  return chars;
}
