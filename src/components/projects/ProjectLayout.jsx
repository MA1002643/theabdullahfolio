"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useRouter } from "next/navigation"
import TransitionLink from "@/components/pageTransition/TransitionLink"
import { warmProjectScene } from "@/components/project-detail/scene-loader"

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

  const handleClick = () => {
    if (category) {
      localStorage.setItem("projects-category", category)
    }
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
  return (
    <ProjectLink
      variants={prefersReducedMotion ? reducedItem : item}
      href={`/projects/${id}`}
      transitionLabel={name}
      onClick={handleClick}
      onMouseEnter={warmDetail}
      onFocus={warmDetail}
      onTouchStart={warmDetail}
      className="text-sm md:text-base flex items-center justify-between w-full relative rounded-lg overflow-hidden p-4 md:p-6 custom-bg-abt"
    >
      <div className="flex items-center justify-center space-x-2">
        <h2 className="project-title">{name}</h2>
        <p className="project-meta hidden sm:inline-block">{description}</p>
      </div>

      <div aria-hidden="true" className="project-separator-dot self-end flex-1 mx-2 mb-2" />

      <p id="date" className="project-meta">
        {new Date(date).toDateString()}
      </p>
    </ProjectLink>
  )
}

export default ProjectLayout
