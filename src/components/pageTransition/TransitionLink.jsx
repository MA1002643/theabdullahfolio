'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { usePageTransition } from './PageTransitionProvider';

// Drop-in next/link replacement that routes eligible clicks through the Sigil
// Passage instead of a raw navigation. Renders a real <Link>, so prefetching,
// middle-click/new-tab, right-click → copy address, and SEO crawlability all
// keep their native semantics — only a plain left-click on an internal route
// is intercepted.
//
// `transitionLabel` is the name engraved under the monogram mid-passage
// (falls back to a prettified route segment in the provider).
//
// forwardRef so `motion(TransitionLink)` works wherever the codebase already
// does `motion(Link)`.

const isModifiedClick = (e) =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

const TransitionLink = forwardRef(function TransitionLink(
  { href, transitionLabel, onClick, target, ...rest },
  ref,
) {
  const { navigate } = usePageTransition();

  const handleClick = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!navigate) return; // no provider mounted — behave like plain Link
    if (target && target !== '_self') return;
    if (isModifiedClick(e)) return;
    const isInternalPath =
      typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
    if (!isInternalPath) return;
    e.preventDefault();
    navigate(href, { label: transitionLabel });
  };

  return (
    <Link ref={ref} href={href} target={target} onClick={handleClick} {...rest} />
  );
});

export default TransitionLink;
