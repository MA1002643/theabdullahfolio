'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Github,
  Home,
  Linkedin,
  Notebook,
  Palette,
  Phone,
  User,
  Briefcase,
  Clock,
} from 'lucide-react';
import TransitionLink from '@/components/pageTransition/TransitionLink';

const getIcon = (icon, small = false) => {
  const cls = small ? 'h-auto w-[1.4rem]' : 'h-auto w-full md:w-[2.5rem] lg:w-[3rem]';
  switch (icon) {
    case 'about':
      return <User className={cls} strokeWidth={1.5} />;
    case 'projects':
      return <Palette className={cls} strokeWidth={1.5} />;
    case 'qualifications':
      return <Briefcase className={cls} strokeWidth={1.5} />;
    case 'contact':
      return <Phone className={cls} strokeWidth={1.5} />;
    case 'github':
      return <Github className={cls} strokeWidth={1.5} />;
    case 'linkedin':
      return <Linkedin className={cls} strokeWidth={1.5} />;
    case 'resume':
      return <Notebook className={cls} strokeWidth={1.5} />;
    case 'past':
      return <Clock className={cls} strokeWidth={1.5} />;
    default:
      return <Home className={cls} strokeWidth={1.5} />;
  }
};

// In-app routes travel through the Sigil Passage (client-side navigation with
// the emblem transition). Anything external — or a real file like the CV PDF,
// which has an extension — keeps a plain anchor and native behaviour.
const isRouteLink = (link) =>
  link.startsWith('/') && !/\.[a-z0-9]+$/i.test(link);

// One wrapper for both branches so the two layouts below don't each duplicate
// the internal/external split.
const NavLinkShell = ({ link, label, newTab, children, ...shared }) =>
  isRouteLink(link) ? (
    <TransitionLink
      href={link}
      transitionLabel={label}
      target={newTab ? '_blank' : '_self'}
      rel={newTab ? 'noopener noreferrer' : undefined}
      {...shared}
    >
      {children}
    </TransitionLink>
  ) : (
    <a
      href={link}
      target={newTab ? '_blank' : '_self'}
      rel={newTab ? 'noopener noreferrer' : undefined}
      {...shared}
    >
      {children}
    </a>
  );

const NavButton = ({ x, y, label, link, icon, newTab, setHovered, hovered, isMobileColumn, index, visible = true }) => {
  // Declared before the `isMobileColumn` early return below — hooks must run
  // unconditionally on every render path.
  const reduceMotion = useReducedMotion();

  // xs-mobile two-column layout button
  if (isMobileColumn) {
    const baseDelay = 0.1;
    const delay = index != null ? baseDelay + index * 0.08 : baseDelay;
    return (
      <motion.div
        // Reduced motion drops the `scale` (a transform — actual movement) and
        // reveals with a plain fade, the same collapse the rest of the site
        // applies (issue #87). The fade itself is kept: it isn't vestibular
        // motion, and the buttons still need to appear. `scale: 1` is pinned in
        // BOTH the initial and animate targets (not omitted) so the button is
        // never undersized — a target that omits `scale` would leave it at
        // whatever value it last held, which matters only if `reduceMotion`
        // could flip after mount (framer's `useReducedMotion` latches it today,
        // but this keeps the reduced path correct regardless).
        initial={reduceMotion ? { opacity: 0, scale: 1 } : { opacity: 0, scale: 0.6 }}
        // Drive the reveal from the parent's `visible` prop instead of
        // relying on the component being mounted/unmounted. The button
        // is always in the DOM (so its layout space is reserved from
        // the start), and only its opacity/scale change when it should
        // appear. While invisible: pointer-events-none blocks mouse,
        // tabIndex={-1} removes it from the keyboard tab order, and
        // aria-hidden hides it from the AT tree — together that makes
        // the not-yet-revealed buttons truly inert.
        animate={
          reduceMotion
            ? { opacity: visible ? 1 : 0, scale: 1 }
            : visible
              ? { opacity: 1, scale: 1 }
              : { opacity: 0, scale: 0.6 }
        }
        // Under reduced motion `scale` is constant (1 → 1), so only opacity
        // actually animates; the `scale: { duration: 0 }` override just makes
        // that explicit so a recovered scale (were the flag ever to flip) snaps
        // rather than eases.
        transition={
          reduceMotion
            ? {
                duration: 0.35,
                delay: visible ? delay : 0,
                ease: 'easeOut',
                scale: { duration: 0 },
              }
            : { duration: 0.35, delay: visible ? delay : 0, type: 'tween', ease: 'easeOut' }
        }
        className={`cursor-pointer ${visible ? '' : 'pointer-events-none'}`}
        aria-hidden={!visible}
      >
        <NavLinkShell
          link={link}
          label={label}
          newTab={newTab}
          aria-label={label}
          name={label}
          tabIndex={visible ? 0 : -1}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="group nav-button custom-bg flex items-center justify-center rounded-full transition-all duration-300"
        >
          <span className="relative flex items-center justify-center h-10 w-10 sm:h-[52px] sm:w-[52px] p-2 sm:p-[11px]">
            <span className="text-white group-hover:text-[#ff6d05] transition-colors duration-300 flex items-center justify-center">
              {getIcon(icon, true)}
            </span>
          </span>
        </NavLinkShell>
      </motion.div>
    );
  }

  // Orbital layout button (480px and above)
  return (
    <div
      className="absolute z-50 cursor-pointer mx-auto"
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      <NavLinkShell
        link={link}
        label={label}
        newTab={newTab}
        aria-label={label}
        name={label}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group nav-button custom-bg flex items-center justify-center rounded-full transition-all duration-300"
      >
        <span className="relative flex flex-col items-center h-14 sm:h-16 md:h-[4.5rem] lg:h-[5rem] w-14 sm:w-16 md:w-[4.5rem] lg:w-[5rem] sm:p-4 md:p-[0.75rem] lg:p-4 p-3">
          {/* Icon */}
          <span className="text-lg text-white group-hover:text-[#ff6d05] transition-colors duration-300">
            {getIcon(icon)}
          </span>

          <span className="peer absolute left-0 top-0 h-full w-full bg-transparent" />

          {/* Label (hidden until hover) */}
          <span className="sm:mt-4 mt-2 whitespace-nowrap rounded-md px-2 py-1 text-sm md:text-md text-[#ff6d05] shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300">
            {label}
          </span>
        </span>
      </NavLinkShell>

    </div>
  );
};

export default NavButton;
