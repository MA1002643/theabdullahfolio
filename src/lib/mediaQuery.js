// Subscribe to a MediaQueryList's changes, returning an unsubscribe fn. Older
// Safari / WebViews (iOS < 14) expose ONLY the deprecated addListener/
// removeListener — they have no addEventListener on MediaQueryList — so calling
// addEventListener unconditionally throws and breaks the effect (and the page).
// Prefer the modern `change` event; fall back to the legacy methods when it's
// missing. Mirrors the guard in usePointerCapability, hoisted here so every
// matchMedia subscriber shares one correct implementation.
export function onMediaChange(mql, handler) {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  mql.addListener(handler);
  return () => mql.removeListener(handler);
}
