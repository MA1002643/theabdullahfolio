import { m } from "framer-motion";
import { useEffect, useState } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";

export default function GlowingTitle({ text }) {
    const [flicker, setFlicker] = useState(1);

    // Reduced motion stills the bloom and the flicker (issue #92): the ring
    // pulsed forever, which tests/a11y/motion.spec.js flags under WCAG 2.2.2.
    // Gated behind a mounted flag (the house pattern, see PrivacyNotice) so the
    // first client render matches the server's and adds no hydration mismatch.
    const rawReduced = useReducedMotion();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const reduced = mounted && rawReduced;

    // Random tiny flicker every 6–8 seconds
    useEffect(() => {
        if (reduced) return undefined;
        const doFlicker = () => {
            setFlicker(1 + (Math.random() * 0.02 - 0.01)); // ±1%
        };

        const interval = setInterval(doFlicker, 6000 + Math.random() * 2000);
        return () => clearInterval(interval);
    }, [reduced]);

    return (
        <div className="relative inline-block">
            {/* Bloom Ring Behind Text */}
            <m.div
                initial={{ scale: 1, opacity: 0.4 }}
                animate={
                    reduced
                        ? { scale: 1, opacity: 0.4 }
                        : { scale: [1, 1.02, 1], opacity: [0.4, 0.5, 0.4] }
                }
                transition={
                    reduced
                        ? { duration: 0 }
                        : { duration: 4, repeat: Infinity, ease: "easeInOut" }
                }
                className="absolute inset-0 blur-2xl bg-[#b16612]"
            />

            {/* Main Title */}
            <m.h1
                initial={{
                    filter: "brightness(0%)",
                    opacity: 0,
                }}
                animate={{
                    filter: `brightness(${flicker * 100}%)`,
                    opacity: 1,
                }}
                transition={{
                    duration: 0.9,
                    ease: "easeOut",
                }}
                // Typography mirrors the qualifications page header
                // (issue #104) so the project-detail title sits in
                // the same visual register as every other sub-page
                // title. Bloom ring + flicker stay — they're this
                // title's distinctive cinematic effect, not part of
                // the typography that was being unified.
                //
                // `text-transparent` intentionally dropped — the shared
                // .text-glow-stroke-neon utility now paints a solid
                // #ff6d05 fill so each letter is a filled orange
                // glyph instead of an outline-only shape.
                className="relative text-[2rem] md:text-[3rem] font-extrabold uppercase leading-tight text-glow-stroke-neon"
                // The project's name, not prose: never translated. The
                // pseudo-locale gate also reads this to accept the same name
                // in the <title>.
                translate="no"
            >
                {text}
            </m.h1>
        </div>
    );
}
