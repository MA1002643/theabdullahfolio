"use client"

import { useTranslations } from "next-intl"

// The live-region half of /projects/[id]/loading.js (issue #82). A Client
// Component because loading.js receives no `params`: it cannot call
// setRequestLocale, and a server-side getTranslations() there would fall back
// to reading request headers, which opts the route out of static rendering.
// The root layout's provider is already above it with the GLOBAL namespaces,
// so the label reads from `Common` — the route's own ProjectDetail scope only
// starts at page.js, below this fallback.
//
// `t.has` keeps the English label even if the key is ever missing from the
// catalogue: a loading fallback must never be the thing that throws.
export default function LoadingStatus({ children }) {
    const t = useTranslations("Common")
    const label = t.has("loadingProject") ? t("loadingProject") : "Loading project"
    return (
        <div
            role="status"
            aria-label={label}
            className="fixed inset-0 flex items-end justify-center pb-24 pointer-events-none"
        >
            {children}
        </div>
    )
}
