'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { usePageTransition } from './PageTransitionProvider';

// Drop-in next/link replacement that routes eligible clicks through the Ember
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

// Where on screen the visitor actually pressed — the point the disintegration
// starts from, so the embers nearest the button lift first.
//
// A keyboard activation (Enter/Space on a focused link) still fires a click, but
// with no pointer behind it: `detail` is 0 and the coordinates are 0,0. Taking
// those literally would erupt the wall from the top-left corner every time
// somebody tabs through the nav. Falling back to the centre of the link itself
// keeps the gesture honest — the page still comes apart at the thing they hit.
const pressPoint = (e) => {
  if (e.detail !== 0 && (e.clientX !== 0 || e.clientY !== 0)) {
    return { x: e.clientX, y: e.clientY };
  }
  const rect = e.currentTarget?.getBoundingClientRect?.();
  if (!rect) return undefined;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

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
    // Read the press point BEFORE preventDefault/navigate: `currentTarget` is
    // nulled out once React finishes dispatching the synthetic event, so a later
    // read inside navigate would find nothing to measure.
    const origin = pressPoint(e);
    e.preventDefault();
    navigate(href, { label: transitionLabel, origin });
  };

  return (
    <Link ref={ref} href={href} target={target} onClick={handleClick} {...rest} />
  );
});

export default TransitionLink;
