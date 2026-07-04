'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import MetricPopover from './MetricPopover';
import { useNow } from './useNow';
import { formatAge } from '@/utils/formatAge';

// Live Maintenance Header (issue #24, multi-repo since issue #94).
//
// OPSLINE redesign: the header renders the portfolio-wide development
// state as a segmented instrument strip — labeled fields separated by
// vertical hairlines — instead of a prose sentence:
//
//   [ STATE | FOCUS (flex-1) | PRS | ISSUES | PUSHES · 24H | SYNC ]
//
// STATE carries a four-node delivery rail (plan → build → ship → live)
// whose active node breathes; FOCUS sets the current work item's number
// as a mono folio figure next to its full title; the metric columns keep
// their per-repo breakdown popovers; SYNC blips once per successful poll.
// Signal confidence is deliberately NOT rendered — it lives in the SYNC
// tooltip so a low-confidence reading never headlines the strip.
//
// Data: fetches /api/work-status on mount, polls every 30s while the tab
// is visible (and every 15 min when hidden). All animations are
// restricted to transform/opacity/filter and respect
// prefers-reduced-motion.

// Polling cadence aligned to the 30s server cache so GitHub Project
// column moves (which don't fire repo webhooks) become visible within
// ~30s. Hidden tabs back off to 15 min — no point polling fast for a
// tab nobody is looking at. When the server signals GitHub rate-budget
// pressure (meta.softRateLimit), visible polling backs off to 60s until
// the warning clears (issue #94 §5).
const POLL_INTERVAL_MS = 30 * 1000;
const POLL_INTERVAL_SOFT_MS = 60 * 1000;
const POLL_INTERVAL_HIDDEN_MS = 15 * 60 * 1000;

const STATE_LABELS = {
  shipping: 'SHIPPING',
  live: 'LIVE',
  in_progress: 'IN PROGRESS',
  planning: 'PLANNING',
  idle: 'MAINTENANCE',
};

// Delivery-rail stations in pipeline order. `idle` is deliberately not a
// station — maintenance is off-pipeline and renders the rail dimmed with
// every node hollow.
const PIPELINE = [
  { key: 'planning', label: 'Plan' },
  { key: 'in_progress', label: 'Build' },
  { key: 'shipping', label: 'Ship' },
  { key: 'live', label: 'Live' },
];

// The strip's single rotation clock. One 10s beat drives BOTH the focus
// queue (the FOCUS field cycles through every active work item — so
// multiple open PRs/issues across projects each get their turn) AND the
// Pattern D secondaryMessage in the sub-row. One clock, not two: a
// second independent cadence made the signature field feel like churn.
// Rotation pauses while the pointer or keyboard focus is inside the
// FOCUS field — the line is a link, and swapping its target under a
// cursor about to click is a real failure, not a nicety.
//
// 12s (not 10s): a 3-item cycle then takes 36s, deliberately offset from
// the 30s poll so rotation and poll never phase-lock.
const ROTATION_MS = 12 * 1000;

// The FOCUS queue cycles through at most this many items — beyond that
// the rotation takes too long to come back around to the primary item.
const FOCUS_QUEUE_MAX = 3;

// Field-level entrance: each labeled column fades and rises in, staggered
// left-to-right, after the top hairline draws. Replaces the old section
// scale-0 pop-in — an instrument strip powers on, it doesn't bounce.
const contentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: 'easeOut',
      staggerChildren: 0.06,
      delayChildren: 0.12,
    },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

// Vertical field rules scale open with the cascade so the strip reads as
// being metered out left-to-right rather than popping in as a grid.
const ruleVariants = {
  hidden: { opacity: 0, scaleY: 0 },
  visible: { opacity: 1, scaleY: 1, transition: { duration: 0.3, ease: 'easeOut' } },
};

// Pass-through variant labels for the content branch: mount/exit opacity
// lives here while each visible tree (desktop strip / mobile stack) runs
// its own stagger orchestration via contentVariants.
const passThroughVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export default function LiveMaintenanceHeader() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [compressed, setCompressed] = useState(false);
  const reduceMotion = useReducedMotion();
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

  // Soft rate-limit backoff (issue #94 §5): the server sets
  // meta.softRateLimit while its GitHub budget guard is active. Held in a
  // ref so the polling loop picks up the latest value at each reschedule
  // without tearing down the polling effect.
  const softRateLimitRef = useRef(false);
  useEffect(() => {
    softRateLimitRef.current = Boolean(data?.meta?.softRateLimit);
  }, [data]);

  // Poll: on mount, on tab visibility change, and on the configured
  // interval. The Page Visibility API lets us back off when the tab is
  // hidden so a long-open background tab doesn't hammer the API.
  useEffect(() => {
    fetchStatus();
    let timer;

    // Self-rescheduling timeout (same pattern as RelativeTime below) so
    // every cycle re-reads the current visibility + soft-backoff state —
    // a fixed setInterval would hold a stale cadence until the next
    // visibility change.
    const nextDelay = () =>
      document.visibilityState === 'hidden'
        ? POLL_INTERVAL_HIDDEN_MS
        : softRateLimitRef.current
          ? POLL_INTERVAL_SOFT_MS
          : POLL_INTERVAL_MS;

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fetchStatus();
        schedule();
      }, nextDelay());
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchStatus();
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      abortRef.current?.abort();
    };
  }, [fetchStatus]);

  // Scroll-aware compression. Subtle: we only need a single boolean
  // flip past a hero threshold, not a continuous transform. Under
  // compression the eyebrow line and FOCUS sub-row collapse so the strip
  // returns to a single visual band (mobile collapses its metric row
  // first).
  useEffect(() => {
    const onScroll = () => setCompressed(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const state = data?.state ?? 'idle';
  const stateLabel = STATE_LABELS[state] ?? STATE_LABELS.idle;

  const meta = data?.meta ?? {
    activePrs: 0,
    activeIssues: 0,
    recentPushes: 0,
    lastUpdated: null,
  };

  // Per-repo item lists for the counter popovers (issue #94). Defensive
  // against a stale cached payload that predates the multi-repo schema.
  const breakdown = {
    prs: Array.isArray(meta.breakdown?.prs) ? meta.breakdown.prs : [],
    issues: Array.isArray(meta.breakdown?.issues) ? meta.breakdown.issues : [],
    pushes: Array.isArray(meta.breakdown?.pushes) ? meta.breakdown.pushes : [],
  };

  // True per-repo totals for the popovers' collapsible section headers and
  // per-project "+ N more" rows. Keyed by display name — the same join key
  // as the breakdown items' `repo` field. Defensive like `breakdown`:
  // a stale pre-#94 payload simply yields no totals and the popover falls
  // back to counting the items it was given.
  const byRepo = meta.byRepo && typeof meta.byRepo === 'object' ? meta.byRepo : {};
  const repoTotals = (key) =>
    Object.fromEntries(
      Object.entries(byRepo).map(([repo, counts]) => [repo, counts?.[key] ?? 0]),
    );

  // The FOCUS queue: every current work item (multiple open PRs/issues,
  // same or different projects), cycled by the shared rotation beat. The
  // matching breakdown entry (when the item is within the per-repo cap)
  // contributes each item's repo attribution and the GitHub URL that
  // makes the block a link.
  const focusItems = Array.isArray(meta.topItems)
    ? meta.topItems.slice(0, FOCUS_QUEUE_MAX)
    : [];
  // Beat resets only when the queue's identity changes — NOT on every
  // 30s poll (setData fires per poll even when nothing changed, and
  // restarting the cycle each poll would trap the rotation on item 1).
  const focusSignature = focusItems
    .map((item) => `${item.type}#${item.number}`)
    .join(',');

  const [beat, setBeat] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const secondary = data?.secondaryMessage ?? null;
  const rotating = focusItems.length > 1 || Boolean(secondary);

  useEffect(() => {
    setBeat(0);
  }, [focusSignature]);

  useEffect(() => {
    if (!rotating || rotationPaused) return undefined;
    const id = setInterval(() => {
      // Hidden tabs skip beats instead of accumulating them — returning
      // users find a live rotation, not a burned-through one.
      if (document.visibilityState === 'hidden') return;
      setBeat((b) => b + 1);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [rotating, rotationPaused]);

  const pauseHandlers = {
    onMouseEnter: () => setRotationPaused(true),
    onMouseLeave: () => setRotationPaused(false),
    onFocusCapture: () => setRotationPaused(true),
    onBlurCapture: () => setRotationPaused(false),
  };

  const queueLength = focusItems.length;
  // Sign-safe modulo: ArrowLeft stepping can take `beat` negative, and JS
  // % returns negative remainders.
  const queueIndex = queueLength
    ? ((beat % queueLength) + queueLength) % queueLength
    : 0;
  const focus = queueLength ? focusItems[queueIndex] : null;
  // Pattern D shares the beat: odd beats surface the secondaryMessage in
  // the sub-row, even beats show the current item's repo attribution.
  // Ambient content yields under interrogation: while the user is
  // hovering/focused (rotationPaused), the sub-row always shows the
  // current item's own attribution — stepping to an item and getting the
  // unrelated secondary message instead would answer the wrong question.
  const showSecondary =
    Boolean(secondary) && ((beat % 2) + 2) % 2 === 1 && !rotationPaused;

  // Arrow keys drive the same beat the rotation clock advances — the
  // manual control and the clock are one instrument dial. Only plain
  // Left/Right are captured (Alt/Cmd+Left is browser history), and only
  // when there's an actual queue to step.
  const handleQueueKeys = (event) => {
    if (queueLength <= 1) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    event.stopPropagation();
    setBeat((b) => (event.key === 'ArrowRight' ? b + 1 : b - 1));
  };
  const queueHint =
    queueLength > 1 ? '← → arrow keys cycle the focus queue' : undefined;

  // Match by number AND title first — with multiple tracked repos, a bare
  // issue/PR number can exist in both, and a number-only match could
  // attribute the wrong repo and URL. Number-only remains the fallback
  // for stale payloads whose titles were normalized differently.
  const focusPool = focus?.type === 'pr' ? breakdown.prs : breakdown.issues;
  const focusDetail = focus
    ? (focusPool.find(
        (item) => item.number === focus.number && item.title === focus.title,
      ) ??
      focusPool.find((item) => item.number === focus.number) ??
      null)
    : null;
  const focusEyebrow = focus
    ? `Focus · ${focus.type === 'pr' ? 'PR' : 'Issue'}`
    : 'Focus';
  // Reserve the folio's width for the widest number in the queue ("#" +
  // digits) so the title's left edge never shifts as the rotation cycles
  // between numbers of different lengths.
  const folioReserveCh =
    1 + Math.max(1, ...focusItems.map((item) => String(item.number).length));

  // ACTIVITY sparkline data — defensive like `breakdown`: a stale
  // pre-v3-schema payload simply omits the field and the column (plus its
  // paired rule) doesn't render.
  const rawTrace = meta.activityTrace;
  const activityTrace =
    rawTrace &&
    Array.isArray(rawTrace.counts) &&
    rawTrace.counts.length > 0 &&
    rawTrace.counts.every((n) => Number.isFinite(n) && n >= 0)
      ? rawTrace
      : null;

  const repoCount = Object.keys(byRepo).length;
  const monitoringCopy =
    repoCount > 0
      ? `Monitoring ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'} — no active focus item`
      : 'Monitoring tracked repositories';

  const confidence = meta.confidence ?? 0;
  const softRateLimit = Boolean(meta.softRateLimit);
  // Mirror the visible-tab cadence picked by the polling effect. The hidden
  // 15-minute tier is deliberately omitted: a tooltip can't be read while
  // the tab is hidden, so it would only add noise.
  const pollSeconds =
    (softRateLimit ? POLL_INTERVAL_SOFT_MS : POLL_INTERVAL_MS) / 1000;
  const syncTitle = `Signal confidence ${confidence} · polls every ${pollSeconds} seconds${
    softRateLimit ? ' while metered' : ''
  }`;

  const isInitialLoading = loading && !data;

  // Stable announcement string for screen readers — updates only when
  // genuinely new API data arrives, NOT on the seconds tick or the
  // sub-row rotation. The visible <motion.section> is intentionally not a
  // live region (role="region" + aria-live="off") so live embellishments
  // never trigger repeated announcements. Sync recency is deliberately
  // excluded: including it would re-announce on every 30s poll.
  // Announce the canonical primary item (queue head), never the rotating
  // one — the visible rotation must not re-announce every 10s.
  const primaryFocus = focusItems[0] ?? null;
  const srAnnouncement = data
    ? [
        `Status: ${stateLabel.toLowerCase()}.`,
        primaryFocus
          ? `Current focus: ${primaryFocus.type === 'pr' ? 'pull request' : 'issue'} ${primaryFocus.number}, ${primaryFocus.title}.`
          : null,
        `${pluralize(meta.activePrs, 'active pull request')}, ${pluralize(meta.activeIssues, 'open issue')}, and ${pluralize(meta.recentPushes, 'push', 'pushes')} in the last 24 hours.`,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const v = (variants) => (reduceMotion ? undefined : variants);

  return (
    <motion.section
      role="region"
      aria-live="off"
      aria-busy={isInitialLoading}
      aria-label="Live maintenance status"
      // The initial/whileInView styles are deliberately identical in both
      // motion modes (only the transition timing branches): this element
      // renders at SSR, where useReducedMotion() is always false, so any
      // reduceMotion-dependent style here would hydration-mismatch for
      // reduced-motion users. Same rule applies to the top hairline and
      // the skeleton below.
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: false, amount: 0.3 }}
      transition={reduceMotion ? { duration: 0.12 } : { duration: 0.35, ease: 'easeOut' }}
      className={`custom-bg-abt relative isolate mx-auto w-full max-w-[min(100%,1400px)] overflow-hidden rounded-xl px-[clamp(0.6rem,2vw,1.5rem)] transition-[padding] duration-200 ${compressed ? 'py-[clamp(0.3rem,1vw,0.6rem)]' : 'py-[clamp(0.45rem,1.4vw,0.8rem)]'} ${isInitialLoading ? 'header-loading' : ''}`}
    >
      {/* Screen-reader-only live announcer. Holds the canonical status
          summary; only changes when /api/work-status returns a different
          payload, so AT users hear updates exactly once per real change. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      {/* Top hairline — draws in scaleX left-to-right on entrance, then
          sits as the strip's accent rail against the card's pale gold
          border. Replaces the old scale-0 section pop-in as the
          orchestrated entrance moment. */}
      <motion.div
        aria-hidden="true"
        className="elite-divider absolute inset-x-[clamp(0.75rem,2.5vw,2rem)] top-0 h-px"
        style={{ transformOrigin: 'left center' }}
        initial={{ opacity: 0, scaleX: 0 }}
        whileInView={{ opacity: 1, scaleX: 1 }}
        viewport={{ once: false, amount: 0.3 }}
        transition={reduceMotion ? { duration: 0.12 } : { duration: 0.5, ease: 'easeOut' }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {isInitialLoading ? (
          <HeaderSkeleton key="skeleton" reduceMotion={reduceMotion} />
        ) : (
          <motion.div
            key="content"
            variants={v(passThroughVariants)}
            initial={reduceMotion ? { opacity: 0 } : 'hidden'}
            whileInView={reduceMotion ? { opacity: 1 } : 'visible'}
            viewport={{ once: false, amount: 0.3 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, transition: { duration: 0.2 } }
            }
            className="min-w-0"
          >
            {/* ── Desktop / tablet: segmented field strip ─────────────── */}
            <motion.div
              variants={v(contentVariants)}
              className="hidden min-w-0 items-center gap-x-[clamp(0.7rem,1.7vw,1.4rem)] sm:flex"
            >
              {/* STATE — the whole column triggers the delivery-pipeline
                  legend: the instrument explains itself on hover/focus,
                  reusing the metric popover's floater and single-open
                  slot. */}
              <motion.div variants={v(childVariants)} className="shrink-0">
                <MetricPopover
                  id="work-popover-state"
                  metricLabel="Delivery pipeline"
                  panel={<StateLegendPanel state={state} repoCount={repoCount} />}
                  widthClass="w-[min(17rem,calc(100vw-1rem))]"
                  reduceMotion={reduceMotion}
                  underline={false}
                >
                  <span className="flex flex-col gap-y-1.5 text-left">
                    <Eyebrow
                      compressed={compressed}
                      className="group-hover:text-[#ffd27a]"
                    >
                      State
                    </Eyebrow>
                    <StateWord state={state} label={stateLabel} reduceMotion={reduceMotion} />
                    <DeliveryRail state={state} reduceMotion={reduceMotion} />
                  </span>
                </MetricPopover>
              </motion.div>

              <FieldRule variants={v(ruleVariants)} />

              {/* FOCUS — the strip's signature field. Hover/focus inside
                  pauses the queue rotation so the link never swaps under
                  an incoming click. */}
              <motion.div
                variants={v(childVariants)}
                className="flex min-w-0 flex-1 flex-col justify-center gap-y-1"
                title={queueHint}
                onKeyDown={handleQueueKeys}
                {...pauseHandlers}
              >
                {/* Manual-stepping announcer: populated only while the
                    user is interacting (paused), so the ambient 12s
                    rotation never re-announces. */}
                <span className="sr-only" aria-live="polite">
                  {rotationPaused && focus
                    ? `${focus.type === 'pr' ? 'Pull request' : 'Issue'} ${focus.number}: ${focus.title}`
                    : ''}
                </span>
                <Eyebrow compressed={compressed} className="flex items-center gap-x-2">
                  <span>{focusEyebrow}</span>
                  <QueueDots
                    count={queueLength}
                    active={queueIndex}
                    reduceMotion={reduceMotion}
                  />
                </Eyebrow>
                {focus ? (
                  <>
                    <FocusLine
                      focus={focus}
                      url={focusDetail?.url}
                      reserveCh={folioReserveCh}
                      reduceMotion={reduceMotion}
                    />
                    <FocusSubRow
                      repo={focusDetail?.repo}
                      lastActivityAt={focusDetail?.updatedAt ?? meta.lastActivityAt}
                      secondary={secondary}
                      showSecondary={showSecondary}
                      reduceMotion={reduceMotion}
                      compressed={compressed}
                      className="hidden min-[850px]:block"
                    />
                  </>
                ) : (
                  <p
                    className="truncate text-[clamp(0.78rem,1.5vw,0.95rem)] font-medium leading-snug"
                    style={{ color: 'rgba(255, 170, 42, 0.6)' }}
                  >
                    {monitoringCopy}
                  </p>
                )}
              </motion.div>

              <FieldRule variants={v(ruleVariants)} />

              {/* METRICS */}
              <motion.div variants={v(childVariants)} className="shrink-0">
                <MetricPopover
                  id="work-popover-prs"
                  metricLabel="Active PRs"
                  emptyLabel="No active PRs across tracked projects."
                  count={meta.activePrs}
                  items={breakdown.prs}
                  totalsByRepo={repoTotals('activePrs')}
                  stale={error}
                  reduceMotion={reduceMotion}
                >
                  <MetricField
                    eyebrow="PRs"
                    value={meta.activePrs}
                    reduceMotion={reduceMotion}
                    compressed={compressed}
                  />
                </MetricPopover>
              </motion.div>

              <FieldRule variants={v(ruleVariants)} />

              <motion.div variants={v(childVariants)} className="shrink-0">
                <MetricPopover
                  id="work-popover-issues"
                  metricLabel="Open issues"
                  emptyLabel="No open issues across tracked projects."
                  count={meta.activeIssues}
                  items={breakdown.issues}
                  totalsByRepo={repoTotals('activeIssues')}
                  stale={error}
                  reduceMotion={reduceMotion}
                >
                  <MetricField
                    eyebrow="Issues"
                    value={meta.activeIssues}
                    reduceMotion={reduceMotion}
                    compressed={compressed}
                  />
                </MetricPopover>
              </motion.div>

              {/* Pushes column sheds below 1000px — the rule travels with
                  its column so no divider ever dangles. */}
              <FieldRule variants={v(ruleVariants)} className="hidden min-[1000px]:block" />

              <motion.div variants={v(childVariants)} className="hidden shrink-0 min-[1000px]:block">
                <MetricPopover
                  id="work-popover-pushes"
                  metricLabel="Pushes (24h)"
                  emptyLabel="No pushes across tracked projects in the last 24h."
                  count={meta.recentPushes}
                  items={breakdown.pushes}
                  totalsByRepo={repoTotals('recentPushes')}
                  stale={error}
                  reduceMotion={reduceMotion}
                >
                  <MetricField
                    eyebrow="Pushes · 24h"
                    value={meta.recentPushes}
                    reduceMotion={reduceMotion}
                    compressed={compressed}
                  />
                </MetricPopover>
              </motion.div>

              {/* ACTIVITY — 14-day commit trace. Sheds first (<1100px);
                  the rule travels with its column. Not a popover trigger:
                  the sparkline IS its own breakdown. */}
              {activityTrace && (
                <>
                  <FieldRule
                    variants={v(ruleVariants)}
                    className="hidden min-[1100px]:block"
                  />
                  <motion.div
                    variants={v(childVariants)}
                    className="hidden shrink-0 min-[1100px]:block"
                  >
                    <ActivityField
                      trace={activityTrace}
                      reduceMotion={reduceMotion}
                      compressed={compressed}
                    />
                  </motion.div>
                </>
              )}

              <FieldRule variants={v(ruleVariants)} />

              {/* SYNC — the one single-line field: label and value sit on
                  one baseline ("SYNC ● 17s ago") instead of the stacked
                  eyebrow-over-value column the other fields use. The row
                  carries the anti-jitter width reservation (justify-end +
                  min-w) so label, dot, and time stay a tight cluster with
                  EQUAL gaps around the dot — reserving on the value put
                  the slack between label and dot, off-centering it. */}
              <motion.div
                variants={v(childVariants)}
                className="flex min-w-[7.5rem] shrink-0 items-baseline justify-end gap-x-1.5 whitespace-nowrap"
                title={syncTitle}
              >
                <Eyebrow compressed={false} className="whitespace-nowrap">
                  Sync
                  {softRateLimit && <span className="text-[#f9d174]"> · metered</span>}
                </Eyebrow>
                <SyncValue meta={meta} stale={error} reduceMotion={reduceMotion} />
              </motion.div>
            </motion.div>

            {/* ── Mobile (<640px): three micro-rows ───────────────────── */}
            <motion.div
              variants={v(contentVariants)}
              className="flex min-w-0 flex-col gap-y-1.5 sm:hidden"
            >
              <motion.div
                variants={v(childVariants)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-1.5">
                  <StateDot state={state} reduceMotion={reduceMotion} />
                  <StateWord
                    state={state}
                    label={stateLabel}
                    reduceMotion={reduceMotion}
                    compact
                  />
                </span>
                <span title={syncTitle}>
                  <SyncValue meta={meta} stale={error} reduceMotion={reduceMotion} compact />
                </span>
              </motion.div>

              <motion.div
                variants={v(childVariants)}
                aria-hidden="true"
                className="elite-divider h-px opacity-50"
              />

              <motion.div
                variants={v(childVariants)}
                className="flex min-w-0 flex-col gap-y-1"
                title={queueHint}
                onKeyDown={handleQueueKeys}
                {...pauseHandlers}
              >
                <Eyebrow className="flex items-center gap-x-2">
                  <span>{focusEyebrow}</span>
                  <QueueDots
                    count={queueLength}
                    active={queueIndex}
                    reduceMotion={reduceMotion}
                  />
                </Eyebrow>
                {focus ? (
                  <>
                    <FocusLine
                      focus={focus}
                      url={focusDetail?.url}
                      reserveCh={folioReserveCh}
                      reduceMotion={reduceMotion}
                      compact
                    />
                    <FocusSubRow
                      repo={focusDetail?.repo}
                      lastActivityAt={focusDetail?.updatedAt ?? meta.lastActivityAt}
                      secondary={secondary}
                      showSecondary={showSecondary}
                      reduceMotion={reduceMotion}
                      compressed={false}
                    />
                  </>
                ) : (
                  <p
                    className="text-[0.78rem] font-medium leading-snug"
                    style={{ color: 'rgba(255, 170, 42, 0.6)' }}
                  >
                    {monitoringCopy}
                  </p>
                )}
              </motion.div>

              {/* Metric row — restores the counters on mobile (previously
                  hidden below sm). Collapses first under compression. */}
              <motion.div
                variants={v(childVariants)}
                className={`overflow-hidden transition-[max-height,opacity] duration-200 ${compressed ? 'max-h-0 opacity-0' : 'max-h-16 opacity-100'}`}
              >
                <div aria-hidden="true" className="elite-divider mb-1.5 h-px opacity-50" />
                <div className="flex items-center justify-between gap-2">
                  <MetricPopover
                    id="work-popover-prs-m"
                    metricLabel="Active PRs"
                    emptyLabel="No active PRs across tracked projects."
                    count={meta.activePrs}
                    items={breakdown.prs}
                    totalsByRepo={repoTotals('activePrs')}
                    stale={error}
                    reduceMotion={reduceMotion}
                  >
                    <MetricInline label="PRs" value={meta.activePrs} reduceMotion={reduceMotion} />
                  </MetricPopover>
                  <MetricPopover
                    id="work-popover-issues-m"
                    metricLabel="Open issues"
                    emptyLabel="No open issues across tracked projects."
                    count={meta.activeIssues}
                    items={breakdown.issues}
                    totalsByRepo={repoTotals('activeIssues')}
                    stale={error}
                    reduceMotion={reduceMotion}
                  >
                    <MetricInline
                      label="Issues"
                      value={meta.activeIssues}
                      reduceMotion={reduceMotion}
                    />
                  </MetricPopover>
                  <MetricPopover
                    id="work-popover-pushes-m"
                    metricLabel="Pushes (24h)"
                    emptyLabel="No pushes across tracked projects in the last 24h."
                    count={meta.recentPushes}
                    items={breakdown.pushes}
                    totalsByRepo={repoTotals('recentPushes')}
                    stale={error}
                    reduceMotion={reduceMotion}
                  >
                    <MetricInline
                      label="Pushes"
                      value={meta.recentPushes}
                      reduceMotion={reduceMotion}
                    />
                  </MetricPopover>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="mt-2 text-center text-xs text-amber-300/80" role="alert">
          {data
            ? 'Live status temporarily unavailable. Showing the latest snapshot.'
            : 'Live status temporarily unavailable. Showing maintenance fallback.'}
        </p>
      )}
    </motion.section>
  );
}

const pluralize = (n, word, pluralWord) =>
  `${n} ${n === 1 ? word : (pluralWord ?? `${word}s`)}`;

// 10px letterspaced micro-label — the strip's field naming layer. Matches
// the popovers' eyebrow treatment (10px / 0.22em / #ffaa2a). Collapses
// (max-height + opacity) under scroll compression so the strip returns to
// a single visual band.
function Eyebrow({ children, compressed = false, className = '' }) {
  return (
    <span
      className={`block overflow-hidden text-[10px] font-medium uppercase leading-none tracking-[0.22em] text-[#ffaa2a] transition-[max-height,opacity,color] duration-200 ${
        compressed ? 'max-h-0 opacity-0' : 'max-h-3 opacity-100'
      } ${className}`}
    >
      {children}
    </span>
  );
}

// The state word — flat #ff6d05, no halo (matches the about page's flat
// digit precedent). Crossfades on state change.
function StateWord({ state, label, reduceMotion, compact = false }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={state}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className={`font-bold uppercase leading-none tracking-[0.15em] ${compact ? 'text-[0.68rem]' : 'text-xs'}`}
        style={{ color: '#ff6d05', textShadow: 'none' }}
      >
        {label}
      </motion.span>
    </AnimatePresence>
  );
}

// The delivery rail — four 5px nodes joined by 1px hairlines, one node
// per lifecycle station. Past stations are dim-filled, the active one is
// solid #ff6d05 and breathes (cadence encodes urgency: 2.4s building,
// 1.6s shipping, steady in live), future ones are hollow. Idle renders
// the whole rail dimmed and hollow — maintenance is off-pipeline. On
// state change the nodes remount and re-fill in pipeline order (80ms
// stagger), so progressions AND regressions read as the same calm
// re-metering, never as an error. Decorative: aria-hidden, meaning is
// carried by the state word and the SR announcement.
function DeliveryRail({ state, reduceMotion }) {
  const activeIdx = PIPELINE.findIndex((stage) => stage.key === state);
  const idle = activeIdx === -1;

  // No title attr: the STATE field's legend popover answers "what is
  // this?" — a native tooltip racing it would be two surfaces for one
  // question.
  return (
    <span
      aria-hidden="true"
      className={`flex w-14 items-center ${idle ? 'opacity-40' : ''}`}
    >
      {PIPELINE.map((stage, i) => {
        const isPast = !idle && i < activeIdx;
        const isActive = !idle && i === activeIdx;
        const breathe =
          isActive && !reduceMotion && state !== 'live'
            ? state === 'shipping'
              ? 'rail-node-breathe-fast'
              : 'rail-node-breathe'
            : '';
        return (
          <Fragment key={stage.key}>
            {/* Connecting segment — fills (scaleX from the left) up to the
                active node so the rail reads as distance travelled, not
                four loose dots. Future segments stay at the dim track. */}
            {i > 0 && (
              <span className="relative h-px min-w-0 flex-1 bg-[rgba(255,170,42,0.3)]">
                {!idle && i <= activeIdx && (
                  <motion.span
                    key={`fill-${state}-${i}`}
                    className="absolute inset-0 bg-[rgba(255,170,42,0.65)]"
                    style={{ transformOrigin: 'left center' }}
                    initial={reduceMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.25, delay: reduceMotion ? 0 : i * 0.08 }}
                  />
                )}
              </span>
            )}
            <motion.span
              key={`${stage.key}-${state}`}
              initial={reduceMotion ? false : { opacity: 0.2 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: reduceMotion ? 0 : i * 0.08 }}
              className={`h-[5px] w-[5px] shrink-0 rounded-full ${breathe}`}
              style={
                isActive
                  ? { background: '#ff6d05' }
                  : isPast
                    ? { background: 'rgba(255, 170, 42, 0.65)' }
                    : { border: '1px solid rgba(255, 170, 42, 0.45)' }
              }
            />
          </Fragment>
        );
      })}
    </span>
  );
}

// Single-node state indicator for the mobile row (the rail's active node
// without the rail).
function StateDot({ state, reduceMotion }) {
  const idle = !PIPELINE.some((stage) => stage.key === state);
  const breathe =
    !idle && !reduceMotion && state !== 'live'
      ? state === 'shipping'
        ? 'rail-node-breathe-fast'
        : 'rail-node-breathe'
      : '';
  return (
    <span
      aria-hidden="true"
      className={`h-[5px] w-[5px] shrink-0 rounded-full ${breathe}`}
      style={
        idle
          ? { border: '1px solid rgba(249, 209, 116, 0.5)' }
          : { background: '#ff6d05' }
      }
    />
  );
}

// Micro queue-position rail inside the FOCUS eyebrow — one 3px dot per
// queued work item, the active one at full opacity. The DeliveryRail's
// dot vocabulary at eyebrow scale; renders only when there's an actual
// queue (a single dot carries no information). Decorative: aria-hidden,
// the SR announcement names the primary item.
function QueueDots({ count, active, reduceMotion }) {
  if (count <= 1) return null;
  return (
    <span
      aria-hidden="true"
      title={`Focus rotation · item ${active + 1} of ${count}`}
      className="flex shrink-0 items-center gap-x-1"
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] w-[3px] rounded-full bg-[#ff6d05] ${reduceMotion ? '' : 'transition-opacity duration-200'}`}
          style={{ opacity: i === active ? 1 : 0.35 }}
        />
      ))}
    </span>
  );
}

// ACTIVITY — 14-day commit sparkline, one 2px bar per UTC day, today
// last. Sparse-but-real data is the design problem: zero days render a
// 1px baseline tick in the rail's dim-track color (channel open, no
// signal — a deliberate dotted rhythm, not absence), and nonzero heights
// use square-root scaling with a 3px floor so a 1-commit day clears the
// tick line while a burst compresses to the full 14px without flattening
// everything else. Flat fills only; today's bar is the accent orange.
// No visible numeric total — the title and sr text carry it once.
function ActivityField({ trace, reduceMotion, compressed }) {
  const max = Math.max(...trace.counts, 1);
  const summary = `${trace.total} commit${trace.total === 1 ? '' : 's'} · last ${trace.counts.length} days${trace.truncated ? ' (oldest days undercounted)' : ''}`;
  return (
    <span className="flex flex-col items-center gap-y-1.5" title={summary}>
      <Eyebrow compressed={compressed} className="whitespace-nowrap">
        Activity · 14d
      </Eyebrow>
      <span className="flex h-[14px] items-end gap-x-[2px]" aria-hidden="true">
        {trace.counts.map((count, i) => {
          if (count === 0) {
            return (
              <span
                key={i}
                className="w-[2px] shrink-0"
                style={{ height: 1, background: 'rgba(255, 170, 42, 0.3)' }}
              />
            );
          }
          const height = Math.max(3, Math.round(14 * Math.sqrt(count / max)));
          const isToday = i === trace.counts.length - 1;
          return (
            <motion.span
              key={i}
              className="w-[2px] shrink-0"
              style={{
                height,
                background: isToday ? '#ff6d05' : 'rgba(255, 170, 42, 0.65)',
                transformOrigin: 'bottom center',
              }}
              initial={reduceMotion ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{
                duration: 0.3,
                delay: reduceMotion ? 0 : 0.15 + i * 0.02,
                ease: 'easeOut',
              }}
            />
          );
        })}
      </span>
      <span className="sr-only">{summary}</span>
    </span>
  );
}

// One-line meanings for the pipeline legend — mirrors the server's actual
// state-derivation rules (workSignal.js precedence), so the legend is
// documentation of real behavior, not marketing copy.
const STAGE_MEANINGS = {
  planning: 'Open issues queued and scoped',
  in_progress: 'Active work on branches and pull requests',
  shipping: 'Merged work moved to Done in the last 48 hours',
  live: 'Commits or updates within the last 2 hours',
};

// The STATE field's hover/focus legend: the four pipeline stages plus the
// off-pipeline maintenance row, current position highlighted. Pure text —
// the popover's Tab handling lets keyboard focus exit naturally. The
// current stage's dot does NOT breathe: the rail already pulses on the
// strip, and one motion source per meaning is the rule.
function StateLegendPanel({ state, repoCount }) {
  const activeIdx = PIPELINE.findIndex((stage) => stage.key === state);
  const idle = activeIdx === -1;
  const dotStyle = (isActive, isPast) =>
    isActive
      ? { background: '#ff6d05' }
      : isPast
        ? { background: 'rgba(255, 170, 42, 0.65)' }
        : { border: '1px solid rgba(255, 170, 42, 0.45)' };
  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {idle
          ? 'Delivery pipeline. Off pipeline: maintenance monitoring.'
          : `Delivery pipeline. Current stage: ${PIPELINE[activeIdx].label}, ${activeIdx + 1} of ${PIPELINE.length}.`}
      </p>
      <div aria-hidden="true">
        <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#ffaa2a]">
          Delivery pipeline
        </p>
        <h3
          className="mb-1 text-sm font-semibold uppercase tracking-[0.08em]"
          style={{ color: '#ff6d05', textShadow: 'none' }}
        >
          {idle
            ? 'Maintenance · off pipeline'
            : `${PIPELINE[activeIdx].label} · stage ${activeIdx + 1} of ${PIPELINE.length}`}
        </h3>
        <div className="elite-divider mb-3 h-px" />
        <ul className="space-y-2">
          {PIPELINE.map((stage, i) => {
            const isActive = !idle && i === activeIdx;
            const isPast = !idle && i < activeIdx;
            return (
              <li key={stage.key} className="flex items-center gap-x-2">
                <span
                  className="h-[5px] w-[5px] shrink-0 rounded-full"
                  style={dotStyle(isActive, isPast)}
                />
                <span className="min-w-0">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.15em]"
                    style={{ color: isActive ? '#ff6d05' : 'rgba(255, 170, 42, 0.75)' }}
                  >
                    {stage.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-[#f9d174]/80">
                    {STAGE_MEANINGS[stage.key]}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {/* The half-opacity divider IS the off-pipeline boundary. */}
        <div className="elite-divider my-2.5 h-px opacity-50" />
        <div className="flex items-center gap-x-2">
          <span
            className="h-[5px] w-[5px] shrink-0 rounded-full"
            style={{ border: '1px solid rgba(249, 209, 116, 0.5)' }}
          />
          <span className="min-w-0">
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: idle ? '#ff6d05' : 'rgba(255, 170, 42, 0.75)' }}
            >
              Maintenance
            </span>
            <span className="block text-[11px] leading-snug text-[#f9d174]/80">
              Off pipeline — monitoring{' '}
              {repoCount > 0 ? `${repoCount} repos` : 'tracked repositories'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// Vertical hairline between fields. Always paired with the column to its
// right via matching visibility classes so a shed column never leaves a
// dangling rule.
function FieldRule({ variants, className = '' }) {
  return (
    <motion.span
      variants={variants}
      aria-hidden="true"
      className={`elite-divider-v h-[clamp(1.9rem,3.4vw,2.5rem)] w-px shrink-0 self-center ${className}`}
    />
  );
}

// The focus item's number as a rolling folio figure: on change, each
// digit slides up 0.4em through a 2px blur crossfade, staggered 40ms
// left-to-right — a page number being reset in metal type. Instant swap
// under reduced motion. The visible digits are aria-hidden; the anchor's
// aria-label (or the SR announcement) carries the value.
function RollingDigits({ value, reduceMotion }) {
  const digits = String(value ?? '').split('');
  return (
    <span className="inline-flex" aria-hidden="true">
      {digits.map((digit, i) => (
        <AnimatePresence key={i} mode="popLayout" initial={false}>
          <motion.span
            key={`${value}-${digit}`}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: '0.4em', filter: 'blur(2px)' }
            }
            animate={{
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              transition: {
                duration: reduceMotion ? 0.12 : 0.28,
                delay: reduceMotion ? 0 : i * 0.04,
                ease: 'easeOut',
              },
            }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.1 } }
                : {
                    opacity: 0,
                    y: '-0.4em',
                    filter: 'blur(2px)',
                    transition: { duration: 0.18, delay: i * 0.04 },
                  }
            }
          >
            {digit}
          </motion.span>
        </AnimatePresence>
      ))}
    </span>
  );
}

// FOCUS value line: mono folio number + full item title, the whole line a
// link to the item on GitHub when the breakdown carried its URL. The
// title keeps the fire-amber gradient (the strip's one gradient moment);
// the underline affordance gets an explicit decoration color because the
// gradient text's own color is transparent.
//
// On queue advance the digits roll first (RollingDigits fires on the
// value change) and the title crossfades a beat behind — the number
// leads, the annotation follows, like an instrument re-metering. The "#"
// is dimmed furniture (folio typography: the digits carry the meaning)
// and never animates; `reserveCh` pins the folio's width to the widest
// number in the queue so the title's left edge holds still all cycle.
function FocusLine({ focus, url, reserveCh = 3, reduceMotion, compact = false }) {
  const typeWord = focus.type === 'pr' ? 'pull request' : 'issue';
  const content = (
    <span className="flex min-w-0 items-baseline gap-x-2">
      <span
        className={`shrink-0 font-mono font-semibold leading-none tabular-nums ${compact ? 'text-[0.95rem]' : 'text-[clamp(1.05rem,1.6vw,1.25rem)]'}`}
        style={{ color: '#ff6d05', textShadow: 'none', minWidth: `${reserveCh}ch` }}
      >
        <span style={{ color: 'rgba(255, 170, 42, 0.65)' }}>#</span>
        <RollingDigits value={focus.number} reduceMotion={reduceMotion} />
      </span>
      <span className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${focus.type}-${focus.number}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
            animate={
              reduceMotion
                ? { opacity: 1, transition: { duration: 0.12 } }
                : {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.22, delay: 0.06, ease: 'easeOut' },
                  }
            }
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.1 } }
                : { opacity: 0, y: -4, transition: { duration: 0.18 } }
            }
            className={`text-fire-amber block truncate font-medium leading-snug decoration-[#ffaa2a]/70 underline-offset-2 ${compact ? 'text-[0.78rem]' : 'text-[clamp(0.78rem,1.5vw,0.95rem)]'} ${url ? 'group-hover/focus:underline' : ''}`}
            title={focus.title}
          >
            {focus.title}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );

  if (!url) return content;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${typeWord} #${focus.number}: ${focus.title} on GitHub`}
      className="group/focus relative block min-w-0 rounded-sm before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
    >
      {content}
    </a>
  );
}

// Quiet attribution line under the focus item: repo + live "active Ns
// ago". Fully controlled by the parent's shared rotation beat — when the
// API sends a secondaryMessage (Pattern D), odd beats surface it here.
// No timer of its own: one clock drives the whole strip's rotation.
function FocusSubRow({
  repo,
  lastActivityAt,
  secondary,
  showSecondary = false,
  reduceMotion,
  compressed,
  className = '',
}) {
  if (!lastActivityAt && !secondary && !repo) return null;

  return (
    <span
      className={`block overflow-hidden transition-[max-height,opacity] duration-200 ${compressed ? 'max-h-0 opacity-0' : 'max-h-4 opacity-100'} ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={showSecondary ? 'secondary' : `primary-${repo ?? 'global'}`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: reduceMotion ? 0.1 : 0.22 }}
          className="block truncate text-[11px] leading-tight text-[#f9d174]/90"
        >
          {showSecondary && secondary ? (
            secondary
          ) : (
            <>
              {repo ? `${repo} · ` : ''}
              {lastActivityAt ? (
                <>
                  active <ActiveAge iso={lastActivityAt} />
                </>
              ) : null}
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Live age text on the shared once-per-second ticker. Isolated in its own
// component so the seconds tick re-renders this span, not the header.
function ActiveAge({ iso }) {
  const now = useNow(Boolean(iso));
  if (!iso) return null;
  return formatAge(iso, now);
}

// Instruments dim dead channels: a zero metric renders in muted amber so
// the eye goes to the live figures.
const metricColor = (value) =>
  (value ?? 0) === 0 ? 'rgba(255, 170, 42, 0.45)' : '#ff6d05';

// Desktop metric column: centered eyebrow over a centered mono figure.
// The 4ch reservation means the 0→209 count-up never reflows its
// neighbors (centered, not right-aligned: these are independent labeled
// fields, not a comparison table — right-hanging digits under a centered
// eyebrow read as misalignment). Hovering the popover trigger brightens
// the eyebrow (group-hover via the trigger button).
function MetricField({ eyebrow, value, reduceMotion, compressed }) {
  return (
    <span className="flex flex-col items-center gap-y-1.5">
      <Eyebrow
        compressed={compressed}
        className="whitespace-nowrap group-hover:text-[#ffd27a]"
      >
        {eyebrow}
      </Eyebrow>
      <span
        className="min-w-[4ch] text-center font-mono text-[clamp(0.95rem,1.55vw,1.1rem)] font-semibold leading-none tabular-nums"
        style={{ color: metricColor(value), textShadow: 'none' }}
      >
        <MetricValue value={value} reduceMotion={reduceMotion} />
      </span>
    </span>
  );
}

// Mobile metric pair: "1 PRS" — digit first, micro-label after.
function MetricInline({ label, value, reduceMotion }) {
  return (
    <span className="flex items-baseline gap-x-1 whitespace-nowrap">
      <span
        className="font-mono text-[0.85rem] font-semibold leading-none tabular-nums"
        style={{ color: metricColor(value), textShadow: 'none' }}
      >
        <MetricValue value={value} reduceMotion={reduceMotion} />
      </span>
      <span className="text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-[#ffaa2a]">
        {label}
      </span>
    </span>
  );
}

// SYNC value: a 5px dot that blips once per successful poll (keyed on
// lastUpdated — remounts and plays a single 300ms opacity pulse, no
// loop), next to the live relative time. Stale data hollows the dot and
// swaps the time for STALE.
function SyncValue({ meta, stale, reduceMotion, compact = false }) {
  return (
    <span
      className={`flex items-center gap-x-1.5 whitespace-nowrap leading-none tabular-nums ${compact ? 'text-[0.68rem]' : 'text-[clamp(0.7rem,1.4vw,0.85rem)]'}`}
    >
      {stale ? (
        <span
          aria-hidden="true"
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ border: '1px solid rgba(249, 209, 116, 0.6)' }}
        />
      ) : (
        <motion.span
          key={meta.lastUpdated ?? 'sync'}
          aria-hidden="true"
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ background: '#ff6d05' }}
          initial={{ opacity: 0.45 }}
          animate={reduceMotion ? { opacity: 0.45 } : { opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.3, times: [0, 0.5, 1] }}
        />
      )}
      {/* The row (not the text) carries a min-width with justify-end, so
          9s→10s / 59s→1m digit-count changes never compress the flex-1
          FOCUS field, while the dot stays glued to the time — a
          text-level reservation stranded the dot left of short values. */}
      {stale ? (
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-[#f9d174]/70">
          Stale
        </span>
      ) : (
        <RelativeTime iso={meta.lastUpdated} />
      )}
    </span>
  );
}

// Metric figure with two motion vocabularies, by moment:
//   - ENTRANCE (mount): the rAF count-up 0 → N — the strip's power-on
//     theater, fast start with a slow settle past 75%.
//   - LIVE DELTAS (later polls): the same 0.28s digit roll as the FOCUS
//     folio — one shared "value changed" grammar across the strip; a
//     1.1s count-up for a +1 tick read as theatrical.
// The visible rolling digits are aria-hidden, so a sibling sr-only span
// carries the value for the popover trigger's accessible name.
function MetricValue({ value, reduceMotion }) {
  const [display, setDisplay] = useState(0);
  const [entered, setEntered] = useState(false);
  const targetRef = useRef(value ?? 0);
  targetRef.current = value ?? 0;

  useEffect(() => {
    if (entered) return undefined;
    const target = targetRef.current;
    if (reduceMotion || target === 0) {
      setDisplay(target);
      setEntered(true);
      return undefined;
    }
    const duration = Math.min(2200, 1100 + target * 100);
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // Piecewise curve: linear "ticking up fast" through the first 75%
      // of the value (covered in the first half of the duration), then a
      // strong cubic ease-out for the last 25% so the final approach is
      // visibly slow.
      const FAST_END_TIME = 0.5;
      const FAST_END_VALUE = 0.75;
      let eased;
      if (t <= FAST_END_TIME) {
        eased = (t / FAST_END_TIME) * FAST_END_VALUE;
      } else {
        const tail = (t - FAST_END_TIME) / (1 - FAST_END_TIME);
        eased = FAST_END_VALUE + (1 - FAST_END_VALUE) * (1 - Math.pow(1 - tail, 3));
      }
      setDisplay(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setEntered(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [entered, reduceMotion]);

  if (!entered) return display;
  return (
    <>
      <RollingDigits value={value ?? 0} reduceMotion={reduceMotion} />
      <span className="sr-only">{value ?? 0}</span>
    </>
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
    if (!iso) return undefined;
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

  // Split the formatted output ("46s ago" / "5m ago" / …) so the numeric
  // digits render in flat #ff6d05 while the unit text reads in the
  // `.text-fire-amber` gradient. Guarded fallback renders the whole
  // string in the gradient if the format ever changes shape so the
  // digits regex stops matching.
  const formatted = formatRelative(diffMs);
  const match = /^(\d+)(\D.*)$/.exec(formatted);

  return (
    <span title={new Date(iso).toLocaleString()}>
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

// Loading state. Mirrors the new field geometry exactly — one skeleton
// block per field at the same clamp sizes and shedding breakpoints — so
// the AnimatePresence swap to content causes no layout shift.
//
// The skeleton renders at SSR (data is always null on the server), so
// its variant STYLES are identical in both motion modes and only the
// transition timing branches on reduceMotion — style branches here would
// hydration-mismatch for reduced-motion users (see the section wrapper's
// comment).
function HeaderSkeleton({ reduceMotion }) {
  const skeletonBlocks = (
    <>
      {/* Desktop strip skeleton */}
      <div className="hidden min-w-0 flex-1 items-center gap-x-[clamp(0.7rem,1.7vw,1.4rem)] sm:flex">
        {/* STATE: eyebrow / word / rail */}
        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex shrink-0 flex-col gap-y-1.5"
        >
          <div className="header-skeleton h-2 w-9 rounded" />
          <div className="header-skeleton h-3 w-20 rounded" />
          <div className="header-skeleton h-[5px] w-14 rounded-full" />
        </SkeletonBlock>

        <div className="h-8 w-px shrink-0 self-center bg-[#f9d174]/10" />

        {/* FOCUS: eyebrow / folio + title / sub-row */}
        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex min-w-0 flex-1 flex-col gap-y-1.5"
        >
          <div className="header-skeleton h-2 w-16 rounded" />
          <div className="flex items-center gap-x-2">
            <div className="header-skeleton h-4 w-10 rounded" />
            <div className="header-skeleton h-3.5 w-[55%] rounded" />
          </div>
          <div className="header-skeleton hidden h-2 w-40 rounded min-[850px]:block" />
        </SkeletonBlock>

        <div className="h-8 w-px shrink-0 self-center bg-[#f9d174]/10" />

        {/* Metric columns */}
        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex shrink-0 flex-col items-center gap-y-1.5"
        >
          <div className="header-skeleton h-2 w-8 rounded" />
          <div className="header-skeleton h-4 w-9 rounded" />
        </SkeletonBlock>

        <div className="h-8 w-px shrink-0 self-center bg-[#f9d174]/10" />

        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex shrink-0 flex-col items-center gap-y-1.5"
        >
          <div className="header-skeleton h-2 w-10 rounded" />
          <div className="header-skeleton h-4 w-9 rounded" />
        </SkeletonBlock>

        <div className="hidden h-8 w-px shrink-0 self-center bg-[#f9d174]/10 min-[1000px]:block" />

        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="hidden shrink-0 flex-col items-center gap-y-1.5 min-[1000px]:flex"
        >
          <div className="header-skeleton h-2 w-14 rounded" />
          <div className="header-skeleton h-4 w-9 rounded" />
        </SkeletonBlock>

        {/* ACTIVITY sparkline column — mirrors the <1100px shed */}
        <div className="hidden h-8 w-px shrink-0 self-center bg-[#f9d174]/10 min-[1100px]:block" />

        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="hidden shrink-0 flex-col items-center gap-y-1.5 min-[1100px]:flex"
        >
          <div className="header-skeleton h-2 w-16 rounded" />
          <div className="header-skeleton h-[14px] w-[54px] rounded" />
        </SkeletonBlock>

        <div className="h-8 w-px shrink-0 self-center bg-[#f9d174]/10" />

        {/* SYNC — single-line field: label and value bars side by side */}
        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex shrink-0 items-center gap-x-2"
        >
          <div className="header-skeleton h-2 w-9 rounded" />
          <div className="header-skeleton h-3 w-16 rounded" />
        </SkeletonBlock>
      </div>

      {/* Mobile stack skeleton */}
      <div className="flex min-w-0 flex-1 flex-col gap-y-1.5 sm:hidden">
        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex items-center justify-between gap-2"
        >
          <div className="header-skeleton h-3 w-24 rounded" />
          <div className="header-skeleton h-3 w-16 rounded" />
        </SkeletonBlock>
        <SkeletonBlock reduceMotion={reduceMotion} className="h-px bg-[#f9d174]/10" />
        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex min-w-0 flex-col gap-y-1.5"
        >
          <div className="header-skeleton h-2 w-14 rounded" />
          <div className="header-skeleton h-4 w-[80%] rounded" />
        </SkeletonBlock>
        <SkeletonBlock reduceMotion={reduceMotion} className="h-px bg-[#f9d174]/10" />
        <SkeletonBlock
          reduceMotion={reduceMotion}
          className="flex items-center justify-between gap-2"
        >
          <div className="header-skeleton h-3 w-14 rounded" />
          <div className="header-skeleton h-3 w-16 rounded" />
          <div className="header-skeleton h-3 w-16 rounded" />
        </SkeletonBlock>
      </div>
    </>
  );

  return (
    <motion.div
      key="skeleton"
      variants={skeletonContainerVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.12 }
          : { duration: 0.25, staggerChildren: 0.06, delayChildren: 0.05 }
      }
      className="min-w-0"
      aria-hidden
    >
      {skeletonBlocks}
    </motion.div>
  );
}

const skeletonContainerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const skeletonChildVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

function SkeletonBlock({ reduceMotion, className, children }) {
  return (
    <motion.div
      variants={skeletonChildVariants}
      transition={reduceMotion ? { duration: 0.12 } : { duration: 0.35, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
