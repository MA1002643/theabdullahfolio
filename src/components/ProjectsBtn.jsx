"use client";
import { m } from "framer-motion";
import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import TransitionLink from "@/components/pageTransition/TransitionLink";

const NavLink = m.create(TransitionLink);
// Logical insets so the island sits at the reading START in RTL, as it does
// in LTR (issue #82). The palette glyph is not directional, so not mirrored.
const ProjectsBtn = () => {
  const t = useTranslations("Nav");
  return (
    // Never from scale(0): a focusable link with no box for a second is a Tab
    // stop with nothing to show (WCAG 2.4.11). Same reason as HomeBtn.jsx.
    <NavLink
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      href={"/projects"}
      transitionLabel={t("routes.projects")}
      target={"_self"}
      className="text-foreground  rounded-full flex items-center justify-center
        custom-bg fixed top-4 start-4 w-fit self-start z-50
        "
      aria-label={t("projectsButton.label")}
      name={"Projects"}                         
      prefetch={false}
    >
      <span className="relative  w-14 h-14 p-4 group">
        <Palette className="w-full h-auto text-white group-hover:text-[#ff6d05] transition-all duration-300" strokeWidth={1.5} />

        <span className="peer bg-transparent absolute inset-0 w-full h-full" />

        {/* Tooltip chrome reuses `.custom-bg-abt` — the same class
            the Years in the Craft / Most Active Repository cards on
            the about page wear — so this tooltip's border colour and
            background gradient match the rest of the site's card
            language instead of the plain grey `bg-background` it
            used to fall back to. Dropping `shadow-lg` because
            custom-bg-abt already projects its own warm orange neon
            halo and the two stacked would read as muddy. Matches the
            same fix already applied to HomeBtn. */}
        <span className="custom-bg-abt desktop-hover-only absolute hidden peer-hover:block px-2 py-1 sm:px-2.5 sm:py-1.5 start-full ms-2 md:ms-3 top-1/2 -translate-y-1/2 text-[#ff6d05] text-xs sm:text-sm md:text-base rounded-md whitespace-nowrap">
          {t("projectsButton.tooltip")}
        </span>
      </span>
      <span className="sr-only">{t("projectsButton.srLabel")}</span>
    </NavLink>
  );
};

export default ProjectsBtn;
