import Image from 'next/image';
import bg from '../../../../public/background/contact-bg.png';
import Form from '@/components/contact/Form';
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

      <article className="relative flex w-full flex-col items-center justify-center space-y-6 py-2 sm:py-0">
        <div className="flex w-full flex-col items-center justify-center space-y-6 sm:w-3/4">
          {/* HEADLINE — uses shared PageTitle (issue #104). */}
          <PageTitle title="CONTACT ME" subtitle="get in touch" />
          <p className="xs:text-base text-fire-amber text-center text-sm font-light">
            Step into the circle of enchantment and weave your words into the
            fabric of the cosmos. Whether you seek to conjure collaborations,
            unlock mysteries, or simply share tales of adventure, your messages
            are treasured scrolls within this realm. Use the form below to send
            your missives through the ethereal network, and await the whisper of
            magic in response.
          </p>
        </div>
        <div className="flex w-full justify-center gap-6">
          <Form />
        </div>
      </article>
    </>
  );
}
