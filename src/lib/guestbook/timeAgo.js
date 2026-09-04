// Relative "posted N ago" labels for guestbook cards. Hand-rolled on purpose
// (issue #40 rules out a date library for one formatting concern). Pure —
// `now` is injectable so unit tests don't race the wall clock, and callers
// re-render on a timer to keep "just now" honest without any library.
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

export function timeAgo(dateString, now = Date.now()) {
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return '';
  // Clock skew between the server that stamped the message and the visitor's
  // device can put a fresh message a few seconds in the future; clamping means
  // it reads "just now" instead of an empty or negative label.
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < MINUTE) return 'just now';
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  if (seconds < MONTH) return `${Math.floor(seconds / DAY)}d ago`;
  // The absolute date is fixed to UTC (code review): the card is a Client
  // Component that also server-renders, and a timestamp near midnight would
  // otherwise format to one date on the UTC server and another in the
  // visitor's zone — a hydration mismatch, and a posting date that changed
  // with where it was read. One zone, one date, for every render.
  return new Date(then).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
