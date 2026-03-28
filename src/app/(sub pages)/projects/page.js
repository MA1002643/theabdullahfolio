import Image from "next/image";
import bg from "../../../../public/background/project-bg.png";
import ProjectList from "@/components/projects";
import { projectsData } from "../../data";

export default function Project() {
  return (
    <main>
      <Image
        priority
        sizes="100vw"
        src={bg}
        alt="background-image"
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-70 blur-[0.4px]"
      />
      <div className="fixed -z-40 top-0 left-0 w-full h-full bg-black/70"/>

      <ProjectList projects={projectsData} />
    </main>
  );
}
