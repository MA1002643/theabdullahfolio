"use client";
import { motion } from "framer-motion";

export default function LanternSweep() {
    return (
        <motion.div
            initial={{ opacity: 0, x: -120 }}
            animate={{ opacity: [0, 1, 0], x: [-120, 120, 260] }}
            transition={{
                duration: 1.2,
                ease: "easeInOut",
            }}
            className="
                pointer-events-none
                absolute inset-0
                mix-blend-screen
                z-[-4]
            "
        >
            {/* Radial glow */}
            <div
                className="
                    absolute top-1/2 left-1/2
                    w-[180%] h-[180%]
                    -translate-x-1/2 -translate-y-1/2
                    rounded-full
                    bg-[radial-gradient(circle,rgba(255,240,200,0.55)_0%,rgba(255,240,200,0.15)_40%,rgba(255,240,200,0)_70%)]
                    blur-[90px]
                "
            />
        </motion.div>
    );
}
