"use client";

import { AnimatePresence, motion, useInView } from "framer-motion";
import { Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function StreakStatsCard({ data, isUpdated }) {
    const cardRef = useRef(null);
    const isInView = useInView(cardRef, { once: false, margin: "-50px" });

    const { totalContributions, currentStreak, longestStreak } = data || {};

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-full px-4 py-6 relative overflow-hidden"
        >
            <AnimatePresence>
                {isUpdated && (
                    <motion.div
                        key="banner"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="absolute inset-0 flex items-center justify-center bg-orange-500/80 backdrop-blur-xl text-[#ff6d05] font-medium text-lg md:text-xl rounded-lg z-10"
                    >
                        <span className="">
                            This streak data has been updated
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="flex flex-col sm:flex-row items-center md:justify-between justify-center sm:gap-2 gap-4">
                {/* Total Contributions */}
                <AnimatedStatBlock
                    title="Total Contributions"
                    value={totalContributions?.value}
                    dateRange={totalContributions?.dateRange}
                    isInView={isInView}
                    delay={0}
                />

                {/* Divider */}
                <div className="sm:block w-px h-32 bg-white sm:mx-4 mx-1 hidden" />

                {/* Current Streak with Circle */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="flex flex-col items-center flex-1 text-center"
                >
                    <div className="relative sm:w-24 sm:h-24 h-20 w-20 flex items-center justify-center mb-2">
                        <svg
                            className="absolute w-full h-full"
                            viewBox="0 0 120 120"
                            style={{ transform: "rotate(-90deg)" }}
                        >
                            <circle
                                cx="60"
                                cy="60"
                                r="55"
                                fill="none"
                                stroke="rgba(217, 119, 6, 0.2)"
                                strokeWidth="4"
                            />
                            <motion.circle
                                cx="60"
                                cy="60"
                                r="55"
                                fill="none"
                                stroke="rgb(217, 119, 6)"
                                strokeWidth="6"
                                strokeDasharray="345"
                                strokeDashoffset="345"
                                initial={{ strokeDashoffset: 345 }}
                                animate={isInView ? { strokeDashoffset: 0 } : { strokeDashoffset: 345 }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="flex items-center justify-center absolute top-1 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-[#0F000F] px-1">
                            <Flame size={24} fill="#ea580c" className="text-orange-600" />
                        </div>

                        <AnimatedNumber
                            target={currentStreak?.value}
                            isInView={isInView}
                            className="text-3xl md:text-4xl font-bold text-shadow-neon-light-orange z-10"
                            duration={1000}
                        />
                    </div>
                    <div className="text-sm md:text-base mb-1 text-shadow-neon-light-orange font-semibold" style={{ textShadow: "none" }}>Current Streak</div>
                    <div className="text-[10px] sm:text-xs md:text-sm text-shadow-neon-light-orange font-light" style={{ textShadow: "none" }}>{currentStreak?.dateRange}</div>
                </motion.div>

                {/* Divider */}
                <div className="sm:block w-px h-32 bg-white sm:mx-4 mx-1 hidden" />

                {/* Longest Streak */}
                <AnimatedStatBlock
                    title="Longest Streak"
                    value={longestStreak?.value}
                    dateRange={longestStreak?.dateRange}
                    isInView={isInView}
                    align="end"
                    delay={0.2}
                />
            </div>
        </motion.div>
    );
}

/* --------------------- Reusable Stat Block --------------------- */
function AnimatedStatBlock({ title, value, dateRange, isInView, align = "center", delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: "easeOut", delay }}
            className={`flex flex-col items-center md:items-${align} flex-1 text-center md:text-${align}`}
        >
            <AnimatedNumber
                target={value}
                isInView={isInView}
                className="text-2xl md:text-3xl font-bold text-[#ff6d05] mb-2 text-center w-full"
            />
            <div className="text-sm md:text-base mb-1 w-full font-semibold text-shadow-neon-light-orange" style={{ textShadow: "none" }}>{title}</div>
            <div className="text-[10px] sm:text-xs md:text-sm w-full text-shadow-neon-light-orange font-light" style={{ textShadow: "none" }}>{dateRange}</div>
        </motion.div>
    );
}

/* ------------------- Animated Number (0 → value) ------------------- */
function AnimatedNumber({ target = 0, isInView, duration = 1200, className }) {
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        if (!isInView) {
            setDisplay(0);
            return;
        }

        let startTime;
        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            setDisplay(Math.floor(progress * target));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [isInView, target, duration]);

    return <div className={`${className} text-shadow-neon-light-orange`}>{display}</div>;
}
