"use client";
import { motion } from "framer-motion";

export function GlowButton({ children, href }) {
    return (
        <motion.button
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
        whitespace-nowrap px-8 py-4 
        custom-bg-abt text-shadow-neon-light-orange 
        rounded-lg font-bold text-[1.6rem]
        transition-all ease-in-out shadow-2xl
        relative overflow-hidden
    "
        >
            {/* Ripple glow layer */}
            <motion.span
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
        </motion.button>

    );
}
