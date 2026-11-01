import { sectionMetadata } from '@/lib/og/meta';
import JsonLd from '@/components/seo/JsonLd';
import { sectionPage } from '@/lib/seo/schema';
import { routeFor } from '@/lib/seo/site';

// Route registry entry — the single source for this route's title,
// description, sitemap entry and JSON-LD (issue #32, W1/W7).
const ROUTE = routeFor('/guestbook');

// guestbook/page.js is a Client Component and cannot export metadata itself,
// so this pass-through layout owns the route's title/OG fields (the same
// arrangement every sub-page uses — see about/layout.js). The share image
// lives beside it as opengraph-image.js.
export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

export default function GuestbookLayout({ children }) {
  return (
    <>
      {/* WebPage + BreadcrumbList (issue #32, W2). Declares this route as part
          of the site and about `#person`, and gives it the Home → here trail
          the project pages get. Built from the same registry entry the title
          and the sitemap read, so the three cannot disagree. */}
      <JsonLd
        id="ld-guestbook"
        data={sectionPage({
          path: ROUTE.path,
          name: ROUTE.title,
          description: ROUTE.description,
        })}
      />
      {children}
    </>
  );
}
