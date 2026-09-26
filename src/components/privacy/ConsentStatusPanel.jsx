'use client';

// "Here is what you currently allow" — the one part of /privacy that cannot be
// server-rendered, and the reason it is a separate island rather than making the
// whole policy a client component.
//
// ── Why the page needs it ───────────────────────────────────────────────────
// Almost every privacy policy tells you what a site *can* do and leaves you to
// guess what you personally agreed to. That gap is why people distrust the
// genre: the document and your own state are two different things, and only one
// of them is on screen. Showing the actual stored answer, with the date it was
// given and a control to change it, turns the page from a statement into an
// account.
//
// ── Hydration ───────────────────────────────────────────────────────────────
// `hydrated` is false during SSR and the first client paint, and this renders a
// deliberately stateless line in that window. It does NOT render "off" and then
// correct itself: flashing the wrong answer about somebody's privacy setting is
// worse than briefly saying nothing, and would also be a mismatch on the one
// page where being wrong is expensive.

import { CalendarClock, ShieldCheck, ShieldOff } from 'lucide-react';

import { fluid, fluidText } from '@/lib/fluidScale';
import { cn } from '@/lib/utils';
import { STATUS } from '@/lib/privacy/consentStore';
import { useConsent } from './ConsentProvider';

export default function ConsentStatusPanel() {
  const { status, analytics, decidedAt, hydrated, reopen } = useConsent();

  // Formatted with an explicit locale and only after hydration, so there is no
  // server render of it to disagree with — the footer's copyright-year note
  // documents the same hazard.
  const decidedLabel =
    decidedAt &&
    new Date(decidedAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const allowed = hydrated && analytics;

  return (
    <aside
      // `aria-live="polite"`: the text changes when the visitor accepts or
      // declines from the dialog while standing on this page, and a screen
      // reader user needs to hear that their change took effect. `polite` rather
      // than `assertive` — it is a confirmation, not an alarm.
      aria-live="polite"
      className="pv-record relative rounded-xl border border-[#ffcd5b]/25 bg-white/[0.025] p-5 sm:p-6"
      style={{ marginTop: fluid(1.25) }}
    >
      <h2
        className="font-semibold uppercase tracking-[0.16em] text-[#ffaa2a]"
        style={{ fontSize: fluidText(0.74, 0.7) }}
      >
        <span className="pv-focus">Your current choice</span>
      </h2>

      <div className="mt-3.5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {!hydrated ? (
            // Pre-hydration and JS-off. A plain, TRUE sentence rather than a
            // skeleton: with JavaScript disabled nothing on this site can have
            // loaded an analytics script, so this is not a placeholder for a
            // value that never arrives — it is the correct answer.
            <p
              className="text-[#e4d6f7]"
              style={{ fontSize: fluidText(0.95, 0.88), lineHeight: 1.55 }}
            >
              Analytics are not running. With JavaScript disabled they cannot be.
            </p>
          ) : (
            <>
              <p
                className={cn(
                  'flex items-center gap-2 font-medium',
                  allowed ? 'text-[#ffb066]' : 'text-[#ff8a1e]',
                )}
                style={{ fontSize: fluidText(0.98, 0.9) }}
              >
                {allowed ? (
                  <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <ShieldOff className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                )}
                {allowed
                  ? 'Anonymous analytics are allowed.'
                  : 'Analytics are off. Nothing is being measured.'}
              </p>
              <p
                className="mt-1.5 flex items-center gap-2 text-[#c8a6ee]"
                style={{ fontSize: fluidText(0.84, 0.78) }}
              >
                <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                {status === STATUS.UNDECIDED
                  ? 'You have not been asked yet, so the answer is no.'
                  : decidedLabel
                    ? `You decided this on ${decidedLabel}.`
                    : 'Your decision is stored on this device.'}
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={reopen}
          className={cn(
            'shrink-0 rounded-md border border-[#ff6d05]/60 bg-[#ff6d05]/[0.08] px-4 py-2 font-medium text-[#ffb066] transition-colors',
            'hover:bg-[#ff6d05]/[0.16] hover:text-[#ffc38a]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950',
          )}
          style={{ fontSize: fluidText(0.86, 0.8) }}
        >
          Change this
        </button>
      </div>
    </aside>
  );
}
