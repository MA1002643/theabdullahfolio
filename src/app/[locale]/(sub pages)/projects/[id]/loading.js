import Image from "next/image"
import bg from "../../../../../public/background/home-bg.webp"

// Segment-level Suspense fallback for /projects/[id] (issue #83). Next.js
// swaps this in the instant a navigation to the route commits — before the
// page chunk has downloaded — so the router never has to hold the visitor on
// the previous page. Two paths depend on it:
//   - Stone Passage navigations: the pathname flips as soon as this renders,
//     which is what lets PageTransitionProvider leave `holding` on schedule
//     instead of hitting FAILSAFE_MS and revealing the old page.
//   - Direct loads / back-forward / middle-click: no overlay runs there, so
//     this is the only thing standing between the visitor and a blank frame.
// It intentionally renders the SAME background as page.js (same static
// import → same URL → shared cache entry), so the fallback → page swap is
// seamless: the background simply stays put while title and scene fade in.
export default function Loading() {
    return (
        <>
            <Image
                src={bg}
                alt=""
                fill
                priority
                className="fixed top-0 left-0 w-full h-full object-cover object-center -z-10"
            />
            <div
                role="status"
                aria-label="Loading project"
                className="fixed inset-0 flex items-end justify-center pb-24 pointer-events-none"
            >
                {/* Lone ember waking up — restrained stand-in for the lantern
                    glow while the scene chunk arrives. */}
                <span
                    aria-hidden
                    className="h-2 w-2 rounded-full bg-[#ff9d3f] opacity-70 animate-pulse"
                    style={{ boxShadow: "0 0 18px 6px rgba(255, 157, 63, 0.35)" }}
                />
            </div>
        </>
    )
}
