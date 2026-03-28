import { motion } from "framer-motion"
import Image from "next/image";
import { useEffect, useState } from "react";
import { FaCog, FaComments, FaCreditCard, FaDatabase, FaLock, FaNodeJs, FaReact } from "react-icons/fa"
import TypeOnChunks from "./typeon-chunks";
import { GlowButton } from "./glow-button";
import LaptopBootSequence from "./boot-on-sequence";

export default function LaptopContent() {
    const [bootComplete, setBootComplete] = useState(false);

    return (
        <div className="w-full h-full">

            {!bootComplete ? (
                <LaptopBootSequence onComplete={() => setBootComplete(true)} />
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 2 }}
                    className="w-full h-full overflow-y-auto
                bg-gradient-to-b from-black/85 to-black/60 
                backdrop-blur-md 
                flex flex-row items-stretch justify-between p-4 text-gray-200 gap-4
                text-left laptop-scroll rounded-xl pb-10"
                >
                    {/* LEFT PANEL */}
                    <div className="w-[100%] sm:w-[60%] flex flex-col space-y-4">
                        <div>
                            <p className="text-[2rem] leading-snug text-shadow-neon-light-orange">
                                <TypeOnChunks text="Empowering your ideas with next-gen digital craftsmanship." />
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-1">
                            {["Next.js", "TailwindCSS", "Framer Motion", "Fullstack"].map((badge, i) => (
                                <span
                                    key={i}
                                    className="text-[1.4rem] border border-amber-500/50 px-2 py-[1px] rounded-full bg-black/30 text-amber-300"
                                >
                                    {badge}
                                </span>
                            ))}
                        </div>

                        <div>
                            <h3 className="text-amber-400 text-base font-semibold uppercase mb-1">
                                Tools & Frameworks
                            </h3>
                            <div className="flex gap-2 text-base text-amber-200/80">
                                <FaReact size={24} /> <FaNodeJs size={24} /> <FaDatabase size={24} /> <FaCog size={24} />
                            </div>
                        </div>

                        <div>
                            <h3 className="text-amber-400 text-base font-semibold uppercase mb-1">
                                Project Overview
                            </h3>
                            <p className="text-[1.6rem] text-amber-100/80 mb-2">
                                This platform streamlines e-commerce workflows through a unified dashboard and live analytics.
                            </p>
                            <p className="text-[1.6rem] text-amber-100/60">
                                It solves the complexity of managing multiple tools by offering a centralized, intuitive interface.
                            </p>
                        </div>

                        <div>
                            <h3 className="text-amber-400 text-base font-semibold uppercase mb-2">Features</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { icon: <FaLock />, title: "Authentication", desc: "Secure login and user access." },
                                    { icon: <FaCreditCard />, title: "Payments", desc: "Integrated payment gateway." },
                                    { icon: <FaComments />, title: "Live Chat", desc: "Instant user communication." },
                                    { icon: <FaCog />, title: "Admin Panel", desc: "Simplified content control." },
                                ].map((f, i) => (
                                    <div key={i} className="flex items-start gap-2 text-[1.36rem]">
                                        {/* <div className="text-amber-400 mt-[2px]">{f.icon}</div> */}
                                        <div>
                                            <p className="font-medium text-amber-200">{f.title}</p>
                                            <p className="text-amber-100/70">{f.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="w-full flex items-center justify-between gap-4 my-2 px-14">
                            <GlowButton href="#">Live Demo</GlowButton>
                            <GlowButton href="#">GitHub</GlowButton>
                        </div>


                    </div>

                    {/* RIGHT PANEL — Image Window */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.8, duration: 1 }}
                        className="w-[38%] h-[100%] sm:block sticky top-0 self-start overflow-hidden rounded-lg border border-amber-500/40
                           bg-black/50 p-1 flex flex-col gap-2 "
                    >
                        <ImageSlider
                            images={[
                                "data:image/jpeg;base64,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",
                                "data:image/jpeg;base64,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",
                            ]}
                        />
                    </motion.div>
                </motion.div>
            )}

        </div >
    )
}

function ImageSlider({ images }) {
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        const interval = setInterval(
            () => setCurrent((prev) => (prev + 1) % images.length),
            2500
        );
        return () => clearInterval(interval);
    }, [images.length]);

    return (
        <div className="w-full h-full relative">
            {images.map((src, index) => (
                <Image
                    key={index}
                    src={src}
                    alt={`slide-${index}`}
                    fill
                    className={`h-full object-cover transition-opacity duration-700 ${index === current ? "opacity-100" : "opacity-0"
                        }`}
                />
            ))}
        </div>
    );
}