import { sectionMetadata } from '@/lib/og/meta';

// guestbook/page.js is a Client Component and cannot export metadata itself,
// so this pass-through layout owns the route's title/OG fields (the same
// arrangement every sub-page uses — see about/layout.js). The share image
// lives beside it as opengraph-image.js.
export const metadata = sectionMetadata({
  title: 'Guestbook',
  description:
    'Leave your mark — a neon message wall signed by visitors through GitHub or Google.',
  path: '/guestbook',
});

export default function GuestbookLayout({ children }) {
  return children;
}
