'use client';
import HomeBtn from '@/components/HomeBtn';
import ProjectsBtn from '@/components/ProjectsBtn';
import Footer from '@/components/footer';
import { usePathname } from 'next/navigation';

export default function SubPagesLayout({ children }) {
  const pathname = usePathname();
  const isDynamicProjectPage =
    pathname.startsWith('/projects/') && pathname !== '/projects';
  return (
    // A min-height flex column so the shared footer anchors to the true bottom
    // of every sub-page. The content region keeps its original centering +
    // spacing (now `flex-1` so `justify-center` centres within the available
    // space rather than lifting the footer up), and the footer renders once
    // here as a sibling of <main> — the correct place for a contentinfo
    // landmark — so it appears on /about, /qualifications, /projects and
    // /contact without per-page duplication. The floating Home/Projects button
    // is position:fixed, so it is unaffected by this wrapper.
    <div className="flex min-h-screen flex-col">
      {/* Conditional Button */}
      {isDynamicProjectPage ? <ProjectsBtn /> : <HomeBtn />}
      <main className="flex flex-1 flex-col justify-center px-2 pt-20 pb-2 md:px-16 md:py-20">
        {children}
      </main>
      <Footer />
    </div>
  );
}
