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

vi.mock('@/lib/guestbook/redisDriver', () => ({
  redis: { get: async () => null, set: async () => 'OK' },
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

  it('percent-encodes the property identifier into the path', () => {
    // `sc-domain:ma.codes` carries a colon, and a URL-prefix property carries
    // slashes — both would otherwise be read as path structure.
    for (const { url } of analyticsCalls) {
      expect(url).toContain('sc-domain%3A');
      expect(url).not.toContain('sc-domain:');
    }
  });
});
