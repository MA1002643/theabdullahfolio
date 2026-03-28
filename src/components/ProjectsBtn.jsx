"use client";
import { motion } from "framer-motion";
import { Home, Palette } from "lucide-react";
import Link from "next/link";

const NavLink = motion(Link);
const ProjectsBtn = () => {
  return (
    <NavLink
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 1 }}
      href={"/projects"}
      target={"_self"}
      className="text-foreground  rounded-full flex items-center justify-center
        custom-bg fixed top-4 left-4 w-fit self-start z-50
        "
      aria-label={"Projects"}
      name={"Projects"}                         
      prefetch={false}
    >
      <span className="relative  w-14 h-14 p-4 group">
        <Palette className="w-full h-auto text-white group-hover:text-[#ff6d05] transition-all duration-300" strokeWidth={1.5} />

        <span className="peer bg-transparent absolute top-0 left-0 w-full h-full" />

        <span className="absolute hidden peer-hover:block px-2 py-1 left-full mx-2 top-1/2 -translate-y-1/2 bg-background text-[#ff6d05] text-sm rounded-md shadow-lg whitespace-nowrap">
          Projects
        </span>
      </span>
      <span className="sr-only">Go to Projects Page</span>
    </NavLink>
  );
};

export default ProjectsBtn;
