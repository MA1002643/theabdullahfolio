// Pure, dependency-free display helpers for the Now Playing widget (issue #42).
// No React, no server imports — safe to use anywhere on the client.

// Milliseconds → "m:ss" (or "h:mm:ss" for the rare long track). Clamps negatives
// to 0 so an over-run interpolation never prints "-0:01".
export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

// "3 minutes ago" style relative label for a last-played timestamp. Coarse by
// design — the widget only needs a human sense of recency, not precision.
export function formatPlayedAgo(iso) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// #rrggbb → { r, g, b }. Tolerates a missing/short/malformed value by returning
// the site's warm ember default so a caller never has to null-check the result.
export function hexToRgb(hex) {
  const fallback = { r: 230, g: 163, b: 77 }; // == DEFAULT_ACCENT #e6a34d
  if (typeof hex !== 'string') return fallback;
  const m = hex.trim().replace('#', '');
  // Validate 6 hex DIGITS, not just length: parseInt(m, 16) partial-parses a
  // 6-char non-hex string (e.g. 'e6a34z' → parses only 'e6a34' → 0xe6a34, a
  // wrong colour that a downstream NaN check would NOT catch). Rejecting up
  // front makes the fallback fire on any malformed input and makes `int`
  // provably never NaN, so no post-parse guard is needed.
  if (!/^[0-9a-f]{6}$/i.test(m)) return fallback;
  const int = parseInt(m, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

// `rgb(r g b / a)` string for any alpha — lets one accent hex drive borders,
// glows and washes at different strengths without pre-mixing each shade.
export function rgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

// Relative luminance (WCAG) of a hex colour, 0 (black) → 1 (white). Used to pick
// a readable text tone to sit ON the accent.
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// A near-black or near-white text colour that stays legible when painted on the
// given accent — for the tiny "playing" pip that sits inside the accent ring.
export function onAccentText(hex) {
  return luminance(hex) > 0.5 ? 'rgb(20 16 12)' : 'rgb(245 245 245)';
}
