import { AnimatePresence, motion } from "framer-motion"
import { Monitor, Zap } from "lucide-react"

export default function ReadmeStatsCard({ data, isUpdated }) {
    const { title,
        description,
        language,
        color = "#F7DF1E" } = data
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2,
            },
        },
    }

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.5, ease: "easeOut" },
        },
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="w-full p-6 relative overflow-hidden"
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
                            Information in this section has been updated
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Title */}
            <motion.div variants={itemVariants} className="flex items-center gap-2 mb-3">
                <Monitor className="w-5 h-5 text-shadow-neon-light-orange" />
                <h3 className="text-xl font-semibold text-[#ff6d05] text-shadow-neon-orange">{title}</h3>
            </motion.div>

            {/* Description */}
            <motion.div variants={itemVariants} className="flex items-center gap-2 mb-4">
                <p className="text-sm text-shadow-neon-light-orange font-light" style={{ textShadow: "none" }}>{description}</p>
            </motion.div>

            {/* Language */}
            <motion.div variants={itemVariants} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm text-shadow-neon-light-orange font-light" style={{ textShadow: "none" }}>{language}</span>
            </motion.div>
        </motion.div>
    )
}
