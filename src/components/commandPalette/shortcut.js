// The palette's hotkey, as a label. useCommandPalette listens for BOTH ⌘K and
// Ctrl+K, but a hint that advertises the shortcut must name the one the
// reader's keyboard actually has: the guestbook's "⌘K · commands" pill told
// every Windows and Linux visitor the wrong key (code review).
//
// Apple is decided from the platform hint the browser gives — the UA-CH
// `userAgentData.platform` ("macOS") where it exists, else the legacy
// `navigator.platform` ("MacIntel", "iPhone", "iPad") — with a last look at
// the user-agent string for a WebKit that reports an iPad as a Mac. Pure over
// an injected navigator so it can be pinned by a unit test. The default is
// the BROWSER's navigator only: Node ≥21 has a global `navigator` of its own
// that reports the server's platform, and the reader's keyboard is knowable
// only where a window exists — anywhere else (SSR, a test without a DOM) is
// "not Apple".
const browserNavigator = () =>
  typeof window !== 'undefined' ? window.navigator : undefined;

export function isApplePlatform(nav = browserNavigator()) {
  const platform = nav?.userAgentData?.platform || nav?.platform || '';
  if (/^(mac|iphone|ipad|ipod)/i.test(platform)) return true;
  return /\b(Macintosh|Mac OS|iPhone|iPad|iPod)\b/.test(nav?.userAgent || '');
}

export function paletteShortcutLabel(nav = browserNavigator()) {
  return isApplePlatform(nav) ? '⌘K' : 'Ctrl+K';
}
