import Image from 'next/image';
import bg from '../../public/background/Homebackground.png';
import Navigation from '@/components/navigation';

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center">
      {/* full-screen, semi-opaque bg image */}
      <Image
        priority
        src={bg}
        alt="background"
        fill
        sizes="100vw"
        className="-z-50 object-cover object-center opacity-100"
      />

      {/* HEADLINE at the very top */}
      <div className="absolute inset-x-0 top-0 z-50 pt-12 text-center">
        <h1 className="text-neon-orange text-[3rem] font-extrabold uppercase leading-tight md:text-[5rem]">
          Muhammad Abdullah
        </h1>
        <h2 className="text-neon-pink mt-2 text-[1.25rem] font-semibold uppercase leading-snug md:text-[1.875rem]">
          Software Developer
        </h2>
      </div>

      {/* navigation sits below the headline */}
      <div className="z-10 flex w-full flex-1 items-center justify-center">
        <Navigation />
      </div>
    </main>
  );
}
