import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { LOCALE_CODES } from '@/i18n/locales';
import { loadMessages, pickMessages } from '@/i18n/messages';
import { GLOBAL_NAMESPACES, ROUTE_NAMESPACES } from '@/i18n/namespaces';
import { CURATED_TOOL_COPY } from '@/lib/uses/curatedToolCopy';

// The client message budget (issue #82): what one route's
// NextIntlClientProvider receives, gzipped, per locale, stays at or under
// 8 kB. Measured through the same loadMessages → pickMessages path IntlScope
// renders, so the figure is what is actually serialised into the page.
// Locales without a full catalogue yet are measured with English filling
// the gaps, which is also what ships for them.

const BUDGET_BYTES = 8 * 1024;

// Routes allowed past the line, each with its reason. /uses server-renders a
// description for every curated stack tile (42 of them, ~2.4 kB gzipped in
// the longer locales) so the plate paints in the reader's language rather
// than English; everything else it ships is on screen at first paint too.
// Measured 2026-11-01, after the preference centre and ⌘K copy were deferred
// and the 404's copy scoped to its boundary: ru /uses 8,279 bytes, every
// other locale under 8 kB. Owner decision: /uses alone gets 9 kB, so the
// strict line holds everywhere else.
const ROUTE_BUDGET_BYTES = { '/uses': 9 * 1024 };

// Paths a page hands IntlScope beyond its route entry.
const EXTRA = { '/uses': CURATED_TOOL_COPY };

const routePaths = (route) => [
  ...GLOBAL_NAMESPACES,
  ...ROUTE_NAMESPACES[route],
  ...(EXTRA[route] ?? []),
];

describe('client message budget', () => {
  for (const locale of LOCALE_CODES) {
    it(`${locale}: every route ships ≤ 8 kB gzipped (/uses ≤ 9 kB)`, async () => {
      const messages = await loadMessages(locale);
      const sizes = Object.fromEntries(
        Object.keys(ROUTE_NAMESPACES).map((route) => [
          route,
          gzipSync(JSON.stringify(pickMessages(messages, routePaths(route)))).length,
        ]),
      );
      const over = Object.entries(sizes).filter(
        ([route, bytes]) => bytes > (ROUTE_BUDGET_BYTES[route] ?? BUDGET_BYTES),
      );
      expect(over, JSON.stringify(sizes)).toEqual([]);
    });
  }
});
