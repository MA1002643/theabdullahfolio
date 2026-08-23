import Image from 'next/image';
import bg from '../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import JourneyTimeline from '@/components/journey';
import { sectionMetadata } from '@/lib/og/meta';

// Server component on purpose (the /projects pattern): metadata exports live
// here while all interactivity sits behind the 'use client' boundary in
// @/components/journey — no pass-through layout.js needed.
export const metadata = sectionMetadata({
  title: 'Journey',
  description:
    'Every role, qualification and volunteering post as one scroll-driven timeline — from Bolton College in 2018 to production today.',
  path: '/journey',
});

export default function JourneyPage() {
  return (
    // Fragment, not <main>: the (sub pages) layout already provides the one
    // <main> landmark (see issue #86 — nested <main> is invalid HTML).
    <>
      {/* Backdrop trio shared with /about, /contact and /my-past: the still at
          half opacity, a black dimmer, then the cursor-reactive aurora
          composited over the top. `alt=""` marks the image decorative; it is
          also the aurora's reduced-motion fallback. */}
      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
      <AuroraDustMount />

      <PageTitle
        title="MY JOURNEY"
        subtitle="from first line to production"
        replayOnView
      />

      <JourneyTimeline />
    </>
  );
}
