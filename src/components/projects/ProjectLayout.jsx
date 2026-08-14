"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useRouter } from "next/navigation"
import TransitionLink from "@/components/pageTransition/TransitionLink"
import { warmProjectScene } from "@/components/project-detail/scene-loader"
import { fluid, fluidText } from "@/lib/fluidScale"
import { saveProjectFilterHandoff } from "@/lib/projectFilterHandoff"

// Per-card reveal (issue #27 §3.2): a short rise while the card pulls into
// focus — replaces the original y:100 leap, whose full-viewport travel read
// as dramatic rather than elegant at the parent's slower stagger. The 2px
// blur is deliberately faint: enough to sell "coming into focus", cheap
// enough that the 3–4 cards mid-flight at any moment (0.22s stagger, 0.7s
// item) don't tax the compositor.
const item = {
  hidden: { opacity: 0, y: 28, filter: "blur(2px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
}

// Reduced motion → a plain fade: travel and blur are both motion. Same
// REDUCED_* pattern as ScrollHijackCategories, so the two halves of the
// page stand down together.
const reducedItem = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
}

const ProjectLink = motion(TransitionLink)

// Mirrors the signals Next's own viewport prefetch stands down for
// (saveData, 2g/slow-2g). navigator.connection is Chromium-only; where it
// doesn't exist there is no signal to respect, so we warm as usual.
const isConstrainedConnection = () => {
  const connection = navigator.connection
  return (
    !!connection &&
    (connection.saveData || /2g/.test(connection.effectiveType || ""))
  )
}

const ProjectLayout = ({ id, name, description, date, demoLink, category }) => {
  const router = useRouter()
  const prefersReducedMotion = useReducedMotion()

  // Hand the current filter forward so that coming BACK from this project's
  // page returns the visitor to the list they left. A one-hop token, not a
  // saved preference: it is spent the moment /projects reads it, and voided if
  // the visitor goes anywhere outside /projects in between — a single card
  // click used to pin the tab permanently, so a first visit landed on a filter
  // rather than on "All". See lib/projectFilterHandoff.
  const handleClick = () => {
    saveProjectFilterHandoff(category)
  }

  // Warm the destination while the visitor is still deciding (issue #83).
  // <Link> prefetches the route in-viewport, and warmProjectScene starts the
  // three.js chunk download that next/dynamic would otherwise only begin
  // after navigation. Both calls dedupe, so re-hovering costs nothing.
  // onTouchStart is the mobile "intent" signal — it fires a beat before
  // click, which is enough to get the request going. On Save-Data / 2G we
  // stand down entirely: hover is a hint, not a click, and a speculative
  // ~1 MB scene chunk is exactly the spend that preference asks us to skip —
  // those visitors pay the chunk on navigation itself, as before this branch.
  const warmDetail = () => {
    if (isConstrainedConnection()) return
    router.prefetch(`/projects/${id}`)
    warmProjectScene()
  }

  // Text roles are semantic classes in globals.css (issue #27 §5) — no
  // per-element colour/shadow overrides here. Title glows softly; the
  // description and date share the flat "eyebrow amber" the About page
  // settled on for its headings (#14); the leader between them is real
  // dots in the title's colour, not the dashed border it replaces.
  //
  // Sizing (issue #50): padding, radius and base font ride the page's
  // fluid factor — the old text-sm md:text-base / p-4 md:p-6 jumps are
  // gone. The description is ALWAYS in the layout now (the old
  // `hidden sm:inline-block` popped it in at 640px, the page's most
  // abrupt breakpoint): `.project-card-desc` lets it shrink and
  // ellipsize inside the min-w-0 group instead, so on a narrow card the
  // blurb trails off while name, leader and date always keep their
  // place. shrink-0 on title and date marks the description as the one
  // flexible passenger; the leader's min-width guarantees a few dots
  // survive between them at any width.
  return (
    <ProjectLink
      variants={prefersReducedMotion ? reducedItem : item}
      href={`/projects/${id}`}
      transitionLabel={name}
      onClick={handleClick}
      onMouseEnter={warmDetail}
      onFocus={warmDetail}
      onTouchStart={warmDetail}
      className="flex items-center w-full relative overflow-hidden custom-bg-abt"
      style={{
        fontSize: fluidText(1, 0.78),
        padding: fluid(1.25),
        borderRadius: fluid(0.5),
      }}
    >
      <div className="flex min-w-0 items-center" style={{ gap: fluid(0.5) }}>
        <h2 className="project-title shrink-0">{name}</h2>
        <p className="project-meta project-card-desc">{description}</p>
      </div>

      <div
        aria-hidden="true"
        className="project-separator-dot self-end"
        // grow:1 fills whatever the description leaves; shrink:0 with a
        // scaled basis is the leader's floor — the row can never squeeze
        // it out entirely, so a few dots always separate blurb from date.
        style={{
          marginInline: fluid(0.5),
          marginBottom: fluid(0.5),
          flex: `1 0 ${fluid(0.75)}`,
        }}
      />

      <p id="date" className="project-meta shrink-0">
        {new Date(date).toDateString()}
      </p>
    </ProjectLink>
  )
}

export default ProjectLayout
