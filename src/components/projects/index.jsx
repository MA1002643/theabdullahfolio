"use client";
import { motion, AnimatePresence } from "framer-motion";
import ProjectLayout from "./ProjectLayout";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import PageTitle from "@/components/PageTitle";
import ScrollHijackCategories from "@/components/shared/ScrollHijackCategories";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

// Module-scope so the array reference is stable across renders. The
// in-component literal it replaced was recreated on every render,
// which made the `useEffect` and `useMemo` below trip the
// `react-hooks/exhaustive-deps` lint: adding it to the deps would
// re-run them every render, omitting it would mask a real dependency.
// Hoisting matches the naming convention used by `PARENT_CATEGORIES`
// in `qualifications/Carousel.jsx`.
/* ⚠️ ─── TEMPORARY DEMO CATEGORIES — issue #47 manual testing ──────────────
   Eight extra tabs so the row outgrows the 4-slot desktop window (2 on mobile)
   and the strip actually engages. Mobile / Design / Robotics / Data have demo
   projects behind them in src/app/data.js and are SELECTABLE; Cloud / Security
   / Embedded / Research have none, so they stay dimmed and raise the toast.
   DELETE this const and drop the spread below to restore the shipping four. */
const DEMO_CATEGORIES = [
  "Mobile",
  "Design",
  "Robotics",
  "Data",
  "Cloud",
  "Security",
  "Embedded",
  "Research",
];

const CATEGORIES = ["All", "Web", "System", "App", ...DEMO_CATEGORIES];

const ProjectList = ({ projects }) => {
  const [active, setActive] = useState("All");
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

  // ✅ Check localStorage for saved category
  useEffect(() => {
    const saved = localStorage.getItem("projects-category");
    if (saved && CATEGORIES.includes(saved)) {
      setActive(saved);
    } else {
      setActive("All");
    }
  }, []);

  // Dismiss any lingering empty-category toast on unmount — fires when
  // the user clicks the home (or any other) nav button and the
  // /projects route is torn down. The toast lives in the Toaster
  // mounted at the root layout, so it survives this unmount unless we
  // explicitly close it.
  useEffect(() => () => dismissEmptyToast(), []);

  const filteredProjects =
    active === "All"
      ? projects
      : projects.filter((p) => p.category === active);

  const categoryCounts = useMemo(() => {
    const counts = { All: projects.length };
    CATEGORIES.forEach((cat) => {
      if (cat !== "All") {
        counts[cat] = projects.filter((p) => p.category === cat).length;
      }
    });
    return counts;
  }, [projects]);

  // "All" is never disabled — it is the reset, even on an empty portfolio.
  const isCategoryDisabled = (cat) => cat !== "All" && categoryCounts[cat] === 0;

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
      lastToastIdRef.current = toast.info("No projects in this category", {
        style: {
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
        },
      });
      return;
    }
    setActive(cat);
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full max-w-full xl:max-w-4xl px-4 mx-auto lg:px-10 space-y-6 md:space-y-8 flex flex-col items-center"
    >
      {/* HEADER — uses shared PageTitle (issue #104). The decorative
          dashes around "MY WORK" were dropped per the acceptance
          criteria: the subtitle now uses the same plain <h2>
          treatment as the qualifications page. */}
      <PageTitle title="PROJECTS" subtitle="MY WORK" />

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
          categories={CATEGORIES}
          active={active}
          onSelect={handleSelect}
          isDisabled={isCategoryDisabled}
          disabledTitle={() => "No projects in this category"}
          counts={categoryCounts}
        />

      {/* PROJECT LIST */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          variants={container}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0 }}
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
