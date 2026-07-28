import Image from 'next/image';
import bg from '../../../../public/background/contact-bg.png';
import Form from '@/components/contact/Form';
import ContactIntro from '@/components/contact/ContactIntro';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';

export const metadata = {
  title: 'Contact',
};

export default function Contact() {
  return (
    <>
      <Image
        src={bg}
        alt="contact-bg"
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />

      {/* Shared ambient WebGL aurora (same layer as the about and 404 pages):
          drifts, bends toward the cursor, and parallax-shifts with scroll.
          Self-gates on motion preference + loader reveal; the static image
          above stays the reduced-motion fallback. */}
      <AuroraDustMount />

      <article className="relative flex w-full flex-col items-center justify-center space-y-6 py-2 sm:py-0">
        <div className="flex w-full flex-col items-center justify-center space-y-6 sm:w-3/4">
          {/* HEADLINE — uses shared PageTitle (issue #104). replayOnView
              re-arms the headline ignite whenever the block scrolls out
              of view, matching the other sub-pages. */}
          <PageTitle title="CONTACT ME" subtitle="get in touch" replayOnView />
          {/* Copy + its "materialize from the ether" reveal live in the client
              component; the classes below keep the exact prior typography. */}
          <ContactIntro className="xs:text-base text-fire-amber text-center text-sm font-light" />
        </div>
        <div className="flex w-full justify-center gap-6">
          <Form />
        </div>
      </article>
    </>
  );
}
