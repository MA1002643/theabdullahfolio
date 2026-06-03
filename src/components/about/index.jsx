import React, { useEffect, useMemo, useRef, useState } from "react";
import ItemLayout from "./ItemsLayout";
import { animate, useInView, useScroll, useTransform, useReducedMotion, motion } from "framer-motion";
import { projectsData } from "@/app/data";
import LanguagesCard from "./LanguagesCard";
import GitHubStatsCard from "./StatsCard";
import StreakStatsCard from "./StreakStatsCard";
import ReadmeStatsCard from "./RepoStatsCard";
import { detectChanges } from "@/utils/diffChanges";
import { computeRepoDiff } from "@/utils/repoDiff";
import { computeStatsDiff } from "@/utils/statsDiff";
import { useExperienceSummary } from "@/hooks/useExperienceSummary";
import { useProjectCountSignal } from "@/hooks/useProjectCountSignal";
import { ExperienceBreakdownModal } from "./ExperienceBreakdownModal";
import { ExperienceUpdateBanner } from "./ExperienceUpdateBanner";
import { UpdateBanner } from "./UpdateBanner";

const githubStatsStorageKey = (username) =>
  `github-stats:lastGood:${username}`;

const ARCHITECT_PARAGRAPH = "My journey in web development is powered by an array of mystical tools and languages, with JavaScript casting the core of my enchantments. I wield frameworks like React.js and Next.js with precision, crafting seamless portals (websites) that connect realms (users) across the digital universe. The ancient arts of the Jamstack empower me to create fast, secure, and dynamic experiences, while my design skills ensure every creation is not only functional but visually captivating. Beyond the visible enchantments, I tend the hidden machinery — conjuring resilient APIs and databases (the vaults where each realm's memory is safely kept) and weaving automated pipelines that carry my creations from the workshop to the cloud (the boundless aether where they finally awaken). I hold performance and accessibility as sacred vows, so every portal opens swiftly for every traveller, on any device and in any far-flung corner of the realm. Curiosity remains my truest compass, forever drawing me toward new grimoires, sharper instincts, and ideas bold enough to become living, breathing experiences. Join me as I continue to explore new spells and technologies to shape the future of the web.";
const ARCHITECT_WORDS = ARCHITECT_PARAGRAPH.split(" ");

const RevealWord = ({ children, progress, range, reducedMotion }) => {
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <motion.span style={{ opacity: reducedMotion ? 1 : opacity }}>
      {children}{" "}
    </motion.span>
  );
};

// Inline percentage count-up. Drives the count-up from `value` alone —
// not viewport visibility. The viewport-trigger variant was a UX nicety
// (replay on scroll re-entry) but compounded badly with the parent
// ItemLayout's `initial={{ scale: 0 }}` entrance: `transform: scale(0)`
// collapses every descendant's IntersectionObserver rect to zero area,
// so neither this count-up's `amount: 0.3` nor the bar segments'
// `amount: 0.5` thresholds were ever crossed. The latch in
// `useViewportCountTrigger` then refused to re-arm cleanly once the
// scale animation completed, leaving `playToken === 0` and the
// percentage stuck at the JSX-rendered "0". This was visible on the
// employment side after a stale-cache hydration: the live fetch
// correctly updated `value` to ~32, but the effect's `playToken === 0`
// guard returned early before the `animate()` ever ran.
//
// Reduced motion still skips the animation and shows the final value.
//
// `unavailable` short-circuits the whole count-up and renders an
// "Unavailable" label instead of a percentage. It's how a category whose
// source failed to load (e.g. employment, when the resume PDF can't be
// parsed) is distinguished from a genuine 0% — rendering "0%" for missing
// data would assert "zero experience" when the truth is "couldn't measure".
// `inView` (default true) makes the percentage count-up replay on every
// viewport entry: each false → true flip re-runs the 0 → value tween, and
// going out of view resets the digit to 0 so re-entry starts fresh. Defaults
// to true so a caller that doesn't gate on visibility animates once on mount.
function PercentCount({ value, unavailable = false, inView = true }) {
  const nodeRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (unavailable) return;
    const node = nodeRef.current;
    if (!node) return;
    if (prefersReducedMotion) {
      node.textContent = String(value);
      return;
    }
    if (!inView) {
      // Out of view — reset to 0 so re-entry animates from the start.
      node.textContent = "0";
      return;
    }
    const controls = animate(0, value, {
      duration: 2,
      onUpdate(v) {
        node.textContent = v.toFixed(0);
      },
    });
    return () => controls.stop();
  }, [value, prefersReducedMotion, unavailable, inView]);

  if (unavailable) {
    return (
      <span className="italic opacity-60 normal-case tracking-normal">
        Unavailable
      </span>
    );
  }

  return (
    <span className="inline-flex items-baseline">
      <span ref={nodeRef}>{prefersReducedMotion ? value : 0}</span>
      <span>%</span>
    </span>
  );
}

// Integer count-up for the projects category legend (Web / System counts).
// Mirrors the card's big `Counter` exactly — animates 0 → value over 2s on
// mount via framer's `animate`, and honours `prefers-reduced-motion` by writing
// the final value straight to the node. Lives at module scope (unlike the
// in-component `Counter`) so the module-level ProjectsSplitBar can use it.
// `inView` drives a replay-on-every-entry count-up: each time it flips false →
// true the effect re-runs and animates 0 → value again; when it goes false the
// digit resets to 0 so the next entry starts fresh. Defaults to `true` (animate
// once on mount) for any caller that doesn't gate on viewport visibility.
function CountUp({ value, inView = true }) {
  const nodeRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (prefersReducedMotion) {
      node.textContent = String(value);
      return;
    }
    if (!inView) {
      // Out of view — reset to 0 so re-entry animates from the start.
      node.textContent = "0";
      return;
    }
    const controls = animate(0, value, {
      duration: 2,
      onUpdate(v) {
        node.textContent = v.toFixed(0);
      },
    });
    return () => controls.stop();
  }, [value, prefersReducedMotion, inView]);

  return <span ref={nodeRef}>{prefersReducedMotion ? value : 0}</span>;
}

// Two-segment proportional bar shown under the years digit on the
// years card. Personal Projects on the left (gold), Employment on the
// right (cool cyan) — same color encoding as the modal donut so the
// two surfaces read as a single visual system. Segments are absolute-
// positioned tooltips rather than children of a flex so a 0%-share
// segment doesn't claim layout width.
function ExperienceSplitBar({
  personalMonths,
  employmentMonths,
  personalAvailable = true,
  employmentAvailable = true,
  inView = true,
}) {
  const prefersReducedMotion = useReducedMotion();
  // When a side's source failed to load its month count is *unknown*, not
  // zero — so exclude it from the denominator entirely. The surviving side
  // then reads as 100% of *measured* experience, and the failed row renders
  // "Unavailable" (below) instead of asserting a misleading 0%. A present-
  // but-empty side ({ months: 0 }) keeps its `*Available` flag true and
  // still shows a genuine 0%. Symmetric across both sources: GitHub failing
  // (personal) is the same misrepresentation as the resume PDF failing
  // (employment).
  const effectivePersonal = personalAvailable ? personalMonths : 0;
  const effectiveEmployment = employmentAvailable ? employmentMonths : 0;
  const total = effectivePersonal + effectiveEmployment;
  // Bail only when there's genuinely nothing to communicate: both sources
  // loaded and the measured total is zero. When a source is *unavailable*
  // we must still render so its "Unavailable" row appears — even if the
  // surviving (measured) side is itself zero (e.g. GitHub down while the
  // resume parsed but yielded no software roles). Guarding on `total === 0`
  // alone would swallow exactly that case.
  if (personalAvailable && employmentAvailable && total === 0) return null;
  // Percentages are shares of *measured* experience. With a zero measured
  // total (only reachable here when a side is unavailable), there's no
  // denominator, so a present-but-empty side reads as a genuine 0%.
  const personalPct = total > 0 ? (effectivePersonal / total) * 100 : 0;
  const employmentPct = total > 0 ? (effectiveEmployment / total) * 100 : 0;

  return (
    <div className="mt-3 w-full" aria-hidden="true">
      <div
        className="h-1.5 w-full rounded-full overflow-hidden relative"
        style={{ background: "rgba(244, 227, 184, 0.06)" }}
      >
        {/* Bar segments use `animate` (not `whileInView`) for the same
            reason PercentCount above dropped its viewport gate: the
            parent ItemLayout's `scale(0)` entrance + the segment's own
            `width: 0` initial state combine to keep the
            IntersectionObserver rect at zero area, so the
            `amount: 0.5` threshold never triggers and the bar stays
            unfilled. Driving the animation from data on mount means
            the bar fills as soon as we know the percentages, not when
            an observer that can't see it agrees. */}
        {/* Each segment is omitted entirely when its source is unavailable —
            there's no meaningful width to draw, and the surviving segment
            already fills the bar at 100%. */}
        {personalAvailable && (
          <motion.span
            className="absolute inset-y-0 left-0"
            style={{
              background: "#ff6d05",
              boxShadow: "0 0 10px rgba(255, 109, 5, 0.45)",
            }}
            initial={prefersReducedMotion ? { width: `${personalPct}%` } : { width: 0 }}
            // Re-fills on every viewport entry: `inView` (from the card-level
            // useInView, not a scale-collapsed segment observer) drives the
            // width back to 0 when the card leaves and animates it to the share
            // again on re-entry. Reduced motion holds the final width, no tween.
            animate={{ width: prefersReducedMotion || inView ? `${personalPct}%` : 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
          />
        )}
        {employmentAvailable && (
          <motion.span
            className="absolute inset-y-0"
            style={{
              left: `${personalPct}%`,
              background: "#ffd27d",
              boxShadow: "0 0 10px rgba(255, 210, 125, 0.45)",
            }}
            initial={prefersReducedMotion ? { width: `${employmentPct}%` } : { width: 0 }}
            animate={{ width: prefersReducedMotion || inView ? `${employmentPct}%` : 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
          />
        )}
      </div>
      {/* Legend — two [dot label … percentage] items. Layout is responsive:
          • Below `sm` (phones): a single stacked column (flex-col), each row
            full-width with `justify-between` so the percentages align in a
            true right-hand column. This is the original look, unchanged.
          • `sm` and up (tablets/laptops): a wrapping flex ROW. When both items
            fit they sit side by side with a safe `gap-x-6` between them; when
            they don't (a narrow lg-width 1/3 card, or the wider "Unavailable"
            labels), `flex-wrap` drops the second onto its own line and `grow`
            lets each lone item fill the width — falling back to the exact
            stacked `justify-between` rows above. `basis-[130px]` sets the
            fit/wrap threshold; `min-width:auto` (left at its default) means an
            item that's intrinsically wider than that — i.e. an "Unavailable"
            row — pushes the wrap point out on its own, so the unavailable
            state stacks precisely when the pair no longer fits. */}
      <div
        className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-1 text-[10px] uppercase tracking-[0.16em] mt-2 tabular-nums"
        style={{ color: "#d4af7a" }}
      >
        <span className="flex items-center justify-between gap-2 sm:grow sm:basis-[130px]">
          <span className="flex items-center gap-1.5">
            {/* Filled dot when measured; hollow ring when unavailable, so
                a failed source reads as "no data" rather than a real
                zero-width slice. */}
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={
                personalAvailable
                  ? { background: "#ff6d05" }
                  : { border: "1px solid #ff6d05", opacity: 0.5 }
              }
            />
            <span className="text-fire-amber">Personal</span>
          </span>
          <span style={{ color: "#ff6d05", textShadow: "none" }}>
            <PercentCount
              value={Math.round(personalPct)}
              unavailable={!personalAvailable}
              inView={inView}
            />
          </span>
        </span>
        {/* Vertical divider between the two legend items — same vivid
            #ff6d05 as the experience digit above. Shown only in the `sm+`
            side-by-side row; below `sm` the legend is a stacked column so
            this is `hidden` and no rule appears between the two rows. */}
        <span
          aria-hidden="true"
          className="hidden sm:block select-none px-3"
          style={{ color: "#ff6d05", textShadow: "none" }}
        >
          |
        </span>
        <span className="flex items-center justify-between gap-2 sm:grow sm:basis-[130px]">
          <span className="flex items-center gap-1.5">
            {/* Filled dot when measured; hollow ring when unavailable, so
                the empty employment row reads as "no data" at a glance
                rather than a real zero-width slice. */}
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={
                employmentAvailable
                  ? { background: "#ffd27d" }
                  : { border: "1px solid #ffd27d", opacity: 0.5 }
              }
            />
            <span className="text-fire-amber">Employment</span>
          </span>
          <span style={{ color: "#ff6d05", textShadow: "none" }}>
            <PercentCount
              value={Math.round(employmentPct)}
              unavailable={!employmentAvailable}
              inView={inView}
            />
          </span>
        </span>
      </div>
    </div>
  );
}

// Warm palette for the completed-projects category split, drawn from the same
// 5-tone scheme the years card uses (vivid orange → golds). Index 0/1 are the
// exact two colours of the years card's Personal/Employment segments, so a
// two-category split (Web / System today) reads as the same visual system;
// extra categories fall back to the cooler golds further down the palette.
const PROJECT_CATEGORY_COLORS = ["#ff6d05", "#ffd27d", "#ffaa2a", "#d4af7a", "#b8946a"];

// Completed-projects category split bar — the "elite & complex" counterpart to
// the years card's ExperienceSplitBar. Apportions the total project count
// across its categories (Web / System), rendering a single thin rounded bar of
// proportional segments plus a stacked legend with animated percentages. Built
// to mirror ExperienceSplitBar 1:1 visually: same height/track, same
// absolute-positioned segments (so a zero-share category never claims layout
// width), and the same 10px tracking legend rows. The fill is gated on the
// card-level `inView` prop (passed down from the parent's useInView, NOT a
// per-segment whileInView — the parent ItemLayout's `scale(0)` entrance would
// collapse a segment's own IntersectionObserver rect to zero area, exactly as
// documented on PercentCount above), so it re-fires on every viewport entry.
function ProjectsSplitBar({ breakdown, inView = true }) {
  const prefersReducedMotion = useReducedMotion();
  const total = breakdown.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return null;

  // Cumulative left-offset per segment so each absolutely-positioned slice
  // starts where the previous one ended — no flex, so a 0% category draws
  // nothing and steals no width.
  let cumulative = 0;
  const segments = breakdown.map((c, i) => {
    const pct = (c.count / total) * 100;
    const left = cumulative;
    cumulative += pct;
    return {
      ...c,
      pct,
      left,
      color: PROJECT_CATEGORY_COLORS[i % PROJECT_CATEGORY_COLORS.length],
    };
  });

  // Plain-text equivalent of the per-category counts for screen readers. The
  // bar + legend are decorative and animated (count-up via textContent), so
  // they stay aria-hidden; this string is the ONLY place the category
  // breakdown — information not expressed in text anywhere else on the card —
  // reaches assistive tech.
  const categorySummary = segments
    .map((s) => `${s.label}: ${s.count} ${s.count === 1 ? "project" : "projects"}`)
    .join(", ");

  return (
    <div className="mt-3 w-full">
      <span className="sr-only">
        Completed projects by category — {categorySummary}.
      </span>
      <div
        aria-hidden="true"
        className="h-1.5 w-full rounded-full overflow-hidden relative"
        style={{ background: "rgba(244, 227, 184, 0.06)" }}
      >
        {segments.map((s, i) => (
          <motion.span
            key={s.label}
            className="absolute inset-y-0"
            style={{
              left: `${s.left}%`,
              background: s.color,
              // 8-digit hex: `73` ≈ 0.45 alpha, matching the 0.45 glow on the
              // years card's split segments.
              boxShadow: `0 0 10px ${s.color}73`,
            }}
            initial={prefersReducedMotion ? { width: `${s.pct}%` } : { width: 0 }}
            // Re-fills on every viewport entry (see ExperienceSplitBar): the
            // card-level `inView` collapses the width to 0 on exit and animates
            // it back to the share on re-entry. Reduced motion holds final width.
            animate={{ width: prefersReducedMotion || inView ? `${s.pct}%` : 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 + i * 0.15 }}
          />
        ))}
      </div>
      {/* Legend — mirrors the years card's responsive layout exactly: a
          stacked column below `sm` (full-width rows, `justify-between`), and a
          wrapping side-by-side row from `sm` up. Each item grows to fill when
          it's alone on a line (the wrapped/stacked fallback), and a vivid
          #ff6d05 `|` divider — same colour as the count digit above — sits
          between adjacent items in the side-by-side row (hidden below `sm`). */}
      <div
        aria-hidden="true"
        className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-1 text-[10px] uppercase tracking-[0.16em] mt-2 tabular-nums"
        style={{ color: "#d4af7a" }}
      >
        {segments.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className="hidden sm:block select-none px-3"
                style={{ color: "#ff6d05", textShadow: "none" }}
              >
                |
              </span>
            )}
            <span className="flex items-center justify-between gap-2 sm:grow sm:basis-[130px]">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: s.color }}
                />
                <span className="text-fire-amber">{s.label}</span>
              </span>
              {/* Legend shows the raw project count per category (not a
                  percentage) — the bar segment widths already carry the
                  proportional share. `s.count` is derived from projectsData,
                  so adding a project to a category bumps this automatically.
                  Animated with the same 0 → count count-up as the card's big
                  "completed projects" digit. */}
              <span style={{ color: "#ff6d05", textShadow: "none" }}>
                <CountUp value={s.count} inView={inView} />
              </span>
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// Spoken equivalent of the ExperienceSplitBar legend, for the years card's
// accessible name. The card is a `role="button"` with an explicit
// `aria-label`, which makes it a leaf for name computation — its descendant
// text (the visual, aria-hidden legend included) is never announced. So the
// Personal/Employment split, and crucially the "data unavailable" state,
// have to be folded into the button's own label or screen-reader users hear
// only the grand total. Mirrors the bar's denominator logic exactly: an
// unavailable source is excluded (not counted as zero) and spoken as
// "data unavailable", while a present-but-empty side speaks a genuine
// "0 percent". Returns "" when there's nothing to split (no bar shown).
function buildSplitBreakdownLabel(experienceData) {
  // No payload yet (summary still loading) is not a failure — match the
  // visual split bar's `!!experienceData` gate and say nothing, rather than
  // announcing both sources as "data unavailable" before any request has
  // resolved. Without this guard a null payload would fall through (both
  // `*Available` false, so the both-loaded bail below never fires) and speak
  // a spurious double "data unavailable".
  if (!experienceData) return "";
  const personalAvailable = experienceData?.personalProjects != null;
  const employmentAvailable = experienceData?.employment != null;
  const personalMonths = experienceData?.personalProjects?.months ?? 0;
  const employmentMonths = experienceData?.employment?.months ?? 0;
  const effectivePersonal = personalAvailable ? personalMonths : 0;
  const effectiveEmployment = employmentAvailable ? employmentMonths : 0;
  const total = effectivePersonal + effectiveEmployment;
  // Nothing to announce only when both sources loaded and measured zero —
  // same gate as ExperienceSplitBar. With a side unavailable we still speak
  // the split so AT users hear the "data unavailable" distinction even when
  // the measured side is itself zero.
  if (personalAvailable && employmentAvailable && total === 0) return "";
  const personalText = personalAvailable
    ? `${total > 0 ? Math.round((effectivePersonal / total) * 100) : 0} percent`
    : "data unavailable";
  const employmentText = employmentAvailable
    ? `${total > 0 ? Math.round((effectiveEmployment / total) * 100) : 0} percent`
    : "data unavailable";
  return `Experience split: personal projects ${personalText}, employment ${employmentText}.`;
}

const AboutDetails = () => {
  // GitHub Username — override via NEXT_PUBLIC_GITHUB_USERNAME when forking.
  // The most-active repo is now picked server-side by /api/github-stats, so the
  // hardcoded `repo` constant that used to live here is gone (issue #22).
  const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643";

  const [githubStats, setGithubStats] = useState(null)
  const [changedFields, setChangedFields] = useState([]);
  const [repoDiffMessage, setRepoDiffMessage] = useState(null);
  // Specific per-stat change summary for the GitHub Stats card's banner
  // ("Total Stars +5 | Total Commits +50"). Null when nothing changed, so
  // the banner only fires on real value changes — never on first load.
  const [statsDiffMessage, setStatsDiffMessage] = useState(null);
  // Dev-only override so a synthetic Shift+B can fire the experience
  // banner, which is otherwise driven entirely by the hook. Stays null
  // in production builds because the listener that sets it never runs.
  const [testExperienceMessage, setTestExperienceMessage] = useState(null);

  // Scroll-linked per-word reveal for the "Architect of Enchantment" paragraph.
  // Both ends of the active scroll range are derived from the paragraph's own
  // document offset so the animation tracks paragraph visibility, not raw
  // page scroll.
  const paragraphRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const [revealRange, setRevealRange] = useState({ start: 0, end: 1000 });

  useEffect(() => {
    const measure = () => {
      const el = paragraphRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const docTop = rect.top + window.scrollY;
      const vh = window.innerHeight;
      // progress=0 anchor: scrollY at which the paragraph's top reaches 80%
      // down the viewport (just entering the active area). Clamps to 0 when
      // the paragraph already sits above that line at load.
      const start = Math.max(docTop - vh * 0.8, 0);
      // progress=1 anchor: whichever comes later of (a) scrollY at which the
      // paragraph centers in the viewport — chosen so the whole paragraph is
      // still on screen as the last word lights up — or (b) start + 200, a
      // floor that keeps the active range wide enough for the per-word
      // cadence to stay perceivable when the center anchor falls too close
      // to start (e.g. tall viewports where the paragraph is already near
      // center at load).
      const end = Math.max(docTop + rect.height / 2 - vh / 2, start + 200);
      setRevealRange({ start, end });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const paragraphScrollProgress = useTransform(
    scrollY,
    [revealRange.start, revealRange.end],
    [0, 1]
  );

  // Counter Animation. Drives the count-up from (from, to) directly —
  // no viewport gate. The earlier `useViewportCountTrigger` variant
  // failed the same way `PercentCount` did: this Counter is rendered
  // inside `ItemLayout`, whose `initial={{ scale: 0 }}` entrance
  // collapses every descendant's IntersectionObserver rect to zero
  // area, so `playToken` could latch at 0, the effect's
  // `if (playToken === 0) return;` early-return would fire, and the
  // digit `<p>` would stay empty even after `to` (e.g. the years value
  // from `useExperienceSummary`) arrived.
  //
  // Honours `prefers-reduced-motion`: skip the 2 s tween entirely and
  // write `to` straight to the node — mirrors PercentCount's
  // contract so vestibular-sensitive users don't get a fresh count-up
  // replay every time `experienceCounterValue` flips from cached to
  // live data. The JSX text initialiser uses the same gate so the
  // first paint is also the final value under reduced motion.
  // `inView` (default true) makes the count-up replay on every viewport entry:
  // each false → true flip re-runs the tween from `from` → `to`, and going out
  // of view resets the digit to `from` so the next entry starts fresh. Callers
  // that don't pass it (e.g. the years card) keep the original animate-once
  // behaviour since `inView` stays constant true.
  function Counter({ from, to, plusIcon = true, inView = true }) {
    const nodeRef = useRef(null);
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
      const node = nodeRef.current;
      if (!node) return;
      if (prefersReducedMotion) {
        node.textContent = String(to);
        return;
      }
      if (!inView) {
        // Out of view — reset to the start so re-entry animates from `from`.
        node.textContent = String(from);
        return;
      }

      const controls = animate(from, to, {
        duration: 2,
        onUpdate(value) {
          node.textContent = value.toFixed(0);
        },
      });

      return () => controls.stop();
    }, [from, to, prefersReducedMotion, inView]);

    return (
      <div className="flex items-center justify-center">
        <p ref={nodeRef}>{prefersReducedMotion ? to : from}</p>
        {plusIcon && <p>+</p>}
      </div>
    );
  }

  // Issue #17: years is now driven by the experience-summary API
  // (GitHub earliest-repo date + software roles parsed from the resume
  // PDF) instead of a hardcoded `startDate`. The hook fetches once per
  // mount; the server caches the underlying GitHub + PDF work for 24h
  // so this is nearly free across visits. Defaulting `data` to null
  // until the fetch resolves; the Counter below treats `null` as 0 and
  // animates up once the real value lands.
  const { data: experienceData, changeMessage: experienceChangeMessage } =
    useExperienceSummary(username);
  const experienceTotalMonths = experienceData?.total?.months ?? 0;
  // Display unit follows the spec: years when total >= 12 months, else
  // months. Both the numeric `to` and the trailing label switch
  // together so they can't drift out of sync.
  const experienceCounterValue =
    experienceTotalMonths >= 12
      ? Math.floor(experienceTotalMonths / 12)
      : experienceTotalMonths;
  const experienceCounterUnit =
    experienceTotalMonths >= 12 ? "years" : "months";
  // Spoken Personal/Employment split for the years-card button's accessible
  // name (the visual legend is decorative + aria-hidden and, being inside a
  // labelled button, would never be announced on its own). Empty string when
  // there's no split to read.
  const experienceSplitLabel = buildSplitBreakdownLabel(experienceData);

  // Render the split bar when there's anything worth communicating: measured
  // experience to apportion, OR a source that failed to load (so its
  // "Unavailable" row still appears). Hiding purely on `experienceTotalMonths
  // > 0` would swallow the case where the measured side is genuinely zero but
  // the other source is unavailable — e.g. GitHub down while the resume
  // parsed to no roles. Matches ExperienceSplitBar's own bail condition.
  const experiencePersonalAvailable =
    experienceData?.personalProjects != null;
  const experienceEmploymentAvailable = experienceData?.employment != null;
  const showExperienceSplit =
    !!experienceData &&
    (experienceTotalMonths > 0 ||
      !experiencePersonalAvailable ||
      !experienceEmploymentAvailable);

  // Years-card-as-button: click / Enter / Space opens the breakdown
  // modal. `experienceTriggerRef` lets the modal return focus to the
  // card on close, matching the WAI-ARIA dialog focus-restoration
  // pattern. Modal state lives here (not in the card subtree) because
  // the modal is rendered at the end of the component tree as a fixed
  // overlay — same z-index regardless of which card opened it.
  const [isExperienceModalOpen, setIsExperienceModalOpen] = useState(false);
  const experienceTriggerRef = useRef(null);
  // Banner visibility driver. The banner component dedupes per
  // message internally, so re-entering the card while the same
  // message is "in flight" won't restart the timer; only a fresh
  // change-message from the next poll will fire it again.
  const isExperienceCardInView = useInView(experienceTriggerRef, {
    once: false,
    amount: 0.5,
  });
  const openExperienceModal = () => {
    if (experienceData) setIsExperienceModalOpen(true);
  };
  const handleExperienceTriggerKeyDown = (e) => {
    // Standard button keyboard semantics — Enter or Space activates.
    // Prevent Space from scrolling the page.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openExperienceModal();
    }
  };



  const getGithubStats = async () => {
    let data;
    try {
      const res = await fetch(`/api/github-stats?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error(`github-stats API responded ${res.status}`);
      data = await res.json();
    } catch (err) {
      // Keep whatever state we already have (localStorage hydrate or prior poll)
      // so the cards never go blank on a transient fetch failure.
      console.error("Failed to load GitHub stats:", err);
      return;
    }

    // A timed-out languages GraphQL call returns an empty `languages` array
    // with a 200 — the stats half can still succeed, so the response carries
    // NO `_fallback` flag and the guard below for it doesn't fire. Treat an
    // empty list as "no fresh language data this fetch" so it never clobbers
    // the last good languages already on screen / in the cold-load cache; the
    // Most Used Languages card keeps showing the most recent successful fetch.
    const freshLanguages = Array.isArray(data.languages) ? data.languages : [];
    const hasFreshLanguages = freshLanguages.length > 0;
    // The server now substitutes the bundled snapshot's languages (flagged
    // `languagesFallback`) instead of serving an empty list when its own
    // languages fetch aborted — so a brand-new visitor with no localStorage
    // still sees a populated card. But those snapshot languages are a static
    // default: never let them overwrite THIS browser's own (possibly fresher)
    // last-good in memory or in the cold-load cache. Only a genuine live fetch
    // is authoritative. New visitors still get the snapshot via the no-prev
    // first-load branch below, which uses `data.languages` directly.
    //
    // `languagesAreAuthoritative` doubles as the "are these languages LIVE?"
    // signal that drives the card's "live from GitHub" label: true only for a
    // genuine live fetch — not an empty timeout (`!hasFreshLanguages`), the
    // partial languages snapshot (`languagesFallback`), or the whole-payload
    // bundled fallback (`_fallback`). When false, the displayed languages are
    // kept/stale and the label is dropped until a live fetch returns.
    const languagesAreAuthoritative =
      hasFreshLanguages && !data.languagesFallback && !data._fallback;

    // Are the *stats* live? Unlike languages (which can independently time out
    // and soft-fall-back via `languagesFallback`), the stats half only ever
    // becomes non-live when the whole upstream fetch fails and the route serves
    // the bundled snapshot (`_fallback`). So stats are live whenever the
    // payload isn't that whole-payload fallback. Drives the GitHub Stats card's
    // "Live GitHub Metrics" eyebrow, which is hidden when this is false (API
    // down / showing kept or snapshot data), mirroring `languagesLive`.
    const statsAreLive = !data._fallback;

    setGithubStats(prevStats => {
      // If the API served the bundled fallback (upstream failure) and we
      // already have real data on screen, keep that state — only let the
      // fallback populate on a truly empty first load. Mark BOTH `languagesLive`
      // and `statsLive` false since the live source is fully down and we're
      // showing kept data, so both cards drop their "live" labels. Return a
      // fresh object only when a flag actually flips, to avoid a needless render.
      if (data._fallback && prevStats) {
        const needsFlip =
          prevStats.languagesLive || prevStats.statsLive;
        return needsFlip
          ? { ...prevStats, languagesLive: false, statsLive: false }
          : prevStats;
      }

      // First-time load
      if (!prevStats) {
        return {
          languages: data.languages || [],
          // `repo: null` (not `{}`) so the parent guard
          // `githubStats?.stats?.repo` correctly suppresses the card when the
          // API reports no qualifying activity. An empty object is truthy and
          // would render a blank "Most Active Repository" card.
          stats: data.stats || { user: {}, stats: {}, streaks: {}, repo: null },
          // Live only when this first response was a genuine live fetch — a
          // new visitor served the snapshot starts un-labelled until a live
          // poll confirms.
          languagesLive: languagesAreAuthoritative,
          statsLive: statsAreLive,
        };
      }

      // Detect top-level and nested changes
      const diffs = detectChanges(prevStats, data);

      // Liveness can flip without the *values* changing — a timeout after live
      // data, or a recovery to an identical payload — so the label state has to
      // reconcile even when the value diff is empty. Tracks both the languages
      // and stats liveness flags so either label can re-appear/disappear on a
      // pure liveness change.
      const livenessChanged =
        Boolean(prevStats.languagesLive) !== languagesAreAuthoritative ||
        Boolean(prevStats.statsLive) !== statsAreLive;
      if (diffs.length === 0 && !livenessChanged) return prevStats; // nothing changed

      // Compute a human-readable diff for the repo card's update banner.
      // computeRepoDiff returns null on the first-ever change cycle (no prev),
      // suppressing a false-positive banner on the initial poll after load.
      const repoMsg = computeRepoDiff(prevStats?.stats?.repo, data?.stats?.repo);
      if (repoMsg) setRepoDiffMessage(repoMsg);

      // Per-stat diff for the GitHub Stats banner. computeStatsDiff returns
      // hasChanged=false on the first cycle (prevStats present here, but the
      // nested stats object may be absent), so a real message only appears on a
      // genuine value change — mirroring the repo banner's suppression of false
      // positives on the initial poll.
      //
      // RECONCILE (set OR clear) every changed poll, never set-only: the card
      // prefers `diffMessage` over the generic `isUpdated` copy, so a stale
      // per-stat message left over from an earlier poll would be shown for a
      // *later* non-stat change (e.g. a `stats.user` display-name update, where
      // `hasChanged` is false but `changedFields` still flips the card's
      // `isUpdated`). Clearing to null when stats didn't move this poll makes
      // the card correctly fall back to the generic banner.
      const statsMsg = computeStatsDiff(prevStats?.stats?.stats, data?.stats?.stats);
      setStatsDiffMessage(statsMsg.hasChanged ? statsMsg.summaryMessage : null);

      setChangedFields(diffs);

      // Start from existing state
      const updatedStats = { ...prevStats };

      // --- Update top-level languages if changed ---
      // Only overwrite when the fetch carried *authoritative* (live, non-
      // snapshot) languages. An empty list means the languages GraphQL timed
      // out; a `languagesFallback` list is the server's static snapshot. In
      // both cases keep `prevStats.languages` — already spread into
      // `updatedStats` — so neither blanks the card nor downgrades a fresher
      // last-good to the bundled snapshot. A genuinely empty account is a
      // non-issue on this single-user, language-bearing site.
      if (diffs.includes("languages") && languagesAreAuthoritative) {
        updatedStats.languages = freshLanguages;
      }

      // --- Update nested stats fields selectively ---
      // `detectChanges` flattens to two-level keys (e.g. "stats.user"), so the bare "stats" is never emitted — match any "stats.*" instead.
      if (diffs.some((d) => d === "stats" || d.startsWith("stats."))) {
        const prevNested = prevStats.stats || {};
        const newNested = data.stats || {};

        updatedStats.stats = {
          ...prevNested,
          // only overwrite changed parts.
          // `repo` uses ?? so a legitimate `null` (API reporting "no
          // qualifying activity") is preserved instead of coerced to `{}` —
          // the parent guard `githubStats?.stats?.repo` then suppresses an
          // otherwise-blank card. The other fields stay on `||` because
          // they're always object-shaped in practice and the empty-object
          // fallback there is just a safety net.
          user: diffs.includes("stats.user") ? newNested.user || {} : prevNested.user,
          stats: diffs.includes("stats.stats") ? newNested.stats || {} : prevNested.stats,
          streaks: diffs.includes("stats.streaks") ? newNested.streaks || {} : prevNested.streaks,
          repo: diffs.includes("stats.repo") ? (newNested.repo ?? null) : prevNested.repo,
        };
      }

      // Reconcile the live/stale label state every fetch — independent of the
      // value diff above, so a timeout (live → stale) or a recovery to an
      // identical list (stale → live) flips the "live from GitHub" label even
      // when `updatedStats.languages` itself is unchanged.
      updatedStats.languagesLive = languagesAreAuthoritative;
      updatedStats.statsLive = statsAreLive;

      return updatedStats;
    });

    // Persist the last good payload so the next page load can hydrate
    // immediately from cache while the fresh fetch runs in the background.
    // Skip when the API served the bundled fallback (`_fallback: true`),
    // otherwise a transient upstream failure would overwrite genuine cached
    // stats with stale snapshot data for every future cold load.
    if (!data?._fallback) {
      try {
        const statsKey = githubStatsStorageKey(username);
        // Mirror the in-memory guard for the cold-load cache: never let a
        // non-authoritative languages list (empty timeout, or the server's
        // static snapshot) overwrite a better last-good already persisted, or
        // the next cold load would downgrade/blank the card. Prefer the stored
        // list when this fetch wasn't authoritative; if nothing is stored yet
        // (brand-new visitor), fall through to whatever we got — the snapshot
        // — so their cold reload still hydrates a populated card.
        let languagesToStore = freshLanguages;
        if (!languagesAreAuthoritative) {
          const prevRaw = window.localStorage.getItem(statsKey);
          const prev = prevRaw ? JSON.parse(prevRaw) : null;
          if (Array.isArray(prev?.languages) && prev.languages.length > 0) {
            languagesToStore = prev.languages;
          }
        }
        window.localStorage.setItem(
          statsKey,
          JSON.stringify({
            languages: languagesToStore,
            // `repo: null` (not `{}`) so the parent guard
            // `githubStats?.stats?.repo` correctly suppresses the card on the
            // next cold load when there's no qualifying activity. Must match
            // the same default used by the in-memory first-load branch above
            // — drifting these out of sync causes the hydrate to render an
            // empty card the next time the user visits.
            stats: data.stats || { user: {}, stats: {}, streaks: {}, repo: null },
          })
        );
      } catch {
        // Quota exceeded or private mode — non-fatal.
      }
    }
  };

  useEffect(() => {
    // Hydrate from the previously cached payload so the stat cards never
    // render empty on a cold page load.
    try {
      const newKey = githubStatsStorageKey(username);
      let raw = window.localStorage.getItem(newKey);

      // Legacy key migration: prior to dropping the `:${repo}` suffix, the
      // cache key was `github-stats:lastGood:${username}:${repo}` — one entry
      // per repo the algorithm had ever selected. Existing visitors carry
      // those entries forward, and without this scan they'd lose their cold-
      // load hydration until the first network fetch returns. Find any
      // legacy entry, promote it to the new key, and clear the old ones.
      if (!raw) {
        const legacyPrefix = `${newKey}:`;
        const legacyKeys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(legacyPrefix)) legacyKeys.push(k);
        }
        if (legacyKeys.length > 0) {
          // Any one of them will do — they're per-repo snapshots and the
          // next 10-minute poll will overwrite with the live answer anyway.
          raw = window.localStorage.getItem(legacyKeys[0]);
          if (raw) {
            window.localStorage.setItem(newKey, raw);
          }
          // Clean up all legacy entries (including ones we didn't read from)
          // so localStorage doesn't accumulate stale per-repo snapshots.
          for (const k of legacyKeys) window.localStorage.removeItem(k);
        }
      }

      if (raw) {
        const parsed = JSON.parse(raw);
        // Defensive normalizes for legacy payloads. Without these the cold-
        // load hydrate would either render a wrong/empty card or trigger a
        // false "Most active repository changed…" banner on the first poll
        // (because `computeRepoDiff` compares hydrated `prev.name` —
        // undefined under the old shape — against the live `next.name`).
        const repo = parsed?.stats?.repo;
        if (repo && typeof repo === "object") {
          // Pre-most-active-repo build: `repo: {}` meant "no qualifying
          // activity". An empty object is truthy and would slip past the
          // `githubStats?.stats?.repo` guard.
          if (Object.keys(repo).length === 0) {
            parsed.stats.repo = null;
          } else {
            // Pre-most-active-repo build also used `title`/`color`; current
            // shape uses `name`/`languageColor`. Re-key in-place so the
            // destructure in RepoStatsCard reads the right fields and the
            // first poll's diff doesn't false-positive on a renamed key.
            if (repo.title !== undefined && repo.name === undefined) {
              repo.name = repo.title;
              delete repo.title;
            }
            if (repo.color !== undefined && repo.languageColor === undefined) {
              // Expand 3-digit hex (#RGB) to 6-digit (#RRGGBB) so the
              // hydrated shape matches what the live API now emits
              // (always 6-digit). RepoStatsCard's `hexToRgba` already
              // tolerates 3-digit at render time, so this normalization
              // is belt-and-suspenders — its main purpose is keeping the
              // stored repo shape consistent across the localStorage and
              // network paths, which simplifies any future code that
              // reads `repo.languageColor` directly without going through
              // the card.
              const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(repo.color);
              repo.languageColor = shortHex
                ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
                : repo.color;
              delete repo.color;
            }
          }
        }
        setGithubStats(parsed);
      }
    } catch {
      // Ignore parse / access errors — the fresh fetch will populate state.
    }

    getGithubStats();

    // Poll every 10 minutes to match the API cache TTL (no point asking for
    // fresh data more often than the server is willing to compute it).
    const interval = setInterval(getGithubStats, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (changedFields.length > 0) {
      const timer = setTimeout(() => {
        setChangedFields([]);
        setRepoDiffMessage(null);
        setStatsDiffMessage(null);
        setTestExperienceMessage(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [changedFields]);

  // Dev-only banner sandbox. Press Shift+B anywhere on the page to push
  // a synthetic change to every card on the about page at once — repo,
  // stats, streaks, languages, skills section overlay, and the
  // experience banner inside the years card. Same auto-dismiss path as
  // a real API change (10s) so the harness clears itself.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.log("[banner-sandbox] listener attached — press Shift+B to fire");
    const handler = (e) => {
      // `e.code` matches the physical key regardless of layout / caps,
      // so this works on every Mac keyboard.
      if (!e.shiftKey || e.code !== "KeyB") return;
      const target = e.target;
      // Don't hijack the chord while typing in a form field.
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      console.log("[banner-sandbox] firing all banners");
      setChangedFields([
        "languages",
        "stats.stats",
        "stats.user",
        "stats.streaks",
        "stats.repo",
        "skills",
      ]);
      setRepoDiffMessage("Test: repository update banner");
      setStatsDiffMessage("Total Stars +5 | Total Commits +50 | Total PRs +2");
      setTestExperienceMessage("Test: experience update banner");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);


  // Skills icon-grid card needs the same in-view gating as every
  // other card so the shared UpdateBanner only paints while the
  // section is on screen (matching LanguagesCard, RepoStatsCard, etc.).
  const skillsRef = useRef(null);
  const isSkillsInView = useInView(skillsRef, { once: false, amount: 0.3 });

  // Completed-projects count-change banner (issue #16). `projectsData` is a
  // static import, so the count only moves across a deploy; the signal hook
  // compares it to a per-device localStorage baseline and surfaces a one-time
  // message when it changed since this device last saw it (same model as the
  // languages card). Shown via the shared UpdateBanner once the card is in
  // view, then auto-hidden after ~4.5s.
  const completedProjectsRef = useRef(null);
  const isCompletedProjectsInView = useInView(completedProjectsRef, {
    once: false,
    amount: 0.3,
  });
  const { pendingMessage: projectCountPending, consume: consumeProjectCount } =
    useProjectCountSignal(projectsData.length);
  // Category breakdown that feeds the completed-projects split bar (the elite
  // counterpart to the years card's Personal/Employment split). Derived from
  // the static projectsData so it stays correct as projects are added/retired;
  // sorted by count desc so the largest category takes the lead colour
  // (#ff6d05) and anchors the bar's left edge — same reading order as the
  // years card, where Personal (the larger share) leads.
  const projectCategoryBreakdown = useMemo(() => {
    const counts = projectsData.reduce((acc, p) => {
      const key = p.category || "Other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, []);
  const [projectCountBanner, setProjectCountBanner] = useState(null);
  // Promote the pending message to a visible banner once the card scrolls into
  // view, then consume it. The auto-hide timer lives in its own effect below
  // (keyed on the visible message), so consuming the pending message can't
  // cancel it — the same split that fixed the languages banner getting stuck.
  useEffect(() => {
    if (!projectCountPending || !isCompletedProjectsInView) return;
    setProjectCountBanner(projectCountPending);
    consumeProjectCount();
  }, [projectCountPending, isCompletedProjectsInView, consumeProjectCount]);
  useEffect(() => {
    if (!projectCountBanner) return;
    const timer = setTimeout(() => setProjectCountBanner(null), 4500);
    return () => clearTimeout(timer);
  }, [projectCountBanner]);

  //
  //
  // Icons...
  const icons = [
    "appwrite", "aws", "babel", "bootstrap", "cloudflare", "css", "d3", "docker",
    "figma", "firebase", "gatsby", "git", "github", "graphql", "html", "ipfs",
    "js", "jquery", "kubernetes", "linux", "mongodb", "mysql", "netlify", "nextjs",
    "nodejs", "npm", "postgres", "react", "redux", "replit", "sass", "supabase",
    "tailwind", "threejs", "vercel", "vite", "vscode", "yarn"
  ];

  return (
    // Horizontal padding scales with viewport: a flat `px-16` (64px) left
    // phones only ~247px of content width, cramping every card and truncating
    // the longest language name. Now `px-6` (24px) on mobile → `px-10` at `sm`
    // → the original `px-16` from `md`+ up, so desktop is unchanged while small
    // screens gain real breathing room.
    <section className="py-20 px-6 sm:px-10 md:px-16 w-full">
      <div className="grid grid-cols-12 gap-4 xs:gap-6 md:gap-8 w-full">
        <ItemLayout
          className={
            // `!py-4 sm:!py-5` overrides the shared p-6/p-8 vertical
            // padding to tighten the gap above the heading and below
            // the paragraph (per the request — the card had "too
            // much space on top and at the end"). `!` is needed
            // because both rules target padding on the same element.
            " col-span-full lg:col-span-8 row-span-2 flex-col items-start !py-4 sm:!py-5"
          }
        >
          <h2
            className="text-xl md:text-2xl text-left w-full capitalize mb-3"
            style={{
              // Matches the "YEARS IN THE CRAFT" eyebrow on the years
              // card (eyebrow amber from the 5-tone warm palette) so
              // every uppercase / heading microlabel on the about
              // page now reads in the same hue.
              color: '#ffaa2a',
              textShadow: 'none',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              textRendering: 'geometricPrecision',
            }}
          >
            Architect of Enchantment
          </h2>
          <p
            ref={paragraphRef}
            className="font-light text-xs sm:text-sm md:text-base text-fire-amber"
          >
            {ARCHITECT_WORDS.map((word, i) => (
              <RevealWord
                key={i}
                progress={paragraphScrollProgress}
                range={[i / ARCHITECT_WORDS.length, (i + 1) / ARCHITECT_WORDS.length]}
                reducedMotion={prefersReducedMotion}
              >
                {word}
              </RevealWord>
            ))}
          </p>
        </ItemLayout>

        <ItemLayout
          ref={completedProjectsRef}
          // Mirrors the "Years in the craft" card exactly: `!p-0` hands all
          // padding to the inner `repo-card-breathe` wrapper, and `group
          // relative` matches the sibling so the two feature cards share one
          // structure (outer owns the `custom-bg-abt` amber border + gradient;
          // inner owns the breathing glow on its rounded-lg perimeter).
          className={" group relative col-span-full xs:col-span-6 lg:col-span-4 text-accent !p-0"}
        >
          {/* Inner wrapper is the 1:1 twin of the years card's: the
              `repo-card-breathe` pulsing glow border on a `rounded-lg`
              perimeter, padded `p-6`, content flex-col centered. */}
          <div className="repo-card-breathe relative w-full h-full overflow-hidden rounded-lg px-6 py-4 flex flex-col items-stretch justify-center">
            {/* Count-change banner — appears only when the completed-projects
                count changed since this device last saw it (issue #16). The
                UpdateBanner's nodes are both out-of-flow (sr-only is absolute,
                overlay is absolute inset-0), so it doesn't disturb the card's
                stacked content. */}
            <UpdateBanner
              message={projectCountBanner}
              visible={isCompletedProjectsInView}
              srPrefix="Projects update: "
            />

            {/* Eyebrow — same uppercase micro-label treatment + amber tone as
                the years card's "Years in the craft", so the two feature cards
                announce themselves identically. */}
            <p
              aria-hidden="true"
              className="text-[10px] uppercase tracking-[0.22em] mb-2"
              style={{ color: "#ffaa2a", textShadow: "none" }}
            >
              Projects shipped
            </p>

            {/* Digit uses the vivid neon-orange (#ff6d05) of the sibling years
                digit; the label now matches the years card's `text-fire-amber`
                "of experience" tone (was the golden text-shadow-neon-light-orange)
                so the two cards' colour systems are identical. */}
            <h1
              className="flex items-center gap-2 font-semibold w-full text-left text-2xl sm:text-5xl"
              style={{ color: "#ff6d05", textShadow: "none" }}
            >
              <Counter from={0} to={projectsData.length} plusIcon={false} inView={isCompletedProjectsInView}></Counter>
              <p
                className="font-semibold text-base text-fire-amber"
                style={{ textShadow: "none" }}
              >
                completed projects
              </p>
            </h1>

            {/* Two-segment category split bar (Web / System) — the "elite &
                complex" counterpart to the years card's Personal/Employment
                split, same track, animated fill, legend, and percentages. */}
            <ProjectsSplitBar breakdown={projectCategoryBreakdown} inView={isCompletedProjectsInView} />
          </div>
        </ItemLayout>

        <ItemLayout
          ref={experienceTriggerRef}
          // Button semantics are only attached once `experienceData`
          // resolves. While loading, the card is a plain informational
          // region with `aria-busy` — exposing role="button" + click
          // handlers on a control that no-ops would mislead AT users in
          // virtual-cursor mode (they'd hear "button", activate it, and
          // get nothing). The trigger contract (role, tabIndex, ARIA
          // popup state, click/keydown handlers) all attach atomically
          // the moment the data lands.
          {...(experienceData
            ? {
                role: "button",
                tabIndex: 0,
                "aria-haspopup": "dialog",
                "aria-expanded": isExperienceModalOpen,
                "aria-label": `${experienceCounterValue}+ ${experienceCounterUnit} of experience.${
                  experienceSplitLabel ? ` ${experienceSplitLabel}` : ""
                } Activate to open category breakdown.`,
                onClick: openExperienceModal,
                onKeyDown: handleExperienceTriggerKeyDown,
              }
            : {
                "aria-busy": true,
                "aria-label": "Loading experience summary",
              })}
          className={`group relative col-span-full xs:col-span-6 lg:col-span-4 text-accent !p-0 ${
            experienceData ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50" : "cursor-default"
          }`}
        >
          {/* Inner wrapper mirrors the "Most Active Repository" card's
              own structure 1:1: outer ItemLayout owns the amber
              `custom-bg-abt` border + dark gradient background; inner
              div owns the `repo-card-breathe` pulsing glow on its
              `rounded-lg` perimeter, padded `p-6`. With `!p-0` on the
              outer, the two radii line up exactly like the repo card.
              The content's flex-col stack + vertical centering moved
              from the outer to this inner so layout behaviour is
              unchanged after the restructure. */}
          <div className="repo-card-breathe relative w-full h-full overflow-hidden rounded-lg px-6 py-4 flex flex-col items-stretch justify-center">
            <ExperienceUpdateBanner
              message={testExperienceMessage ?? experienceChangeMessage}
              inView={isExperienceCardInView}
              variant="elite"
            />

            {/* Eyebrow — uppercase micro-label sets the "feature card"
                tone before the eye lands on the digit. Amber tone reads
                a touch warmer than the digit's vivid orange below it. */}
            <p
              aria-hidden="true"
              className="text-[10px] uppercase tracking-[0.22em] mb-2"
              style={{ color: "#ffaa2a", textShadow: "none" }}
            >
              Years in the craft
            </p>

            <h1
              // `items-center` (not `items-baseline`): the Counter renders a
              // flex <div>, which doesn't expose a reliable text baseline to
              // the parent, so baseline alignment let the big number and the
              // "… of experience" text drift apart. Centering aligns them
              // consistently at every width — and matches the sibling
              // "Completed projects" card, which already uses items-center.
              className="flex items-center gap-2 font-semibold w-full text-left text-2xl sm:text-5xl"
              style={{ color: "#ff6d05", textShadow: "none" }}
            >
              {experienceData ? (
                <>
                  <Counter from={0} to={experienceCounterValue} inView={isExperienceCardInView}></Counter>
                  <p
                    className="font-semibold text-base text-fire-amber"
                    style={{ textShadow: "none" }}
                  >
                    {experienceCounterUnit} of experience
                  </p>
                </>
              ) : (
                // First-ever visit: no localStorage baseline yet, so the
                // hook genuinely has `null` until the fetch resolves.
                // Render a quiet pulsing em-dash in the same slot rather
                // than the misleading "0 months of experience" — keeps
                // the layout stable and signals "still computing" instead
                // of "the answer is zero". Once data arrives, the Counter
                // takes over and animates 0 → value as before.
                <p aria-label="Loading years of experience" className="animate-pulse">
                  —
                </p>
              )}
            </h1>

            {/* Two-segment split bar — Personal vs Employment as a share of
                total. Renders when there's measured experience to split OR a
                source is unavailable (so its "Unavailable" row still shows);
                hidden only when both sources loaded and measured zero. */}
            {showExperienceSplit && (
              <ExperienceSplitBar
                personalMonths={experienceData?.personalProjects?.months ?? 0}
                employmentMonths={experienceData?.employment?.months ?? 0}
                // A `null` side = its source failed to load (GitHub down for
                // personal; resume PDF missing/parse error for employment),
                // distinct from a parsed-but-empty `{ months: 0 }`. Drives
                // the "Unavailable" treatment instead of a misleading 0%.
                personalAvailable={experiencePersonalAvailable}
                employmentAvailable={experienceEmploymentAvailable}
                inView={isExperienceCardInView}
              />
            )}

            {/* Hover affordance — fades in on group-hover/focus so the
                click target stops being implicit. `aria-hidden` because
                the card itself already advertises `role="button"` +
                aria-haspopup, so this is purely a visual hint. */}
            <p
              aria-hidden="true"
              className="text-[11px] tracking-wide mt-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300"
              style={{ color: "#ffd27d", textShadow: "none" }}
            >
              View breakdown →
            </p>
          </div>
        </ItemLayout>

        {githubStats?.languages && <ItemLayout
          className={"col-span-full lg:col-span-6 !p-0"}
        >
          {/* Update banner is now driven inside LanguagesCard by
              useLanguagesUpdateSignal (a structured language-diff against the
              last-seen fingerprint), replacing the old generic
              changedFields("languages") boolean. */}
          <LanguagesCard
            data={githubStats.languages}
            // Drop the "live from GitHub" label whenever the displayed
            // languages are kept/stale (a languages-GraphQL timeout or the
            // bundled snapshot); it returns the moment a live fetch does.
            isLive={Boolean(githubStats.languagesLive)}
          />
        </ItemLayout>}

        {githubStats?.stats && <ItemLayout className={" col-span-full lg:col-span-6 !p-0"}>
          <GitHubStatsCard data={githubStats.stats.stats} userName={githubStats.stats.user.name} isUpdated={changedFields.includes("stats.stats") || changedFields.includes('stats.user')} diffMessage={statsDiffMessage} isLive={Boolean(githubStats.statsLive)} />
        </ItemLayout>}

        <ItemLayout
          ref={skillsRef}
          className="col-span-full grid grid-cols-4 sm:grid-cols-8 lg:[grid-template-columns:repeat(15,minmax(0,1fr))] !space-y-2 md:!space-y-6 relative overflow-hidden"
        >
          <UpdateBanner
            message={changedFields.includes('skills') ? "This section has been updated" : null}
            visible={isSkillsInView}
            srPrefix="Skills update: "
          />
          {icons.map((icon) => (
            <div
              key={icon}
              className="relative group w-11 h-11 md:w-12 md:h-12 lg:w-16 lg:h-16 transition-transform duration-300 ease-in-out hover:animate-lift-shake"
            >
              <img
                src={`https://skillicons.dev/icons?i=${icon}`}
                alt={icon}
                className="w-full h-full object-contain hover:scale-110 transition-all duration-300 group-hover:grayscale "
                loading="lazy"
              />
              <div className="absolute top-0 left-0 w-full h-full bg-black/60 hidden group-hover:block z-10" />
              {/* Tooltip */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300  text-shadow-neon-orange text-md rounded px-2 py-1 pointer-events-none whitespace-nowrap z-20">
                {icon}
              </div>
            </div>
          ))}
        </ItemLayout>

        {githubStats?.stats && <ItemLayout className={"col-span-full lg:col-span-6 !p-0"}>
          <StreakStatsCard data={githubStats.stats.streaks} isUpdated={changedFields.includes("stats.streaks")} />
        </ItemLayout>}


        {githubStats?.stats?.repo && <ItemLayout className={" col-span-full lg:col-span-6 !p-0"}>
          <ReadmeStatsCard
            data={githubStats.stats.repo}
            isUpdated={changedFields.includes("stats.repo")}
            diffMessage={repoDiffMessage}
          />
        </ItemLayout>}

        {/* <ItemLayout className={"col-span-full"}>
          <img
            className="w-full h-auto"
            src={`https://skillicons.dev/icons?i=appwrite,aws,babel,bootstrap,cloudflare,css,d3,docker,figma,firebase,gatsby,git,github,graphql,html,ipfs,js,jquery,kubernetes,linux,mongodb,mysql,netlify,nextjs,nodejs,npm,postgres,react,redux,replit,sass,supabase,tailwind,threejs,vercel,vite,vscode,yarn`}
            alt="CodeBucks"
            loading="lazy"
          />
        </ItemLayout> */}

        {/* <ItemLayout className={"col-span-full md:col-span-6 !p-0"}>
          <img
            className="w-full h-auto"
            src={`https://github-readme-streak-stats.herokuapp.com?user=${username}&theme=dark&hide_border=true&background=EB545400`}
            // src={`https://github-readme-stats.vercel.app/api/top-langs/?username=${username}&theme=gruvbox&show_icons=true&hide_border=true&layout=compact`}
            // src={`https://github-readme-stats.vercel.app/api?username=${username}`}
            alt="CodeBucks"
            loading="lazy"
          />
        </ItemLayout> */}

        {/* <ItemLayout className={"col-span-full md:col-span-6 !p-0"}>
          <Link
            href="https://github.com/codebucks27/Nextjs-contentlayer-blog"
            target="_blank"
            className="w-full"
          >
            <img
              className="w-full h-auto"
              src={`https://github-readme-streak-stats.herokuapp.com?user=${username}&theme=dark&hide_border=true&background=EB545400`}
              alt="CodeBucks"
              loading="lazy"
            />
          </Link>
        </ItemLayout> */}
      </div>

      {/* Mounted at the section root (outside the grid) so its
          fixed-position backdrop covers the full viewport regardless
          of the years card's position in the layout. Modal manages its
          own AnimatePresence + body scroll lock + focus restoration. */}
      <ExperienceBreakdownModal
        open={isExperienceModalOpen}
        onClose={() => setIsExperienceModalOpen(false)}
        data={experienceData}
        triggerRef={experienceTriggerRef}
      />
    </section>
  );
};

export default AboutDetails;
