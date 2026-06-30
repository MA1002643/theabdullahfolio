'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMessageRefine } from '@/hooks/useMessageRefine';

// MessageRefine — the "polish my missive" affordance that sits beneath the
// message field. Once the visitor has written a real sentence, a quiet ember
// link offers to refine it; tapping it streams an AI rewrite into a ghosted
// panel (building token by token) that the visitor can accept into the field or
// discard. It owns none of the form's state — the parent passes the current
// `message`, an `onAccept(text)` applier, and a `disabled` flag (true while the
// form is sending) so refine can never fire mid-send.

// Match the API's MIN_LEN: below this there's nothing meaningful to polish, so
// the affordance stays hidden rather than offering a no-op.
const MIN_REFINE_LEN = 24;

export default function MessageRefine({ message, onAccept, disabled }) {
  const reduced = useReducedMotion();
  const { status, suggestion, error, refine, reset } = useMessageRefine();

  const trimmed = (message || '').trim();
  const longEnough = trimmed.length >= MIN_REFINE_LEN;
  const busy = status === 'loading' || status === 'streaming';
  const showPanel = busy || status === 'done' || status === 'error';

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

  const handleAccept = () => {
    if (suggestion) onAccept(suggestion);
    reset();
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
            onClick={() => refine(trimmed)}
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
                  <button type="button" className="refine-btn refine-btn--use" onClick={handleAccept}>
                    Use this
                  </button>
                  <button type="button" className="refine-btn refine-btn--ghost" onClick={() => refine(trimmed)}>
                    Polish again
                  </button>
                  <button type="button" className="refine-btn refine-btn--ghost" onClick={reset}>
                    Discard
                  </button>
                </>
              )}
              {status === 'error' && (
                <>
                  <button type="button" className="refine-btn refine-btn--use" onClick={() => refine(trimmed)}>
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
