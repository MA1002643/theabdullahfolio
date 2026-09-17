import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { freshCronSecret } from '../helpers/secrets.js';

// ── What we actually send to Search Analytics ───────────────────────────────
// Nothing pinned the OUTGOING request. Every other suite stubs `fetch` and
// inspects the response side, so the request body — the half Google validates
// and rejects — was unasserted, and a wrong field name would surface only as a
// 400 from a route that is 503 until someone configures it by hand.
//
// The field this exists for is `type`. Google's reference is explicit:
//
//   type      [Optional] Filter results to the following type: "discover",
//             "googleNews", "news", "image", "video", "web" [Default]
//   searchType    Deprecated, use `type` instead
//
// (https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
//
// `searchType` was RENAMED to `type` — that rename is what added `discover`
// and `googleNews` to the original web/image/video/news set. So the deprecated
// name is the one that breaks this call, and a review suggesting the opposite
// has it backwards. This file exists so that is settled by a failing test
// rather than by argument.

// `eval` is the baseline publish (PUBLISH_LATEST_LUA). Stubbed as "wrote" so
// the route reaches its success response — without it the handler throws on a
// missing method and answers 502, which would leave the response-shape
// assertions below reading an error body.
vi.mock('@/lib/guestbook/redisDriver', () => ({
  redis: {
    get: async () => null,
    set: async () => 'OK',
    eval: async () => 1,
  },
  redisAvailable: true,
}));

const CRON_SECRET = freshCronSecret();

/** Every Search Analytics request the route made: `{ url, body }`. */
const analyticsCalls = [];

let GET;
let realFetch;

beforeAll(async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.GSC_SERVICE_ACCOUNT_KEY = Buffer.from(
    JSON.stringify({
      client_email: 'seo-report@test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
  ).toString('base64');
  // Left unset so the route derives `sc-domain:<host>` from ORIGIN, which is
  // the encoding case worth pinning (a colon in a path segment).
  delete process.env.GSC_SITE_URL;

  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-token' }),
      };
    }
    if (target.includes('searchAnalytics/query')) {
      analyticsCalls.push({ url: target, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ rows: [] }) };
    }
    throw new Error(`unexpected fetch in test: ${target}`);
  };

  ({ GET } = await import('@/app/api/seo-report/route'));

  await GET(
    new Request('http://localhost/api/seo-report', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('the Search Analytics request body', () => {
  it('made one request per dimension', () => {
    // Guards the whole file: if the route stopped calling, every assertion
    // below would vacuously pass over an empty array.
    expect(analyticsCalls).toHaveLength(3);
    expect(analyticsCalls.map((call) => call.body.dimensions)).toEqual([
      ['query'],
      ['page'],
      ['country'],
    ]);
  });

  it('selects the web surface with `type`, the documented field', () => {
    for (const { body } of analyticsCalls) {
      expect(body.type, 'the current field name per the API reference').toBe(
        'web',
      );
    }
  });

  it('never sends `searchType`, which the API marks deprecated', () => {
    // The specific regression this file was written for. Renaming `type` to
    // `searchType` is a plausible-looking "fix" that would send the retired
    // name, so it is asserted as an explicit absence rather than implied by
    // the assertion above.
    for (const { body } of analyticsCalls) {
      expect(Object.keys(body)).not.toContain('searchType');
      expect(body.searchType).toBeUndefined();
    }
  });

  it('sends only fields the request body defines', () => {
    // An unknown field is rejected outright by the API ("Invalid JSON payload
    // received. Unknown name ..."), so the whole key set is worth pinning, not
    // just the one under review.
    const allowed = [
      'startDate',
      'endDate',
      'dimensions',
      'rowLimit',
      'type',
      'startRow',
      'dimensionFilterGroups',
      'aggregationType',
      'dataState',
    ];
    for (const { body } of analyticsCalls) {
      for (const key of Object.keys(body)) {
        expect(allowed, `unknown request field "${key}"`).toContain(key);
      }
    }
  });

  it('asks for a closed window that ends short of today', () => {
    // GSC lags ~2 days and the most recent days are incomplete, so a window
    // ending today shows a cliff that reads as a traffic collapse.
    for (const { body } of analyticsCalls) {
      expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(body.startDate) < new Date(body.endDate)).toBe(true);
      expect(new Date(body.endDate) < new Date()).toBe(true);
    }
  });

  it('asks for exactly 28 days, counted the way the API counts them', () => {
    // The regression: `startDate` was `LAG_DAYS + WINDOW_DAYS` days back and
    // `endDate` `LAG_DAYS` days back, which is 29 CALENDAR DAYS because Search
    // Console treats both endpoints as inclusive — the arithmetic counted the
    // gap and the API counted the days. Every total, CTR and average position
    // was computed over a day more than the runbook and the response's own
    // `window` claimed, and a 29-day figure compared against another 29-day
    // figure looks entirely consistent.
    //
    // Pinned as the INCLUSIVE count, in days, so the assertion fails for the
    // same reason a reader would object rather than restating the arithmetic
    // the route uses.
    const DAY_MS = 24 * 60 * 60 * 1000;
    for (const { body } of analyticsCalls) {
      const span =
        (Date.parse(`${body.endDate}T00:00:00Z`) -
          Date.parse(`${body.startDate}T00:00:00Z`)) /
        DAY_MS;
      expect(span + 1, 'inclusive day count of the requested window').toBe(28);
    }

    // All three dimensions must cover the SAME window, or the geographic split
    // is measured over a different period than the totals it sits beside.
    const windows = new Set(
      analyticsCalls.map(({ body }) => `${body.startDate}..${body.endDate}`),
    );
    expect(windows.size).toBe(1);
  });

  it('records the window it actually requested', async () => {
    // The off-by-one had a second copy: the snapshot's `window` was built from
    // the same expression as the request, so fixing one and not the other would
    // leave the stored/reported window disagreeing with the data — and the
    // stored window is what a later reader trusts when interpreting figures.
    const response = await GET(
      new Request('http://localhost/api/seo-report', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = await response.json();
    const requested = analyticsCalls.at(-1).body;

    expect(body.window).toEqual({
      start: requested.startDate,
      end: requested.endDate,
    });
  });

  it('keeps one window when the run crosses UTC midnight', async () => {
    // The dates were read from the clock THREE times — once per request, and
    // again for the snapshot's `window` after `Promise.all` resolved. The first
    // three land in the same synchronous tick, so they agree; the fourth is
    // separated from them by the upstream round-trip. A run that crossed UTC
    // midnight in that gap asked Google for one window and then stored a
    // different one, one day later, against the data it had just fetched.
    //
    // Nothing about the result would look wrong — the rows are real, the window
    // is a plausible window, and the disagreement is only visible by comparing
    // the request with the record nobody kept. This is the same straddle the
    // baseline publish already defends against with its compare-and-set, one
    // field over, and the offset constant's own comment names the two agreeing
    // as mattering more than the off-by-one it was written for.
    //
    // Reproduced rather than described: the clock is moved past midnight while
    // the three requests are in flight, which is exactly where the real gap is.
    // Only `Date` is faked — `toFake` — so nothing that relies on real timers
    // (the route's `AbortSignal.timeout` bounds) changes behaviour here.
    const straddleCalls = [];
    let stored = null;

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-17T23:59:59.500Z'));

      const previousFetch = globalThis.fetch;
      globalThis.fetch = async (url, init = {}) => {
        const target = String(url);
        if (target.startsWith('https://oauth2.googleapis.com/token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'test-token' }),
          };
        }
        straddleCalls.push(JSON.parse(init.body));
        // The round-trip, with the day boundary inside it. Set on every call so
        // the assertion does not depend on which of the three resolves first.
        vi.setSystemTime(new Date('2026-09-18T00:00:01.000Z'));
        return { ok: true, status: 200, json: async () => ({ rows: [] }) };
      };

      const redisModule = await import('@/lib/guestbook/redisDriver');
      const setSpy = vi
        .spyOn(redisModule.redis, 'set')
        .mockImplementation(async (_key, value) => {
          stored ??= typeof value === 'string' ? JSON.parse(value) : value;
          return 'OK';
        });

      const response = await GET(
        new Request('http://localhost/api/seo-report', {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        }),
      );
      const body = await response.json();

      globalThis.fetch = previousFetch;
      setSpy.mockRestore();

      expect(straddleCalls).toHaveLength(3);
      // Every request on the pre-midnight window, as before — this half was
      // never broken, and asserting it keeps the case honest about what moved.
      for (const requested of straddleCalls) {
        expect(requested.startDate).toBe(straddleCalls[0].startDate);
        expect(requested.endDate).toBe(straddleCalls[0].endDate);
      }
      expect(straddleCalls[0].endDate).toBe('2026-09-14');

      // The half that was: the window REPORTED and the window STORED must both
      // be the one the data was actually fetched for, not the one the clock
      // happened to show by the time the rows came back.
      const asked = {
        start: straddleCalls[0].startDate,
        end: straddleCalls[0].endDate,
      };
      expect(body.window).toEqual(asked);
      expect(stored, 'the snapshot should have been written').toBeTruthy();
      expect(stored.window).toEqual(asked);
    } finally {
      vi.useRealTimers();
    }
  });

  it('percent-encodes the property identifier into the path', () => {
    // `sc-domain:ma.codes` carries a colon, and a URL-prefix property carries
    // slashes — both would otherwise be read as path structure.
    for (const { url } of analyticsCalls) {
      expect(url).toContain('sc-domain%3A');
      expect(url).not.toContain('sc-domain:');
    }
  });
});
