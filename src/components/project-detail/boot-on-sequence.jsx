"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import TypeOnChunks from "./typeon-chunks";

// English fallback for the boot lines. The live copy arrives translated as
// `messages` (ProjectDetail `screen.boot.*`, via useScreenCopy in
// scene-loader.jsx) because this renders inside drei's separate <Html> root.
const BOOT_MESSAGES = [
    "Initializing BIOS...",
    "Detecting hardware...",
    // "Memory test: OK",
    // "CPU: Intel i7-12700K detected",
    // "Storage: SSD 1TB detected",
    // "Network: Connected",
    "Loading operating system...",
];

export default function LaptopBootSequence({ onComplete, messages, rtl = false }) {
    const bootMessages = messages ?? BOOT_MESSAGES;
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < bootMessages.length) {
            const timer = setTimeout(() => {
                setCurrentIndex(currentIndex + 1);
            }, 1200); // adjust speed between messages
            return () => clearTimeout(timer);
        } else {
            if (onComplete) onComplete(); // callback after boot complete
        }
    }, [currentIndex, bootMessages.length]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full bg-black text-green-400 font-mono p-4 rounded-lg overflow-y-auto"
        >
            {bootMessages.slice(0, currentIndex).map((msg, i) => (
                <p key={i}>
                    <TypeOnChunks text={msg} speed={20} rtl={rtl} />
                </p>
            ))}
            {currentIndex < bootMessages.length && <p className="blinking-cursor">_</p>}
        </motion.div>
    );
}
