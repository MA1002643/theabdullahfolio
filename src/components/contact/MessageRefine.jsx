'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMessageRefine } from '@/hooks/useMessageRefine';

// MessageRefine — the "polish my missive" affordance that sits beneath the
// message field. Once the visitor has written a real sentence, a quiet ember
// link offers to refine it; tapping it streams an AI rewrite into a ghosted
// panel (building token by token) that the visitor can accept into the field or
// discard. It owns none of the form's state — the parent passes the current
// `message`, an `onAccept(text)` applier, and a `disabled` flag (true while the
// form is sending) so refine can never fire mid-send.
//
// Shared by the contact form (its home) and the guestbook composer, the same
// way FireInput is: `mode` picks the server's editorial contract (omitted →
// contact) and `minLength` scales the show-the-affordance floor to the
// surface's own field (a 150-char guestbook mark earns polish sooner than a
// 500-char contact note).

// Match the API's contact-mode minLen: below this there's nothing meaningful to
// polish, so the affordance stays hidden rather than offering a no-op.
const MIN_REFINE_LEN = 24;

export default function MessageRefine({
  message,
  onAccept,
  disabled,
  mode,
  minLength = MIN_REFINE_LEN,
}) {
  const reduced = useReducedMotion();
  const { status, suggestion, error, refine, reset } = useMessageRefine({ mode });

  const trimmed = (message || '').trim();
  const longEnough = trimmed.length >= minLength;
  const busy = status === 'loading' || status === 'streaming';

  // The moment the form starts sending (`disabled` flips on), any refine in
  // flight or on offer is moot: the submit has captured the message. Hiding
  // the panel alone was not enough — the stream kept running inside the hook,
  // and a composer that stays MOUNTED after a successful post (the guestbook
  // one does; the contact form remounts) saw it finish and the stale
  // suggestion surface beneath the cleared field the moment `disabled`
  // cleared. So the transition ABORTS and resets the hook, never merely hides
  // the view. Idempotent on an idle hook, so mounting already-disabled is a
  // no-op; after a failed send the field is restored and a fresh refine is
  // one tap away.
  useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  // Gate the whole panel on `!disabled`, not just its buttons: once the form is
  // sending it has already captured the message, so the panel goes fully inert
  // — and, per the effect above, empty by the time it could return.
  const showPanel = !disabled && (busy || status === 'done' || status === 'error');

  // sr-only status so non-streaming AT users hear the state transitions without
  // the live text node spamming an announcement on every token.
  const announce =
    status === 'loading' || status === 'streaming'
      ? 'Polishing your message…'
      : status === 'done'
        ? 'Suggested rewrite ready.'
        : status === 'error'
          ? error || 'Could not polish the message.'
          : '';

  // Once the form is sending (`disabled`), the panel must go inert: accepting a
  // rewrite would mutate the textarea the submit has already captured, and a new
  // refine would fire a request mid-send. The affordance is hidden while busy,
  // but a panel left open from a just-finished refine still renders its buttons.
  const handleAccept = () => {
    if (disabled) return;
    if (suggestion) onAccept(suggestion);
    reset();
  };

  // Guarded refine starter — no-op while disabled so neither the affordance nor
  // the panel's "Polish again" / "Try again" can kick off a request mid-send.
  const startRefine = () => {
    if (!disabled) refine(trimmed);
  };

  // The affordance hides entirely while a panel is open (the panel owns the
  // interaction then) and whenever the message is too short or the form is busy.
  const showAffordance = !showPanel && longEnough && !disabled;

  const panelMotion = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -6, height: 0 },
        animate: { opacity: 1, y: 0, height: 'auto' },
        exit: { opacity: 0, y: -6, height: 0 },
      };

  return (
    <div className="refine-root w-full">
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>

      <AnimatePresence initial={false} mode="wait">
        {showAffordance && (
          <motion.button
            key="affordance"
            type="button"
            className="refine-affordance"
            onClick={startRefine}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <span aria-hidden="true" className="refine-spark">
              ✦
            </span>
            Refine my message
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showPanel && (
          <motion.div
            key="panel"
            className="refine-panel"
            role="group"
            aria-label="Suggested rewrite"
            {...panelMotion}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          >
            {status === 'error' ? (
              <p className="refine-error">{error}</p>
            ) : (
              <p className="refine-suggestion" aria-hidden={busy ? 'true' : undefined}>
                {suggestion || (status === 'loading' ? 'Polishing…' : '')}
                {busy && !reduced && <span className="refine-caret" aria-hidden="true" />}
              </p>
            )}

            <div className="refine-actions">
              {status === 'done' && (
                <>
                  <button
                    type="button"
                    className="refine-btn refine-btn--use"
                    onClick={handleAccept}
                    disabled={disabled}
                  >
                    Use this
                  </button>
                  <button
                    type="button"
                    className="refine-btn refine-btn--ghost"
                    onClick={startRefine}
                    disabled={disabled}
                  >
                    Polish again
                  </button>
                  <button type="button" className="refine-btn refine-btn--ghost" onClick={reset}>
                    Discard
                  </button>
                </>
              )}
              {status === 'error' && (
                <>
                  <button
                    type="button"
                    className="refine-btn refine-btn--use"
                    onClick={startRefine}
                    disabled={disabled}
                  >
                    Try again
                  </button>
                  <button type="button" className="refine-btn refine-btn--ghost" onClick={reset}>
                    Dismiss
                  </button>
                </>
              )}
              {busy && (
                <button type="button" className="refine-btn refine-btn--ghost" onClick={reset}>
                  Cancel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
