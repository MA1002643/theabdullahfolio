import Image from 'next/image';

import bg from '../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import Cv from '@/components/cv';
import JsonLd from '@/components/seo/JsonLd';
import { buildCv } from '@/lib/cv/buildCv';
import { sectionMetadata } from '@/lib/og/meta';
import { cvPage } from '@/lib/seo/schema';
import { knowsAboutFromStack, routeFor } from '@/lib/seo/site';
import { usesData } from '@/app/data';

// Route registry entry — the single source for this route's title,
// description, sitemap entry and JSON-LD (issue #32, W1/W7).
const ROUTE = routeFor('/cv');

export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

// Server component, and a fully static one: `buildCv()` reads three committed
// arrays and nothing else — no request, no clock, no network. The whole
// document is in the prerendered HTML, which is the entire point of the route
// (see the note at the top of src/components/cv/index.jsx).
export default function CvPage() {
  const cv = buildCv();

  return (
    <>
      {/* ProfilePage + Person (issue #32, W2). The Person node is RESTATED
          rather than referenced so `hasOccupation` and `alumniOf` attach to it
          — JSON-LD merges nodes sharing an `@id`, so this adds properties to
          the node the root layout's graph already defined rather than
          competing with it. `knowsAbout` comes from the same `usesData.stack`
          that /about publishes and that this page renders visibly in its Skills
          block, so the claim and the page cannot disagree (§11). */}
      <JsonLd
        id="ld-cv"
        data={cvPage({
          experience: cv.experience,
          education: cv.education,
          knowsAbout: knowsAboutFromStack(usesData.stack),
        })}
      />

      {/* The same backdrop trio the other sub-pages use, so /cv does not read
          as a page from a different site. All three are `print:hidden` via the
          wrapper below — a fixed full-bleed image is the single worst thing to
          send to a printer. */}
      <div className="print:hidden">
        <Image
          src={bg}
          alt=""
          priority
          sizes="100vw"
          className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
        />
        <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
        <AuroraDustMount />
      </div>

      {/* `print:hidden` for the same reason the PDF button is: the masthead
          inside the document already names the person, and the decorative page
          title would print as a second, larger name above it. */}
      <div className="print:hidden">
        <PageTitle title="CV" subtitle="the full record" replayOnView />
      </div>

      <Cv cv={cv} />
    </>
  );
}
