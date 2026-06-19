"use client";

import { useEffect, useRef, useState } from "react";

import { UpdateBanner } from "./UpdateBanner";

// Auto-dismiss timeout — 4.5s sits comfortably in the spec's "4-5
// seconds" window. Long enough for the user to read a one-line
// sentence, short enough that it doesn't linger past the moment of
// attention.
const VISIBLE_DURATION_MS = 4500;

// sessionStorage key for the last message played in this tab. Cleared
// automatically when the tab closes; survives soft remounts (route
// changes, re-renders) so the banner doesn't re-fire after the user
// navigates away from /about and back within the same session.
const SESSION_KEY = "experience-update-banner:lastPlayed";

/**
 * Inline banner that appears inside the years card the first time the
 * user scrolls into view *after* the experience summary changes. Each
 * distinct message is shown at most once per browser session — re-
 * entries with the same message are silently skipped (no nag), but a
 * fresh message from a later poll re-arms the trigger.
 *
 * Session-scope dedupe is persisted to `sessionStorage`, so it survives
 * component remounts (route changes, soft reloads) but clears when the
 * tab closes — that's the "browser session" boundary the docstring
 * promises. In environments where `sessionStorage` is unavailable
 * (private browsing on some platforms, locked-down embeds), we silently
 * fall back to in-memory dedupe scoped to the component lifetime.
 *
 * Visual is delegated to the shared `UpdateBanner` so the experience
 * banner uses the exact same look-and-feel as every other update
 * banner on the about page (RepoStatsCard, StatsCard, etc.) instead
 * of carrying its own one-off design.
 *
 * Spec behaviour preserved here:
 *   - Renders only when there's a real change (`message` non-null —
 *     the hook handles that gating via fingerprint diffing).
 *   - Trigger fires on the next viewport entry after the message
 *     lands, *not* on every render.
 *   - Visible 4-5s, then fades out.
 *
 * @param {object} props
 * @param {string|null} props.message  - the change message (null hides)
 * @param {boolean} props.inView       - is the parent card in viewport?
 * @param {"orange"|"elite"} [props.variant] - palette forwarded to
 *                                       UpdateBanner. Default "orange"
 *                                       preserves the original look;
 *                                       the years card opts into
 *                                       "elite" so the banner matches
 *                                       its slate + gold treatment.
 * @param {(shown: boolean) => void} [props.onVisibilityChange] - notified
 *                                       whenever the banner shows (true) or
 *                                       auto-hides (false). The years card
 *                                       uses the show→hide edge to defer its
 *                                       legend heartbeat until the banner
 *                                       overlay has cleared (no pulse hidden
 *                                       under the blur).
 */
export function ExperienceUpdateBanner({ message, inView, variant = "orange", onVisibilityChange }) {
  const [shown, setShown] = useState(false);
  // Remembers which message we've already played so re-entries with the
  // same message don't re-show it. Hydrated from sessionStorage on first
  // run via `hydratedRef`, then kept in sync with each new banner fire.
  const lastPlayedRef = useRef(null);
  const hydratedRef = useRef(false);

  // ── Arm / show ──────────────────────────────────────────────────────────────
  // On the first in-view entry after a fresh message, mark the banner shown.
  // Deliberately does NOT own the auto-hide timer — that lives in the separate
  // effect below. Tying the dismiss to this effect's `inView` dep was a
  // stuck-banner bug: scrolling the card out mid-show ran this cleanup
  // (clearing the timeout), and the `!message || !inView` early-return then
  // skipped rescheduling, stranding `shown` at true forever (the banner could
  // never dismiss, and its show→hide edge never fired).
  useEffect(() => {
    // First-run hydration. Done inside this effect (rather than a separate mount
    // effect) so the read completes before any banner decision is made on this
    // same render — no narrow race where the banner fires once before
    // sessionStorage is consulted.
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      try {
        lastPlayedRef.current = window.sessionStorage.getItem(SESSION_KEY);
      } catch {
        // sessionStorage unavailable — in-memory dedupe still works for
        // this component lifetime, which matches the prior behavior.
      }
    }
    if (!message || !inView) return;
    if (lastPlayedRef.current === message) return;
    lastPlayedRef.current = message;
    try {
      window.sessionStorage.setItem(SESSION_KEY, message);
    } catch {
      // Write failure is non-fatal: the in-memory ref still prevents
      // re-fires for the rest of this component's lifetime, and the
      // next mount falls back to lifetime-scoped dedupe.
    }
    setShown(true);
    // Tell the parent the banner is now visible. The matching `false` is sent
    // from UpdateBanner's onExitComplete below — i.e. only once the overlay has
    // FULLY animated out and unmounted, not when `shown` flips false. That edge
    // is what the years card waits for before pulsing its legend, so the
    // heartbeat can never play under the still-fading banner regardless of how
    // long the per-character exit stagger runs.
    onVisibilityChange?.(true);
  }, [message, inView, onVisibilityChange]);

  // ── Auto-hide ───────────────────────────────────────────────────────────────
  // Keyed ONLY on `shown` (never `inView`), so once the banner is up it always
  // resolves to hidden after the window — scrolling the card out of view can no
  // longer cancel the dismiss timer and strand `shown` at true. This also
  // guarantees the show→hide edge (and the parent's `onVisibilityChange(false)`,
  // fired via onExitComplete) eventually arrives. The 4.5s counts from the show
  // moment; a banner only shows while in view, and two distinct messages can't
  // overlap (polls are 10 min apart), so there's no need to also key on `message`.
  useEffect(() => {
    if (!shown) return undefined;
    const timer = setTimeout(() => setShown(false), VISIBLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <UpdateBanner
      message={shown ? message : null}
      visible={shown}
      srPrefix="Experience update: "
      variant={variant}
      onExitComplete={() => onVisibilityChange?.(false)}
    />
  );
}
