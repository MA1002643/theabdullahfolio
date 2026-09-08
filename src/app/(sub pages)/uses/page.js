import Image from 'next/image';
import bg from '../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import UsesBench from '@/components/uses';
import { sectionMetadata } from '@/lib/og/meta';
import { readBuildFacts } from '@/lib/uses/buildFacts';

// Server component on purpose (the /journey pattern): metadata exports live
// here, the build-time facts are read here with synchronous `fs` (so
// node:fs never reaches a client bundle and the route stays static), and all
// interactivity sits behind the 'use client' boundary in @/components/uses.
export const metadata = sectionMetadata({
  title: 'Uses',
  description:
    'The machine, the bench, the stack and the pipeline — every tool verified against the repositories and the build.',
  path: '/uses',
});

export default function UsesPage() {
  // Read once at build. Static route: no dynamic APIs are touched here.
  const facts = readBuildFacts();

  return (
    // Fragment, not <main>: the (sub pages) layout already provides the one
    // <main> landmark (issue #86 — nested <main> is invalid HTML).
    <>
      {/* Backdrop trio shared with /about, /contact, /journey and /my-past:
          the still at half opacity, a black dimmer, then the cursor-reactive
          aurora composited over the top. `alt=""` marks it decorative. */}
      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
      <AuroraDustMount />

      <PageTitle title="MY SETUP" subtitle="the tools, verified" replayOnView />

      <UsesBench facts={facts} />
    </>
  );
}
