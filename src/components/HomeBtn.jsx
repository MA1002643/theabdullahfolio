'use client';
import { motion } from 'framer-motion';
import { Home } from 'lucide-react';
import { useTranslations } from 'next-intl';
import TransitionLink from '@/components/pageTransition/TransitionLink';

const NavLink = motion(TransitionLink);

// The house glyph is not a direction, so it is not mirrored under RTL; the
// tooltip opens on the reading-END side via logical insets (issue #82).
const HomeBtn = () => {
  const t = useTranslations('Nav');
  return (
    <div className="control-island">
      {/* Pops in from 60%, never from zero, and at once. It used to sit at
          scale(0) for a full second: a focusable link with no box, which Tab
          could land on with nothing to show (WCAG 2.4.11). The intro loader
          hid that second on first visits until a visit entering on a sub-page
          stopped playing it (2026-10-31); tests/a11y/keyboard.spec.js found it
          on every sub-page. */}
      <NavLink
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        whileTap={{ scale: 0.96 }}
        href='/'
        transitionLabel={t('routes.home')}
        prefetch={false}
        className='text-foreground rounded-full flex items-center justify-center custom-bg touch-manipulation pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05]'
      >
        <span className='relative w-11 h-11 p-2.5 sm:w-12 sm:h-12 sm:p-3 md:w-14 md:h-14 md:p-4 group'>
          <Home
            className='w-full h-auto text-white group-hover:text-[#ff6d05] transition-all duration-300'
            strokeWidth={1.5}
          />
          <span className='desktop-hover-only peer bg-transparent absolute inset-0 w-full h-full' />
          {/* Tooltip chrome reuses `.custom-bg-abt` — the same class
              the Years in the Craft / Most Active Repository cards on
              the about page wear — so the tooltip's border colour and
              background gradient match the rest of the site's card
              language instead of the plain grey `bg-background` it
              used to fall back to. Dropping `shadow-lg` because
              custom-bg-abt already projects its own warm orange neon
              halo and the two stacked would read as muddy. */}
          <span className='custom-bg-abt desktop-hover-only absolute hidden peer-hover:block px-2 py-1 sm:px-2.5 sm:py-1.5 start-full ms-2 md:ms-3 top-1/2 -translate-y-1/2 text-[#ff6d05] text-xs sm:text-sm md:text-base rounded-md whitespace-nowrap'>
            {t('homeButton.tooltip')}
          </span>
        </span>
        <span className='sr-only'>{t('homeButton.srLabel')}</span>
      </NavLink>
    </div>
  );
};

export default HomeBtn;
