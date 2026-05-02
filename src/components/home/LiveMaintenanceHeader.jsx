'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion';

// Live Maintenance Header (issue #24).
//
// Renders the current development state of MA1002643/theabdullahfolio:
// fetches /api/work-status on mount, polls every 90s while the tab is
// visible, slows polling when hidden, and animates state/message/counter
// transitions. All animations restrict to transform/opacity/filter and
// respect prefers-reduced-motion.

// Polling cadence aligned to the 30s server cache so GitHub Project
// column moves (which don't fire repo webhooks) become visible within
// ~30s. Hidden tabs back off to 15 min — no point polling fast for a
// tab nobody is looking at.
const POLL_INTERVAL_MS = 30 * 1000;
const POLL_INTERVAL_HIDDEN_MS = 15 * 60 * 1000;

const STATE_LABELS = {
  shipping: 'SHIPPING',
  live: 'LIVE',
  in_progress: 'IN PROGRESS',
  planning: 'PLANNING',
  idle: 'MAINTENANCE',
};

// Pattern D: rotate primary ↔ secondary message every 10s when both
// exist. Aligns with the user's "alive feel" without re-rendering so
// fast that screen readers can't keep up.
const MESSAGE_ROTATION_MS = 10 * 1000;

// Section-level entrance: 0 → 1 scale pop-in matching the About page
// ItemLayout. whileInView with once:false re-fires every time the
// section enters the viewport (e.g. navigating back from /about, or
// scrolling away and back when the page overflows on small viewports).
const containerVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

// Content-level entrance: rises in with stagger so the chip / message /
// counters fan in one after another. Lives on its own variants chain
// (rather than inheriting from the section) so AnimatePresence can mount
// it fresh after the skeleton exits, and so whileInView re-animates the
// stagger on scroll re-entry without re-triggering the section pop-in.
const contentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export default function LiveMaintenanceHeader() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [compressed, setCompressed] = useState(false);
  const reduceMotion = useReducedMotion();
  const prevConfidenceRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/work-status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll: on mount, on tab visibility change, and on the configured
  // interval. The Page Visibility API lets us back off when the tab is
  // hidden so a long-open background tab doesn't hammer the API.
  useEffect(() => {
    fetchStatus();
    let timer;

    const schedule = () => {
      clearInterval(timer);
      const ms =
        document.visibilityState === 'hidden'
          ? POLL_INTERVAL_HIDDEN_MS
          : POLL_INTERVAL_MS;
      timer = setInterval(fetchStatus, ms);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchStatus();
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStatus]);

  // Scroll-aware compression. Subtle: we only need a single boolean
  // flip past a hero threshold, not a continuous transform.
  useEffect(() => {
    const onScroll = () => setCompressed(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const state = data?.state ?? 'idle';
  const fallbackMessage =
    'New features are being released very soon. This website is actively under development.';

  // Build the rotation list. When the API returns a secondaryMessage
  // (Pattern D: SHIPPING + active In Progress work), we rotate. Otherwise
  // the list is just the primary message.
  const messages = useMemo(() => {
    const list = [];
    if (data?.message) list.push(data.message);
    if (data?.secondaryMessage) list.push(data.secondaryMessage);
    return list.length ? list : [fallbackMessage];
  }, [data?.message, data?.secondaryMessage]);

  const [messageIndex, setMessageIndex] = useState(0);

  // Reset to the primary message whenever the message set changes (new
  // data from polling) so the user sees the freshest content first.
  useEffect(() => {
    setMessageIndex(0);
  }, [messages]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % messages.length);
    }, MESSAGE_ROTATION_MS);
    return () => clearInterval(id);
  }, [messages.length]);

  const message = messages[messageIndex] ?? messages[0] ?? fallbackMessage;

  const meta = data?.meta ?? {
    activePrs: 0,
    activeIssues: 0,
    recentPushes: 0,
    lastUpdated: null,
  };

  const confidence = meta.confidence ?? 0;
  const direction = confidence >= prevConfidenceRef.current ? 1 : -1;
  useEffect(() => {
    prevConfidenceRef.current = confidence;
  }, [confidence]);

  const isInitialLoading = loading && !data;

  return (
    <motion.section
      role="status"
      aria-live="polite"
      aria-busy={isInitialLoading}
      aria-label="Live maintenance status"
      variants={reduceMotion ? undefined : containerVariants}
      initial={reduceMotion ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: false, amount: 0.3 }}
      className={`custom-bg-abt relative isolate mx-auto w-full max-w-[min(100%,1400px)] overflow-hidden rounded-xl px-[clamp(0.5rem,1.8vw,1.25rem)] transition-[padding] duration-200 ${compressed ? 'py-[clamp(0.3rem,1vw,0.6rem)]' : 'py-[clamp(0.4rem,1.4vw,0.85rem)]'} ${isInitialLoading ? 'header-loading' : ''}`}
    >
      {/* Layer E: ambient sheen + noise. Both kept under 0.2 opacity. */}
      <div
        aria-hidden
        className="status-sheen pointer-events-none absolute inset-0 -z-10 opacity-60"
      />
      <div
        aria-hidden
        className="status-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.15]"
      />

      <AnimatePresence mode="wait" initial={false}>
        {isInitialLoading ? (
          <HeaderSkeleton key="skeleton" reduceMotion={reduceMotion} />
        ) : (
          <motion.div
            key="content"
            variants={reduceMotion ? undefined : contentVariants}
            initial={reduceMotion ? { opacity: 0 } : 'hidden'}
            whileInView={reduceMotion ? { opacity: 1 } : 'visible'}
            viewport={{ once: false, amount: 0.3 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, transition: { duration: 0.2 } }
            }
            className="flex flex-row items-center gap-2 sm:gap-3 md:gap-4"
          >
            <motion.div variants={reduceMotion ? undefined : childVariants}>
              <StateChip state={state} loading={loading} reduceMotion={reduceMotion} />
            </motion.div>

            <motion.div
              variants={reduceMotion ? undefined : childVariants}
              className="min-w-0 flex-1"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={message}
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          y: direction === 1 ? 8 : -8,
                          filter: 'blur(4px)',
                        }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, filter: 'blur(0px)' }
                  }
                  exit={
                    reduceMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          y: direction === 1 ? -6 : 6,
                          filter: 'blur(2px)',
                        }
                  }
                  transition={{ duration: reduceMotion ? 0.12 : 0.32 }}
                  className="text-shadow-neon-light-orange line-clamp-2 break-words text-[clamp(0.78rem,1.6vw,1.05rem)] font-medium leading-snug sm:line-clamp-none"
                >
                  {message}
                </motion.p>
              </AnimatePresence>
            </motion.div>

            <motion.div
              variants={reduceMotion ? undefined : childVariants}
              className={`hidden flex-wrap items-center gap-x-3 gap-y-1 text-[clamp(0.7rem,1.4vw,0.9rem)] tabular-nums text-[#f9d174] transition-[font-size] duration-200 sm:flex ${compressed ? 'text-[clamp(0.65rem,1.2vw,0.8rem)]' : ''}`}
            >
              <Counter
                label="PRs"
                value={meta.activePrs}
                reduceMotion={reduceMotion}
              />
              <Counter
                label="Issues"
                value={meta.activeIssues}
                reduceMotion={reduceMotion}
              />
              <Counter
                label="Pushes 24h"
                value={meta.recentPushes}
                reduceMotion={reduceMotion}
              />
              <RelativeTime iso={meta.lastUpdated} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="mt-2 text-xs text-amber-300/80" role="alert">
          Live status temporarily unavailable. Showing the latest snapshot.
        </p>
      )}
    </motion.section>
  );
}

function StateChip({ state, loading, reduceMotion }) {
  // Both LIVE and SHIPPING are "active" pulsing states — they show the
  // ping dot + breathe halo. SHIPPING wins precedence in the signal but
  // the visual treatment matches LIVE so it reads as "something's
  // happening right now" either way.
  const isPulsing = state === 'live' || state === 'shipping';
  const label = STATE_LABELS[state] ?? STATE_LABELS.idle;

  // Chip is non-interactive, so the 44px touch-target rule from the spec
  // doesn't apply here. Sizing it tightly keeps the header compact on
  // small screens.
  return (
    <div
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[#ff6d05]/60 bg-black/50 px-2 sm:h-9 sm:gap-2 sm:px-3 ${reduceMotion || !isPulsing ? '' : 'live-chip-breathe'}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2"
        >
          {isPulsing && <span className="live-dot" aria-hidden />}
          <span className="text-shadow-neon-orange text-[0.7rem] font-bold uppercase tracking-[0.15em] sm:text-xs">
            {loading ? '…' : label}
          </span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function Counter({ label, value, reduceMotion }) {
  // Always start from 0 so the count-up animation fires on mount —
  // including when AnimatePresence remounts the content branch after
  // the skeleton exits, or when the user navigates back to the home
  // page from elsewhere. Subsequent value updates animate from the
  // last finished value (held in fromRef) to the new target.
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const target = value ?? 0;
    const from = fromRef.current;
    if (reduceMotion || from === target) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const delta = Math.abs(target - from);
    const duration = Math.min(2200, 1100 + delta * 100);
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // Piecewise curve: linear "ticking up fast" through the first 75%
      // of the value (covered in the first half of the duration), then a
      // strong cubic ease-out for the last 25% so the final approach is
      // visibly slow. Matches the user-described feel of "fast then
      // slow finish past 75%".
      const FAST_END_TIME = 0.5;
      const FAST_END_VALUE = 0.75;
      let eased;
      if (t <= FAST_END_TIME) {
        eased = (t / FAST_END_TIME) * FAST_END_VALUE;
      } else {
        const tail = (t - FAST_END_TIME) / (1 - FAST_END_TIME);
        eased = FAST_END_VALUE + (1 - FAST_END_VALUE) * (1 - Math.pow(1 - tail, 3));
      }
      const current = Math.round(from + (target - from) * eased);
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduceMotion]);

  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-semibold">{display}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function RelativeTime({ iso }) {
  const [, setTick] = useState(0);

  // Adaptive tick rate so the displayed unit always feels live:
  //   < 1 min ago  → re-render every 1s   (seconds tick smoothly)
  //   < 1 hour ago → re-render every 30s  (minutes increment naturally)
  //   < 1 day ago  → re-render every 1m   (hours)
  //   ≥ 1 day ago  → re-render every 1h   (days)
  // A self-rescheduling setTimeout (rather than setInterval) lets the
  // delay change as the elapsed unit grows.
  useEffect(() => {
    if (!iso) return;
    const target = new Date(iso).getTime();

    const nextDelay = () => {
      const sec = Math.max(0, (Date.now() - target) / 1000);
      if (sec < 60) return 1000;
      if (sec < 3600) return 30 * 1000;
      if (sec < 86400) return 60 * 1000;
      return 60 * 60 * 1000;
    };

    let timeoutId;
    const schedule = () => {
      timeoutId = setTimeout(() => {
        setTick((n) => n + 1);
        schedule();
      }, nextDelay());
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [iso]);

  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return null;
  return (
    <span className="opacity-70" title={new Date(iso).toLocaleString()}>
      Updated {formatRelative(diffMs)}
    </span>
  );
}

function formatRelative(ms) {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

// Loading state. Mirrors the real header layout exactly so the swap to
// content doesn't cause a layout shift. Each block fades + scales in
// with a 60ms stagger, matching the cadence the loaded content uses, so
// the load → ready transition reads as one continuous choreography.
function HeaderSkeleton({ reduceMotion }) {
  const skeletonContainer = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.06, delayChildren: 0.05 },
        },
      };
  const skeletonChild = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, scale: 0.92, y: 4 },
        visible: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { duration: 0.35, ease: 'easeOut' },
        },
      };

  return (
    <motion.div
      key="skeleton"
      variants={skeletonContainer}
      initial="hidden"
      animate="visible"
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.25 }}
      className="flex flex-row items-center gap-2 sm:gap-3 md:gap-4"
      aria-hidden
    >
      {/* chip skeleton — same dimensions as StateChip */}
      <motion.div
        variants={skeletonChild}
        className="header-skeleton h-7 w-[5.5rem] shrink-0 rounded-full sm:h-9 sm:w-[7rem]"
      />

      {/* message skeleton — two stacked lines (75% + 50% widths) */}
      <motion.div
        variants={skeletonChild}
        className="min-w-0 flex-1 space-y-1.5"
      >
        <div className="header-skeleton h-3 w-[80%] rounded sm:h-4" />
        <div className="header-skeleton h-3 w-[55%] rounded sm:h-4" />
      </motion.div>

      {/* counter skeletons — only on sm+ to mirror the real layout */}
      <motion.div
        variants={skeletonChild}
        className="hidden flex-wrap items-center gap-x-3 gap-y-1 sm:flex"
      >
        <div className="header-skeleton h-3 w-12 rounded" />
        <div className="header-skeleton h-3 w-14 rounded" />
        <div className="header-skeleton h-3 w-20 rounded" />
        <div className="header-skeleton h-3 w-20 rounded" />
      </motion.div>
    </motion.div>
  );
}
