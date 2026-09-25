import { usesData } from '@/app/data';
import JsonLd from '@/components/seo/JsonLd';
import { sectionMetadata } from '@/lib/og/meta';
import { profilePage } from '@/lib/seo/schema';
import { knowsAboutFromStack, routeFor } from '@/lib/seo/site';

const ROUTE = routeFor('/about');

// about/page.js is a Client Component and cannot export metadata itself,
// so this pass-through layout owns the route's title/OG fields (issue
// #88 v2). The share image lives beside it as opengraph-image.js.
//
// Title and description now come from the route registry (issue #32, W7) rather
// than being written here. That is not indirection for its own sake: the
// metadata contract test asserts every description is unique and 110–160
// characters, the JSON-LD graph states the same description, and `llms.txt`
// prints it — four consumers that were four chances to disagree.
export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

export default function AboutLayout({ children }) {
  return (
    <>
      {/* ProfilePage — the page whose SUBJECT is the person (issue #32, W2).
          `mainEntity` points at `#person`, defined once in the root layout's
          graph, so this adds the "this page is about that entity" statement
          without restating the entity and creating a second, competing
          definition of it.

          `knowsAbout` is attached HERE rather than in the root graph because
          this is the page that actually evidences it — the skills grid this
          layout wraps renders the same stack. See `knowsAboutFromStack` for why
          it is derived from the /uses data rather than fetched at build from
          /api/github-skills, which is what W2 originally specified.

          This layout is a Server Component (the page it wraps is the client
          one), so the block lands in the server HTML — which is the only place
          it is worth anything, since the crawlers that need it most do not run
          JavaScript. */}
      <JsonLd
        id="ld-about"
        data={profilePage({ knowsAbout: knowsAboutFromStack(usesData.stack) })}
      />
      {children}
    </>
  );
}
