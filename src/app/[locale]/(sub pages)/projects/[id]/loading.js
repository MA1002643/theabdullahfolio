import Backdrop from "@/components/case-study/Backdrop"
import LoadingStatus from "@/components/case-study/LoadingStatus"

// Segment-level Suspense fallback for /projects/[id] (issue #83). Next.js
// swaps this in the instant a navigation to the route commits — before the
// page chunk has downloaded — so the router never has to hold the visitor on
// the previous page. Two paths depend on it:
//   - Stone Passage navigations: the pathname flips as soon as this renders,
//     which is what lets PageTransitionProvider leave `holding` on schedule
//     instead of hitting FAILSAFE_MS and revealing the old page.
//   - Direct loads / back-forward / middle-click: no overlay runs there, so
//     this is the only thing standing between the visitor and a blank frame.
// It renders the SAME ground as page.js (the case study's Backdrop, minus
// the project's bloom, which needs the project), so the fallback → page swap
// is seamless: the slate, the grid and the ember pools simply stay put while
// the hero and chapters arrive.
export default function Loading() {
    return (
        <>
            <Backdrop media={null} />
            {/* The status wrapper is a client component so its label can be
                translated without a locale param — see LoadingStatus.jsx. */}
            <LoadingStatus>
                {/* Lone ember waking up — restrained stand-in for the hero
                    while the page chunk arrives. */}
                <span
                    aria-hidden
                    className="h-2 w-2 rounded-full bg-[#ff9d3f] opacity-70 animate-pulse"
                    style={{ boxShadow: "0 0 18px 6px rgba(255, 157, 63, 0.35)" }}
                />
            </LoadingStatus>
        </>
    )
}
