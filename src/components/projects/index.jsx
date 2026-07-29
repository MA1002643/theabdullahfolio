"use client";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import ProjectLayout from "./ProjectLayout";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import PageTitle from "@/components/PageTitle";
import ScrollHijackCategories from "@/components/shared/ScrollHijackCategories";
import { useLoaderRevealed } from "@/hooks/useLoaderRevealed";
import { normalizeCategory } from "@/lib/categories";

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

  // ✅ Restore the saved category — validated against TODAY'S tabs (§2.5).
  // The stored label can predate a data change: its category may have lost
  // its last project (tab gone — tabs are derived from the data above) or
  // been renamed away. Restoring it blind would land a returning visitor on
  // a bare "No Projects Found!" panel with no explanation. Instead fall back
  // to "All" (the default state — no setActive needed), say why once, and
  // heal the stored value so the note doesn't repeat every visit (§2.4).
  // The ref makes the restore once-per-mount even though the memoised
  // categories/counts are in the dep array for lint honesty.
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
    const saved = localStorage.getItem("projects-category");
    if (saved === null) return;
    // Fold the stored label through the same normalisation the tabs are
    // derived through: a legacy "web" (written by a pre-normalisation
    // version, or hand-edited) must match today's "Web" tab rather than
    // failing includes() and bouncing the visitor to "All" behind a
    // misleading fallback note. Heal storage to the canonical casing so
    // the value on disk always mirrors a real tab label.
    const normalized = normalizeCategory(saved);
    if (saved !== normalized) {
      localStorage.setItem("projects-category", normalized || "All");
    }
    if (!normalized || normalized === "All") return;
    if (categories.includes(normalized) && (categoryCounts[normalized] ?? 0) > 0) {
      setActive(normalized);
      return;
    }
    localStorage.setItem("projects-category", "All");
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
    <motion.div
      variants={listVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-full xl:max-w-4xl px-4 mx-auto lg:px-10 space-y-6 md:space-y-8 flex flex-col items-center"
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
          className="mb-4 mt-10"
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
          className="w-full space-y-4"
        >
          {filteredProjects.length >= 1 ? (
            filteredProjects.map((project, index) => (
              <ProjectLayout key={index} {...project} category={active}/>
            ))
          ) : (
            <div className="custom-bg-abt rounded-md p-3">
              <h3 className="text-center text-lg font-semibold text-[#FFB627] tracking-wide relative z-10 drop-shadow-[0_0_5px_#ffb627]">
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
