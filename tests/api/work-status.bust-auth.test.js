import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshCronSecret } from '../helpers/secrets.js';

// The privileged cache-bust on GET /api/work-status (issue #92, L4).
//
// `?bust=1` forces a fresh GitHub (and optionally OpenAI) round-trip, so it is
// gated on CRON_SECRET. Until 2026-09-28 that gate was the one CRON_SECRET check
// in the codebase written as a plain `===`, not the shared constant-time
// compare; tests/fitness/apiSurface.test.js pins the SHAPE of the fix, and this
// suite pins its BEHAVIOUR. Every case here must be refused before the route
// does any outbound work: the shared MSW server fails the suite on any request
// it was not told to expect, and none is registered.

const SECRET = freshCronSecret();
const bust = (authorization) =>
  new Request('https://ma.codes/api/work-status?bust=1', {
    headers: authorization === undefined ? {} : { authorization },
  });

let saved;
beforeEach(() => {
  saved = process.env.CRON_SECRET;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
  vi.restoreAllMocks();
});

async function loadRoute(secret) {
  if (secret) process.env.CRON_SECRET = secret;
  else delete process.env.CRON_SECRET;
  vi.resetModules();
  return import('@/app/api/work-status/route');
}

describe('work-status ?bust=1 authorisation', () => {
  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['the secret without the scheme', SECRET],
    ['a wrong secret of the same length', `Bearer ${'0'.repeat(SECRET.length)}`],
    ['a PREFIX of the secret', `Bearer ${SECRET.slice(0, -1)}`],
    ['the secret plus a suffix', `Bearer ${SECRET}x`],
    ['a lower-case scheme', `bearer ${SECRET}`],
  ])('refuses %s with 401, before any outbound call', async (_label, header) => {
    const { GET } = await loadRoute(SECRET);
    const res = await GET(bust(header));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized cache bust' });
  });

  it('refuses "Bearer undefined" when CRON_SECRET is unset (fail closed)', async () => {
    const { GET } = await loadRoute(null);
    expect((await GET(bust('Bearer undefined'))).status).toBe(401);
    expect((await GET(bust('Bearer '))).status).toBe(401);
  });
});
