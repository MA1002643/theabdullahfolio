"use client";
import { m } from "framer-motion";

// `rtl` reveals from the right edge instead (issue #82): the type-on should
// start where the line starts. A prop, not useDirection(): this renders inside
// drei's <Html> root, which has no intl context to read the locale from.
const inset = (amount, rtl) =>
    rtl ? `inset(0 0 0 ${amount})` : `inset(0 ${amount} 0 0)`

export default function TypeOnChunks({ text, rtl = false }) {
    return (
        <m.span
            initial={{
                clipPath: inset("100%", rtl), // fully hidden
            }}
            animate={{
                clipPath: [
                    inset("100%", rtl), // hidden
                    inset("66%", rtl),  // chunk 1
                    inset("33%", rtl),  // chunk 2
                    inset("0%", rtl),   // fully revealed
                ],
            }}
            transition={{
                duration: 0.52, // 400–600ms sweet spot
                ease: "easeOut",
                times: [0, 0.25, 0.55, 1], // irregular chunk timing
            }}
            className="inline-block overflow-hidden will-change-transform"
        >
            {text}
        </m.span>
    );
}
