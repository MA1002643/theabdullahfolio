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
    // of every sub-page. The footer renders once here as a sibling of <main> —
    // the correct place for a contentinfo landmark — so it appears on /about,
    // /qualifications, /projects and /contact without per-page duplication.
    // The floating Home/Projects button is position:fixed, so it is unaffected
    // by this wrapper.
    //
    // `justify-start`, deliberately NOT `justify-center` (issue #86): the
    // content region wraps VARIABLE-height children, and centring
    // variable-height content inside a stretched flex column means any page
    // whose body is shorter than the viewport gets re-centred every time its
    // height changes — on /projects (mobile) the header visibly walked up and
    // down as the category filter switched between long and short lists.
    // Anchoring to the top decouples the header's position from the list
    // height below it; `flex-1` still lets long pages push the footer down.
    <div className="flex min-h-screen flex-col">
      {/* Conditional Button */}
      {isDynamicProjectPage ? <ProjectsBtn /> : <HomeBtn />}
      <main className="flex flex-1 flex-col justify-start px-2 pt-20 pb-2 md:px-16 md:py-20">
        {children}
      </main>
      <Footer />
    </div>
  );
}
