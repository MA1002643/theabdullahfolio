"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useDirection } from "@/i18n/useDirection"

import { optionalChunk } from "@/lib/optionalChunk"
import { canCreateWebGL } from "@/lib/webglSupport"

// Client-side boundary that keeps the WebGL bundle OUT of the /projects/[id]
// entry chunk (issue #83). scene.jsx is the only module in the route that
// imports three / @react-three/*, and next/dynamic splits it into its own
// async chunk, so the page shell (background, title, aurora) can commit and
// paint while the scene is still downloading. ssr:false because the Canvas
// only renders on the GPU anyway — and it requires this wrapper to be a
// client component, hence the directive above.
//
// Optional (issue #92): if the ~1 MB chunk cannot load, the page keeps its
// title, description and links instead of collapsing into Next's bare
// "Application error" screen, which is what a failed dynamic() import did.
const ProjectScene = dynamic(
    optionalChunk(() => import("@/components/project-detail/scene"), "ProjectScene"),
    { ssr: false },
)

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

// The laptop screen's copy, resolved HERE rather than inside the screen
// (issue #82). drei's <Html> mounts its children in a separate React root,
// which inherits none of this tree's context, so a `useTranslations` call on
// the far side of the Canvas would find no provider and throw. Strings and the
// reading direction cross the boundary as plain props instead.
export function useScreenCopy() {
    const t = useTranslations("ProjectDetail")
    const { dir, isRtl } = useDirection()
    return {
        dir,
        isRtl,
        boot: [t("screen.boot.bios"), t("screen.boot.hardware"), t("screen.boot.os")],
        tagline: t("screen.tagline"),
        badgeFullstack: t("screen.badgeFullstack"),
        tools: t("screen.tools"),
        overview: t("screen.overview"),
        overviewLead: t("screen.overviewLead"),
        overviewBody: t("screen.overviewBody"),
        features: t("screen.features"),
        featureList: ["auth", "payments", "chat", "admin"].map((key) => ({
            key,
            title: t(`screen.feature.${key}.title`),
            desc: t(`screen.feature.${key}.desc`),
        })),
        liveDemo: t("screen.liveDemo"),
        github: t("screen.github"),
        demoLabel: (name) => t("screen.demoLabel", { name }),
        sourceLabel: (name) => t("screen.sourceLabel", { name }),
    }
}

// No WebGL context to be had (switched off, blocklisted, headless Firefox):
// the same outcome as a chunk that failed to load. The page keeps its title,
// description and links, and three.js is never asked, because it throws
// rather than degrading. Probed after hydration, so the first render matches
// the server's.
export default function SceneLoader({ links }) {
    const copy = useScreenCopy()
    const [webgl, setWebgl] = useState(false)
    useEffect(() => setWebgl(canCreateWebGL()), [])
    if (!webgl) return null
    return <ProjectScene links={links} copy={copy} />
}
