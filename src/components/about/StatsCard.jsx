"use client";

import { motion, useInView, useAnimation, AnimatePresence } from "framer-motion";
import { Star, Clock, GitBranch, AlertCircle, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function GitHubStatsCard({ data, userName = "GitHub User", isUpdated }) {
    const cardRef = useRef(null);
    const isInView = useInView(cardRef, { once: false, margin: "-50px" });

    const stats = [
        { label: "Total Stars Earned", value: data.stars, icon: Star },
        { label: "Total Commits (last year)", value: data.commits, icon: Clock },
        { label: "Total PRs", value: data.prs, icon: GitBranch },
        { label: "Total Issues", value: data.issues, icon: AlertCircle },
        { label: "Contributed to (last year)", value: data.contributedTo, icon: Package },
    ];

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="p-5 w-full relative overflow-hidden"
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
                            Data in this section has been updated
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            <h2 className="text-xl md:text-2xl text-left w-full capitalize text-shadow-neon-orange mb-4">
                {userName}&apos;s GitHub Stats
            </h2>

            <div className="flex gap-8 items-center flex-col sm:flex-row md:items-start flex-wrap justify-center">
                {/* Stats List */}
                <div className="flex-1 space-y-2 w-full">
                    {stats.map((stat, idx) => (
                        <AnimatedStat
                            key={idx}
                            icon={stat.icon}
                            label={stat.label}
                            value={stat.value}
                            delay={idx * 0.15}
                            isInView={isInView}
                        />
                    ))}
                </div>

                {/* Level Circle */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                    className="flex items-center justify-center flex-shrink-0"
                >
                    <AnimatedRankCircle
                        level={data.level}
                        percentile={parseFloat(data.percentile)}
                        isInView={isInView}
                    />
                </motion.div>
            </div>
        </motion.div>
    );
}

/* -------------------------- ANIMATED STAT LINE -------------------------- */
function AnimatedStat({ icon: Icon, label, value, delay, isInView }) {
    const [displayValue, setDisplayValue] = useState(0);
    const target = Number(value) || 0;

    useEffect(() => {
        if (isInView) {
            let startTime;
            const duration = 1200;

            const animate = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);
                setDisplayValue(Math.floor(progress * target));
                if (progress < 1) requestAnimationFrame(animate);
            };

            const timeout = setTimeout(() => requestAnimationFrame(animate), delay * 1000);
            return () => clearTimeout(timeout);
        } else {
            setDisplayValue(0);
        }
    }, [isInView, target, delay]);

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay, ease: "easeOut" }}
            className="flex items-center gap-3 w-full justify-between"
        >
            <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-amber-500" />
                <span style={{ textShadow: "none" }} className=" text-xs md:text-base text-shadow-neon-light-orange">
                    {label}:
                </span>
            </div>
            <span style={{ textShadow: "none" }} className="font-light text-xs md:text-base text-shadow-neon-light-orange">
                {displayValue.toLocaleString()}
            </span>
        </motion.div>
    );
}

/* ----------------------- ANIMATED RANK CIRCLE -------------------------- */
function AnimatedRankCircle({ level, percentile, isInView }) {
    const controls = useAnimation();

    const radius = 70;
    const circumference = 2 * Math.PI * radius;

    useEffect(() => {
        if (isInView) {
            controls.start({
                strokeDashoffset: circumference * (1 - percentile / 100),
                transition: { duration: 1.2, ease: "easeOut" },
            });
        } else {
            controls.start({ strokeDashoffset: circumference });
        }
    }, [isInView, percentile, circumference, controls]);

    return (
        <div className="relative w-36 h-36">
            <svg
                className="absolute inset-0"
                width="144"
                height="144"
                viewBox="0 0 160 160"
            >
                {/* Background Circle */}
                <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    stroke="rgba(80, 80, 80, 0)"
                    strokeWidth="6"
                    fill="transparent"
                />
                {/* Animated Circle */}
                <motion.circle
                    cx="80"
                    cy="80"
                    r={radius}
                    stroke="rgb(209 151 14)"
                    strokeWidth="6"
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={controls}
                    style={{
                        transform: "rotate(-90deg)",
                        transformOrigin: "50% 50%",
                    }}
                />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-shadow-neon-light-orange">
                    {level}
                </span>
            </div>
        </div>
    );
}
