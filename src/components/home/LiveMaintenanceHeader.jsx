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
// fetches /api/work-status on mount, polls every 30s while the tab is
// visible (and every 15 min when hidden), and animates state, message,
// and counter transitions. All animations are restricted to
// transform/opacity/filter and respect prefers-reduced-motion.

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
  // Guard against overlapping polls (mount + interval + visibilitychange
  // can all fire fetchStatus). The id sequence ensures only the most
  // recent request's result is allowed to call setState; the abort
  // controller cancels the in-flight request when a newer one starts.
  const latestRequestId = useRef(0);
  const abortRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/work-status', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      if (requestId === latestRequestId.current) {
        setData(json);
        setError(false);
      }
    } catch {
      if (requestId === latestRequestId.current) setError(true);
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
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
      abortRef.current?.abort();
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

  // Stable announcement string for screen readers — updates only when
  // genuinely new API data arrives, NOT when the visible message rotates
  // every 10 seconds. The visible <motion.section> is intentionally not a
  // live region (role="region" + aria-live="off") so the rotation doesn't
  // trigger repeated announcements.
  const srAnnouncement =
    data?.message && data?.headline
      ? `${data.headline}. ${data.message}`
      : data?.message ?? '';

  return (
    <motion.section
      role="region"
      aria-live="off"
      aria-busy={isInitialLoading}
      aria-label="Live maintenance status"
      variants={reduceMotion ? undefined : containerVariants}
      initial={reduceMotion ? false : 'hidden'}
      whileInView={reduceMotion ? undefined : 'visible'}
      viewport={{ once: false, amount: 0.3 }}
      className={`custom-bg-abt relative isolate mx-auto w-full max-w-[min(100%,1400px)] overflow-hidden rounded-xl px-[clamp(0.5rem,1.8vw,1.25rem)] transition-[padding] duration-200 ${compressed ? 'py-[clamp(0.3rem,1vw,0.6rem)]' : 'py-[clamp(0.4rem,1.4vw,0.85rem)]'} ${isInitialLoading ? 'header-loading' : ''}`}
    >
      {/* Screen-reader-only live announcer. Holds the canonical
                primary message; only changes when /api/work-status returns a
                different payload, so AT users hear updates exactly once per
                real change instead of every rotation tick. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      {/* Background intentionally limited to `.custom-bg-abt` (applied on
          the <motion.section> wrapper) so the maintenance header reads
          as the exact same surface as the "Architect of Enchantment"
          card on the about page, which uses ItemLayout → `custom-bg-abt`
          with no additional overlays. The previous animated sheen and
          noise textures were removed to keep that parity. */}

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
                  className="text-fire-amber break-words text-[clamp(0.78rem,1.6vw,1.05rem)] font-medium leading-snug"
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
          {data
            ? 'Live status temporarily unavailable. Showing the latest snapshot.'
            : 'Live status temporarily unavailable. Showing maintenance fallback.'}
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
      className={`status-chip-fire-border inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 sm:h-9 sm:gap-2 sm:px-3 ${reduceMotion || !isPulsing ? '' : 'live-chip-breathe'}`}
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
          {/* State label: flat #ff6d05 fill (matches the "Experience by
              category" modal title and the "Years in the craft" number
              on the about page) behind a same-color #ff6d05 text-shadow
              halo, so the SHIPPING / LIVE / etc. text reads as a single
              uniform orange accent consistent with the chip's orange
              ring border and outer halo. */}
          <span
            className="text-[0.7rem] font-bold uppercase tracking-[0.15em] sm:text-xs"
            style={{
              color: '#ff6d05',
              textShadow:
                '0 0 4px rgba(255, 109, 5, 0.55), 0 0 12px rgba(255, 109, 5, 0.35)',
            }}
          >
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

  // Number: flat #ff6d05 (matches the "4+" digit on the about page's
  // years card). Label: `.text-fire-amber` (the gradient + warm glow
  // used by the Architect of Enchantment paragraph) so the unit text
  // ("PRs", "Issues", "Pushes 24h") reads in the same fire effect as
  // the rotating message above. `tabular-nums` is inherited from the
  // counter row wrapper so the digit columns still align.
  return (
    <span className="inline-flex items-baseline gap-1">
      <span
        className="font-semibold"
        style={{ color: '#ff6d05', textShadow: 'none' }}
      >
        {display}
      </span>
      <span className="text-fire-amber">{label}</span>
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

  // Split the formatted output ("46s ago" / "5m ago" / …) so the
  // numeric digits can render in flat #ff6d05 (matches the "4+" digit
  // on the about page's years card) while the surrounding "Updated" and
  // "s ago" / "m ago" text reads in the same `.text-fire-amber`
  // gradient + glow as the Architect of Enchantment paragraph. Guarded
  // fallback renders the whole string in the gradient if the format
  // ever changes shape so the digits regex stops matching.
  const formatted = formatRelative(diffMs);
  const match = /^(\d+)(\D.*)$/.exec(formatted);

  return (
    <span title={new Date(iso).toLocaleString()}>
      <span className="text-fire-amber">Updated </span>
      {match ? (
        <>
          <span
            className="font-semibold"
            style={{ color: '#ff6d05', textShadow: 'none' }}
          >
            {match[1]}
          </span>
          <span className="text-fire-amber">{match[2]}</span>
        </>
      ) : (
        <span className="text-fire-amber">{formatted}</span>
      )}
    </span>
  );
}

function formatRelative(ms) {
  // Floor (not round) so we never claim more elapsed time than has
  // actually passed — e.g. 59m31s should still read "59m ago", not
  // "1h ago".
  const sec = Math.max(1, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// Loading state. Mirrors the real header layout exactly so the swap to
// content doesn't cause a layout shift. Two code paths:
//   - reduceMotion: a plain opacity fade with no variant chain (passing
//     "hidden"/"visible" labels with variants={undefined} would fail to
//     resolve and warn in dev).
//   - normal: container variants + staggerChildren so chip / message /
//     counters fan in one after another.
function HeaderSkeleton({ reduceMotion }) {
  const skeletonBlocks = (
    <>
      {/* chip skeleton — same dimensions as StateChip */}
      <SkeletonBlock
        reduceMotion={reduceMotion}
        className="header-skeleton h-7 w-[5.5rem] shrink-0 rounded-full sm:h-9 sm:w-[7rem]"
      />

      {/* message skeleton — two stacked lines (80% + 55% widths) */}
      <SkeletonBlock
        reduceMotion={reduceMotion}
        className="min-w-0 flex-1 space-y-1.5"
      >
        <div className="header-skeleton h-3 w-[80%] rounded sm:h-4" />
        <div className="header-skeleton h-3 w-[55%] rounded sm:h-4" />
      </SkeletonBlock>

      {/* counter skeletons — only on sm+ to mirror the real layout */}
      <SkeletonBlock
        reduceMotion={reduceMotion}
        className="hidden flex-wrap items-center gap-x-3 gap-y-1 sm:flex"
      >
        <div className="header-skeleton h-3 w-12 rounded" />
        <div className="header-skeleton h-3 w-14 rounded" />
        <div className="header-skeleton h-3 w-20 rounded" />
        <div className="header-skeleton h-3 w-20 rounded" />
      </SkeletonBlock>
    </>
  );

  if (reduceMotion) {
    return (
      <motion.div
        key="skeleton"
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="flex flex-row items-center gap-2 sm:gap-3 md:gap-4"
        aria-hidden
      >
        {skeletonBlocks}
      </motion.div>
    );
  }

  const skeletonContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.05 },
    },
  };

  return (
    <motion.div
      key="skeleton"
      variants={skeletonContainer}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="flex flex-row items-center gap-2 sm:gap-3 md:gap-4"
      aria-hidden
    >
      {skeletonBlocks}
    </motion.div>
  );
}

const skeletonChildVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' },
  },
};

function SkeletonBlock({ reduceMotion, className, children }) {
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div variants={skeletonChildVariants} className={className}>
      {children}
    </motion.div>
  );
}
