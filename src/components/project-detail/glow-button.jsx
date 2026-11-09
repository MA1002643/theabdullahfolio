"use client";
import { m } from "framer-motion";

// A real external link styled as the scene's glowing button (issue #92). It
// used to be a <motion.button> that accepted `href` and ignored it, so "Live
// Demo" and "GitHub" did nothing on every project page.
//
// `inert3d`: for copies projected onto the 3D laptop screen (drei <Html
// transform>). Their layout box is not where they paint, so a keyboard focus
// ring would be drawn somewhere else entirely (WCAG 2.4.11, keyboard suite
// finding K3). Those copies stay clickable but leave the Tab order and the
// accessibility tree; ProjectIntro renders the accessible pair in normal flow.
export function GlowButton({ children, href, label, inert3d = false }) {
    return (
        <m.a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={inert3d ? undefined : label}
            aria-hidden={inert3d ? true : undefined}
            tabIndex={inert3d ? -1 : undefined}
            initial={{
                filter: "drop-shadow(0 0 0px rgba(255,160,80,0))",
            }}
            whileHover={{
                scale: 1.05,
                filter: [
                    "drop-shadow(0 0 0px rgba(255,160,80,0))",
                    "drop-shadow(0 0 6px rgba(255,160,80,0.6))",
                    "drop-shadow(0 0 12px rgba(255,160,80,1))",
                ],
            }}
            whileTap={{
                y: 1, // 1px depress
                filter: [
                    "drop-shadow(0 0 12px rgba(255,160,80,1))",
                    "drop-shadow(0 0 18px rgba(255,180,120,1))", // bloom pop
                    "drop-shadow(0 0 8px rgba(255,160,80,0.6))",
                ],
                transition: { duration: 0.12 },
            }}
            transition={{
                duration: 0.35,
                ease: "easeOut",
            }}
            className="
        inline-block whitespace-nowrap px-8 py-4 
        custom-bg-abt text-shadow-neon-light-orange 
        rounded-lg font-bold text-[1.6rem]
        transition-all ease-in-out shadow-2xl
        relative overflow-hidden
    "
        >
            {/* Ripple glow layer */}
            <m.span
                initial={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.5, opacity: 0.3 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="
            absolute inset-0 rounded-lg
            bg-[radial-gradient(circle,rgba(255,180,120,0.3)_0%,rgba(255,180,120,0)_70%)]
            pointer-events-none
        "
            />

            <span className="relative z-10">{children}</span>
        </m.a>

    );
}
