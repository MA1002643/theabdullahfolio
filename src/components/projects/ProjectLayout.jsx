"use client"

import { motion } from "framer-motion"
import Link from "next/link"

const item = {
  hidden: { opacity: 0, y: 100 },
  show: { opacity: 1, y: 0 },
}

const ProjectLink = motion(Link)

const ProjectLayout = ({ id, name, description, date, demoLink, category }) => {
  const handleClick = () => {
    if (category) {
      localStorage.setItem("projects-category", category)
    }
  }

  return (
    <ProjectLink
      variants={item}
      href={`/projects/${id}`}
      onClick={handleClick}
      className="text-sm md:text-base flex items-center justify-between w-full relative rounded-lg overflow-hidden p-4 md:p-6 custom-bg-abt"
    >
      <div className="flex items-center justify-center space-x-2">
        <h2 className="text-shadow-neon-orange">{name}</h2>
        <p
          className="text-[#ff6d05] hidden sm:inline-block text-shadow-neon-orange"
          style={{ textShadow: "none" }}
        >
          {description}
        </p>
      </div>

      <div className="self-end flex-1 mx-2 mb-2 bg-transparent border-b border-dashed border-[#ffcd5bcc]" />

      <p
        id="date"
        className="text-[#ff6d05] text-shadow-neon-orange"
        style={{ textShadow: "none" }}
      >
        {new Date(date).toDateString()}
      </p>
    </ProjectLink>
  )
}

export default ProjectLayout
