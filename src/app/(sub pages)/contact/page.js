import Image from 'next/image';
import bg from '../../../../public/background/projects-background.png';
import Form from '@/components/contact/Form';

export const metadata = {
  title: 'Contact',
};

export default function Contact() {
  return (
    <>
      <Image
        src={bg}
        alt="Next.js Portfolio website's contact page background image"
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />

      <article className="relative flex w-full flex-col items-center justify-center space-y-8 py-8 sm:py-0">
        <div className="flex w-full flex-col items-center justify-center space-y-6 sm:w-3/4">
          <h1 className="text-center text-5xl font-extrabold uppercase text-[#FFB627] drop-shadow-[0_0_20px_rgba(255,182,39,0.9)] sm:text-7xl">
            CONTACT ME
          </h1>
          <h2 className="text-center text-lg font-semibold uppercase tracking-wider text-[#C56FFF] sm:text-xl">
            – get in touch –
          </h2>
          <p className="xs:text-base text-center text-sm font-light">
            Step into the circle of enchantment and weave your words into the
            fabric of the cosmos. Whether you seek to conjure collaborations,
            unlock mysteries, or simply share tales of adventure, your messages
            are treasured scrolls within this realm. Use the form below to send
            your missives through the ethereal network, and await the whisper of
            magic in response.
          </p>
        </div>
        <Form />
      </article>
    </>
  );
}
