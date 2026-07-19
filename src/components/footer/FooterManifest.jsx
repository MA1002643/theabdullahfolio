'use client';

// The footer's "Index" column, re-cut as a split-flap DEPARTURES board (issue
// #30 follow-up, owner-chosen from the four "Index" treatments over Marquee /
// Atlas / Ledger). The site's four routes are staged as a mechanical departure
// board that "arrives" the first time the footer scrolls into view: each row's
// two-digit ordinal scrambles across its flap tiles and settles, row after row,
// and the route you're currently on reads NOW BOARDING with a live pulse while
// the rest sit ON TIME.
//
//   • It extends the vocabulary already in the footer — the graphite keycap of
//     the GitHub CTA and the mono status line of the Elsewhere terminal — so the
//     board reads as part of one system, not a bolted-on gimmick.
//   • The rows stay real internal links: each is a <TransitionLink> that keeps
//     the SPA page-transition, is keyboard-focusable, route-aware (aria-current
//     + the NOW BOARDING state on the live route), and keeps the signature
//     per-glyph .hover-swap roll on the destination (HoverText). The scrambling
//     flap glyphs are decorative (aria-hidden); the link's accessible name never
//     depends on how far the flaps have settled.
//   • Motion is transform/opacity/colour only and every tile reserves its box,
//     so the flapping never shifts layout (no CLS). Under prefers-reduced-motion
//     the board is shown already-settled and still, pulse included.
//   • Deliberately carries NO clock: the footer surfaces live time exactly once
//     (LiveLocation's Ember Meridian), so a second ticking clock is omitted.
//
// SSR-safe: every tile renders its final ordinal on the server and on first
// client render (correct with JS off, no hydration mismatch); once mounted, each
// tile re-scrambles and lands only when the board actually reveals, so the flap
// is seen. Same reveal-gating pattern as ElsewhereTerminal.jsx.

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import TransitionLink from '@/components/pageTransition/TransitionLink';
import { useFooterReveal } from './useFooterReveal';
import { cn } from '@/lib/utils';
import HoverText from './HoverText';
import { quickLinks } from './footer-data';

const GLYPHS = '0123456789';
// Scramble cadence (ms). Kept snappy so the whole board settles in ~2s, in step
// with the Elsewhere terminal's own type-out.
const TICK_MS = 55;
const ROW_START_MS = 220; // when the first row begins flipping
const ROW_STAGGER_MS = 260; // added per row so they land one after another
const TILE_STAGGER_MS = 120; // the second digit lands just after the first

const FOCUS_RING =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950';

// One split-flap tile. Renders `final` at rest (SSR / no-JS / reduced motion);
// when `play` turns true it scrambles through `ticks` random digits, then lands
// on `final`. Each tile owns its own timer so React stays the source of truth —
// no imperative textContent, no reconciler fights.
function Flap({ final, play, reduced, delayMs, ticks }) {
  const [glyph, setGlyph] = useState(final);
  // 'idle' | 'flipping' | 'settled' — drives the CSS flap/land animations.
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    // Reduced motion or not-yet-revealed → hold the settled ordinal, no flip.
    if (reduced || !play) {
      setGlyph(final);
      setPhase('idle');
      return undefined;
    }
    let cancelled = false;
    let i = 0;
    let interval;
    let settle; // settled → idle timer; captured so cleanup can clear it
    const start = setTimeout(() => {
      if (cancelled) return;
      setPhase('flipping');
      interval = setInterval(() => {
        if (cancelled) return;
        i += 1;
        if (i >= ticks) {
          clearInterval(interval);
          setGlyph(final);
          setPhase('settled');
          settle = setTimeout(() => {
            if (!cancelled) setPhase('idle');
          }, 340);
        } else {
          setGlyph(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
        }
      }, TICK_MS);
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(start);
      clearInterval(interval);
      clearTimeout(settle); // no-op if it never reached the settled phase
    };
  }, [play, reduced, final, delayMs, ticks]);

  return (
    <b
      className={cn(
        'footer-index__tile',
        phase === 'flipping' && 'is-flipping',
        phase === 'settled' && 'settled',
      )}
    >
      {glyph}
    </b>
  );
}

export default function FooterManifest() {
  const pathname = usePathname();
  const rawReduced = useReducedMotion();
  const ref = useRef(null);

  // The cascade must read from the FIRST row exactly as the board arrives, so it
  // waits until the board is *fully* on screen (amount:'all') — not a partial
  // peek. At 50% there's still ~110px of scroll before it's fully in view, and
  // the rows flip every 260ms, so by the time you reached it the cascade was
  // already three rows deep (at "Projects"). useFooterReveal fires on that full-
  // view gate + the intro loader, and re-arms when the board scrolls fully out of
  // view — so on this persistent footer a transition transient can't spend the
  // flaps off-screen, and the board re-arrives each time it is scrolled back to.
  const revealed = useFooterReveal(ref, 'all');

  // useReducedMotion is null on the server; gate behind a mounted flag so SSR
  // and first client render agree, then settle (same pattern as the terminal).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = mounted && rawReduced;

  const play = reduced || revealed;

  // Route-aware highlight: exact match, or a nested route under the link (so
  // /projects/123 still boards "Projects").
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    // data-play drives the Split-Flap Cascade: while "false" the rows sit hidden
    // (offset + transparent); when the board reveals it flips to "true" and each
    // row rises on its own `--enter` delay, in step with its ordinal flap. It's
    // omitted entirely until mount — with the attribute absent, neither
    // [data-play] rule matches and the rows fall back to their visible base
    // style, so SSR / JS-off / a stalled hydration still show the Index nav
    // instead of an empty block. See .footer-index[data-play] in globals.css.
    <div
      className="footer-index"
      ref={ref}
      data-play={mounted ? (play ? 'true' : 'false') : undefined}
    >
      {/* Board chrome — a "DEPARTURES" marquee over a hairline. Decorative. */}
      <div className="footer-index__head" aria-hidden="true">
        <span className="footer-index__marquee">Departures</span>
        <span className="footer-index__rule" />
      </div>

      {/* <ol> because the numbering is meaningful order (site IA), not decoration. */}
      <ol className="footer-index__board">
        {quickLinks.map((l, i) => {
          const active = isActive(l.href);
          const ordinal = String(i + 1).padStart(2, '0');
          return (
            // Per-row entrance delay — the cascade cadence, matched to the flap's
            // own ROW_STAGGER_MS so a row lands just as its ordinal starts flipping.
            <li key={l.href} style={{ '--enter': `${i * ROW_STAGGER_MS}ms` }}>
              <TransitionLink
                href={l.href}
                transitionLabel={l.label}
                aria-current={active ? 'page' : undefined}
                data-active={active ? 'true' : undefined}
                className={cn('footer-index__row hover-swap', FOCUS_RING)}
              >
                <span className="footer-index__flap" aria-hidden="true">
                  {ordinal.split('').map((digit, ti) => (
                    <Flap
                      key={ti}
                      final={digit}
                      play={play}
                      reduced={reduced}
                      delayMs={ROW_START_MS + i * ROW_STAGGER_MS + ti * TILE_STAGGER_MS}
                      ticks={7 + i * 3 + ti * 2}
                    />
                  ))}
                </span>
                <span className="footer-index__dest">
                  <HoverText text={l.label} />
                </span>
                <span className="footer-index__gate" aria-hidden="true">
                  {l.desc}
                </span>
                <span className="footer-index__status" aria-hidden="true">
                  <i />
                  {active ? 'Now boarding' : 'On time'}
                </span>
              </TransitionLink>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
