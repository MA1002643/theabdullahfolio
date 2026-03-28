"use client";
import { motion } from "framer-motion";
import React from "react";

export default function InfinityLoader() {
    const circleVariants = {
        animate: {
            scale: [1, 1.3, 1],
            opacity: [0.6, 1, 0.6],
            transition: {
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
            },
        },
    };

    return (
        <div className="flex items-center justify-center h-screen bg-black/80">
            <motion.div
                className="flex gap-3 text-glow-stroke-neon"
                initial="start"
                animate="animate"
            >
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        className="w-5 h-5 rounded-full bg-[#ff6d05]"
                        style={{
                            filter: `
                                drop-shadow(0 0 10px rgba(255, 106, 0, 0.8))
                                drop-shadow(0 0 20px rgba(255, 106, 0, 0.6))
                                drop-shadow(0 0 30px rgba(255, 90, 0, 0.4))
                            `,
                            WebkitTextStroke: "2.8px #f9d174",
                        }}
                        variants={circleVariants}
                        transition={{
                            delay: i * 0.2,
                            repeat: Infinity,
                            repeatType: "loop",
                        }}
                    />
                ))}
            </motion.div>
        </div>
    );
}
