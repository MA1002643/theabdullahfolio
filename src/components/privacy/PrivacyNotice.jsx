'use client';

// The first-visit privacy notice (issue #141).
//
// ── What this is deliberately not ───────────────────────────────────────────
// Not a full-screen interstitial, not a modal, and not a focus trap. The site's
// first impression is the hero; putting a wall in front of it to ask permission
// to count page views would trade the thing the site is for a thing it barely
// needs. So this is a `role="region"` anchored to the bottom of the viewport:
// the page stays readable, scrollable and fully keyboard-operable with the
// notice on screen, and a visitor who wants to read first and decide later can.
//
// Not a "cookie banner" either, and the distinction is load-bearing rather than
// pedantic — see `COOKIES` in src/lib/privacy/inventory.js. This site's only
// cookies are the guestbook's sign-in session, set exclusively for somebody who
// signs in, and none of them requires consent. What the notice asks about is
// measurement.
//
// ── The three dark patterns it refuses ──────────────────────────────────────
// Each of these is standard on sites that consider themselves reputable, and
// each is the reason consent UI is distrusted:
//
//   1. DECLINE IS A REAL BUTTON, one click, the same size and weight as Accept.
//      It is not greyed out, not demoted to small print, and not hidden behind
//      "Manage preferences". Accept carries the ember tint because it is the
//      affirmative action and a person should be able to find it — that is the
//      whole of the visual difference between them.
//   2. DISMISSAL IS NOT CONSENT. There is no scroll-to-accept, no
//      continue-to-browse-means-yes, no timeout that decides for you. The notice
//      has exactly three exits and all three are something the visitor pressed.
//   3. ESCAPE MEANS DECLINE, never accept. Bound on the region rather than on
//      `document`, deliberately: a global handler would fire while the ⌘K
//      command palette is open and steal its own dismissal key, and a privacy
//      notice hijacking a shortcut belonging to another component is its own
//      small dark pattern. So Escape works for the keyboard user who has
//      actually reached the notice, which is who it is for.
//
// ── Why it waits ────────────────────────────────────────────────────────────
// LoaderWrapper covers the page with a z-9999 overlay for ~3.3s from the first
// render, so anything that animates in before the reveal plays and finishes
// unseen — the site's standard trap, which ContactIntro.jsx documents. The gate
// is `useLoaderRevealed()` plus a settle delay, so the notice arrives after the
// hero has landed rather than racing it. The hero gets its moment; then the
// question is asked.

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import TransitionLink from '@/components/pageTransition/TransitionLink';
import { fluid, fluidText } from '@/lib/fluidScale';
import { wordFill } from '@/lib/fireRamp';
import { cn } from '@/lib/utils';
import { STATUS } from '@/lib/privacy/consentStore';
import { useConsent } from './ConsentProvider';

// Split once at module scope — the notice's copy never changes at runtime.
const NOTICE_WORDS = (
  'This site keeps a little state on your device so it remembers your ' +
  'preferences, and — only if you allow it — counts which pages get ' +
  'read. No advertising cookies, no tracking, no third-party profiling.'
).split(' ');

// How long after the loader lifts before the notice arrives. Long enough that
// the hero's own entrance reads as the thing that happened, short enough that a
// visitor deciding to scroll has not already started.
const SETTLE_MS = 1100;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950';

export default function PrivacyNotice() {
  const { status, hydrated, grant, deny, reopen } = useConsent();
  const revealed = useLoaderRevealed();
  const rawReduced = useReducedMotion();
  const panelRef = useRef(null);

  // `useReducedMotion` is null on the server and resolves synchronously on the
  // client, so it is gated behind a mounted flag — the house pattern (Footer,
  // FooterManifest). Without it, the first client render can disagree with the
  // server's for reduced-motion users, which is the exact hydration-warning
  // class #141's acceptance criteria forbid adding to.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = mounted && rawReduced;

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!revealed) return undefined;
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  // `hydrated` is what stops the notice flashing in for somebody who decided
  // months ago: before the effect in ConsentProvider has read storage, the
  // status is `undecided` because that is the SSR-safe default, not because
  // anything is known about this visitor.
  const open = hydrated && settled && status === STATUS.UNDECIDED;

  // ── Publish the panel's height so the corner widgets get out of its way ────
  // NowPlaying (fixed, bottom-left) and FloatingSoundToggle (fixed,
  // bottom-right) both already occupy the bottom corners of every page, and a
  // full-width bottom sheet lands on top of both. Rather than teaching this
  // component where those two live — a coupling that would rot the moment a
  // third widget appeared — it publishes its own measured height and both
  // widgets add `--consent-lift` to their bottom offset (see `.floating-anchor`
  // in globals.css). Neither of them needs to know this notice exists.
  //
  // Measured rather than assumed, because the height is genuinely unknown: the
  // copy reflows from one line to four between an ultrawide monitor and a 320px
  // phone, and the controls stack below `sm`.
  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.style.removeProperty('--consent-lift');
      return undefined;
    }
    const node = panelRef.current;
    if (!node) return undefined;

    const publish = () => {
      // A 12px breathing gap so a lifted widget does not sit flush against the
      // panel's top edge.
      root.style.setProperty('--consent-lift', `${node.offsetHeight + 12}px`);
    };
    publish();

    // ResizeObserver rather than a resize listener: the panel's height changes
    // on reflow (a rotated phone, a zoom step, a font finishing loading) and
    // several of those fire no window resize at all.
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--consent-lift');
    };
  }, [open]);

  // Reduced motion gets opacity only — no translate. The entrance is short
  // either way; this element should arrive, not perform.
  const variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0, y: 24 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
        },
      };

  if (!open) {
    // The live region stays mounted and empty so that when the notice does
    // arrive, assistive technology sees a TEXT CHANGE inside an existing live
    // region — which is what gets announced. A live region inserted with its
    // text already in place is frequently not announced at all, which is the
    // usual reason this pattern is implemented and still does not work.
    return <span className="sr-only" role="status" aria-live="polite" />;
  }

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        A privacy notice has appeared at the bottom of the page. You can accept
        or decline analytics, or open preferences.
      </span>

      <motion.section
        ref={panelRef}
        // A region, NOT a dialog: no `aria-modal`, no focus trap, and the page
        // behind it stays operable. Labelled so it is reachable as a landmark
        // rather than being an unnamed box at the end of the document.
        role="region"
        aria-label="Privacy notice"
        variants={variants}
        initial="hidden"
        animate="show"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          // Scoped to the region on purpose — see the header. Stopped here so it
          // cannot bubble to a document-level handler and be read twice.
          event.stopPropagation();
          deny();
        }}
        // z-[60]: above the two corner widgets and the toaster (z-50), below the
        // intro loader (z-9999) and the page-transition overlay, neither of which
        // this may ever cover.
        //
        // `fluid-scale` is on this element so `fluid()` below resolves against a
        // real factor — the notice lives in the ROOT layout, outside the
        // `(sub pages)` <main> that normally carries the scope. `--fluid-min` is
        // raised from the sitewide 0.6 because this panel is READ rather than
        // admired: at 0.6 the body copy on a small phone is smaller than the
        // legibility floor the rest of the system tolerates for decoration.
        style={{ '--fluid-min': 0.85 }}
        className={cn(
          'fluid-scale fixed inset-x-0 bottom-0 z-[60]',
          'border-t border-[#ff6d05]/25 bg-night-950/95 backdrop-blur-xl',
          // No neon bloom, by instruction: a single hairline rule in the site's
          // ember, and a plain shadow to lift the plate off the page. This
          // element should recede.
          'shadow-[0_-12px_40px_rgba(0,0,0,0.55)]',
        )}
      >
        <div
          className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
          style={{ padding: `${fluid(1.1)} ${fluid(1.25)}` }}
        >
          <div className="min-w-0">
            <h2
              className="mb-1.5 font-semibold uppercase tracking-[0.18em] text-[#ffaa2a]"
              style={{ fontSize: fluidText(0.72, 0.68) }}
            >
              Privacy
            </h2>
            {/* The copy. Every clause is checkable against the inventory —
                which is the point of writing it from an audit rather than from
                a template. It does NOT say "no cookies": the guestbook sign-in
                sets four, and #141's original copy would have shipped that as a
                falsehood. It says what is actually true and says it more
                specifically. */}
            {/* Set in the Architect of Enchantment's fire (About): the gold→ember
                ramp, darkening in reading order, under the same two-layer halo.
                The clip is PER WORD via `wordFill`, never on this <p>: the panel
                is backdrop-blurred and so GPU-promoted, which is exactly where a
                parent `background-clip:text` rasterises wrongly (see
                src/lib/fireRamp.js). The halo is a filter, which composites
                correctly, so it stays on the parent. */}
            <p
              className="max-w-[62ch]"
              style={{
                fontSize: fluidText(0.92, 0.84),
                lineHeight: 1.55,
                filter:
                  'drop-shadow(0 0 4px rgba(255, 178, 60, 0.55)) drop-shadow(0 0 12px rgba(255, 73, 0, 0.35))',
              }}
            >
              {NOTICE_WORDS.map((word, i) => (
                <span key={i} style={wordFill(i, NOTICE_WORDS.length)}>
                  {word}{' '}
                </span>
              ))}
              <TransitionLink
                href="/privacy"
                transitionLabel="Privacy"
                className={cn(
                  'rounded-sm font-medium text-[#ff6d05] underline decoration-[#ff6d05]/40 underline-offset-[3px] transition-colors hover:decoration-[#ff6d05]',
                  FOCUS_RING,
                )}
              >
                Read what that means
              </TransitionLink>
              .
            </p>
          </div>

          {/* Accept and Decline are the same element with a different tint.
              Written as one shared class string plus a two-line difference so
              that "equal weight" is true by CONSTRUCTION rather than by two
              lists of classes happening to match today. */}
          <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="flex gap-2.5">
              <NoticeButton tone="affirm" onClick={grant} style={{ fontSize: fluidText(0.88, 0.82) }}>
                Accept
              </NoticeButton>
              <NoticeButton tone="neutral" onClick={deny} style={{ fontSize: fluidText(0.88, 0.82) }}>
                Decline
              </NoticeButton>
            </div>
            <button
              type="button"
              onClick={reopen}
              className={cn(
                'rounded-sm text-left text-[#8f8f8f] underline decoration-[#8f8f8f]/35 underline-offset-[3px] transition-colors hover:text-[#d4d4d4] hover:decoration-[#d4d4d4] sm:ml-1 sm:text-center',
                FOCUS_RING,
              )}
              style={{ fontSize: fluidText(0.82, 0.76) }}
            >
              Preferences
            </button>
          </div>
        </div>
      </motion.section>
    </>
  );
}

/**
 * Accept / Decline, as one component so their weight cannot drift apart.
 *
 * The only difference `tone` makes is border and text colour. Padding, radius,
 * font weight, letter-spacing and min-width are shared, which is what makes the
 * "no dark pattern" claim structural instead of a promise: you cannot demote
 * Decline here without demoting Accept with it.
 */
function NoticeButton({ tone, onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        'min-w-[6.5rem] flex-1 rounded-md border px-4 py-2 font-medium tracking-[0.02em] transition-colors sm:flex-none',
        FOCUS_RING,
        tone === 'affirm'
          ? 'border-[#ff6d05]/70 bg-[#ff6d05]/[0.12] text-[#ffb066] hover:bg-[#ff6d05]/20 hover:text-[#ffc38a]'
          : 'border-[#5a5a5a] bg-white/[0.03] text-[#d4d4d4] hover:border-[#8f8f8f] hover:bg-white/[0.07]',
      )}
    >
      {children}
    </button>
  );
}
