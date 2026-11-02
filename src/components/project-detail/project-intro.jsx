"use client"

import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import GlowingTitle from "@/components/project-detail/glowing-project-name"

// Title + tagline overlay for /projects/[id]. Split out of the page so the
// page itself can be a Server Component (issue #83): GlowingTitle has no
// "use client" directive of its own and framer-motion needs a client
// boundary, so this file provides it for both.
// The sr-only "(opens in a new tab)" tail lives INSIDE each link's message as
// a <sr> tag (issue #82), so a translator words the whole link at once — the
// tail's position and punctuation differ by language.
const srOnly = (chunks) => <span className="sr-only">{chunks}</span>

export default function ProjectIntro({ name, description, links }) {
    const t = useTranslations("ProjectDetail")
    return (
        <section className="absolute top-14 sm:top-20 md:top-10 left-1/2 -translate-x-1/2 flex flex-col items-center justify-start text-center space-y-2 px-4 md:px-0 z-20">
            <GlowingTitle text={name || t("intro.fallbackName")} />
            <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 1 }}
                className="text-[1.1rem] sm:text-[1.3rem] md:text-[1.5rem] !font-thin text-shadow-neon-light-orange"
            >
                {description || t("intro.fallbackDescription")}
            </motion.p>
            {/* The accessible pair of the 3D laptop's buttons (issue #92): in
                normal flow, so keyboard focus and screen readers land where the
                links actually are. The in-scene copies are pointer-only. */}
            {links?.demo || links?.source ? (
                <nav aria-label={t("intro.linksLabel", { name })} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-1">
                    {links.demo ? (
                        <a
                            href={links.demo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-sm text-[0.95rem] uppercase tracking-[0.14em] text-[#ffaa2a] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[rgba(255,170,42,0.8)]"
                        >
                            {t.rich("intro.liveDemo", { sr: srOnly })}
                        </a>
                    ) : null}
                    {links.source ? (
                        <a
                            href={links.source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-sm text-[0.95rem] uppercase tracking-[0.14em] text-[#ffaa2a] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[rgba(255,170,42,0.8)]"
                        >
                            {t.rich("intro.source", { sr: srOnly })}
                        </a>
                    ) : null}
                </nav>
            ) : null}
        </section>
    )
}
