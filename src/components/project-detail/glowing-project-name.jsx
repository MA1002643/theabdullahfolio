import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function GlowingTitle({ text }) {
    const [flicker, setFlicker] = useState(1);

    // Random tiny flicker every 6–8 seconds
    useEffect(() => {
        const doFlicker = () => {
            setFlicker(1 + (Math.random() * 0.02 - 0.01)); // ±1%
        };

        const interval = setInterval(doFlicker, 6000 + Math.random() * 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative inline-block">
            {/* Bloom Ring Behind Text */}
            <motion.div
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: [1, 1.02, 1], opacity: [0.4, 0.5, 0.4] }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute inset-0 blur-2xl bg-[#b16612]"
            />

            {/* Main Title */}
            <motion.h1
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
            >
                {text}
            </motion.h1>
        </div>
    );
}
