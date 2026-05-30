"use client";
import { motion } from "framer-motion";
import { Palette } from "lucide-react";
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

        {/* Tooltip chrome reuses `.custom-bg-abt` — the same class
            the Years in the Craft / Most Active Repository cards on
            the about page wear — so this tooltip's border colour and
            background gradient match the rest of the site's card
            language instead of the plain grey `bg-background` it
            used to fall back to. Dropping `shadow-lg` because
            custom-bg-abt already projects its own warm orange neon
            halo and the two stacked would read as muddy. Matches the
            same fix already applied to HomeBtn. */}
        <span className="custom-bg-abt desktop-hover-only absolute hidden peer-hover:block px-2 py-1 sm:px-2.5 sm:py-1.5 left-full ml-2 md:ml-3 top-1/2 -translate-y-1/2 text-[#ff6d05] text-xs sm:text-sm md:text-base rounded-md whitespace-nowrap">
          Projects
        </span>
      </span>
      <span className="sr-only">Go to Projects Page</span>
    </NavLink>
  );
};

export default ProjectsBtn;
