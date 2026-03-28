"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import TypeOnChunks from "./typeon-chunks";

const bootMessages = [
    "Initializing BIOS...",
    "Detecting hardware...",
    // "Memory test: OK",
    // "CPU: Intel i7-12700K detected",
    // "Storage: SSD 1TB detected",
    // "Network: Connected",
    "Loading operating system...",
];

export default function LaptopBootSequence({ onComplete }) {
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
    }, [currentIndex]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full bg-black text-green-400 font-mono p-4 rounded-lg overflow-y-auto"
        >
            {bootMessages.slice(0, currentIndex).map((msg, i) => (
                <p key={i}>
                    <TypeOnChunks text={msg} speed={20} />
                </p>
            ))}
            {currentIndex < bootMessages.length && <p className="blinking-cursor">_</p>}
        </motion.div>
    );
}
