"use client"
import HomeBtn from "@/components/qualifications/HomeBtn";
import ProjectsBtn from "@/components/ProjectsBtn";
import { usePathname } from "next/navigation";

export default function SubPagesLayout({ children }) {
  const pathname = usePathname();
  const isDynamicProjectPage =
    pathname.startsWith("/projects/") && pathname !== "/projects";
  return (
    <main className="flex min-h-screen flex-col  justify-center md:py-20 md:px-16 py-2 px-2">
      {/* Conditional Button */}
      {isDynamicProjectPage ? <ProjectsBtn /> : <HomeBtn />}
      {children}
    </main>
  );
}
