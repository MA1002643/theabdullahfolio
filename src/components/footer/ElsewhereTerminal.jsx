'use client';

// The footer's "Elsewhere" block, recut as a live TERMINAL (issue #30 follow-up,
// owner-chosen over the plainer link list). The three professional destinations
// are staged as a small graphite terminal window that "runs a session" the first
// time the footer scrolls into view: each command types itself out, its resolved
// destination prints beneath it, and a blinking ember caret waits at the prompt.
//
//   • It extends the vocabulary already in the footer — the git-graph CTA's
//     honest caption ("❯ main · N commits") uses the same ember prompt glyph and
//     ui-monospace family — so the terminal reads as part of one system, not a
//     bolted-on gimmick.
//   • The three links stay real links (GitHub / LinkedIn / Résumé): the whole
//     command+output entry is one <a>, keyboard-focusable, with the honest
//     aria-label from footer-data. The typed glyphs are decorative; the link's
//     accessible name never depends on how far the animation has typed.
//   • Motion is opacity/colour only and every output row reserves its height, so
//     the "printing" never shifts layout (no CLS). Under prefers-reduced-motion
//     the whole session is shown already-run and still, caret included.
//
// SSR-safe: the markup renders fully "run" on the server and on first client
// render (so it's correct with JS off and there's no hydration mismatch); once
// mounted, it clears to empty behind the still-hidden footer and re-runs the
// session when the footer reveals, so the type-out is actually seen.

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useFooterReveal } from './useFooterReveal';
import { cn } from '@/lib/utils';
import { socialLinks } from './footer-data';

// One terminal entry per professional link. `cmd` is the typed command; `handle`
// is the resolved destination printed beneath it. Derived once from the static
// footer config so the arrays below stay referentially stable across renders.
const CHANNELS = socialLinks.map((s) => ({
  label: s.label,
  href: s.href,
  aria: s.aria,
  handle: s.handle,
  cmd: `open ${s.label.toLowerCase()}`,
}));

const FULL_TYPED = CHANNELS.map((c) => c.cmd);
const EMPTY_TYPED = CHANNELS.map(() => '');
const ALL_SHOWN = CHANNELS.map(() => true);
const NONE_SHOWN = CHANNELS.map(() => false);

// Typing cadence (ms). Kept snappy so the whole session runs in ~2s.
const CHAR_MS = 42;
const AFTER_OUTPUT_MS = 300;
const START_MS = 450;

const FOCUS_RING =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950';

export default function ElsewhereTerminal() {
  const rawReduced = useReducedMotion();
  const ref = useRef(null);

  // Run the session when the terminal is genuinely on screen (~30% in view) —
  // not on the first-pixel peek, which on mobile (columns stacked) would type the
  // whole ~2s session out while the terminal is still a sliver at the very bottom
  // edge, finishing before it is actually read. useFooterReveal also re-arms when
  // it scrolls fully out of view and is gated on the intro loader, so on this
  // persistent footer the type-out re-runs each time it is scrolled to and is
  // never spent behind the overlay / a page-transition transient.
  const revealed = useFooterReveal(ref, 0.3);

  // useReducedMotion is null on the server; gate behind a mounted flag so SSR
  // and first client render agree, then settle (same pattern as the CTA).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = mounted && rawReduced;

  const play = reduced || revealed;

  // Rendered "fully run" for SSR / no-JS. The effect below clears it while the
  // footer is still hidden and replays the session on reveal.
  const [typed, setTyped] = useState(FULL_TYPED);
  const [shown, setShown] = useState(ALL_SHOWN);

  useEffect(() => {
    // Reduced motion → show the finished session, no typing.
    if (reduced) {
      setTyped(FULL_TYPED);
      setShown(ALL_SHOWN);
      return;
    }
    // Not yet revealed → hold the session cleared (this happens off-screen /
    // behind the hidden footer, so the reset is never seen).
    if (!play) {
      setTyped(EMPTY_TYPED);
      setShown(NONE_SHOWN);
      return;
    }
    // Revealed → run it: type each command, print its output, then the next.
    setTyped(EMPTY_TYPED);
    setShown(NONE_SHOWN);
    let cancelled = false;
    let line = 0;
    let ch = 0;
    let timer;
    const step = () => {
      if (cancelled || line >= CHANNELS.length) return;
      const full = CHANNELS[line].cmd;
      if (ch < full.length) {
        ch += 1;
        const at = line;
        const upto = ch;
        setTyped((prev) => {
          const next = [...prev];
          next[at] = full.slice(0, upto);
          return next;
        });
        timer = setTimeout(step, CHAR_MS);
      } else {
        // Command finished → print its resolved destination, advance.
        const at = line;
        setShown((prev) => {
          const next = [...prev];
          next[at] = true;
          return next;
        });
        line += 1;
        ch = 0;
        timer = setTimeout(step, AFTER_OUTPUT_MS);
      }
    };
    timer = setTimeout(step, START_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [play, reduced]);

  return (
    <div className="footer-term" ref={ref}>
      {/* Window chrome — traffic lights + working directory. Decorative. */}
      <div className="footer-term__bar" aria-hidden="true">
        <span className="footer-term__dot footer-term__dot--r" />
        <span className="footer-term__dot footer-term__dot--y" />
        <span className="footer-term__dot footer-term__dot--g" />
        <span className="footer-term__path">~/elsewhere</span>
      </div>

      <ul className="footer-term__body">
        {CHANNELS.map((c, i) => (
          <li key={c.label}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={c.aria}
              className={cn('footer-term__entry', FOCUS_RING)}
            >
              <span className="footer-term__cmdline">
                <span className="footer-term__prompt" aria-hidden="true">❯</span>
                <span className="footer-term__cmd">{typed[i]}</span>
              </span>
              <span
                className={cn('footer-term__out', shown[i] && 'is-shown')}
                aria-hidden="true"
              >
                <span className="footer-term__branch">↳</span>
                <span className="footer-term__handle">{c.handle}</span>
              </span>
            </a>
          </li>
        ))}

        {/* Resting prompt — a blinking ember caret waiting for the next command. */}
        <li className="footer-term__promptline" aria-hidden="true">
          <span className="footer-term__prompt">❯</span>
          {!reduced && <span className="footer-term__caret" />}
        </li>
      </ul>
    </div>
  );
}
