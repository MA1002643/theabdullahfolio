import Image from 'next/image';
import bg from '../../../../public/background/contact-bg.png';
import Form from '@/components/contact/Form';
import ContactIntro from '@/components/contact/ContactIntro';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import { fluid, fluidText } from '@/lib/fluidScale';
import { sectionMetadata } from '@/lib/og/meta';
import JsonLd from '@/components/seo/JsonLd';
import { sectionPage } from '@/lib/seo/schema';
import { routeFor } from '@/lib/seo/site';

// Route registry entry — the single source for this route's title,
// description, sitemap entry and JSON-LD (issue #32, W1/W7).
const ROUTE = routeFor('/contact');

export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

export default function Contact() {
  return (
    <>
      {/* WebPage + BreadcrumbList (issue #32, W2). Declares this route as part
          of the site and about `#person`, and gives it the Home → here trail
          the project pages get. Built from the same registry entry the title
          and the sitemap read, so the three cannot disagree. */}
      <JsonLd
        id="ld-contact"
        data={sectionPage({
          path: ROUTE.path,
          name: ROUTE.title,
          description: ROUTE.description,
        })}
      />
      <Image
        src={bg}
        // `alt=""` — decorative (issue #32, W7's alt-text audit). It was
        // `alt="contact-bg"`, a filename read aloud: a screen reader announced
        // "contact-bg, image" before any of the page's real content. Every
        // other route using this exact backdrop (/about, /journey, /my-past)
        // already marks it decorative, so this was also the odd one out.
        alt=""
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />

      {/* Shared ambient WebGL aurora (same layer as the about and 404 pages):
          drifts, bends toward the cursor, and parallax-shifts with scroll.
          Self-gates on motion preference + loader reveal; the static image
          above stays the reduced-motion fallback. */}
      <AuroraDustMount />

      {/* Fluid scale (issue #9): the page opts into the `.fluid-scale` scope
          via FLUID_SCALE_PAGES, so the old breakpoint jumps here — space-y-6,
          py-2 sm:py-0, sm:w-3/4, xs:text-base — become continuous fluid()
          values. gap replaces space-y (same 1.5rem at scale 1); the headline
          column narrows via a fluid max-width instead of snapping to 3/4 at
          `sm`, which also caps the intro at a readable measure on desktop. */}
      <article
        className="relative flex w-full flex-col items-center justify-center"
        style={{ gap: fluid(1.5), paddingBlock: fluid(0.5) }}
      >
        <div
          className="flex w-full flex-col items-center justify-center"
          style={{ gap: fluid(1.5), maxWidth: fluid(48) }}
        >
          {/* HEADLINE — uses shared PageTitle (issue #104). replayOnView
              re-arms the headline ignite whenever the block scrolls out
              of view, matching the other sub-pages. Its sizing rides the
              fluid scope centrally (.page-title-* rules from issue #50). */}
          <PageTitle title="CONTACT ME" subtitle="get in touch" replayOnView />
          {/* Copy + its "materialize from the ether" reveal live in the client
              component. Type scales from the shared factor with a legibility
              floor equal to the old mobile size (text-sm), so no viewport
              renders it smaller than before; unitless line-height keeps the
              leading proportional at every scale. */}
          <ContactIntro
            className="text-fire-amber text-center font-light"
            style={{ fontSize: fluidText(1, 0.875), lineHeight: 1.5 }}
          />
        </div>
        <div className="flex w-full justify-center">
          <Form />
        </div>
      </article>
    </>
  );
}
