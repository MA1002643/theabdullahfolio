'use client';

import { useEffect, useSyncExternalStore } from 'react';

// The sitewide palette's contributor registry (issue #41).
//
// There is ONE palette, mounted in the root layout. A page that has commands of
// its own (/journey's era jumps, /uses' plate jumps, the guestbook's "leave a
// message") registers them here with usePaletteActions, and they show in the
// global palette while that page is mounted. Before #41 each of those pages
// mounted a palette of its own, each with its own ⌘K listener and its own copy
// of the route list.
//
// An external store rather than a React context: a context provider would
// have to WRAP `{children}` in the layout to be reachable from a page, which
// moves every page one level down the tree; a module store needs no wrapper,
// and useSyncExternalStore gives the palette a tear-free snapshot.

const sets = new Map();
const listeners = new Set();
let snapshot = [];

function rebuild() {
  // Registration order, which is mount order: the page's own groups appear in
  // the order the page registered them.
  snapshot = [...sets.values()].flat();
  for (const fn of listeners) fn();
}

/** Registers `actions` under `key`, replacing any earlier set. */
export function registerPaletteActions(key, actions) {
  sets.set(key, Array.isArray(actions) ? actions : []);
  rebuild();
  return () => {
    // Only drop the set this call put there: a remount that re-registered the
    // key before this cleanup ran must keep its own.
    if (sets.get(key) === actions || !Array.isArray(actions)) {
      sets.delete(key);
      rebuild();
    }
  };
}

export function subscribePaletteActions(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getPaletteActions = () => snapshot;
const getServerSnapshot = () => EMPTY;
const EMPTY = [];

/** The current page's contributed actions, live. */
export function useContributedActions() {
  return useSyncExternalStore(subscribePaletteActions, getPaletteActions, getServerSnapshot);
}

/**
 * Contributes `actions` to the global palette while the calling component is
 * mounted. Memoise the array: every new identity re-registers.
 */
export function usePaletteActions(key, actions) {
  useEffect(() => registerPaletteActions(key, actions), [key, actions]);
}

/** Test seam: forgets every registration. */
export function resetPaletteRegistry() {
  sets.clear();
  rebuild();
}
