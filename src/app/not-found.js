import NotFoundClient from '@/components/not-found/NotFoundClient';

// Server component on purpose — exporting `metadata` only works
// from server components, and the validation checklist requires
// the document `<title>` to be set during SSR. All interactivity
// lives behind the 'use client' boundary inside NotFoundClient.
export const metadata = {
  title: '404 — Page Not Found | theabdullahfolio',
  description:
    "You've drifted into the void. This page doesn't exist — yet.",
};

export default function NotFound() {
  return <NotFoundClient />;
}
