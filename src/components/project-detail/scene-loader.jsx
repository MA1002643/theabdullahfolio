"use client"

import dynamic from "next/dynamic"

// Client-side boundary that keeps the WebGL bundle OUT of the /projects/[id]
// entry chunk (issue #83). scene.jsx is the only module in the route that
// imports three / @react-three/*, and next/dynamic splits it into its own
// async chunk, so the page shell (background, title, aurora) can commit and
// paint while the scene is still downloading. ssr:false because the Canvas
// only renders on the GPU anyway — and it requires this wrapper to be a
// client component, hence the directive above.
const ProjectScene = dynamic(() => import("@/components/project-detail/scene"), {
    ssr: false,
})

// Starts the scene chunk download before it's needed. The /projects listing
// calls this on hover/focus/touch so the ~1 MB of three.js is already in
// flight (or cached) by the time the visitor clicks through. import() is
// idempotent — repeat calls resolve from the module cache, and webpack emits
// the SAME chunk as the dynamic() call above, so nothing is fetched twice.
export function warmProjectScene() {
    // Best-effort: a failed prefetch (offline, blocked, deploy skew) must not
    // surface as an unhandled rejection — navigation's own dynamic() import
    // retries the fetch and is the right place for a real failure to show.
    import("@/components/project-detail/scene").catch(() => {})
}

export default function SceneLoader() {
    return <ProjectScene />
}
