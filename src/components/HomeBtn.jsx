'use client';
import { motion } from 'framer-motion';
import { Home } from 'lucide-react';
import Link from 'next/link';

const NavLink = motion(Link);

const HomeBtn = () => {
  return (
    <div className="control-island">
      <NavLink
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1 }}
        whileTap={{ scale: 0.96 }}
        href='/'
        prefetch={false}
        className='text-foreground rounded-full flex items-center justify-center custom-bg touch-manipulation pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05]'
      >
        <span className='relative w-10 h-10 p-2 sm:w-12 sm:h-12 sm:p-3 md:w-14 md:h-14 md:p-4 group'>
          <Home
            className='w-full h-auto text-white group-hover:text-[#ff6d05] transition-all duration-300'
            strokeWidth={1.5}
          />
          <span className='desktop-hover-only peer bg-transparent absolute top-0 left-0 w-full h-full' />
          <span className='desktop-hover-only absolute hidden peer-hover:block px-2 py-1 sm:px-2.5 sm:py-1.5 left-full mx-2 md:mx-3 top-1/2 -translate-y-1/2 bg-background text-[#ff6d05] text-xs sm:text-sm md:text-base rounded-md shadow-lg whitespace-nowrap'>
            Home
          </span>
        </span>
        <span className='sr-only'>Go to Home Page</span>
      </NavLink>
    </div>
  );
};

export default HomeBtn;
