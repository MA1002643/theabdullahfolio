"use client";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import ProjectLayout from "./ProjectLayout";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import PageTitle from "@/components/PageTitle";
import ScrollHijackCategories from "@/components/shared/ScrollHijackCategories";
import { useLoaderRevealed } from "@/hooks/useLoaderRevealed";
import { normalizeCategory } from "@/lib/categories";
import { consumeProjectFilterHandoff } from "@/lib/projectFilterHandoff";
import { fluid, fluidText } from "@/lib/fluidScale";

// List reveal (issue #27 §3.2) — slowed from the original 0.15/0.3 so the
// cards read as settling into place one at a time rather than racing in.
// The per-card travel/blur profile this staggers lives in ProjectLayout.
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.22,
      delayChildren: 0.18,
    },
  },
};

// Reduced motion → the same states via one plain cross-fade: no stagger (a
// queue of timed appearances is still choreography). Mirrors the REDUCED_*
// variant pattern in ScrollHijackCategories.
const reducedContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
};

// §2.3 — the one place the empty-category wording lives: the disabled-tab
// click toast, the disabled tab's tooltip, and the stored-filter fallback
// note below all read from it.
const emptyCategoryMessage = (category) => `No projects in "${category}" yet.`;

// Shared by both info toasts (empty-category click and stored-filter
// fallback) so the two can never drift apart visually.
const INFO_TOAST_STYLE = {
  color: "#ff6d05",
  backgroundColor: "rgb(0 0 0 / 0.7)",
  border: "none",
  textAlign: "center",
  // Shrink the toast container to its content width on every
  // viewport so it doesn't span the screen on mobile or leave dead
  // space on desktop. `alignSelf: center` + auto inline margins opt
  // the toast out of sonner's default flex-column stretch so it
  // centers within the position-anchored wrapper.
  width: "fit-content",
  maxWidth: "min(90vw, 28rem)",
  alignSelf: "center",
  marginInline: "auto",
};

const ProjectList = ({ projects }) => {
  const [active, setActive] = useState("All");
  const prefersReducedMotion = useReducedMotion();
  // Track the id of the most recent "empty category" toast so we can
  // dismiss it precisely when the message stops being relevant — i.e.
  // when the user switches to a category that *does* have projects, or
  // when they navigate away from /projects entirely. Without this, the
  // sonner toast keeps counting down its default duration and is still
  // on screen after the route change, which is the bug we're fixing.
  const lastToastIdRef = useRef(null);

  const dismissEmptyToast = () => {
    if (lastToastIdRef.current !== null) {
      toast.dismiss(lastToastIdRef.current);
      lastToastIdRef.current = null;
    }
  };

  // Tabs are DERIVED from the data (issue #27 §2.1): the unique set of
  // category labels worn by at least one project, in first-appearance order,
  // behind the forced "All" reset. Add a project under a brand-new category
  // in data.js and its tab appears already enabled; remove a category's last
  // project and its tab disappears — there is no second, hand-kept list to
  // fall out of sync with the data. (The old module-scope CATEGORIES
  // constant this replaces was exactly that second list.)
  // "All" is RESERVED: it's pinned as the first tab and its count is
  // projects.length, so a project whose category folds to "All" must be
  // excluded here — otherwise it would mint a duplicate tab (colliding
  // with the strip's key={cat}) and inflate the All count past the real
  // total. Such a project stays reachable through the All view itself.
  const categories = useMemo(() => {
    const derived = [];
    projects.forEach((project) => {
      const cat = normalizeCategory(project.category);
      if (cat && cat !== "All" && !derived.includes(cat)) derived.push(cat);
    });
    return ["All", ...derived];
  }, [projects]);

  const categoryCounts = useMemo(() => {
    const counts = { All: projects.length };
    projects.forEach((project) => {
      const cat = normalizeCategory(project.category);
      if (cat && cat !== "All") counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return counts;
  }, [projects]);

  // "All" is never disabled — it is the reset, even on an empty portfolio.
  // With derived tabs a category with zero projects normally has no tab at
  // all, so this guard is mostly vacuous here — it stays because the shared
  // strip's disabled treatment is part of its API (qualifications uses it),
  // and it keeps /projects safe should the tab source ever widen beyond
  // pure derivation.
  const isCategoryDisabled = (cat) =>
    cat !== "All" && (categoryCounts[cat] ?? 0) === 0;

  // ✅ Restore the category the visitor left on — but ONLY when they left it
  // to open a project's detail page and have just come back. The handoff is
  // minted by the card click, spent by the read below, and voided by any route
  // outside /projects (see lib/projectFilterHandoff), so every other way onto
  // this page — a first visit, a reload, a return from /about or the homepage,
  // a second tab — finds nothing and keeps the "All" default. This was a
  // localStorage preference, which made one card click pin that tab on every
  // future visit.
  //
  // Validated against TODAY'S tabs even so (§2.5): a deploy landing mid-hop
  // serves the returning page a new data.js while the token still names the
  // old category, whose tab may have lost its last project or been renamed
  // away. Restoring it blind would land the visitor on a bare "No Projects
  // Found!" panel with no explanation, so fall back to "All" (the default
  // state — no setActive needed) and say why once (§2.4). The ref makes the
  // restore once-per-mount even though the memoised categories/counts are in
  // the dep array for lint honesty.
  //
  // The fallback NOTE is deferred, not shown here: this effect runs during
  // initial mount, which is (a) before the root layout's <Toaster> has
  // subscribed — sonner silently drops toasts fired before its Toaster
  // mounts, verified against a stored dead category — and (b) under the
  // intro loader's z-9999 overlay, where the toast would burn its ~4s
  // duration invisibly (the PageTitle/strip entrances gate on the loader
  // for the same reason). The label is stashed and announced by the
  // `revealed` effect below, once the visitor can actually see the page.
  const restoredRef = useRef(false);
  const pendingFallbackNoteRef = useRef(null);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    // Reading SPENDS the handoff — nothing to heal or reset afterwards, since
    // the token is gone either way and the next arrival starts on "All".
    const saved = consumeProjectFilterHandoff();
    if (saved === null) return;
    // Fold the label through the same normalisation the tabs are derived
    // through: the token carries the raw data.js label, so a "web" authored
    // in lower case must match today's "Web" tab rather than failing
    // includes() and bouncing the visitor to "All" behind a misleading
    // fallback note.
    const normalized = normalizeCategory(saved);
    if (!normalized || normalized === "All") return;
    if (categories.includes(normalized) && (categoryCounts[normalized] ?? 0) > 0) {
      setActive(normalized);
      return;
    }
    pendingFallbackNoteRef.current = normalized;
  }, [categories, categoryCounts]);

  // Announce the stored-filter fallback once the loader has lifted.
  // `revealed` flips in a post-mount render in every path (even when the
  // loader already ran, the hook sets state from its own effect), so by the
  // time this fires the Toaster is subscribed and the page is visible.
  const revealed = useLoaderRevealed();
  useEffect(() => {
    if (!revealed || !pendingFallbackNoteRef.current) return;
    const saved = pendingFallbackNoteRef.current;
    pendingFallbackNoteRef.current = null;
    lastToastIdRef.current = toast.info(
      `${emptyCategoryMessage(saved)} Showing all projects instead.`,
      { style: INFO_TOAST_STYLE },
    );
  }, [revealed]);

  // Dismiss any lingering empty-category toast on unmount — fires when
  // the user clicks the home (or any other) nav button and the
  // /projects route is torn down. The toast lives in the Toaster
  // mounted at the root layout, so it survives this unmount unless we
  // explicitly close it.
  useEffect(() => () => dismissEmptyToast(), []);

  const filteredProjects =
    active === "All"
      ? projects
      : projects.filter((p) => normalizeCategory(p.category) === active);

  // Fired for every tab click, disabled ones included: the toast and its
  // dismissal lifecycle stay here rather than moving into the shared strip,
  // so the precise "dismiss on switch / dismiss on unmount" behaviour this
  // page already owns is untouched.
  const handleSelect = (cat) => {
    // Clear any prior empty-category toast first so two consecutive empty
    // clicks don't stack and a disabled→enabled switch leaves the old
    // message on screen for its full duration.
    dismissEmptyToast();
    if (isCategoryDisabled(cat)) {
      lastToastIdRef.current = toast.info(emptyCategoryMessage(cat), {
        style: INFO_TOAST_STYLE,
      });
      return;
    }
    setActive(cat);
  };

  const listVariants = prefersReducedMotion ? reducedContainer : container;

  return (
    // Sizing (issue #50): every dimension on this page derives from the one
    // `--fluid-scale` factor the sub-page layout's `fluid-scale` scope
    // computes — the fluid() values below replace the old xl:max-w-4xl /
    // px-4 lg:px-10 / space-y-6 md:space-y-8 breakpoint jumps. max-width is
    // the old 4xl (56rem) at scale 1; space-y-* becomes a flex gap so the
    // title → strip → list rhythm is one scaled property, not per-child
    // margins.
    <motion.div
      variants={listVariants}
      initial="hidden"
      animate="show"
      className="fluid-scale w-full mx-auto flex flex-col items-center"
      style={{
        maxWidth: fluid(56),
        paddingInline: fluid(1),
        gap: fluid(1.5),
      }}
    >
      {/* HEADER — uses shared PageTitle (issue #104). The decorative
          dashes around "MY WORK" were dropped per the acceptance
          criteria: the subtitle now uses the same plain <h2>
          treatment as the qualifications page. replayOnView (issue #28)
          re-arms the headline ignite whenever the block scrolls out of
          view, so it replays alongside the category row's entrance
          instead of sitting static after the first load. */}
      <PageTitle title="PROJECTS" subtitle="MY WORK" replayOnView />

        {/* CATEGORY FILTERS — mirrors the qualifications carousel tab
            treatment: orange neon glow for the active tab, pink neon glow
            for inactive, brighter halo on hover. Disabled (empty) tabs
            dim and surface a toast.

            The row itself is the shared scroll-driven strip (issue #47):
            with today's four categories it measures as fitting and renders
            as the plain centred row it always was. Grow CATEGORIES past what
            the viewport can hold and it becomes a horizontal scroller — a
            wheel over the row travels sideways — instead of wrapping to a
            second line. The project list below never moves. */}
        <ScrollHijackCategories
          // Fluid margins (issue #50) — the old mt-10/mb-4 at scale 1,
          // breathing with the page instead of sitting fixed while
          // everything around them scales.
          style={{ marginTop: fluid(2.5), marginBottom: fluid(1) }}
          label="Project categories"
          categories={categories}
          active={active}
          onSelect={handleSelect}
          isDisabled={isCategoryDisabled}
          disabledTitle={emptyCategoryMessage}
          counts={categoryCounts}
        />

      {/* PROJECT LIST — mode="wait" keeps the handoff sequential (§3.3):
          the outgoing category's list fades down first, then the incoming
          one staggers its cards in. The exit is deliberately brisker than
          the entrance so the pause between filters reads as a beat, not
          a wait. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          variants={listVariants}
          initial="hidden"
          animate="show"
          exit={{
            opacity: 0,
            transition: { duration: 0.25, ease: "easeIn" },
          }}
          // space-y-4 → scaled flex gap (issue #50): gap lives on the
          // container, so AnimatePresence's exiting copy can't leave a
          // double margin behind mid-handoff.
          className="w-full flex flex-col"
          style={{ gap: fluid(1) }}
        >
          {filteredProjects.length >= 1 ? (
            filteredProjects.map((project, index) => (
              <ProjectLayout key={index} {...project} category={active}/>
            ))
          ) : (
            <div className="custom-bg-abt rounded-md" style={{ padding: fluid(0.75) }}>
              <h3
                className="text-center font-semibold text-[#FFB627] tracking-wide relative z-10 drop-shadow-[0_0_5px_#ffb627]"
                style={{ fontSize: fluidText(1.125, 0.85) }}
              >
                No Projects Found !
              </h3>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

export default ProjectList;
