'use client';

// The footer's mandatory "View this project on GitHub" CTA (issue #30) — the
// one signature call-to-action of the whole colophon, so it earns real craft.
//
// It's built as ONE object · ONE palette · ONE story (the design charter): a
// single etched-graphite plate that
//   • is literally a GIT GRAPH — a hairline ember branch that forks and merges,
//     drawn on scroll-in with framer's `pathLength` 0→1 (the same self-drawing
//     language as the contact SEND check), its commit nodes popping in along it;
//   • RUNS A COMMIT on hover — a bright pulse travels the branch to HEAD (pure
//     CSS offset-path), the octocat leans, and a single ember light rakes across
//     the engraving once;
//   • LEANS magnetically toward the cursor (useMagneticPull — the same physical
//     lean as the contact CTA), so it feels physically caught, not tweened;
//   • carries an HONEST terminal caption — "❯ main · N commits · pushed <rel>" —
//     fed live by /api/project-repo (this exact repo, cached). If the fetch
//     can't complete it degrades to the branch + "open source": never a faked
//     number.
//
// Everything is transform/opacity/colour (no layout, no CLS). Under
// prefers-reduced-motion the graph is shown fully drawn and still, the pulse and
// rake are suppressed, and useMagneticPull already returns inert — so the CTA is
// a calm, static etched plate with nothing missing.

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Github } from 'lucide-react';
import { useMagneticPull } from '@/hooks/useMagneticPull';
import { useFooterReveal } from './useFooterReveal';
import { cn } from '@/lib/utils';
import { projectGithubUrl } from './footer-data';

const REPO_ENDPOINT = '/api/project-repo';

// The git-graph geometry. ONE path string drives both the drawn branch and the
// commit pulse's offset-path, so the light rides exactly on the line. A feature
// branch forks up at the 2nd commit and merges back before HEAD — a real graph
// shape, not decoration.
const BRANCH_D =
  'M4 19 H40 M40 19 C40 8, 56 8, 56 8 H70 C84 8, 84 19, 84 19 H88';
// Commit nodes: two on the trunk, one on the feature branch, then HEAD (filled).
const NODES = [
  { cx: 4, cy: 19, r: 3 },
  { cx: 40, cy: 19, r: 3 },
  { cx: 56, cy: 8, r: 3 },
];

// Compact, honest relative time. Computed on the client only (depends on "now",
// so it must never run during SSR or it desyncs at hydration). Falls back to an
// absolute month/day for anything older than a month.
function relativeTime(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Group digits so a real commit count reads cleanly (1,204 not 1204).
const formatCount = (n) =>
  typeof n === 'number' ? n.toLocaleString('en-US') : null;

export default function ProjectGithubCta() {
  const rawReduced = useReducedMotion();
  const magnet = useMagneticPull();

  const ref = useRef(null);
  // Draw the graph when the CTA scrolls into view (amount:'some' → as soon as any
  // pixel shows, so it's never caught mid-page still blank). The shared footer
  // gate (useFooterReveal) re-arms when it scrolls fully out of view and is gated
  // on the intro loader, so on this persistent footer the graph re-draws each time
  // it is scrolled to and is never spent by a page-transition transient.
  const revealed = useFooterReveal(ref, 'some');

  // useReducedMotion is null on the server; gate behind a mounted flag so SSR
  // and first client render agree, then settle (same pattern as the footer).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = mounted && rawReduced;

  // Live repo metadata — SSR-safe defaults, real values swap in after fetch.
  // `branch` shows immediately ("main"); commits/pushedAt fill in when present.
  const [repo, setRepo] = useState({
    branch: 'main',
    commits: null,
    pushedAt: null,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(REPO_ENDPOINT);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data) return;
        setRepo({
          branch: data.defaultBranch || 'main',
          commits: typeof data.commits === 'number' ? data.commits : null,
          pushedAt: data.pushedAt || null,
        });
      } catch {
        /* offline / endpoint down — keep the SSR-safe default caption */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Relative "pushed" label is null until mounted (avoids a hydration mismatch)
  // and recomputes when the timestamp arrives.
  const [pushedLabel, setPushedLabel] = useState(null);
  useEffect(() => {
    setPushedLabel(relativeTime(repo.pushedAt));
  }, [repo.pushedAt]);

  const commitsLabel = formatCount(repo.commits);

  // Draw choreography. Reduced motion → everything is shown final and still.
  const play = reduced || revealed;
  const branchTransition = reduced
    ? { duration: 0 }
    : { duration: 1.1, ease: [0.6, 0, 0.2, 1] };
  const nodeVariants = {
    rest: { opacity: 0, scale: 0 },
    draw: {
      opacity: 1,
      scale: 1,
      transition: { duration: reduced ? 0 : 0.28, ease: 'easeOut' },
    },
  };

  return (
    <motion.a
      ref={ref}
      href={projectGithubUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View this project on GitHub (opens in a new tab)"
      // The magnet's motion values ({x,y}) drive the physical lean; scope the
      // colour/shadow easing here so nothing intercepts the per-frame transform.
      style={{
        ...(magnet.style || {}),
        transition: 'box-shadow .35s ease, border-color .35s ease, color .35s ease',
      }}
      {...(magnet.handlers || {})}
      whileTap={reduced ? undefined : { scale: 0.985 }}
      className={cn(
        'gh-cta group mt-6 inline-flex max-w-full flex-col gap-2 rounded-2xl',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05]',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-night-950',
      )}
    >
      <span className="gh-cta__row">
        {/* Self-drawing git graph */}
        <span className="gh-cta__graph" aria-hidden="true">
          <svg viewBox="0 0 92 26" fill="none">
            <motion.path
              d={BRANCH_D}
              className="gh-cta__branch"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: play ? 1 : 0 }}
              transition={branchTransition}
            />
            {NODES.map((n, i) => (
              <motion.circle
                key={i}
                cx={n.cx}
                cy={n.cy}
                r={n.r}
                className="gh-cta__node"
                variants={nodeVariants}
                initial="rest"
                animate={play ? 'draw' : 'rest'}
                transition={{ delay: reduced ? 0 : 0.35 + i * 0.18 }}
              />
            ))}
            <motion.circle
              cx={88}
              cy={19}
              r={3.4}
              className="gh-cta__head"
              variants={nodeVariants}
              initial="rest"
              animate={play ? 'draw' : 'rest'}
              transition={{ delay: reduced ? 0 : 0.95 }}
            />
          </svg>
          {/* Commit pulse — rides BRANCH_D on hover (CSS offset-path). */}
          <span className="gh-cta__pulse" />
        </span>

        <Github className="gh-cta__mark" strokeWidth={1.75} aria-hidden="true" />
        <span className="gh-cta__label">View this project on GitHub</span>
        <ArrowUpRight
          className="gh-cta__arrow"
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>

      {/* Honest terminal caption — live repo metadata. The branch always shows;
          the commit count and "pushed" chip appear only once real values load,
          so it never displays a faked number. aria-hidden: the button's
          aria-label already names the action; this is a decorative live detail. */}
      <span className="gh-cta__meta" aria-hidden="true">
        <span className="gh-cta__prompt">❯</span>
        <span className="gh-cta__branchname">{repo.branch}</span>
        {commitsLabel && (
          <>
            <span className="gh-cta__sep">·</span>
            <span>
              <span className="gh-cta__num">{commitsLabel}</span> commits
            </span>
          </>
        )}
        {pushedLabel && (
          <>
            <span className="gh-cta__sep">·</span>
            <span>pushed {pushedLabel}</span>
          </>
        )}
        {!reduced && <span className="gh-cta__caret" />}
      </span>
    </motion.a>
  );
}
