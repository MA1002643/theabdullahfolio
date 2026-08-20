import { sectionMetadata } from '@/lib/og/meta';

// about/page.js is a Client Component and cannot export metadata itself,
// so this pass-through layout owns the route's title/OG fields (issue
// #88 v2). The share image lives beside it as opengraph-image.js.
export const metadata = sectionMetadata({
  title: 'About',
  description:
    'The engineer behind the ember — story, stack, and live GitHub telemetry.',
  path: '/about',
});

export default function AboutLayout({ children }) {
  return children;
}
