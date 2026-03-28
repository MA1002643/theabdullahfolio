"use client";
import { motion } from "framer-motion";

export default function TypeOnChunks({ text }) {
    return (
        <motion.span
            initial={{
                clipPath: "inset(0 100% 0 0)", // fully hidden
            }}
            animate={{
                clipPath: [
                    "inset(0 100% 0 0)", // hidden
                    "inset(0 66% 0 0)",  // chunk 1
                    "inset(0 33% 0 0)",  // chunk 2
                    "inset(0 0% 0 0)",   // fully revealed
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
        </motion.span>
    );
}
