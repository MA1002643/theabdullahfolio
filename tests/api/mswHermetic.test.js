import { createServer } from 'node:http';

import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../support/msw/server.js';

// The hermetic network is only a promise if an unstubbed request FAILS. Every
// other test in this layer relies on it: a suite that forgot a handler should
// fail by name, not reach GitHub or Abstract with whatever credential is set.
//
// The listen option behind it is a string in tests/support/msw/server.js, and
// msw 3 renamed it (`onUnhandledRequest` → `onUnhandledFrame`) while silently
// ignoring the old name. The upgrade left every test green and the guarantee
// gone. These cases check the behaviour, not the option's spelling.
//
// The target is a real server on loopback that answers 200. If the guard ever
// lets a request through, this server answers it and the first case fails. An
// unreachable host would not do: it rejects whether or not the guard works.

let upstream;
let url;

beforeAll(async () => {
  upstream = createServer((_req, res) => res.end('reached the real network'));
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${upstream.address().port}/probe`;
});

afterAll(() => new Promise((resolve) => upstream.close(resolve)));

describe('the MSW server fails a request no handler claims', () => {
  it('rejects an unstubbed fetch instead of letting it through', async () => {
    await expect(fetch(url)).rejects.toThrow();
  });

  it('still answers a request a test did stub (the guard is not blanket)', async () => {
    server.use(http.get(url, () => HttpResponse.json({ ok: true })));
    const res = await fetch(url);
    expect(await res.json()).toEqual({ ok: true });
  });
});
