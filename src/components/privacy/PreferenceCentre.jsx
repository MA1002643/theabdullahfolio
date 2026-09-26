'use client';

// The preference centre (issue #141) — two categories, one of them a real
// choice, and no vendor list.
//
// ── Why this IS a modal when the notice is not ──────────────────────────────
// They are different jobs and the ARIA roles follow the jobs rather than the
// visual similarity. The notice is an announcement the page must stay readable
// behind, so it is a `region`. This is a form the visitor deliberately opened to
// change a setting, and it is the only thing they are doing — so it is
// `role="dialog"` + `aria-modal="true"`, it traps focus, it locks background
// scroll, Escape closes it, and focus returns to whatever opened it. Getting
// this backwards in either direction is the most common consent-UI a11y bug
// there is: a modal notice that traps you before you have read anything, or a
// preference dialog you can Tab straight out of into a page you cannot see.
//
// ── The mechanics are borrowed, deliberately ────────────────────────────────
// ExperienceBreakdownModal.jsx already solved Escape, the focus trap, the
// focus-restore and scroll-locking in this codebase — including the iOS case
// where Safari ignores `overflow: hidden` for touch and needs `position: fixed`
// with the scroll offset restored on close. #141 says to reuse the established
// pattern rather than inventing a fourth one, so the shape below is that
// component's, kept recognisably the same so a fix to one is findable in the
// other. What is NOT borrowed is its chrome: that modal is a data view on the
// about page and wears the warm-gold `custom-bg-abt` card; this is small print
// and wears a plain plate.
//
// ── Two rows, and why there will not be twelve ──────────────────────────────
// `CATEGORIES` in src/lib/privacy/inventory.js is the list, and it has two
// entries because the audit found two. The essential row is rendered as
// PERMANENTLY ON and visibly not a control — not as a disabled switch, which
// claims to be a choice and then refuses to be one. The analytics row is a real
// switch, defaulting off, that names all three scripts it governs.

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Lock, X } from 'lucide-react';

import TransitionLink from '@/components/pageTransition/TransitionLink';
import { fluid, fluidText } from '@/lib/fluidScale';
import { cn } from '@/lib/utils';
import { ANALYTICS_SURFACES, CATEGORIES } from '@/lib/privacy/inventory';
import { useConsent } from './ConsentProvider';

// Everything an assistive-technology user can Tab to. Element-level
// `[tabindex="-1"]` is excluded so programmatic-only targets do not intercept
// the cycle. Copied from ExperienceBreakdownModal's list on purpose — see header.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950';

// Decline all / Accept analytics. ONE class string for both, so they are
// identical by construction: the same element with a different label, which is
// what equal weight between declining and accepting actually means. The
// colours are the contact form's SEND MESSAGE button (contact/Form.jsx): ember
// #ff6d05 text, and its whole EDGE, which is more than the hairline colour.
// That button's edge is `.custom-bg-abt`'s frame: the #ffcd5bcc gold hairline
// PLUS a 6px orangered glow at rest, which is what the eye reads as its border
// line. A first pass copied only the hairline colour and looked flat beside it.
// `.abt-frame` is that frame by construction (see globals.css), and the hover
// glow is the submit button's own utility, verbatim. Only the edge and text
// colours are borrowed; the shape stays this dialog's own.
const DECISION_BUTTON =
  'abt-frame rounded-md bg-white/[0.03] px-4 py-2 font-medium text-[#ff6d05] transition-[box-shadow,background-color] duration-300 hover:bg-[#ff6d05]/[0.1] hover:shadow-[0_0_8px_rgba(255,109,5,0.65),0_0_20px_rgba(255,109,5,0.4)]';

/**
 * Takes no props. `triggerRef` comes from the provider, which captures whatever
 * had focus when `reopen()` was called — there are two triggers in two different
 * trees (the notice's Preferences button, the footer's Privacy choices link) and
 * a third is likely, so the capture lives in one place rather than being each
 * trigger's job to remember. It can legitimately be null: the notice unmounts on
 * a decision, and when the element that opened the dialog is gone the restore is
 * skipped rather than dumping focus on `<body>`.
 */
export default function PreferenceCentre() {
  const { prefsOpen, closePrefs, analytics, set, triggerRef } = useConsent();
  const rawReduced = useReducedMotion();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Null on the server; resolved synchronously on the client. Read directly
  // rather than behind a mounted flag because this dialog never renders during
  // SSR — it only exists after a click — so there is no first paint for it to
  // disagree with.
  const reduced = rawReduced;

  // Escape closes. Bound at document level, which is correct HERE and wrong for
  // the notice: this is a modal, so while it is open it genuinely owns the key,
  // and the listener has to fire regardless of which descendant holds focus.
  useEffect(() => {
    if (!prefsOpen) return undefined;
    const handler = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closePrefs();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [prefsOpen, closePrefs]);

  // Focus in on open, back out on close. The cleanup captures `trigger` at
  // effect time rather than reading the ref during teardown, because the notice
  // that owned the trigger may already have unmounted by then.
  useEffect(() => {
    if (!prefsOpen) return undefined;
    closeButtonRef.current?.focus();
    const trigger = triggerRef?.current;
    return () => {
      if (trigger && document.body.contains(trigger)) trigger.focus();
    };
  }, [prefsOpen, triggerRef]);

  // Focus trap. Re-queried on every Tab so it tolerates the row count changing.
  useEffect(() => {
    if (!prefsOpen) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handler = (event) => {
      if (event.key !== 'Tab') return;
      const focusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', handler);
    return () => dialog.removeEventListener('keydown', handler);
  }, [prefsOpen]);

  // Background scroll lock, including the iOS case. `overflow: hidden` alone is
  // ignored by Safari for touch scrolling, so phone viewports also get
  // `position: fixed` with the offset restored on close — without which closing
  // the dialog silently returns the visitor to the top of the page.
  useEffect(() => {
    if (!prefsOpen) return undefined;
    const body = document.body;
    const scrollY = window.scrollY;
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = 'hidden';
    if (isMobile) {
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.width = '100%';
    }
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      if (isMobile) window.scrollTo(0, scrollY);
    };
  }, [prefsOpen]);

  const analyticsCategory = CATEGORIES.find((c) => c.gated);
  const essentialCategory = CATEGORIES.find((c) => !c.gated);

  return (
    <AnimatePresence>
      {prefsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.15 : 0.22 }}
          // z-[70]: above the notice (z-[60]) it can be opened from, below the
          // intro loader and the page-transition overlay.
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-4"
          onClick={closePrefs}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-prefs-title"
            aria-describedby="privacy-prefs-intro"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
            transition={
              reduced
                ? { duration: 0.15 }
                : { type: 'spring', stiffness: 300, damping: 30 }
            }
            onClick={(event) => event.stopPropagation()}
            // `fluid-scale` here for the same reason as the notice: this dialog
            // lives in the root layout, outside the <main> that carries the
            // scope, and `--fluid-min` is raised because the panel is read.
            //
            // The depth shadow is a `filter`, not a box-shadow, because the
            // box-shadow slot belongs to the frame's glow. That is the same
            // split ProjectProgressPopup makes.
            style={{
              '--fluid-min': 0.85,
              maxHeight: '88dvh',
              filter: 'drop-shadow(0 24px 60px rgba(0, 0, 0, 0.6))',
            }}
            className={cn(
              'fluid-scale relative flex w-full max-w-lg flex-col',
              // The frame is the Delivery-telemetry popup's (About), built
              // the same way: `.abt-frame` is `.custom-bg-abt`'s border and
              // glow without its slate interior (see globals.css), and the
              // inner `repo-card-breathe` layer below adds the same slow ember
              // pulse. Only the frame is borrowed; the plate stays plain (see
              // header). No `overflow-hidden` on this element: the inner
              // layer's glow has to spill past the border, as it does on About.
              'abt-frame rounded-t-2xl bg-night-950/97 sm:rounded-2xl',
            )}
          >
            <div className="repo-card-breathe flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl sm:rounded-xl">
              <header
                className="flex items-start justify-between gap-4 border-b border-[#ffcd5b]/15"
                style={{ padding: `${fluid(1.15)} ${fluid(1.25)} ${fluid(0.95)}` }}
              >
                <div>
                  <h2
                    id="privacy-prefs-title"
                    className="font-semibold uppercase tracking-[0.16em] text-[#ffaa2a]"
                    style={{ fontSize: fluidText(0.78, 0.72) }}
                  >
                    Privacy choices
                  </h2>
                  <p
                    id="privacy-prefs-intro"
                    className="mt-2 max-w-[46ch] text-[#f7efff]"
                    style={{ fontSize: fluidText(0.85, 0.79), lineHeight: 1.5 }}
                  >
                    Two categories, because two is the real number. The full
                    detail is on the{' '}
                    <TransitionLink
                      href="/privacy"
                      transitionLabel="Privacy"
                      onClick={closePrefs}
                      className={cn(
                        'rounded-sm text-[#ff6d05] underline decoration-[#ff6d05]/40 underline-offset-[3px] hover:decoration-[#ff6d05]',
                        FOCUS_RING,
                      )}
                    >
                      privacy page
                    </TransitionLink>
                    .
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closePrefs}
                  aria-label="Close privacy choices"
                  // The Delivery-telemetry popup's close button, class for
                  // class (ProjectProgressPopup.jsx): `.custom-bg` supplies
                  // the ember hairline and glow, so the two X buttons match
                  // by construction.
                  className="custom-bg flex-shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-[#d4af7a] hover:text-[#ff6d05] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50"
                >
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </header>
  
              <div
                className="flex-1 overflow-y-auto"
                style={{ padding: `${fluid(1)} ${fluid(1.25)}` }}
              >
                {/* ── Essential: shown, explained, and visibly not a control ──
                    Rendered as a locked statement rather than a disabled toggle.
                    A greyed-out switch says "this is a choice you are not allowed
                    to make", which is both untrue (there is no choice to make —
                    it never leaves the browser) and the single most patronising
                    element in the genre. */}
                <section className="rounded-lg border border-[#ffcd5b]/[0.12] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      className="font-medium text-[#ff8a1e]"
                      style={{ fontSize: fluidText(0.93, 0.86) }}
                    >
                      {essentialCategory.name}
                    </h3>
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#fc83ff]/40 bg-[#fc83ff]/[0.07] px-2.5 py-1 text-[#f3b0ff]"
                      style={{ fontSize: fluidText(0.7, 0.66) }}
                    >
                      <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      Always on
                    </span>
                  </div>
                  <p
                    className="mt-2 text-[#e4d6f7]"
                    style={{ fontSize: fluidText(0.83, 0.78), lineHeight: 1.55 }}
                  >
                    {essentialCategory.detail}
                  </p>
                </section>
  
                {/* ── Analytics: the one real switch ──────────────────────────── */}
                <section className="mt-3 rounded-lg border border-[#ffcd5b]/[0.12] bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        className="font-medium text-[#ff8a1e]"
                        style={{ fontSize: fluidText(0.93, 0.86) }}
                      >
                        {analyticsCategory.name}
                      </h3>
                      <p
                        className="mt-2 text-[#e4d6f7]"
                        style={{ fontSize: fluidText(0.83, 0.78), lineHeight: 1.55 }}
                      >
                        {analyticsCategory.detail}
                      </p>
                    </div>
                    <AnalyticsSwitch on={analytics} onToggle={() => set(!analytics)} />
                  </div>
  
                  {/* The three scripts, named. "We use analytics" tells a reader
                      nothing; whose servers are involved is the actual question,
                      and answering it unprompted is the difference between a
                      disclosure and a formality. Read from the inventory so the
                      list cannot disagree with what the gate mounts. */}
                  <ul className="mt-4 space-y-2 border-t border-[#ffcd5b]/[0.12] pt-3">
                    {ANALYTICS_SURFACES.map((surface) => (
                      <li
                        key={surface.name}
                        className="flex gap-2 text-[#c8a6ee]"
                        style={{ fontSize: fluidText(0.78, 0.73), lineHeight: 1.5 }}
                      >
                        <span aria-hidden="true" className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-[#ff6d05]" />
                        <span>
                          <b className="font-medium text-[#f7efff]">{surface.name}</b>
                          <span className="text-[#c8a6ee]"> · {surface.processor}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
  
                  {/* Said before it happens, not discovered afterwards. Turning
                      analytics off reloads the document, because that is the only
                      way to genuinely unload a script the page has already
                      executed — see ConsentedAnalytics.jsx. Surprising somebody
                      with a reload would undo the trust this whole surface exists
                      to earn, so it is stated next to the switch that causes it. */}
                  {analytics ? (
                    <p
                      className="mt-3 text-[#c8a6ee]"
                      style={{ fontSize: fluidText(0.74, 0.7), lineHeight: 1.5 }}
                    >
                      Turning this off reloads the page — it is the only way to
                      genuinely unload a script your browser has already run,
                      rather than leaving it loaded and asking it politely to stop.
                    </p>
                  ) : null}
                </section>
              </div>
  
              <footer
                className="flex flex-col-reverse gap-2.5 border-t border-[#ffcd5b]/15 sm:flex-row sm:justify-end"
                style={{ padding: `${fluid(0.95)} ${fluid(1.25)} calc(${fluid(0.95)} + env(safe-area-inset-bottom))` }}
              >
                <button
                  type="button"
                  onClick={() => set(false)}
                  className={cn(DECISION_BUTTON, FOCUS_RING)}
                  style={{ fontSize: fluidText(0.86, 0.8) }}
                >
                  Decline all
                </button>
                <button
                  type="button"
                  onClick={() => set(true)}
                  className={cn(DECISION_BUTTON, FOCUS_RING)}
                  style={{ fontSize: fluidText(0.86, 0.8) }}
                >
                  Accept analytics
                </button>
              </footer>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The analytics switch.
 *
 * A real `<button role="switch">` with `aria-checked`, not a styled checkbox and
 * not a div with a click handler. `role="switch"` is the accurate role for a
 * setting that takes effect immediately rather than on a form submit, and it is
 * what makes a screen reader say "on"/"off" instead of "checked"/"unchecked" —
 * which is the difference between describing a setting and describing a form.
 *
 * The state is also carried in TEXT beside the track, not by colour alone: a
 * two-position switch distinguished only by hue is unreadable to anyone who
 * cannot separate those hues, and it is the most common failure in exactly this
 * component.
 */
function AnalyticsSwitch({ on, onToggle }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          'w-7 text-right font-medium uppercase tracking-[0.1em] transition-colors',
          on ? 'text-[#ffb066]' : 'text-[#c8a6ee]',
        )}
        style={{ fontSize: '0.68rem' }}
      >
        {on ? 'On' : 'Off'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        aria-label="Allow anonymous analytics"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          FOCUS_RING,
          on
            ? 'border-[#ff6d05]/70 bg-[#ff6d05]/25'
            : 'border-[#7a6547] bg-white/[0.04]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            // `transition-transform`, never Tailwind's bare `transition`: that
            // shorthand puts a 150ms ease on transform AND filter, which is the
            // documented way this codebase has smeared GPU-driven movement
            // before. Here it would merely be redundant, but the habit is what
            // matters.
            'absolute top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full transition-[left,background-color] duration-200',
            on ? 'left-[1.55rem] bg-[#ff6d05]' : 'left-[0.2rem] bg-[#c8a6ee]',
          )}
        >
          {on ? (
            <Check className="h-2.5 w-2.5 text-night-950" strokeWidth={3.5} />
          ) : null}
        </span>
      </button>
    </span>
  );
}
