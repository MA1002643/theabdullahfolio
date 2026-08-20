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

// Lazily load the /qualifications image preloader ONLY when a visitor actually
// aims at that route (hover / focus / touch). A STATIC import would pull the
// preloader — and its 49-entry dimensions manifest — into the nav bundle, and
// therefore the homepage, for everyone, including visitors who never open
// /qualifications. The import() promise is cached module-side so repeated intent
// signals reuse a single chunk fetch; a failed fetch resets the cache so a later
// intent can retry, and it never rejects into the navigation path.
let certPreloadPromise;
const warmQualCerts = () => {
  if (!certPreloadPromise) {
    certPreloadPromise = import(
      '@/components/qualifications/preloadCerts'
    ).catch(() => {
      certPreloadPromise = undefined; // allow a later intent to retry the fetch
      return null;
    });
  }
  certPreloadPromise.then((m) => m?.preloadQualificationCerts?.());
};

// `w-6` rather than the `w-full` this used to carry. `w-full` resolved to 24px
// only by accident: it is a percentage against a shrink-to-fit parent, which is
// circular, so the browser fell back to the glyph's own 24px intrinsic width.
// The moment that parent gets a definite width the icon silently changes size.
// 24px is what it has always measured, said outright.
const getIcon = (icon, small = false) => {
  const cls = small ? 'h-auto w-[1.4rem]' : 'h-auto w-6 md:w-[2.5rem] lg:w-[3rem]';
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

const NavButton = ({ x, y, zIndex = 40, label, link, icon, newTab, setHovered, hovered, isMobileColumn, index, visible = true, labelAbove = false }) => {
  // Declared before the `isMobileColumn` early return below — hooks must run
  // unconditionally on every render path.
  const reduceMotion = useReducedMotion();

  // The /qualifications carousel loads 49 optimised certificate images. Start
  // warming them into the HTTP cache the instant the user shows intent to go
  // there — hover (desktop), focus (keyboard), or pointer-down (touch, fired
  // just before the click that navigates). The Stone Passage transition then
  // hides the ~2s fetch under its cover, so the cards are already cached when
  // the page is revealed. warmQualCerts lazy-loads the preloader on first use
  // (see top of file) and the preloader is idempotent, so firing it from
  // several intent signals costs nothing.
  const warmQual = link === '/qualifications' ? warmQualCerts : undefined;

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
          onMouseEnter={() => { setHovered(true); warmQual?.(); }}
          onMouseLeave={() => setHovered(false)}
          onFocus={warmQual}
          onPointerDown={warmQual}
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
      // The depth comes in as a NUMBER, not a `z-50` class, because it changes
      // every frame: the ring passes behind the laptop on the far half of each
      // lap (10) and in front of it on the near half (40), straddling the
      // laptop's own z-20. A fixed class could only ever pick one of the two.
      // The parent wrapper deliberately has no z-index of its own so these
      // values reach the laptop instead of being flattened against it — see
      // the note in navigation/index.jsx.
      className="absolute cursor-pointer mx-auto"
      style={{
        transform: `translate(${x}px, ${y}px)`,
        zIndex,
      }}
    >
      <NavLinkShell
        link={link}
        label={label}
        newTab={newTab}
        aria-label={label}
        name={label}
        onMouseEnter={() => { setHovered(true); warmQual?.(); }}
        onMouseLeave={() => setHovered(false)}
        // Focus pauses the lap exactly as hover does, and for the same reason:
        // the label below reveals on `group-focus-visible`, and a visible
        // label is only flip-stable (`labelAbove`) because its button's `y` is
        // frozen for as long as it shows. `hovered` is one shared boolean, so
        // a pointer brushing another button mid-focus can briefly resume the
        // ring under a keyboard-focused label — accepted: the label tracks its
        // own button and refreezes the moment the pointer leaves.
        onFocus={() => { setHovered(true); warmQual?.(); }}
        onBlur={() => setHovered(false)}
        onPointerDown={warmQual}
        className="group nav-button custom-bg flex items-center justify-center rounded-full transition-all duration-300"
      >
        {/* `flex items-center justify-center`, NOT `flex flex-col items-center`.
            The column laid the icon and the hover label out as two in-flow
            siblings starting at the content-box top, so the glyph was
            TOP-ANCHORED: its centre sat at border + padding + halfIcon, which
            equals halfButton only at `lg` (1 + 16 + 24 = 41 = 82/2). Every
            other breakpoint put it 4px high — 480-639, 640-767 and 768-1023 all
            measured exactly -4px. Centring on both axes makes it correct by
            construction instead of by coincidence, at any button or icon size.
            The padding stays: it is symmetric, so the content box shares the
            border box's centre and cannot reintroduce an offset. */}
        <span className="relative flex items-center justify-center h-14 sm:h-16 md:h-[4.5rem] lg:h-[5rem] w-14 sm:w-16 md:w-[4.5rem] lg:w-[5rem] sm:p-4 md:p-[0.75rem] lg:p-4 p-3">
          {/* Icon. Also a flex centring box, so no inline/baseline gap can creep
              in between the span and the glyph it wraps. */}
          <span className="flex items-center justify-center text-lg text-white group-hover:text-[#ff6d05] transition-colors duration-300">
            {getIcon(icon)}
          </span>

          <span className="peer absolute left-0 top-0 h-full w-full bg-transparent" />

          {/* Label (hidden until hover or keyboard focus — `group-focus-visible`
              gives sighted keyboard users the same label hover gives pointer
              users; `aria-label` on the link covers AT either way) — positioned
              UNDER the button
              instead of stacked beneath the icon in flow, which is what frees
              the icon to centre. It already overhung the button by 24px, so it
              was never contained by the circle; out of flow it simply sits
              where it always looked like it sat. `pointer-events-none` keeps a
              wide label ("Qualifications") from enlarging the anchor's hover
              target and re-triggering the ring's hover pause off-button. */}
          {/* `-mt-1` puts the label's own 4px `py-1` back over the button's 1px
              border, so the TEXT starts level with the bottom of the circle.
              The old `mt-2 sm:mt-4` was a margin between two in-flow siblings,
              so where the label actually LANDED was
              padding + iconHeight + margin - spanHeight, which drifted the
              tooltip's bottom edge to button + 15 / 19 / 23 / 27px across the
              four breakpoints — the same accident that de-centred the glyph.
              One number replaces those four, and it is the tight one on
              purpose: the bottom-most button in the ring is already near the
              foot of a short viewport, and anything looser pushed its tooltip
              off-screen at 768x700 and 1440x900 where the old values had just
              fit. Measured, no viewport is worse off than before. */}
          {/* `labelAbove` mirrors the tooltip to the other side of the circle
              for the handful of buttons whose label would otherwise fall off the
              foot of the page — the ring keeps a 16px gutter under the lowest
              button and this label wants 23 (see LABEL_DROP in
              navigation/index.jsx). `bottom-full -mb-1` is the exact reflection
              of `top-full -mt-1` — NEGATIVE on both sides, because with
              `bottom: 100%` a positive margin-bottom pushes the label 4px
              FURTHER up where `-mt-1` pulls it back in: the label's near edge
              lands 1px inside the button's border either way, so the text sits
              level with the circle's edge whichever way it points, and the
              tooltip's distance from the glyph it names never changes.
              Which buttons flip is decided from the box, not from taste — see
              `labelFlipY`. On a viewport with room, nothing flips at all. */}
          <span
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-sm text-[#ff6d05] shadow-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-all duration-300 ${
              labelAbove ? 'bottom-full -mb-1' : 'top-full -mt-1'
            }`}
          >
            {label}
          </span>
        </span>
      </NavLinkShell>

    </div>
  );
};

export default NavButton;
