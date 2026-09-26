import Image from 'next/image';

import bg from '../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import PrivacyPolicy from '@/components/privacy/PrivacyPolicy';
import JsonLd from '@/components/seo/JsonLd';
import { sectionMetadata } from '@/lib/og/meta';
import { sectionPage } from '@/lib/seo/schema';
import { routeFor } from '@/lib/seo/site';

// Route registry entry — the single source for this route's title, description,
// sitemap entry, canonical and JSON-LD (issue #32, W1/W7).
const ROUTE = routeFor('/privacy');

export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

// Server component, and the whole page under it is one too (issue #141). The
// policy is static text rendered from `src/lib/privacy/inventory.js`, so this
// route prerenders to complete HTML — a privacy policy that needed JavaScript to
// be legible would be a contradiction, and the visitor with the strictest
// browser settings is precisely the one most likely to open it.
//
// Deliberately NOT noindexed, unlike most sites' policy pages. Being quotable by
// a search engine or an assistant is what makes it independently checkable, and
// checkability is most of what this document is for.
export default function PrivacyPage() {
  return (
    // Fragment, not <main>: the (sub pages) layout already provides the one
    // <main> landmark (issue #86 — nested <main> is invalid HTML).
    <>
      {/* WebPage + BreadcrumbList (issue #32, W2), built from the same registry
          entry the title and the sitemap read, so the three cannot disagree. */}
      <JsonLd
        id="ld-privacy"
        data={sectionPage({
          path: ROUTE.path,
          name: ROUTE.title,
          description: ROUTE.description,
        })}
      />

      {/* The backdrop trio shared with /about, /contact, /journey, /notes,
          /my-past and /uses: the still at half opacity, a black dimmer, then the
          cursor-reactive aurora over the top. `alt=""` marks it decorative.
          Consistent by intent — a policy page that dropped the site's own
          chrome would read as a document bolted on from somewhere else, which
          is the impression this one most needs to avoid. */}
      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
      <AuroraDustMount />

      {/* `replayOnView` is omitted: this page is read top to bottom once, and a
          heading that re-ignites every time it scrolls back into view would be
          movement for its own sake on the quietest surface on the site. */}
      <PageTitle title="PRIVACY" subtitle="what this site knows" />

      <PrivacyPolicy />
    </>
  );
}
