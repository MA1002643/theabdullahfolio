'use client';
import HomeBtn from '@/components/HomeBtn';
import ProjectsBtn from '@/components/ProjectsBtn';
import Footer from '@/components/footer';
import { usePathname } from 'next/navigation';
import { fluid } from '@/lib/fluidScale';

// Pages that have adopted the fluid-scale system (issue #50). A listed page
// gets the `.fluid-scale` scope on <main> — defining the `--fluid-scale`
// factor for everything it renders (PageTitle, the category strip, its own
// components) — plus fluid main padding in place of the px-2 → md:px-16
// breakpoint jump. Adopting another page is adding its pathname here; the
// unlisted pages keep today's classes untouched, which is why this is a
// list and not a blanket change to a layout four routes share.
const FLUID_SCALE_PAGES = ['/projects', '/contact', '/qualifications', '/about'];

export default function SubPagesLayout({ children }) {
  const pathname = usePathname();
  const isDynamicProjectPage =
    pathname.startsWith('/projects/') && pathname !== '/projects';
  const isFluidScalePage = FLUID_SCALE_PAGES.includes(pathname);
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
      {/* pt-20 stays STATIC on fluid pages, deliberately: it clears the
          fixed home-button island, and today it is already 5rem at every
          breakpoint — constant, so it was never one of the jumps issue #50
          exists to remove. Scaling it down would slide the title under the
          island on small screens. The horizontal/bottom padding are the
          jumps (0.5rem → 4rem/5rem at md); on fluid pages they become one
          scaled value instead. */}
      <main
        className={`flex flex-1 flex-col justify-start pt-20 ${
          isFluidScalePage
            ? 'fluid-scale'
            : 'px-2 pb-2 md:px-16 md:py-20'
        }`}
        style={
          isFluidScalePage
            ? { paddingInline: fluid(1), paddingBottom: fluid(1.5) }
            : undefined
        }
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
