// The /projects category filter is VIEW state, not a saved preference.
//
// It used to be written to localStorage on every card click and restored on
// every mount, which made one click permanent: a visitor who once opened a
// System project landed on the System tab on every later visit — a fresh
// arrival, a reload, a second tab, tomorrow — with no way back to "All" but
// clicking it. Opening /projects is supposed to show the whole portfolio.
//
// The one case worth preserving is the round trip THROUGH a project's detail
// page: clicking a card and coming back should return the visitor to the list
// they left rather than dumping them in "All" with their place lost. So the
// category is passed as a one-hop HANDOFF instead of being persisted:
//
//   card click            save()      — ProjectLayout mints the token
//   /projects/<id>        (survives)  — still inside the projects area
//   back on /projects     consume()   — ProjectList applies it AND spends it
//   any other route       clear()     — ProjectFilterHandoffGuard voids it
//
// Two independent things therefore have to be true for a filter to be
// restored: the token was minted in THIS tab, and the visitor never left the
// projects area in between. Either one failing means "All", which is exactly
// the set of cases the old behaviour got wrong.
//
// sessionStorage, not localStorage: a token must not outlive the tab that
// minted it, so tomorrow's visit starts clean even if the last thing this tab
// did was open a card.

const KEY = "projects-category-handoff";

// The pre-handoff localStorage key. Browsers that visited the old build still
// hold a value under it; nothing reads it any more, but it is cleared
// alongside the handoff so the stale category doesn't sit in storage forever.
const LEGACY_KEY = "projects-category";

// Storage throws rather than returning null when it is unavailable (cookies
// blocked, quota exhausted). A filter handoff is a nicety — never let it take
// the page down. Every access in this module goes through here.
const attempt = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

const dropLegacy = () => attempt(() => localStorage.removeItem(LEGACY_KEY));

/** Mint a handoff for the category the visitor is leaving the list from. */
export const saveProjectFilterHandoff = (category) => {
  if (!category) return;
  attempt(() => sessionStorage.setItem(KEY, category));
};

/**
 * Read the handoff and spend it in the same breath. One-shot on purpose: a
 * SECOND arrival on /projects (a reload, a later visit in this tab) is a fresh
 * arrival and must show "All", so there has to be nothing left to find.
 *
 * @returns {string|null} the stored label, or null when there is no live handoff.
 */
export const consumeProjectFilterHandoff = () => {
  const stored = attempt(() => sessionStorage.getItem(KEY));
  if (stored !== null) attempt(() => sessionStorage.removeItem(KEY));
  dropLegacy();
  return stored;
};

/** Void the handoff — the visitor went somewhere that isn't the projects area. */
export const clearProjectFilterHandoff = () => {
  attempt(() => sessionStorage.removeItem(KEY));
  dropLegacy();
};

/**
 * Is this path part of the projects area (the list or a project detail page)?
 * Anything else voids a live handoff. `/projectsomething` must NOT match, hence
 * the exact-or-slash test rather than a bare startsWith.
 */
export const isProjectsRoute = (pathname) =>
  typeof pathname === "string" &&
  (pathname === "/projects" || pathname.startsWith("/projects/"));
