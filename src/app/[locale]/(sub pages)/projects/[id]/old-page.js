"use client";
import { motion, useScroll, useTransform, useSpring, useMotionValue, useAnimation } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { FaReact, FaNodeJs, FaDatabase, FaLock, FaCreditCard, FaComments, FaCog, FaGithub, FaExternalLinkAlt } from "react-icons/fa";

// Neon text glow styles
const neonTextStyle = {
  textShadow: "0 0 10px rgba(251, 191, 36, 0.8), 0 0 20px rgba(251, 191, 36, 0.6), 0 0 30px rgba(251, 191, 36, 0.4)",
  animation: "neonFlicker 8s infinite alternate"
};

const ProjectPage = () => {
  const [current, setCurrent] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const laptopRef = useRef(null);

  const { scrollYProgress } = useScroll();
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  // Parallax for aurora/fog
  const auroraX = useTransform(scrollYProgress, [0, 1], [0, 12]);
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, -8]);

  // Laptop lift on scroll
  const laptopY = useTransform(scrollYProgress, [0, 0.2], [0, -12]);
  const smoothLaptopY = useSpring(laptopY, { stiffness: 100, damping: 30 });

  const images = [
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiNmYjk3MWQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Qcm9qZWN0IFNjcmVlbiAxPC90ZXh0Pjwvc3ZnPg==",
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiNmYmI5MWQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Qcm9qZWN0IFNjcmVlbiAyPC90ZXh0Pjwvc3ZnPg==",
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzNhM2EzYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiNmYmQ3MWQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Qcm9qZWN0IFNjcmVlbiAzPC90ZXh0Pjwvc3ZnPg=="
  ];

  // Auto-rotate images
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [images.length]);

  // Track mouse for tilt effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (laptopRef.current) {
        const rect = laptopRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
        const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
        setMousePos({ x: x * 4, y: y * 4 });
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Typewriter effect for tagline
  const tagline = "Empowering your ideas with next-gen digital craftsmanship.";
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let i = 0;
    const chunks = tagline.match(/.{1,15}/g) || [];
    const timer = setInterval(() => {
      if (i < chunks.length) {
        setDisplayedText(prev => prev + chunks[i]);
        i++;
      } else {
        clearInterval(timer);
      }
    }, 120);
    return () => clearInterval(timer);
  }, []);

  const badges = ["Next.js", "TailwindCSS", "Framer Motion", "Fullstack"];
  const features = [
    { icon: <FaLock />, title: "Authentication", desc: "Secure login and user access." },
    { icon: <FaCreditCard />, title: "Payments", desc: "Integrated payment gateway." },
    { icon: <FaComments />, title: "Live Chat", desc: "Instant user communication." },
    { icon: <FaCog />, title: "Admin Panel", desc: "Simplified content control." },
  ];

  return (
    <div ref={containerRef} className="relative min-h-screen bg-black overflow-hidden">
      <style jsx>{`
        @keyframes neonFlicker {
          0%, 100% { 
            filter: brightness(1) drop-shadow(0 0 10px rgba(251, 191, 36, 0.8));
          }
          50% { 
            filter: brightness(0.98) drop-shadow(0 0 8px rgba(251, 191, 36, 0.6));
          }
        }
        
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        .laptop-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .laptop-scroll::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.2);
        }
        .laptop-scroll::-webkit-scrollbar-thumb {
          background: rgba(251, 191, 36, 0.5);
          border-radius: 2px;
        }
      `}</style>

      {/* Progress bar */}
      <motion.div
        className="fixed top-0 left-0 h-0.5 bg-gradient-to-r from-orange-500 to-amber-500 z-50"
        style={{ width: progressWidth, transformOrigin: "0%" }}
      />

      {/* Aurora parallax background */}
      <motion.div
        className="fixed inset-0 -z-10 opacity-20"
        style={{ x: auroraX, y: auroraY }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 via-transparent to-amber-500/20" />
      </motion.div>

      {/* Lantern sweep effect */}
      <motion.div
        className="fixed inset-0 -z-10 pointer-events-none"
        initial={{ x: "-100%", opacity: 0 }}
        animate={{ x: "100%", opacity: [0, 0.3, 0] }}
        transition={{ duration: 1.2, delay: 0.5, ease: "easeInOut" }}
      >
        <div className="w-1/3 h-full bg-gradient-radial from-amber-500/30 via-orange-500/10 to-transparent blur-3xl" />
      </motion.div>

      {/* Hero Section */}
      <section className="absolute top-40 sm:top-28 md:top-14 left-1/2 -translate-x-1/2 flex flex-col items-center justify-start text-center space-y-2 px-4 md:px-0">

        {/* Title with neon effect */}
        <motion.h1
          initial={{ opacity: 0, filter: "brightness(0)" }}
          animate={{
            opacity: 1,
            filter: ["brightness(0)", "brightness(1)", "brightness(0.98)"]
          }}
          transition={{ duration: 0.9, times: [0, 0.8, 1] }}
          className="text-transparent text-[1.8rem] sm:text-[2.2rem] md:text-[3.4rem] font-extrabold uppercase leading-tight"
          style={neonTextStyle}
        >
          E-Commerce Dashboard
        </motion.h1>

        {/* Breathing glow ring */}
        <motion.div
          className="absolute -z-10 w-full h-24 bg-gradient-radial from-amber-500/20 to-transparent blur-2xl"
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Tagline with type-on effect */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-[1.1rem] sm:text-[1.3rem] md:text-[1.5rem] font-thin text-amber-400"
          style={neonTextStyle}
        >
          {displayedText}
        </motion.p>

        {/* Laptop Showcase */}
        <motion.div
          ref={laptopRef}
          className="relative flex items-center justify-center w-full max-w-[90vw] md:max-w-[40em] h-[13em] sm:h-[15em] md:h-[18em] mb-10"
          style={{
            y: smoothLaptopY,
            rotateX: mousePos.y,
            rotateY: mousePos.x,
            transformStyle: "preserve-3d",
            perspective: 1000
          }}
        >
          {/* Laptop Image */}
          <div className="relative mt-8 sm:mt-10 md:mt-12 -z-10 w-full h-full flex justify-center items-center">
            <img
              src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjUwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImxhcHRvcCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiM0YTRhNGE7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojMmEyYTJhO3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHg9IjUwIiB5PSIzMCIgd2lkdGg9IjcwMCIgaGVpZ2h0PSI0MDAiIHJ4PSIxMCIgZmlsbD0idXJsKCNsYXB0b3ApIiBzdHJva2U9IiM2YTZhNmEiIHN0cm9rZS13aWR0aD0iMyIvPjxyZWN0IHg9IjcwIiB5PSI1MCIgd2lkdGg9IjY2MCIgaGVpZ2h0PSIzNjAiIGZpbGw9IiMwYTBhMGEiLz48cGF0aCBkPSJNIDIwIDQ1MCBMIDgwMCA0NTAgTCA3NTAgNDgwIEwgNTAgNDgwIFoiIGZpbGw9IiMzYTNhM2EiLz48L3N2Zz4="
              alt="Laptop"
              className="object-contain w-full h-full"
            />
          </div>

          {/* Screen boot sequence with scan line */}
          <motion.div
            className="absolute top-[10%] sm:top-[9%] left-[12%] sm:left-[12%] md:left-[20%] h-[61%] sm:h-[63%] w-[75%] sm:w-[76%] md:w-[60%] overflow-hidden rounded-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            {/* Scan line effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/50 to-transparent h-8 -z-10"
              initial={{ y: "-10%" }}
              animate={{ y: "110%" }}
              transition={{ duration: 0.7, delay: 0.8 }}
            />

            {/* Screen Content */}
            <div className="w-full h-full overflow-y-auto bg-gradient-to-b from-black/85 to-black/60 backdrop-blur-md flex flex-row items-stretch justify-between p-4 text-gray-200 gap-4 text-left laptop-scroll">

              {/* LEFT PANEL */}
              <motion.div
                className="w-[100%] sm:w-[60%] flex flex-col space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, staggerChildren: 0.06 }}
              >
                {/* Quick badges with float animation */}
                <motion.div
                  className="flex flex-wrap gap-1"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.6, type: "spring", stiffness: 200 }}
                >
                  {badges.map((badge, i) => (
                    <motion.span
                      key={i}
                      className="text-[0.6rem] border border-amber-500/50 px-2 py-[1px] rounded-full bg-black/30 text-amber-300"
                      animate={{ y: [0, -2, 0] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut"
                      }}
                    >
                      {badge}
                    </motion.span>
                  ))}
                </motion.div>

                {/* Tools & Frameworks with slide */}
                <motion.div
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.7, duration: 0.5 }}
                >
                  <h3 className="text-amber-400 text-xs font-semibold uppercase mb-1">
                    Tools & Frameworks
                  </h3>
                  <div className="flex gap-2 text-sm text-amber-200/80">
                    <FaReact /> <FaNodeJs /> <FaDatabase /> <FaCog />
                  </div>
                </motion.div>

                {/* Project Overview */}
                <motion.div
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.8, duration: 0.5 }}
                >
                  <h3 className="text-amber-400 text-xs font-semibold uppercase mb-1">
                    Project Overview
                  </h3>
                  <p className="text-[0.85rem] text-amber-100/80 mb-2">
                    This platform streamlines e-commerce workflows through a unified dashboard and live analytics.
                  </p>
                </motion.div>

                {/* Problem → Solution with divider line */}
                <motion.div className="relative">
                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.9, duration: 0.5 }}
                  >
                    <p className="text-[0.8rem] text-amber-100/60">
                      It solves the complexity of managing multiple tools by offering a centralized, intuitive interface.
                    </p>
                  </motion.div>

                  {/* Golden divider line */}
                  <motion.svg
                    className="absolute -right-2 top-0 h-full w-1"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 2, duration: 0.8 }}
                  >
                    <line x1="0" y1="0" x2="0" y2="100%" stroke="rgba(251, 191, 36, 0.5)" strokeWidth="2" />
                  </motion.svg>
                </motion.div>

                {/* Features with stagger & hover glow */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2, staggerChildren: 0.1 }}
                >
                  <h3 className="text-amber-400 text-xs font-semibold uppercase mb-2">Features</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {features.map((f, i) => (
                      <motion.div
                        key={i}
                        className="flex items-start gap-2 text-[0.68rem] p-2 rounded border border-transparent hover:border-amber-500/50 transition-all duration-300"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 2.1 + i * 0.1 }}
                        whileHover={{
                          y: -2,
                          boxShadow: "0 2px 8px rgba(251, 191, 36, 0.3)"
                        }}
                      >
                        <div className="text-amber-400 mt-[2px]">{f.icon}</div>
                        <div>
                          <p className="font-medium text-amber-200">{f.title}</p>
                          <p className="text-amber-100/70">{f.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* CTA Buttons inside screen */}
                <motion.div
                  className="flex gap-3 mt-4"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 2.5, type: "spring" }}
                >
                  <motion.button
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded text-xs text-amber-200 font-semibold"
                    whileHover={{
                      scale: 1.05,
                      boxShadow: "0 0 12px rgba(251, 191, 36, 0.6)"
                    }}
                    whileTap={{ scale: 0.98, y: 1 }}
                  >
                    <FaExternalLinkAlt size={10} />
                    Live Demo
                  </motion.button>
                  <motion.button
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/30 border border-gray-500/50 rounded text-xs text-gray-300 font-semibold"
                    whileHover={{
                      scale: 1.05,
                      boxShadow: "0 0 12px rgba(156, 163, 175, 0.4)"
                    }}
                    whileTap={{ scale: 0.98, y: 1 }}
                  >
                    <FaGithub size={10} />
                    GitHub
                  </motion.button>
                </motion.div>
              </motion.div>

              {/* RIGHT PANEL - Image Gallery */}
              <motion.div
                className="w-[38%] h-full hidden sm:block sticky top-0 self-start overflow-hidden rounded-lg border border-amber-500/40 bg-black/50 p-1"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2.6, duration: 0.5 }}
              >
                <div className="relative w-full h-full">
                  {images.map((src, index) => (
                    <motion.img
                      key={index}
                      src={src}
                      alt={`slide-${index}`}
                      className="absolute inset-0 w-full h-full object-cover rounded transition-opacity duration-700"
                      style={{
                        opacity: index === current ? 1 : 0,
                        zIndex: index === current ? 1 : 0
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
};

export default ProjectPage;