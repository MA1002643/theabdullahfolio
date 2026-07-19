'use client';

// The footer contact email with a "Decipher" entrance (issue #30 follow-up,
// owner pick from four reach-strip reveal candidates over Redact / Split-Flap /
// Typeset). On first scroll-into-view — gated on the intro loader so it is never
// spent behind the overlay — the address RESOLVES OUT OF A CIPHER: each glyph
// scrambles through random monospace characters, then locks into its real
// character left→right (ember while unsettled, cooling to the link's resting
// grey as it locks). It speaks the footer terminal's "❯" vocabulary — data
// being decoded — and pairs with the reach strip's own fade-in.
//
// It renders the SAME per-character markup as HoverText (a `.hover-text__face`
// + `.hover-text__clone` stacked inside each char box), so the link keeps its
// per-glyph `.hover-swap` hover-roll and still wraps character-by-character. The
// scramble only mutates the FACE text/colour during the one-shot entrance, then
// drops its state classes so a pristine resting word is handed back to hover.
//
// Detection reuses the footer's shared reveal gate, useFooterReveal (re-arming +
// loader-gated, same as FooterIdentity / FooterManifest / ElsewhereTerminal).
// The scramble is a single rAF loop (textContent + colour only — no transform,
// no layout, no CLS), torn down on unmount. Under prefers-reduced-motion the
// engine never runs, so the real address is simply shown at rest.
//
// Accessibility: the animated glyphs are decorative (aria-hidden); the real,
// unsplit address is exposed once via an sr-only node, so the link's accessible
// name is always correct — identical to HoverText.

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useFooterReveal } from './useFooterReveal';

// A non-breaking space keeps its width when a plain space would collapse inside
// an inline-block char box (matches HoverText).
const NBSP = ' ';

// The pool the unresolved glyphs cycle through — uppercase alnum (ambiguous
// I/O/1/0 dropped) plus the terminal punctuation that gives it a "cipher" feel.
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&$?<>=+/*.@';

// Structural anchors that never scramble: the "@" and "." hold their place while
// the rest resolves around them (and whitespace stays whitespace).
function isAnchor(ch) {
  return ch === '@' || ch === '.' || ch === ' ' || ch === NBSP;
}

export default function DecipherEmail({ text, active }) {
  const ref = useRef(null);
  // When a parent stages the reach-strip reveal it passes `active` — the shared
  // in-view + loader gate — so the decode stays in lockstep with the availability
  // flag and the live-location plate. Standalone (active === undefined) we fall
  // back to observing ourselves through the same shared footer gate (re-arming +
  // loader-gated), so the decode is never spent behind the overlay / a transient.
  const selfRevealed = useFooterReveal(ref, 'some');
  const revealed = active === undefined ? selfRevealed : active;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!revealed || reduced) return undefined;
    const host = ref.current;
    if (!host) return undefined;

    const charEls = Array.from(host.querySelectorAll('.hover-text__char'));
    if (!charEls.length) return undefined;
    const faceEls = charEls.map((c) => c.querySelector('.hover-text__face'));
    const real = charEls.map((c) => c.getAttribute('data-char') || '');

    // Timings (ms). START holds the decode until the availability flag has led in
    // and the email anchor has begun its own fade (see the reach-strip stagger in
    // globals.css), so the strip's three items arrive in sequence rather than at
    // once. Each glyph then scrambles for BASE, plus STEP per index → the left→
    // right lock sweep; SWAP paces the flicker slow enough to read as motion
    // rather than a blur. Last glyph locks at START + BASE + (n-1)·STEP.
    const START = 280;
    const BASE = 300;
    const STEP = 26;
    const SWAP = 50;
    const SETTLE = 360; // matches the colour cool-down before classes are dropped

    let raf = 0;
    let startTs = 0;
    let lastSwap = 0;
    let settleTimer = 0;

    charEls.forEach((c) => c.classList.add('is-scanning'));

    const tick = (ts) => {
      if (!startTs) {
        startTs = ts;
        lastSwap = ts - SWAP; // scramble from the very first frame
      }
      const t = ts - startTs;
      const swap = ts - lastSwap >= SWAP;
      if (swap) lastSwap = ts;

      let done = true;
      for (let i = 0; i < charEls.length; i += 1) {
        const c = charEls[i];
        if (c.classList.contains('is-locked')) continue;
        if (t >= START + BASE + i * STEP) {
          faceEls[i].textContent = real[i];
          c.classList.replace('is-scanning', 'is-locked');
        } else {
          done = false;
          if (t >= START && swap && !isAnchor(real[i])) {
            faceEls[i].textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
        }
      }

      if (done) {
        // Cool-down finished → strip the entrance classes so the link hands a
        // pristine resting word back to the per-glyph hover-roll.
        settleTimer = window.setTimeout(() => {
          charEls.forEach((c, i) => {
            c.classList.remove('is-scanning', 'is-locked');
            faceEls[i].textContent = real[i];
          });
        }, SETTLE);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
      // Leave the real address + no stray state if we unmount mid-scramble.
      charEls.forEach((c, i) => {
        c.classList.remove('is-scanning', 'is-locked');
        if (faceEls[i]) faceEls[i].textContent = real[i];
      });
    };
  }, [revealed, reduced]);

  const chars = String(text).split('');

  return (
    <>
      <span
        ref={ref}
        className="hover-text hover-text--decipher"
        aria-hidden="true"
      >
        {chars.map((char, i) => {
          const display = char === ' ' ? NBSP : char;
          return (
            <span
              key={i}
              className="hover-text__char"
              style={{ '--i': i }}
              data-char={display}
            >
              <span className="hover-text__face">{display}</span>
              <span className="hover-text__clone" aria-hidden="true">
                {display}
              </span>
            </span>
          );
        })}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
