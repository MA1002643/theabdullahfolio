"use client";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

export default function AuroraParallaxBackground() {
    const { scrollYProgress } = useScroll();

    // Scroll-based transforms (map 0→1 scroll to small pixel offsets)
    const band1X = useTransform(scrollYProgress, [0, 1], [0, 12]);  // furthest
    const band1Y = useTransform(scrollYProgress, [0, 1], [0, 8]);

    const band2X = useTransform(scrollYProgress, [0, 1], [0, -10]); // opposite direction
    const band2Y = useTransform(scrollYProgress, [0, 1], [0, 6]);

    const fogX = useTransform(scrollYProgress, [0, 1], [0, 6]);
    const fogY = useTransform(scrollYProgress, [0, 1], [0, 4]);

    // Optional: mouse tilt parallax
    const [mouse, setMouse] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMove = (e) => {
            setMouse({
                x: (e.clientX - window.innerWidth / 2) / 80, // small movement
                y: (e.clientY - window.innerHeight / 2) / 80,
            });
        };
        window.addEventListener("mousemove", handleMove);
        return () => window.removeEventListener("mousemove", handleMove);
    }, []);

    return (
        <div className="absolute left-0 right-0 w-full h-full inset-0 overflow-hidden pointer-events-none z-[-5]">
            {/* Aurora Band 1 */}
            <motion.div
                style={{
                    x: band1X,
                    y: band1Y,
                    translateX: mouse.x,
                    translateY: mouse.y,
                }}
                className="absolute inset-0 bg-[url('/aurora-band-1.png')] bg-cover bg-center opacity-70"
            />

            {/* Aurora Band 2 */}
            <motion.div
                style={{
                    x: band2X,
                    y: band2Y,
                    translateX: mouse.x * 0.6,
                    translateY: mouse.y * 0.6,
                }}
                className="absolute inset-0 bg-[url('/aurora-band-2.png')] bg-cover bg-center opacity-50 mix-blend-screen"
            />

            {/* Fog Layer */}
            <motion.div
                style={{
                    x: fogX,
                    y: fogY,
                    translateX: mouse.x * 0.4,
                    translateY: mouse.y * 0.4,
                }}
                className="absolute inset-0 bg-[url('/fog.png')] bg-cover bg-center opacity-40 mix-blend-lighten blur-xl"
            />
        </div>
    );
}
