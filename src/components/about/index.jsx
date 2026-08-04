import React, { useEffect, useMemo, useRef, useState } from "react";
import ItemLayout from "./ItemsLayout";
import { useScroll, useTransform, useReducedMotion, motion } from "framer-motion";
import { projectsData } from "@/app/data";
import LanguagesCard from "./LanguagesCard";
import GitHubStatsCard from "./StatsCard";
import StreakStatsCard from "./StreakStatsCard";
import ReadmeStatsCard from "./RepoStatsCard";
import SkillsCard from "./SkillsCard";
import { detectChanges } from "@/utils/diffChanges";
import { computeRepoDiff, computeRepoChangedFields } from "@/utils/repoDiff";
import { computeStatsDiff, statsIncreasedFields } from "@/utils/statsDiff";
import { useExperienceSummary } from "@/hooks/useExperienceSummary";
import { useProjectCountSignal } from "@/hooks/useProjectCountSignal";
import { useReliableInView } from "@/hooks/useReliableInView";
import { useLoaderRevealed } from "@/hooks/useLoaderRevealed";
import { cardVariants, childVariants } from "./revealVariants";
import { useViewportCountUp } from "@/hooks/useViewportCountUp";
import { ExperienceBreakdownModal } from "./ExperienceBreakdownModal";
import { ExperienceUpdateBanner } from "./ExperienceUpdateBanner";
import { UpdateBanner } from "./UpdateBanner";
import { wordFill } from "@/lib/fireRamp";
import { fluid, fluidText } from "@/lib/fluidScale";

const githubStatsStorageKey = (username) =>
  `github-stats:lastGood:${username}`;

const ARCHITECT_PARAGRAPH = "My journey in web development is powered by an array of mystical tools and languages, with JavaScript casting the core of my enchantments. I wield frameworks like React.js and Next.js with precision, crafting seamless portals (websites) that connect realms (users) across the digital universe. The ancient arts of the Jamstack empower me to create fast, secure, and dynamic experiences, while my design skills ensure every creation is not only functional but visually captivating. Beyond the visible enchantments, I tend the hidden machinery — conjuring resilient APIs and databases (the vaults where each realm's memory is safely kept) and weaving automated pipelines that carry my creations from the workshop to the cloud (the boundless aether where they finally awaken). I hold performance and accessibility as sacred vows, so every portal opens swiftly for every traveller, on any device and in any far-flung corner of the realm. Curiosity remains my truest compass, forever drawing me toward new grimoires, sharper instincts, and ideas bold enough to become living, breathing experiences. Join me as I continue to explore new spells and technologies to shape the future of the web.";
const ARCHITECT_WORDS = ARCHITECT_PARAGRAPH.split(" ");

// The gold→ember fill is applied PER WORD (not via `.text-fire-amber` on the
// parent <p>): a single `background-clip:text` fill on the parent rasterises
// ONCE inside this tilt card's GPU-promoted layer and paints every glyph
// regardless of its per-word opacity (the headless-invisible GPU bug). Each word
// owning its own clip fixes that AND lets the fill darken gold→ember across the
// paragraph in reading order — see `wordFill` in @/lib/fireRamp.

const RevealWord = ({ children, progress, range, index, total }) => {
  // Start fully hidden (0) and light to full (1) across this word's slice of
  // the scroll range — at load the whole paragraph is invisible and only
  // materialises word-by-word as the reader scrolls into it.
  //
  // Deliberately applied even under prefers-reduced-motion: the effect is
  // opacity-only and *scroll-scrubbed* — the reader drives it with their own
  // scroll, no autonomous movement — so it isn't the kind of motion the setting
  // exists to suppress, and the copy still fully reveals as you reach it.
  const opacity = useTransform(progress, range, [0, 1]);
  return (
    // Per-word ramp fill (darkens toward the paragraph's end) + opacity on the
    // SAME element, so a word's opacity fades its OWN clip. See wordFill.
    <motion.span style={{ ...wordFill(index, total), opacity }}>
      {children}{" "}
    </motion.span>
  );
};

// Inline percentage count-up for the years card's Personal/Employment split.
// `unavailable` short-circuits the count-up and renders an "Unavailable" label
// instead of a percentage — how a category whose source failed to load (e.g.
// employment when the resume PDF can't be parsed) is distinguished from a
// genuine 0%; rendering "0%" for missing data would assert "zero experience"
// when the truth is "couldn't measure". `inView` drives the debounced,
// flicker-immune replay (see useViewportCountUp); reduced motion shows the
// final value with no tween.
function PercentCount({ value, unavailable = false, inView = true }) {
  const nodeRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useViewportCountUp(nodeRef, {
    to: value,
    inView,
    prefersReducedMotion,
    enabled: !unavailable,
  });

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
// Mirrors the card's big `Counter` — animates 0 → value over 2s on a true
// viewport entry and replays on re-entry, with the same debounced, flicker-
// immune behaviour as the rest of the page (see useViewportCountUp). Lives at
// module scope (unlike the in-component `Counter`) so the module-level
// ProjectsSplitBar can use it. `inView` defaults to `true` for any caller that
// doesn't gate on viewport visibility.
function CountUp({ value, inView = true }) {
  const nodeRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useViewportCountUp(nodeRef, { to: value, inView, prefersReducedMotion });

  return <span ref={nodeRef}>{prefersReducedMotion ? value : 0}</span>;
}

// Big-digit count-up for the "Completed projects" and "Years in the craft"
// cards. The count-up + debounced viewport replay live in the shared
// `useViewportCountUp` hook (see its definition for the hysteresis rationale).
// `inView` (default true) gates the replay; reduced motion writes `to` straight
// to the node, and the JSX initialiser uses the same gate so the first paint is
// already final under reduced motion.
//
// MUST live at module scope (not nested in AboutDetails): a component defined
// inside another is a NEW type every parent render, so React unmounts and
// remounts it on each AboutDetails update (hydrate, experience load, polling).
// That reset the count-up to `from` and restarted the tween before it could
// finish — the digit was stuck at 0. Hoisting keeps it mounted so the tween
// runs once to completion.
function Counter({ from = 0, to, plusIcon = true, inView = true }) {
  const nodeRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useViewportCountUp(nodeRef, { from, to, inView, prefersReducedMotion });

  return (
    // Inline elements only: this renders inside the cards' <h1>, and a
    // heading may contain phrasing content only — a block <div>/<p> here is
    // invalid HTML. `inline-flex` keeps the digit (+ optional plus) aligned.
    <span className="inline-flex items-center justify-center">
      <span ref={nodeRef}>{prefersReducedMotion ? to : from}</span>
      {plusIcon && <span>+</span>}
    </span>
  );
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
  pulseCategories = [],
}) {
  const prefersReducedMotion = useReducedMotion();
  // Heartbeat a category whose experience just grew — the same `skill-heartbeat`
  // opacity pulse the Skills / Completed-projects cards apply to a changed
  // category's label + count. Applied to BOTH the legend label and its
  // percentage so the whole entry beats as one. CSS already no-ops the animation
  // under reduced motion, but gate the class too for parity.
  const personalPulse =
    !prefersReducedMotion && pulseCategories.includes("Personal") ? "skill-heartbeat" : "";
  const employmentPulse =
    !prefersReducedMotion && pulseCategories.includes("Employment") ? "skill-heartbeat" : "";
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
        className="abt-micro flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-1 text-[10px] uppercase tracking-[0.16em] mt-2 tabular-nums"
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
            <span className={`text-fire-amber ${personalPulse}`}>Personal</span>
          </span>
          <span className={personalPulse} style={{ color: "#ff6d05", textShadow: "none" }}>
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
            <span className={`text-fire-amber ${employmentPulse}`}>Employment</span>
          </span>
          <span className={employmentPulse} style={{ color: "#ff6d05", textShadow: "none" }}>
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

// Completed-projects category breakdown — computed once at module load from the
// static `projectsData` import. The count only ever changes across a deploy
// (there's no runtime data source), so there's nothing to recompute per render
// or per mount; hoisting to module scope is both cheaper than a `useMemo` and
// sidesteps the react-hooks/exhaustive-deps warning that an empty dep array
// over `projectsData` would trip. Sorted by count desc so the largest category
// leads with the lead colour (#ff6d05) and anchors the bar's left edge — same
// reading order as the years card, where Personal (the larger share) leads.
const PROJECT_CATEGORY_BREAKDOWN = (() => {
  const counts = projectsData.reduce((acc, p) => {
    const key = p.category || "Other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
})();

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
function ProjectsSplitBar({ breakdown, inView = true, pulseCategories = [] }) {
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
      {/* Legend — mirrors the years card's responsive layout: a stacked
          column below `sm` (full-width rows, `justify-between`), and PAIRED
          side-by-side rows from `sm` up. With 4+ categories a single flat
          wrap container broke lines wherever accumulated width said to —
          "Web | System" paired on line one, but the next orphaned divider +
          `grow` left AI stretched alone with Mobile beneath it. So the wrap
          points are now deterministic: the vivid #ff6d05 `|` divider renders
          only INSIDE a pair (odd i), and each pair boundary (even i > 0)
          emits a zero-height `basis-full` break that forces the next pair
          onto its own line — "Web | System" over "AI | Mobile". Both the
          divider and the break are hidden below `sm`, so the stacked mobile
          column is byte-identical to before. An odd trailing category falls
          back to a lone full-width row (`grow`), same as the old wrap. */}
      <div
        aria-hidden="true"
        className="abt-micro flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-1 text-[10px] uppercase tracking-[0.16em] mt-2 tabular-nums"
        style={{ color: "#d4af7a" }}
      >
        {segments.map((s, i) => {
          // Heartbeat the category that just gained project(s) (or is newly
          // present) — the same `skill-heartbeat` opacity pulse the Skills card
          // applies to a changed category's header + count. CSS disables the
          // animation under reduced motion, but gate the class too for parity.
          const pulse =
            !prefersReducedMotion && pulseCategories.includes(s.label) ? "skill-heartbeat" : "";
          return (
            <React.Fragment key={s.label}>
              {i > 0 && i % 2 === 1 && (
                <span
                  aria-hidden="true"
                  className="hidden sm:block select-none px-3"
                  style={{ color: "#ff6d05", textShadow: "none" }}
                >
                  |
                </span>
              )}
              {i > 0 && i % 2 === 0 && (
                <span aria-hidden="true" className="hidden sm:block basis-full" />
              )}
              <span className="flex items-center justify-between gap-2 sm:grow sm:basis-[130px]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: s.color }}
                  />
                  <span className={`text-fire-amber ${pulse}`}>{s.label}</span>
                </span>
                {/* Legend shows the raw project count per category (not a
                    percentage) — the bar segment widths already carry the
                    proportional share. `s.count` is derived from projectsData,
                    so adding a project to a category bumps this automatically.
                    Animated with the same 0 → count count-up as the card's big
                    "completed projects" digit. */}
                <span className={pulse} style={{ color: "#ff6d05", textShadow: "none" }}>
                  <CountUp value={s.count} inView={inView} />
                </span>
              </span>
            </React.Fragment>
          );
        })}
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

  // The two feature cards at the top of the page ("Projects shipped" / "Years in
  // the craft") sit on screen at scroll 0 — behind the full-screen intro loader.
  // Their scale 0 → 1 entrance is held until the loader lifts so it actually
  // plays in view instead of finishing unseen behind the overlay. See
  // useLoaderRevealed / ItemLayout's `revealWhen`.
  const revealed = useLoaderRevealed();

  const [githubStats, setGithubStats] = useState(null)
  const [changedFields, setChangedFields] = useState([]);
  const [repoDiffMessage, setRepoDiffMessage] = useState(null);
  // Which fields of the most-active repo rose this poll (['name','stars',…]) —
  // drives the post-banner heartbeat on the repo card's name + metric values.
  // Held until the card's pulse consumes it / the 10s auto-clear resets it.
  const [repoChangedFields, setRepoChangedFields] = useState([]);
  // Specific per-stat change summary for the GitHub Stats card's banner
  // ("Total Stars +5 | Total Commits +50"). Null when nothing changed, so
  // the banner only fires on real value changes — never on first load.
  const [statsDiffMessage, setStatsDiffMessage] = useState(null);
  // Which GitHub stats rose this poll (['stars','commits',…]) — drives the
  // post-banner heartbeat on each risen stat's label + number in the GitHub
  // Stats card. Held until the card's pulse consumes it / the 10s reset clears.
  const [statsChangedFields, setStatsChangedFields] = useState([]);
  // Dev-only override so a synthetic Shift+B can fire the experience
  // banner, which is otherwise driven entirely by the hook. Stays null
  // in production builds because the listener that sets it never runs.
  const [testExperienceMessage, setTestExperienceMessage] = useState(null);

  // Scroll-linked per-word reveal for the "Architect of Enchantment" paragraph.
  // Both ends of the active scroll range are derived from the paragraph's own
  // document offset so the animation tracks paragraph visibility, not raw
  // page scroll.
  const paragraphRef = useRef(null);
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
      // progress=1 anchor: complete the reveal as the paragraph scrolls UP
      // through the viewport — its bottom passing ~20% down the screen keeps
      // the last words on screen as they light. Floored at HALF A VIEWPORT of
      // scroll so the per-word wave is always a perceptible scrub.
      //
      // The old anchor was the paragraph's CENTER reaching viewport center,
      // floored at a fixed +200px. For this above-the-fold paragraph that
      // center point lands at ~60px, so the whole 185-word reveal collapsed
      // into the first ~200px of scroll — a single trackpad flick blew past it
      // and the copy snapped fully visible instantly, reading as "no reveal".
      // Anchoring to the paragraph's full scroll-through (and a viewport-
      // relative floor) spreads the wave across a distance you can actually
      // watch, and scales naturally for below-the-fold placements too.
      const end = Math.max(docTop + rect.height - vh * 0.2, start + vh * 0.5);
      // Bail-when-unchanged keeps the ResizeObserver below from scheduling
      // render loops when a reflow reports the same geometry.
      setRevealRange((prev) =>
        prev && prev.start === start && prev.end === end ? prev : { start, end },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    // Re-measure after layout SETTLES, not only at mount. On a cold first visit
    // the intro loader is still mounted when this effect first runs, pushing the
    // paragraph far down the document — a once-only measurement then captures a
    // docTop from that transient layout, places `start` beyond the page's max
    // scroll, and leaves the copy PERMANENTLY hidden (progress can never leave
    // 0). `revealed` (from useLoaderRevealed) re-runs this effect the instant
    // the loader lifts, and a ResizeObserver on the document re-measures on any
    // later reflow (stat cards populating, images/fonts loading). Together they
    // make the reveal range correct on cold and warm loads alike.
    window.addEventListener("load", measure);
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (typeof document !== "undefined") ro?.observe(document.documentElement);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
      ro?.disconnect();
    };
  }, [revealed]);

  const paragraphScrollProgress = useTransform(
    scrollY,
    [revealRange.start, revealRange.end],
    [0, 1]
  );

  // Issue #17: years is now driven by the experience-summary API
  // (GitHub earliest-repo date + software roles parsed from the resume
  // PDF) instead of a hardcoded `startDate`. The hook fetches once per
  // mount; the server caches the underlying GitHub + PDF work for 24h
  // so this is nearly free across visits. Defaulting `data` to null
  // until the fetch resolves; the Counter below treats `null` as 0 and
  // animates up once the real value lands.
  const {
    data: experienceData,
    changeMessage: experienceChangeMessage,
    changedCategories: experienceChangedCategories,
    addedRepoNames: experienceAddedRepoNames,
    addedRoleKeys: experienceAddedRoleKeys,
  } = useExperienceSummary(username);
  // Sets for the breakdown modal's per-row heartbeat (added repos / roles).
  const experiencePulseRepoNames = useMemo(
    () => new Set(experienceAddedRepoNames),
    [experienceAddedRepoNames],
  );
  const experiencePulseRoleKeys = useMemo(
    () => new Set(experienceAddedRoleKeys),
    [experienceAddedRoleKeys],
  );
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
  // Viewport observer for the count-up + banner. Deliberately a SEPARATE ref
  // on the inner (non-scaled) card div rather than reusing `experienceTriggerRef`
  // on the outer ItemLayout: the ItemLayout animates `scale 0 → 1` on entry, and
  // an IntersectionObserver attached to that self-scaling element reads zero area
  // at entry and never re-fires after the transform settles — so `useInView`
  // stuck false and the years count-up sat at 0. The inner div isn't the scale
  // target, so its observer reads a true ratio. `experienceTriggerRef` stays on
  // the ItemLayout because the modal restores focus to that focusable button.
  const experienceInViewRef = useRef(null);
  // Banner visibility driver. The banner component dedupes per
  // message internally, so re-entering the card while the same
  // message is "in flight" won't restart the timer; only a fresh
  // change-message from the next poll will fire it again.
  // `useReliableInView` (not framer `useInView`) because the ItemLayout's
  // `scale 0 → 1` entrance blinds an IntersectionObserver to the card — see the
  // hook's own docs. Measures real geometry so the count-up fires on /about
  // where this card is on screen at load and never gets a re-triggering scroll.
  //
  // `inView` (raw) drives the count-up + banner + heartbeat timers (the count-up
  // debounces internally). `settledInView` (debounced, asymmetric hysteresis)
  // drives ONLY the card's entrance variants below — so the `y: 56 → 0` reveal
  // can't reset itself into an on/off flicker loop while the card is parked at
  // ~10% on screen. Same split the GitHub Stats / Languages cards use via
  // useViewportCountTrigger.
  const {
    inView: isExperienceCardInView,
    settledInView: settledExperienceCardInView,
  } = useReliableInView(experienceInViewRef, {
    amount: 0.5,
  });

  // Years-card legend heartbeat (issue #20 follow-up) — when the experience
  // banner reports that a category grew (e.g. "Employment experience updated"),
  // pulse that category's legend label + percentage, the SAME beat the Skills /
  // Completed-projects cards use. Deferred until the banner has fully shown AND
  // EXITED so the pulse never plays under the banner's blur overlay (the bug
  // proven + fixed on the Completed-projects card). Here the "exited" signal is
  // exact — ExperienceUpdateBanner reports `false` from UpdateBanner's
  // onExitComplete — so it's robust to the per-character exit's variable length
  // rather than relying on a guessed delay.
  const [pulseExperienceCats, setPulseExperienceCats] = useState([]);
  // Driven by ExperienceUpdateBanner's onVisibilityChange: `true` when the
  // banner appears, `false` only once it has FULLY animated out (onExitComplete).
  // The banner owns its own show/hide (per-message sessionStorage dedupe), so the
  // parent learns the life cycle through this callback rather than owning a timer.
  const [experienceBannerShown, setExperienceBannerShown] = useState(false);
  const experienceBannerWasShownRef = useRef(false);
  // The changed categories captured at detection time, held until the banner
  // finishes so a later no-diff poll (which resets the hook's array) can't blank
  // them mid-flight.
  const pendingExperienceCatsRef = useRef([]);
  useEffect(() => {
    if (experienceChangedCategories && experienceChangedCategories.length > 0) {
      pendingExperienceCatsRef.current = experienceChangedCategories;
    }
  }, [experienceChangedCategories]);

  // Fire the pulse on the banner's shown → exited edge. `experienceBannerShown`
  // flips false only AFTER the overlay has fully unmounted (onExitComplete), so
  // the card is already clear; the short delay is just a deliberate beat between
  // the banner vanishing and the heartbeat starting. Not gated on in-view here:
  // if the user scrolled away mid-banner, the pulse stays armed and the
  // (in-view-gated) stop timer below holds it until they return — same "pulse
  // survives until seen" contract as the Completed-projects legend.
  useEffect(() => {
    const wasShown = experienceBannerWasShownRef.current;
    experienceBannerWasShownRef.current = experienceBannerShown;
    if (!(wasShown && !experienceBannerShown)) return undefined; // only true→false
    if (pendingExperienceCatsRef.current.length === 0) return undefined;
    const cats = pendingExperienceCatsRef.current;
    const POST_BANNER_BEAT_MS = 150;
    const t = setTimeout(() => {
      setPulseExperienceCats(cats);
      pendingExperienceCatsRef.current = [];
    }, POST_BANNER_BEAT_MS);
    return () => clearTimeout(t);
  }, [experienceBannerShown]);

  // Stop the pulse after the shared ~3.5s heartbeat window, once it's actually
  // been on screen (in-view-gated for the same reason as the projects legend:
  // an off-screen wall-clock timer could burn the window before it's seen).
  useEffect(() => {
    if (pulseExperienceCats.length === 0 || !isExperienceCardInView) return undefined;
    const t = setTimeout(() => setPulseExperienceCats([]), 3500);
    return () => clearTimeout(t);
  }, [pulseExperienceCats, isExperienceCardInView]);

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

      // Structured changed-field list for the repo card's heartbeat (which
      // name / metric values rose). Only set when non-empty so an unrelated
      // poll doesn't blank a pulse the card hasn't shown yet; the 10s timer and
      // the card's own consume handle clearing.
      const repoFields = computeRepoChangedFields(prevStats?.stats?.repo, data?.stats?.repo);
      if (repoFields.length > 0) setRepoChangedFields(repoFields);

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

      // Stats that ROSE → heartbeat their label + number after the banner. Only
      // set when non-empty so an unrelated poll doesn't blank a pulse the card
      // hasn't shown yet; the card captures it locally and the 10s reset clears.
      const statsFields = statsIncreasedFields(statsMsg);
      if (statsFields.length > 0) setStatsChangedFields(statsFields);

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
        setRepoChangedFields([]);
        setStatsDiffMessage(null);
        setStatsChangedFields([]);
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
      ]);
      setRepoDiffMessage("Test: repository update banner");
      // Heartbeat the repo name, the language, the activity score, and a couple
      // of metric rows when the sandbox fires, so the post-banner pulse (name +
      // language text + activity-score number + each risen row's icon/label/
      // value) is testable without a real data change.
      setRepoChangedFields(["name", "stars", "commitCount", "language", "activityScore"]);
      setStatsDiffMessage("Total Stars +5 | Total Commits +50 | Total PRs +2");
      // Heartbeat the matching stat rows (label + number) when the sandbox fires.
      setStatsChangedFields(["stars", "commits", "prs"]);
      setTestExperienceMessage("Test: experience update banner");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);


  // SkillsCard owns its own viewport gating, daily-refresh fetch, and
  // per-device change banner (useSkillsUpdateSignal) — the same self-contained
  // model as LanguagesCard / StreakStatsCard — so index.jsx no longer tracks a
  // skills ref or in-view flag here.

  // Completed-projects count-change banner (issue #16). `projectsData` is a
  // static import, so the count only moves across a deploy; the signal hook
  // compares it to a per-device localStorage baseline and surfaces a one-time
  // message when it changed since this device last saw it (same model as the
  // languages card). Shown via the shared UpdateBanner once the card is in
  // view, then auto-hidden after ~4.5s.
  const completedProjectsRef = useRef(null);
  // `useReliableInView` (not framer `useInView`): the ItemLayout's scale 0 → 1
  // entrance hides the card from an IntersectionObserver, so the count-up never
  // fired and the digit sat at 0 on /about. See the hook's docs.
  //
  // `inView` (raw) drives the count-up + banner + heartbeat timers; `settledInView`
  // (debounced, asymmetric hysteresis) drives ONLY the entrance variants below so
  // the `y: 56 → 0` reveal can't flicker on/off while the card is parked at ~10%
  // on screen — the same fix the GitHub Stats / Languages cards got.
  const {
    inView: isCompletedProjectsInView,
    settledInView: settledCompletedProjectsInView,
  } = useReliableInView(completedProjectsRef, {
    amount: 0.3,
  });
  // The signal now diffs the per-category BREAKDOWN (not just the total), so it
  // can tell which category gained project(s) / is newly present and surface
  // those labels for the legend heartbeat. The breakdown feeds the count too
  // (its sum === projectsData.length), so the banner message is unchanged.
  const {
    pendingMessage: projectCountPending,
    consume: consumeProjectCount,
    changedCategories: projectChangedCategories,
    clearChangedCategories: clearProjectChangedCategories,
  } = useProjectCountSignal(PROJECT_CATEGORY_BREAKDOWN);
  const [projectCountBanner, setProjectCountBanner] = useState(null);
  // The categories currently heartbeating in the split-bar legend (the ones
  // that just grew / appeared). Same lifecycle as the banner: captured as soon
  // as detected, then pulsed for ~6s once the card is in view.
  const [pulseProjectCats, setPulseProjectCats] = useState([]);
  // Set true once the banner has been DISMISSED (message cleared) AND has fully
  // animated out (UpdateBanner.onExitComplete) — the exact, message-length-proof
  // "overlay is gone, the heartbeat may start" signal.
  const [projectBannerGone, setProjectBannerGone] = useState(false);
  // A ref mirror of `projectCountBanner` so the onExitComplete callback (a stable
  // closure) can tell a REAL dismissal apart from a scroll-out exit. This banner's
  // `visible` is the in-view flag, so scrolling away also fires onExitComplete —
  // but with the message still pending; only when the message has already cleared
  // is the exit a genuine dismissal that should arm the pulse.
  const projectCountBannerRef = useRef(null);
  // Capture the pending message as soon as it exists — deliberately NOT gated
  // on viewport visibility. It's passed straight through to UpdateBanner's
  // `message`, whose always-mounted `aria-live` region announces on `message`
  // alone (not `visible`), so AT users hear the count change immediately rather
  // than only after scrolling the card into view. `consume()` advances the
  // localStorage baseline so a reload before the next change doesn't replay it.
  useEffect(() => {
    if (!projectCountPending) return;
    setProjectCountBanner(projectCountPending);
    consumeProjectCount();
  }, [projectCountPending, consumeProjectCount]);
  // Auto-hide the VISUAL banner ~4.5s after the card is actually in view, so an
  // update detected while the card is off-screen doesn't expire its visual
  // before it's seen. Gated on `isCompletedProjectsInView` (the timer restarts
  // on each true entry), mirroring the GitHub Stats banner. `consume()` above
  // only nulls `projectCountPending` — not `projectCountBanner` or the in-view
  // flag — so it can't cancel this timer.
  useEffect(() => {
    if (!projectCountBanner || !isCompletedProjectsInView) return;
    const timer = setTimeout(() => setProjectCountBanner(null), 4500);
    return () => clearTimeout(timer);
  }, [projectCountBanner, isCompletedProjectsInView]);
  // Keep the ref in sync so onExitComplete can read the CURRENT message state.
  useEffect(() => {
    projectCountBannerRef.current = projectCountBanner;
  }, [projectCountBanner]);
  // Legend heartbeat (mirrors the Skills / years cards): once the banner has been
  // dismissed AND fully exited, with the card in view, pulse the changed
  // categories' label + count, then consume the hook's one-shot list so it can't
  // replay on a later re-entry.
  //
  // The trigger is `projectBannerGone`, set ONLY by a real-dismissal
  // onExitComplete (the banner is a full-card blur overlay whose AnimatePresence
  // exit — opacity fade + per-character dissolve — lingers ~0.5–0.75s after the
  // state clears; waiting for the exact unmount signal makes this robust to
  // message length, unlike the earlier guessed delay). Crucially the pulse is NOT
  // coupled to the `projectCountBanner` state transition: because this banner's
  // `visible` is the in-view flag, a scroll-out also fires onExitComplete, and a
  // prior design that keyed off the state edge could fire the pulse the instant
  // the message cleared — i.e. while the re-shown banner was still animating out.
  // `projectBannerGone` only flips true on a dismissal exit (ref guard below), so
  // that can't happen.
  //
  // `isCompletedProjectsInView` stays in the deps so that if the user scrolled
  // away during the post-banner beat, the pulse re-arms on re-entry
  // (`projectBannerGone` stays true until consumed) — the "pulse survives until
  // seen" contract shared with the other cards. The short beat is a breath
  // between the banner vanishing and the heartbeat starting.
  useEffect(() => {
    if (!projectBannerGone) return undefined;
    if (projectChangedCategories.length === 0 || !isCompletedProjectsInView) return undefined;
    const POST_BANNER_BEAT_MS = 150;
    const t = setTimeout(() => {
      setPulseProjectCats(projectChangedCategories);
      clearProjectChangedCategories();
      setProjectBannerGone(false); // one-shot: consume so it can't re-fire
    }, POST_BANNER_BEAT_MS);
    return () => clearTimeout(t);
  }, [
    projectBannerGone,
    projectChangedCategories,
    isCompletedProjectsInView,
    clearProjectChangedCategories,
  ]);
  // Stop the pulse after the shared header-beat window (~3.5s, matching the
  // Skills card's HEARTBEAT_HEADER_MS) so it flags the change without becoming
  // a permanent blinker. Gated on the SAME in-view flag as the banner timer
  // above, for the same reason: the capture effect consumes the hook's one-shot
  // list on the FIRST visibility flicker (even a flick-scroll past the card), so
  // an ungated wall-clock timer could burn the whole window off-screen and the
  // pulse would be gone before it was ever seen. Out of view → cleanup cancels
  // the timer (pulse stays armed); re-entry → a fresh 6s window restarts.
  useEffect(() => {
    if (pulseProjectCats.length === 0 || !isCompletedProjectsInView) return undefined;
    const timer = setTimeout(() => setPulseProjectCats([]), 3500);
    return () => clearTimeout(timer);
  }, [pulseProjectCats, isCompletedProjectsInView]);

  return (
    // Fluid section shell (issue #25). The breakpoint utilities stay as the
    // out-of-scope base; the inline styles override them under the fluid
    // scope (inline beats utilities, and /about is in FLUID_SCALE_PAGES).
    //
    // The inline padding cannot be a plain fluid(): at the 1440 anchor the
    // legacy inset is main px-16 + section px-16 = 128px (the fluid main
    // contributes fluid(1), so this section owes 7rem), but phones only ever
    // had ~32px total — a 4× range that a 0.6-floored factor can't span
    // linearly. So the inline axis rides the same floor→anchor morph the
    // qualifications carousel uses (t: 0 at the configured scale floor via
    // var(--fluid-min), 1 at the anchor, held beyond): 2.5rem at the floor
    // (×0.6 ≈ the legacy phone inset) morphing to 7rem at the anchor, the
    // whole thing × the factor so it keeps breathing on ultrawide.
    //
    // Vertical padding is a plain ride: py-20 was never breakpoint-jumpy, and
    // at scale 1 the totals must match legacy (top: main's static pt-20 + 5rem
    // here = 160px; bottom: main's fluid(1.5) + 8.5rem here = 160px).
    <section
      className="py-20 px-6 sm:px-10 md:px-16 w-full"
      style={{
        "--abt-t":
          "clamp(0, calc((var(--fluid-scale, 1) - var(--fluid-min, 0.6)) / (1 - var(--fluid-min, 0.6))), 1)",
        paddingInline:
          "calc((2.5rem + 4.5rem * var(--abt-t)) * var(--fluid-scale, 1))",
        paddingTop: fluid(5),
        paddingBottom: fluid(8.5),
      }}
    >
      <div
        className="grid grid-cols-12 gap-4 xs:gap-6 md:gap-8 w-full"
        style={{ gap: fluid(2) }}
      >
        <ItemLayout
          // Hero-row card 0. Previously used the default `whileInView` reveal,
          // which — being on screen at scroll 0, behind the intro loader —
          // fired and finished unseen behind the overlay (it read as "no
          // animation"). Gating on `revealed` holds it until the loader lifts so
          // it plays in view, and `revealOrder={0}` leads the orchestrated hero
          // cascade ahead of the two feature cards. `tilt` adds the pointer tilt
          // + ember glare (hover / non-reduced-motion only).
          revealWhen={revealed}
          revealOrder={0}
          tilt
          // The tightened vertical padding (was `!py-4 sm:!py-5`) is now an
          // inline fluid ride: important utilities would beat the scoped
          // .abt-card rule AND an inline style, so they're the one kind of
          // legacy class the fluid conversion must remove rather than keep
          // as base. 1.25rem is the sm:!py-5 anchor value; the inline-axis
          // padding still comes from .abt-card's scoped rule.
          style={{ paddingBlock: fluid(1.25) }}
          className={" col-span-full lg:col-span-8 row-span-2 flex-col items-start"}
        >
          <h2
            className="text-xl md:text-2xl text-left w-full capitalize mb-3"
            style={{
              // Fluid heading (issue #25): overrides the utility base under
              // the scope; 1.5rem = the md:text-2xl anchor.
              fontSize: fluidText(1.5, 1.125),
              marginBottom: fluid(0.75),
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
            className="font-light text-xs sm:text-sm md:text-base"
            style={{
              // Fluid body copy: 1rem/1.5rem = the md:text-base anchor pair.
              // The line-height floor keeps the same 1.5 ratio as the font
              // floor so the paragraph's rhythm never drifts as either binds.
              fontSize: fluidText(1, 0.75),
              lineHeight: "max(1.125rem, calc(1.5rem * var(--fluid-scale, 1)))",
              // Halo ONLY — the gold→ember fill now lives per-word (wordFill in
              // @/lib/fireRamp) so the scroll-scrubbed opacity fades each glyph even in GPU-
              // composited Chrome. `.text-fire-amber` is intentionally NOT on
              // this parent: its `background-clip:text` fill would rasterize
              // once at the promoted tilt-card layer and paint the words
              // regardless of their opacity (the bug). A drop-shadow is a
              // filter — it composites over the faded words correctly. Values
              // match `.text-fire-amber`'s halo in globals.css.
              filter:
                'drop-shadow(0 0 4px rgba(255, 178, 60, 0.55)) drop-shadow(0 0 12px rgba(255, 73, 0, 0.35))',
            }}
          >
            {ARCHITECT_WORDS.map((word, i) => (
              <RevealWord
                key={i}
                index={i}
                total={ARCHITECT_WORDS.length}
                progress={paragraphScrollProgress}
                range={[i / ARCHITECT_WORDS.length, (i + 1) / ARCHITECT_WORDS.length]}
              >
                {word}
              </RevealWord>
            ))}
          </p>
        </ItemLayout>

        <ItemLayout
          // On screen at scroll 0 — behind the intro loader — so its entrance
          // reveal is gated on the loader lifting (`revealed`) instead of a
          // `whileInView` that would fire and finish unseen behind the overlay.
          // See ItemLayout's `revealWhen` note. `revealOrder={1}` places it
          // second in the hero cascade; `tilt` adds pointer tilt + ember glare.
          revealWhen={revealed}
          revealOrder={1}
          tilt
          // Mirrors the "Years in the craft" card exactly: `!p-0` hands all
          // padding to the inner `repo-card-breathe` wrapper, and `group
          // relative` matches the sibling so the two feature cards share one
          // structure (outer owns the `custom-bg-abt` amber border + gradient;
          // inner owns the breathing glow on its rounded-lg perimeter).
          className={" group relative col-span-full xs:col-span-6 lg:col-span-4 text-accent !p-0"}
        >
          {/* Inner wrapper is the 1:1 twin of the years card's: the
              `repo-card-breathe` pulsing glow border on a `rounded-lg`
              perimeter, padded `p-6`, content flex-col centered.

              The viewport observer (`completedProjectsRef`) lives HERE on the
              inner div, NOT on the outer ItemLayout: the ItemLayout animates
              `scale 0 → 1` on entry, and an IntersectionObserver attached to
              that self-scaling element reads zero area at entry and never
              re-fires after the transform settles — leaving `useInView` stuck
              false so the count-up never ran (the digit sat at 0). The inner
              div is not the scale target, so its observer reads a true ratio.
              Same reason the sibling stat cards observe their inner card. */}
          {/* Inner wrapper carries the SAME entrance reveal as the "Most Active
              Repository" card — the whole card springs up + fades in while its
              children (eyebrow → figure → split bar) stagger up after it (shared
              cardVariants/childVariants). Driven by `isCompletedProjectsInView`,
              which (because the outer ItemLayout holds scale 0 until the loader
              lifts — see `revealWhen`) only turns true once this card is actually
              visible, so the reveal plays in view instead of unseen behind the
              loader, and replays on a real scroll re-entry just like the repo
              card. */}
          <motion.div
            ref={completedProjectsRef}
            variants={cardVariants}
            initial="hidden"
            // Entrance driven off the DEBOUNCED `settledInView` (not raw
            // `inView`) so the `y: 56 → 0` reveal can't reset itself into an
            // on/off flicker while the card is parked at ~10% visibility.
            animate={settledCompletedProjectsInView ? "visible" : "hidden"}
            className="repo-card-breathe relative w-full h-full overflow-hidden rounded-lg px-6 py-4 flex flex-col items-stretch justify-center"
            // Inner wrapper owns this card's real padding (the outer
            // ItemLayout is `!p-0`), so it scales inline; radius rides too so
            // the breathing glow's rounded perimeter keeps its proportion.
            style={{
              paddingInline: fluid(1.5),
              paddingBlock: fluid(1),
              borderRadius: fluid(0.5),
            }}
          >
            {/* Count-change banner — appears only when the completed-projects
                count changed since this device last saw it (issue #16). The
                UpdateBanner's nodes are both out-of-flow (sr-only is absolute,
                overlay is absolute inset-0), so it doesn't disturb the card's
                stacked content. Not a stagger child — it owns its own visibility. */}
            <UpdateBanner
              message={projectCountBanner}
              visible={isCompletedProjectsInView}
              srPrefix="Projects update: "
              // Only a real dismissal arms the pulse: if the message has already
              // cleared (ref === null) this exit is the auto-hide; if it's still
              // set, this exit is a scroll-out and must be ignored.
              onExitComplete={() => {
                if (projectCountBannerRef.current === null) setProjectBannerGone(true);
              }}
            />

            {/* Eyebrow — same uppercase micro-label treatment + amber tone as
                the years card's "Years in the craft", so the two feature cards
                announce themselves identically. */}
            <motion.p
              variants={childVariants}
              aria-hidden="true"
              className="abt-micro text-[10px] uppercase tracking-[0.22em] mb-2"
              style={{ color: "#ffaa2a", textShadow: "none" }}
            >
              Projects shipped
            </motion.p>

            {/* Digit uses the vivid neon-orange (#ff6d05) of the sibling years
                digit; the label now matches the years card's `text-fire-amber`
                "of experience" tone (was the golden text-shadow-neon-light-orange)
                so the two cards' colour systems are identical. */}
            <motion.h1
              variants={childVariants}
              className="flex items-center gap-2 font-semibold w-full text-left text-2xl sm:text-5xl"
              // Fluid figure: 3rem = the sm:text-5xl anchor; the 1.5rem floor
              // is the legacy mobile text-2xl, so phones never drop below
              // today's smallest rendering.
              style={{ color: "#ff6d05", textShadow: "none", fontSize: fluidText(3, 1.5), gap: fluid(0.5) }}
            >
              <Counter from={0} to={projectsData.length} plusIcon={false} inView={isCompletedProjectsInView}></Counter>
              <span
                className="font-semibold text-base text-fire-amber"
                style={{ textShadow: "none", fontSize: fluidText(1, 0.875) }}
              >
                completed projects
              </span>
            </motion.h1>

            {/* Two-segment category split bar (Web / System) — the "elite &
                complex" counterpart to the years card's Personal/Employment
                split, same track, animated fill, legend, and percentages.
                Wrapped so it joins the stagger; its own segment fill still keys
                off `inView`. */}
            <motion.div variants={childVariants} className="w-full">
              <ProjectsSplitBar
                breakdown={PROJECT_CATEGORY_BREAKDOWN}
                inView={isCompletedProjectsInView}
                pulseCategories={pulseProjectCats}
              />
            </motion.div>
          </motion.div>
        </ItemLayout>

        <ItemLayout
          ref={experienceTriggerRef}
          // On screen at scroll 0 — behind the intro loader — so its entrance
          // reveal is gated on the loader lifting (`revealed`) instead of a
          // `whileInView` that would fire and finish unseen behind the overlay.
          // See ItemLayout's `revealWhen` note. `revealOrder={2}` makes it the
          // tail of the hero cascade; `tilt` adds pointer tilt + ember glare.
          revealWhen={revealed}
          revealOrder={2}
          tilt
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
          {/* Inner wrapper carries the SAME entrance reveal as the "Most Active
              Repository" card (shared cardVariants/childVariants): the card
              springs up + fades in while its children — eyebrow → figure → split
              bar — stagger up after it. Driven by `isExperienceCardInView`, which
              (the outer ItemLayout holds scale 0 until the loader lifts — see
              `revealWhen`) only turns true once the card is actually visible, so
              the reveal plays in view and replays on a real scroll re-entry. */}
          <motion.div
            ref={experienceInViewRef}
            variants={cardVariants}
            initial="hidden"
            // Entrance driven off the DEBOUNCED `settledInView` (not raw
            // `inView`) so the `y: 56 → 0` reveal can't reset itself into an
            // on/off flicker while the card is parked at ~10% visibility.
            animate={settledExperienceCardInView ? "visible" : "hidden"}
            className="repo-card-breathe relative w-full h-full overflow-hidden rounded-lg px-6 py-4 flex flex-col items-stretch justify-center"
            // Inner wrapper owns this card's real padding (the outer
            // ItemLayout is `!p-0`), so it scales inline; radius rides too so
            // the breathing glow's rounded perimeter keeps its proportion.
            style={{
              paddingInline: fluid(1.5),
              paddingBlock: fluid(1),
              borderRadius: fluid(0.5),
            }}
          >
            <ExperienceUpdateBanner
              message={testExperienceMessage ?? experienceChangeMessage}
              inView={isExperienceCardInView}
              onVisibilityChange={setExperienceBannerShown}
              variant="elite"
            />

            {/* Eyebrow — uppercase micro-label sets the "feature card"
                tone before the eye lands on the digit. Amber tone reads
                a touch warmer than the digit's vivid orange below it. */}
            <motion.p
              variants={childVariants}
              aria-hidden="true"
              className="abt-micro text-[10px] uppercase tracking-[0.22em] mb-2"
              style={{ color: "#ffaa2a", textShadow: "none" }}
            >
              Years in the craft
            </motion.p>

            <motion.h1
              variants={childVariants}
              // `items-center` (not `items-baseline`): the Counter renders a
              // flex <div>, which doesn't expose a reliable text baseline to
              // the parent, so baseline alignment let the big number and the
              // "… of experience" text drift apart. Centering aligns them
              // consistently at every width — and matches the sibling
              // "Completed projects" card, which already uses items-center.
              className="flex items-center gap-2 font-semibold w-full text-left text-2xl sm:text-5xl"
              // Fluid figure: 3rem = the sm:text-5xl anchor; the 1.5rem floor
              // is the legacy mobile text-2xl, so phones never drop below
              // today's smallest rendering.
              style={{ color: "#ff6d05", textShadow: "none", fontSize: fluidText(3, 1.5), gap: fluid(0.5) }}
            >
              {experienceData ? (
                <>
                  <Counter from={0} to={experienceCounterValue} inView={isExperienceCardInView}></Counter>
                  <span
                    className="font-semibold text-base text-fire-amber"
                    style={{ textShadow: "none" }}
                  >
                    {experienceCounterUnit} of experience
                  </span>
                </>
              ) : (
                // First-ever visit: no localStorage baseline yet, so the
                // hook genuinely has `null` until the fetch resolves.
                // Render a quiet pulsing em-dash in the same slot rather
                // than the misleading "0 months of experience" — keeps
                // the layout stable and signals "still computing" instead
                // of "the answer is zero". Once data arrives, the Counter
                // takes over and animates 0 → value as before.
                <span aria-label="Loading years of experience" className="animate-pulse">
                  —
                </span>
              )}
            </motion.h1>

            {/* Two-segment split bar — Personal vs Employment as a share of
                total. Renders when there's measured experience to split OR a
                source is unavailable (so its "Unavailable" row still shows);
                hidden only when both sources loaded and measured zero. Wrapped so
                it joins the stagger; its own segment fill still keys off `inView`. */}
            {showExperienceSplit && (
              <motion.div variants={childVariants} className="w-full">
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
                  pulseCategories={pulseExperienceCats}
                />
              </motion.div>
            )}

            {/* Hover affordance — fades in on group-hover/focus so the
                click target stops being implicit. `aria-hidden` because
                the card itself already advertises `role="button"` +
                aria-haspopup, so this is purely a visual hint. */}
            <p
              aria-hidden="true"
              className="text-[11px] tracking-wide mt-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300"
              style={{ color: "#ffd27d", textShadow: "none", fontSize: fluidText(0.6875, 0.6875) }}
            >
              View breakdown →
            </p>
          </motion.div>
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
          <GitHubStatsCard data={githubStats.stats.stats} userName={githubStats.stats.user.name} isUpdated={changedFields.includes("stats.stats") || changedFields.includes('stats.user')} diffMessage={statsDiffMessage} pulseFields={statsChangedFields} isLive={Boolean(githubStats.statsLive)} />
        </ItemLayout>}

        {/* Skills grid (issue #20): the hardcoded icon list + inline grid were
            replaced by a self-contained SkillsCard that fetches its set from
            /api/github-skills (daily-cached), categorises + responsively renders
            it, handles the in-icon hover label, and raises its own per-device
            "skills changed" banner. `!p-0` hands padding to the card's inner
            `repo-card-breathe` wrapper, matching the Languages / Streak cards —
            and dropping the old `!space-y-2` is what fixes the first-icon lift. */}
        <ItemLayout className="col-span-full !p-0">
          <SkillsCard username={username} />
        </ItemLayout>

        {githubStats?.stats && <ItemLayout className={"col-span-full lg:col-span-6 !p-0"}>
          <StreakStatsCard data={githubStats.stats.streaks} />
        </ItemLayout>}


        {githubStats?.stats?.repo && <ItemLayout className={" col-span-full lg:col-span-6 !p-0"}>
          <ReadmeStatsCard
            data={githubStats.stats.repo}
            isUpdated={changedFields.includes("stats.repo")}
            diffMessage={repoDiffMessage}
            pulseFields={repoChangedFields}
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
        pulseRepoNames={experiencePulseRepoNames}
        pulseRoleKeys={experiencePulseRoleKeys}
      />
    </section>
  );
};

export default AboutDetails;
