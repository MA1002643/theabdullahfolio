"use client";
import { motion, AnimatePresence } from "framer-motion";
import ProjectLayout from "./ProjectLayout";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

const ProjectList = ({ projects }) => {
  const categories = ["All", "Web", "System", "App"];
  const [active, setActive] = useState("All");

  // ✅ Check localStorage for saved category
  useEffect(() => {
    const saved = localStorage.getItem("projects-category");
    if (saved && categories.includes(saved)) {
      setActive(saved);
    } else {
      setActive("All");
    }
  }, []);

  const filteredProjects =
    active === "All"
      ? projects
      : projects.filter((p) => p.category === active);

  const categoryCounts = useMemo(() => {
    const counts = { All: projects.length };
    categories.forEach((cat) => {
      if (cat !== "All") {
        counts[cat] = projects.filter((p) => p.category === cat).length;
      }
    });
    return counts;
  }, [projects]);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full max-w-full xl:max-w-4xl px-4 mx-auto lg:px-10 space-y-6 md:space-y-8 flex flex-col items-center"
    >
      {/* HEADER */}
      <div id="about" className="z-50 pt-8 text-center">
        <h1 className="text-transparent text-[3rem] font-extrabold uppercase leading-tight md:text-[3.5rem] text-glow-stroke-neon">
          PROJECTS
        </h1>
        <div 
          className="flex items-center justify-center gap-4 mt-1 text-[1rem] uppercase leading-snug md:text-[1.6rem]"
          style={{
            color: 'rgb(252 131 255 / var(--tw-text-opacity, 1))',
            textShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7',
            '--tw-text-opacity': '1'
          }}
        >
          <div className="w-6 h-[2px] rounded-full" style={{ backgroundColor: '#fc83ff', boxShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7' }} />
          <span>MY WORK</span>
          <div className="w-6 h-[2px] rounded-full" style={{ backgroundColor: '#fc83ff', boxShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7' }} />
        </div>

        {/* CATEGORY FILTERS */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-6">
          {categories.map((cat) => {
            const isDisabled = cat !== "All" && categoryCounts[cat] === 0;
            return (
              <div key={cat} className="relative group">
                <span
                  onClick={() => {
                    if (isDisabled)
                      return toast.info("No projects in this category", {
                        style: {
                          color: "#ffb347",
                          backgroundColor: "rgb(0 0 0 / 0.7)",
                          border: "none",
                        },
                      });
                    setActive(cat);
                  }}
                  className={`transition text-[1rem] md:text-[1.2rem] font-semibold uppercase cursor-pointer
                  ${active === cat
                      ? "text-glow-stroke-neon"
                      : "glitter-text !tracking-normal !text-shadow-none"
                    }`}
                  style={{
                    textShadow:
                      active === cat
                        ? "none"
                        : "0 0 2px #ff55f7, 0 0 4px #ff55f7, 0 0 6px #ff55f7",
                  }}
                  onMouseEnter={(e) => {
                    if (active !== cat) {
                      e.currentTarget.style.textShadow =
                        "0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7, 0 0 30px #ff55f7";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (active !== cat) {
                      e.currentTarget.style.textShadow =
                        "0 0 2px #ff55f7, 0 0 4px #ff55f7, 0 0 6px #ff55f7";
                    }
                  }}
                >
                  {cat}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* PROJECT LIST */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          variants={container}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0 }}
          className="w-full space-y-4"
        >
          {filteredProjects.length >= 1 ? (
            filteredProjects.map((project, index) => (
              <ProjectLayout key={index} {...project} category={active}/>
            ))
          ) : (
            <div className="custom-bg-abt rounded-md p-3">
              <h3 className="text-center text-lg font-semibold text-[#FFB627] tracking-wide relative z-10 drop-shadow-[0_0_5px_#ffb627]">
                No Projects Found !
              </h3>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

export default ProjectList;
