// Live "how long ago" formatter for the maintenance-header popovers
// (issue #94 §6.3). Pure — takes the reference `now` in ms so a single
// shared ticker can drive every age cell and tests can pin time.
//
// Unlike the header's coarser formatRelative ("5m ago"), popover ages
// carry a second component in the minute/hour bands ("2m 04s ago") so
// the per-second tick is visible, matching the issue's UX spec.
export function formatAge(fromISO, now) {
  const fromMs = Date.parse(fromISO);
  if (Number.isNaN(fromMs)) return '';

  const sec = Math.max(0, Math.floor((now - fromMs) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${pad(sec % 60)}s ago`;
  if (sec < 86400) {
    return `${Math.floor(sec / 3600)}h ${pad(Math.floor((sec % 3600) / 60))}m ago`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return `${d}d ${pad(h)}h ago`;
}

// Two-digit trailing units ("2m 04s") keep the tabular-nums cell a fixed
// width, so the per-second tick never causes layout shift.
const pad = (n) => String(n).padStart(2, '0');
