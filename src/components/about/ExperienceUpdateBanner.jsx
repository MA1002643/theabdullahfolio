"use client";

import { useEffect, useRef, useState } from "react";

import { UpdateBanner } from "./UpdateBanner";

// Auto-dismiss timeout — 4.5s sits comfortably in the spec's "4-5
// seconds" window. Long enough for the user to read a one-line
// sentence, short enough that it doesn't linger past the moment of
// attention.
const VISIBLE_DURATION_MS = 4500;

/**
 * Inline banner that appears inside the years card the first time the
 * user scrolls into view *after* the experience summary changes. Each
 * distinct message is shown at most once per browser session — re-
 * entries with the same message are silently skipped (no nag), but a
 * fresh message from a later poll re-arms the trigger.
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
 */
export function ExperienceUpdateBanner({ message, inView, variant = "orange" }) {
  const [shown, setShown] = useState(false);
  // Remembers which message we've already played so re-entries with
  // the same message don't re-show it. A new message coming in (the
  // ref doesn't match) re-arms the trigger.
  const lastPlayedRef = useRef(null);

  useEffect(() => {
    if (!message || !inView) return;
    if (lastPlayedRef.current === message) return;
    lastPlayedRef.current = message;
    setShown(true);
    const timer = setTimeout(() => setShown(false), VISIBLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, inView]);

  return (
    <UpdateBanner
      message={shown ? message : null}
      visible={shown}
      srPrefix="Experience update: "
      variant={variant}
    />
  );
}
