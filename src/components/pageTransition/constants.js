// Single source of truth for the page-transition ("Sigil Passage") timing.
//
// The passage is a three-beat ritual, a compressed sibling of the intro
// loader's four-beat story:
//   covering  → two skewed molten slabs sweep across the viewport, sealing
//               the old page behind ink-black (the ember slab leads with a
//               glowing edge, pure black chases it)
//   holding   → the MA flame monogram inscribes itself and ignites while the
//               destination name engraves beneath it; router.push runs under
//               the opaque cover, so the route swap is never seen raw
//   revealing → the monogram's bloom becomes the same radial mask wipe (plus
//               ember portal ring) the intro uses, uncovering the new page
//
// The overlay's internal choreography (slab delays, stroke draw, ignite) is
// tuned to land inside COVER_MS + SHOWCASE_MIN_MS; if you change these, check
// the delays in SigilOverlay.jsx still fit.

// Slab sweep fully seals the viewport by here (last slab delay + duration).
export const COVER_MS = 540;

// router.push fires once the cover is opaque — never before, so the old page
// can't visibly swap out mid-sweep.
export const PUSH_AT_MS = 560;

// Minimum time the overlay holds from mount, even if the route arrives
// instantly — guarantees the monogram finishes drawing and igniting instead
// of being yanked mid-stroke on fast navigations.
export const SHOWCASE_MIN_MS = 1250;

// The radial mask wipe that uncovers the destination page.
export const REVEAL_MS = 520;

// If the route never arrives (push failed, network death), force the reveal
// so the visitor is never stranded behind the overlay.
export const FAILSAFE_MS = 6000;

// prefers-reduced-motion: plain cross-fade to a static, already-forged
// monogram, brief hold, cross-fade out. No sweep, no draw, no wipe.
export const REDUCED_COVER_MS = 200;
export const REDUCED_MIN_MS = 500;
export const REDUCED_REVEAL_MS = 260;

// Known routes → engraved destination names. Anything not listed falls back
// to a prettified last path segment (e.g. /projects/3 → passed-in label).
export const ROUTE_LABELS = {
  '/': 'Home',
  '/about': 'About',
  '/projects': 'Projects',
  '/qualifications': 'Qualifications',
  '/contact': 'Contact',
  '/my-past': 'My Past',
};
