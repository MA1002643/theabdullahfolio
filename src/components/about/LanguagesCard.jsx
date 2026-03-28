import { motion, useInView, AnimatePresence } from "framer-motion";
import React, { useRef, useEffect, useState } from "react";

export default function LanguagesCard({ data, isUpdated }) {
    const cardRef = useRef(null);
    const isInView = useInView(cardRef, { once: false, margin: "-50px" });

    const total = data.reduce((sum, lang) => sum + parseFloat(lang.percentage), 0);

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1, ease: "easeOut" }}
            className="p-5 w-full relative overflow-hidden h-full"
        >
            {/* 🔥 Update Banner */}
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
                        This table has been updated
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <h2 className="text-xl md:text-2xl text-left w-full capitalize text-shadow-neon-orange mb-6">
                Most Used Languages
            </h2>

            {/* Combined horizontal stacked bar */}
            <div className="w-full h-2 md:h-3 rounded-full overflow-hidden flex mb-5 bg-gray-700/30">
                {data.map((lang, idx) => (
                    <AnimatedBarSegment
                        key={idx}
                        lang={lang}
                        idx={idx}
                        total={total}
                        isInView={isInView}
                    />
                ))}
            </div>

            {/* List of languages and percentages */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 pt-2 text-sm md:text-base">
                {data.map((lang, idx) => (
                    <AnimatedLangLabel
                        key={idx}
                        lang={lang}
                        idx={idx}
                        isInView={isInView}
                    />
                ))}
            </div>
        </motion.div>
    );
}

/* 🔹 Animated bar segment for each language */
function AnimatedBarSegment({ lang, idx, total, isInView }) {
    const [width, setWidth] = useState(0);
    const target = (lang.percentage / total) * 100;

    useEffect(() => {
        if (isInView) {
            setWidth(0);
            const start = performance.now();
            const duration = 2000; // ms

            const animate = (time) => {
                const progress = Math.min((time - start) / duration, 1);
                setWidth(target * progress);
                if (progress < 1) requestAnimationFrame(animate);
            };

            const timeout = setTimeout(() => requestAnimationFrame(animate), idx * 150);
            return () => clearTimeout(timeout);
        }
    }, [isInView, target, idx]);

    return (
        <motion.div
            style={{
                backgroundColor: lang.color,
                boxShadow: `0 0 6px ${lang.color}`,
            }}
            className="h-full"
            animate={{ width: `${width}%` }}
            transition={{ duration: 0.2 }}
        />
    );
}

/* 🔹 Animated language label + percentage counter */
function AnimatedLangLabel({ lang, idx, isInView }) {
    const [value, setValue] = useState(0);
    const target = parseFloat(lang.percentage);

    useEffect(() => {
        if (isInView) {
            setValue(0);
            const start = performance.now();
            const duration = 2000; // ms

            const animate = (time) => {
                const progress = Math.min((time - start) / duration, 1);
                setValue((target * progress).toFixed(2));
                if (progress < 1) requestAnimationFrame(animate);
            };

            const timeout = setTimeout(() => requestAnimationFrame(animate), idx * 150);
            return () => clearTimeout(timeout);
        }
    }, [isInView, target, idx]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
            className="flex items-center gap-2"
        >
            <span
                className="w-3 h-3 rounded-full shadow-sm"
                style={{
                    backgroundColor: lang.color,
                    boxShadow: `0 0 4px ${lang.color}`,
                }}
            ></span>
            <span
                className="text-shadow-neon-light-orange"
                style={{ textShadow: "none" }}
            >
                {lang.language}
            </span>
            <span
                className="ml-auto !font-light text-shadow-neon-light-orange"
                style={{ textShadow: "none" }}
            >
                {value}%
            </span>
        </motion.div>
    );
}
