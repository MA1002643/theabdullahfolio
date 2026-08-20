import { sectionMetadata } from '@/lib/og/meta';

// qualifications/page.js is a Client Component and cannot export metadata
// itself, so this pass-through layout owns the route's title/OG fields
// (issue #88 v2). The share image lives beside it as opengraph-image.js.
export const metadata = sectionMetadata({
  title: 'Qualifications',
  description:
    'Degrees, certificates and credentials — the paper trail behind the practice.',
  path: '/qualifications',
});

export default function QualificationsLayout({ children }) {
  return children;
}
