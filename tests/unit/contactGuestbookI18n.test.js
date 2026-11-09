// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PresencePill from '@/components/guestbook/PresencePill';
import WallPagination from '@/components/guestbook/WallPagination';
import { arrivalAnnouncement } from '@/lib/guestbook/events';
import { timeAgo } from '@/lib/guestbook/timeAgo';
import { validateMessage } from '@/lib/guestbook/validate';
import { MESSAGE_MAX } from '@/lib/guestbook/limits';
import { bodyError } from '@/lib/guestbook/body';
import { IntlWrapper, messagesFor } from '../support/intl.jsx';

// Issue #82 — the /contact and /guestbook copy moved into the Contact,
// Guestbook and Composer catalogues. Two things are pinned here:
//   1. ENGLISH IS UNCHANGED. Every server code renders, from the English
//      catalogue, the exact sentence the route has always sent; the plurals
//      read as the old `n === 1` branches did for 0 / 1 / many.
//   2. OTHER LOCALES LOCALISE THE FRAME, NEVER THE CONTENT. Digits and
//      relative times are the locale's own (Persian here: RTL, and its CLDR
//      default is extended Arabic-Indic digits), while visitor names and
//      messages pass through untouched.

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  const { withFullMotion } = await import('../support/motionDouble.js');
  return { ...withFullMotion(actual), AnimatePresence: ({ children }) => children };
});

// The pill's figure rolls in; pin it to the target so the label is readable.
vi.mock('@/hooks/useCountUp', () => ({ useCountUp: (n) => n }));

afterEach(cleanup);

const en = messagesFor('en');
const tr = (namespace) => createTranslator({ locale: 'en', messages: en, namespace });

describe('guestbook validation codes — English catalogue matches the route', () => {
  const t = tr('Guestbook');
  it.each([
    [undefined],
    ['x'],
    ['y'.repeat(MESSAGE_MAX + 1)],
    ['bad\u0007char'],
    ['visit spam.ai now'],
  ])('validateMessage(%j) → code renders its own English error', (raw) => {
    const r = validateMessage(raw);
    expect(r.ok).toBe(false);
    expect(t.has(`errors.${r.code}`)).toBe(true);
    expect(t(`errors.${r.code}`, r.values)).toBe(r.error);
  });

  it('the body-ceiling error renders ungrouped (16384, not 16,384)', () => {
    const read = { ok: false, status: 413, error: 'Request body must be at most 16384 bytes' };
    const body = bodyError(read, 16384);
    expect(t(`errors.${body.code}`, body.values)).toBe(read.error);
  });

  it('the rate-limit sentence keeps its 1 / many split', () => {
    expect(t('errors.rate_limited', { minutes: 1 })).toBe(
      'One message every 5 minutes — try again in 1 minute',
    );
    expect(t('errors.rate_limited', { minutes: 4 })).toBe(
      'One message every 5 minutes — try again in 4 minutes',
    );
  });
});

describe('refine-message codes — Composer catalogue matches the route', () => {
  // The route answers every failure as { error: <code>, message: <English> };
  // the client words the code from Composer.refine.errors. Read the pairs
  // straight off the route source so a new or reworded one cannot drift.
  const source = readFileSync(
    // jsdom's import.meta.url is not a file: URL, so resolve from the root.
    resolve(process.cwd(), 'src/app/api/refine-message/route.js'),
    'utf8',
  );
  const pairs = [...source.matchAll(/error: '(\w+)', message: '([^']+)'/g)]
    .map(([, code, message]) => [code, message])
    .filter(([code]) => code !== 'aborted'); // 499: nobody is listening
  const t = tr('Composer');

  it('finds the route\'s error pairs', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(8);
  });
  it.each(pairs)('%s renders the route\'s own English', (code, message) => {
    expect(t(`refine.errors.${code}`)).toBe(message);
  });
});

describe('ICU plurals read as the old branches did', () => {
  it('the held-messages toast', () => {
    const t = tr('Contact');
    expect(t('toast.heldSent', { count: 1 })).toBe('Your held message was sent ✦');
    expect(t('toast.heldSent', { count: 3 })).toBe('3 held messages were sent ✦');
  });

  it('the mark count, keyed on the real count while the figure rolls', () => {
    const t = tr('Guestbook');
    const text = (count, shown) =>
      [].concat(t.rich('wall.marksLeft', { count, shown, n: (c) => [].concat(c).join('') })).join('');
    expect(text(0, '0')).toBe('0 marks left');
    expect(text(1, '0')).toBe('0 mark left');
    expect(text(12, '12')).toBe('12 marks left');
  });
});

describe('arrivalAnnouncement through the catalogue', () => {
  const marks = [
    { author: { name: 'Alice' }, message: 'hello there' },
    { author: {}, message: 'anon mark' },
  ];
  const t = tr('Guestbook');
  const viaCatalogue = (key, values) => t(`announce.${key}`, values);

  it('is byte-identical to the built-in English frame for one and many', () => {
    expect(arrivalAnnouncement(marks.slice(0, 1), viaCatalogue)).toBe(
      arrivalAnnouncement(marks.slice(0, 1)),
    );
    expect(arrivalAnnouncement(marks, viaCatalogue)).toBe(arrivalAnnouncement(marks));
    expect(arrivalAnnouncement(marks)).toBe('2 new messages. Alice: hello there. Someone: anon mark');
  });

  it('never translates what visitors wrote', () => {
    const shout = (key, values) => `${key}|${JSON.stringify(values)}`;
    expect(arrivalAnnouncement(marks.slice(0, 1), shout)).toContain('"message":"hello there"');
  });
});

describe('timeAgo outside English', () => {
  const NOW = new Date('2026-08-23T12:00:00.000Z').getTime();
  const at = (ms) => new Date(NOW - ms).toISOString();

  it('keeps the compact English labels for en', () => {
    expect(timeAgo(at(5 * 60_000), NOW, 'en')).toBe('5m ago');
  });

  it('uses Intl.RelativeTimeFormat and the locale’s month names elsewhere', () => {
    const es = timeAgo(at(5 * 60_000), NOW, 'es');
    expect(es).toBe(
      new Intl.RelativeTimeFormat('es', { style: 'narrow', numeric: 'auto' }).format(-5, 'minute'),
    );
    expect(timeAgo(at(10_000), NOW, 'es')).toBe(
      new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(0, 'second'),
    );
    const old = timeAgo(at(40 * 24 * 3600_000), NOW, 'de');
    expect(old).toBe(
      new Date(NOW - 40 * 24 * 3600_000).toLocaleDateString('de', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    );
  });
});

describe('components under another locale', () => {
  const renderIn = (locale, el) =>
    render(el, {
      wrapper: ({ children }) => createElement(IntlWrapper, { locale }, children),
    });

  it('PresencePill reads "N here now" in English', () => {
    renderIn('en', createElement(PresencePill, { count: 3 }));
    expect(screen.getByText(/here now/).textContent).toBe('3 here now');
  });

  it('WallPagination speaks Persian digits and keeps its labelled controls', () => {
    renderIn('fa', createElement(WallPagination, { page: 2, pageCount: 19, dir: 1, onPage: () => {} }));
    const digits = new Intl.NumberFormat('fa', { minimumIntegerDigits: 2 }).format(3);
    expect(screen.getByText(digits)).toBeTruthy();
    // The controls stay named, in the fa catalogue's words.
    const fa = messagesFor('fa').Guestbook.pagination;
    expect(screen.getByRole('button', { name: fa.next })).toBeTruthy();
    expect(screen.getByRole('button', { name: fa.previous })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('WallPagination English is unchanged ("PAGE 03 / 19", "Page 3 of 19")', () => {
    renderIn('en', createElement(WallPagination, { page: 2, pageCount: 19, dir: 1, onPage: () => {} }));
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('Page 3 of 19')).toBeTruthy();
  });
});
