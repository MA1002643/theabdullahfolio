import { DEFAULT_LOCALE } from '@/i18n/locales';
import { intlTag } from '@/i18n/format';

// Relative "posted N ago" labels for guestbook cards. Hand-rolled on purpose
// (issue #40 rules out a date library for one formatting concern). Pure —
// `now` is injectable so unit tests don't race the wall clock, and callers
// re-render on a timer to keep "just now" honest without any library.
//
// Locales (issue #82): English keeps its compact hand-rolled "5m ago" — no
// `Intl` style produces exactly that, and the cards' tight timestamp slot was
// designed around it. Every other locale gets the same buckets through
// `Intl.RelativeTimeFormat` (narrow style, the closest to compact the
// platform offers) and `Intl.DateTimeFormat`, so the grammar, digits and
// month names are the locale's own with no catalogue strings to translate.
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

export function timeAgo(dateString, now = Date.now(), locale = DEFAULT_LOCALE) {
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return '';
  // Clock skew between the server that stamped the message and the visitor's
  // device can put a fresh message a few seconds in the future; clamping means
  // it reads "just now" instead of an empty or negative label.
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  const english = !locale || locale === DEFAULT_LOCALE;
  if (seconds < MONTH) {
    if (english) {
      if (seconds < MINUTE) return 'just now';
      if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
      if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
      return `${Math.floor(seconds / DAY)}d ago`;
    }
    const rtf = new Intl.RelativeTimeFormat(intlTag(locale), {
      style: 'narrow',
      numeric: 'auto',
    });
    if (seconds < MINUTE) return rtf.format(0, 'second');
    if (seconds < HOUR) return rtf.format(-Math.floor(seconds / MINUTE), 'minute');
    if (seconds < DAY) return rtf.format(-Math.floor(seconds / HOUR), 'hour');
    return rtf.format(-Math.floor(seconds / DAY), 'day');
  }
  // The absolute date is fixed to UTC (code review): the card is a Client
  // Component that also server-renders, and a timestamp near midnight would
  // otherwise format to one date on the UTC server and another in the
  // visitor's zone — a hydration mismatch, and a posting date that changed
  // with where it was read. One zone, one date, for every render.
  return new Date(then).toLocaleDateString(intlTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
