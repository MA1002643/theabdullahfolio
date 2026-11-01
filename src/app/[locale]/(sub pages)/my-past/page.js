import Image from 'next/image';
import bg from '../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import { sectionMetadata } from '@/lib/og/meta';
import JsonLd from '@/components/seo/JsonLd';
import { sectionPage } from '@/lib/seo/schema';
import { routeFor } from '@/lib/seo/site';

// Route registry entry — the single source for this route's title,
// description, sitemap entry and JSON-LD (issue #32, W1/W7).
const ROUTE = routeFor('/my-past');

// The archive gets a real route (it was a deliberate 404 before — see the
// BtnList note in src/app/data.js) because its share card needs one: social
// crawlers refuse to unfurl a 404, so a dedicated /my-past OG image is only
// reachable from a page that answers 200. The old portfolio itself lands
// here later; until then the page states what the archive is, in the same
// voice as every other sub-page.
export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

export default function MyPast() {
  return (
    // Fragment, not <main>: the (sub pages) layout already provides the one
    // <main> landmark (issue #86 — nested <main> is invalid HTML).
    <>
      {/* WebPage + BreadcrumbList (issue #32, W2). Declares this route as part
          of the site and about `#person`, and gives it the Home → here trail
          the project pages get. Built from the same registry entry the title
          and the sitemap read, so the three cannot disagree. */}
      <JsonLd
        id="ld-my-past"
        data={sectionPage({
          path: ROUTE.path,
          name: ROUTE.title,
          description: ROUTE.description,
        })}
      />
      {/* Background mirrors the about/contact pages: contact-bg at half
          opacity under a deepening overlay, with the cursor-reactive aurora
          composited over the top. `alt=""` marks it decorative. */}
      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
      <AuroraDustMount />

      <PageTitle title="MY PAST" subtitle="where it began" replayOnView />

      {/* The archive's holding copy — the fire-amber gradient the contact
          intro uses, at a readable measure. Replaced by the restored
          portfolio showcase when the archive opens. */}
      <p className="text-fire-amber mx-auto mt-8 max-w-2xl px-4 text-center font-light leading-relaxed">
        My first portfolio — built during university, hand-coded in HTML, CSS
        and JavaScript — is being restored for this archive. It was the proving
        ground for everything this site became.
      </p>
    </>
  );
}
