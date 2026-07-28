"use client"

import { motion } from "framer-motion"
import GlowingTitle from "@/components/project-detail/glowing-project-name"

// Title + tagline overlay for /projects/[id]. Split out of the page so the
// page itself can be a Server Component (issue #83): GlowingTitle has no
// "use client" directive of its own and framer-motion needs a client
// boundary, so this file provides it for both.
export default function ProjectIntro({ name, description }) {
    return (
        <section className="absolute top-14 sm:top-20 md:top-10 left-1/2 -translate-x-1/2 flex flex-col items-center justify-start text-center space-y-2 px-4 md:px-0 z-20">
            <GlowingTitle text={name || "Project Name"} />
            <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 1 }}
                className="text-[1.1rem] sm:text-[1.3rem] md:text-[1.5rem] !font-thin text-shadow-neon-light-orange"
            >
                {description || "Innovative, fast, and futuristic web solutions."}
            </motion.p>
        </section>
    )
}
