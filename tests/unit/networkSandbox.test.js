import { createRequire } from 'node:module';
import net from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The Playwright test server's network sandbox (tests/support/network-sandbox.cjs),
// which refuses any outbound connection to a host other than this machine.
//
// Loading it patches `fetch` and `net.Socket#connect` for the whole process,
// as `--require` does on the test server, so both are saved first and put
// back afterwards. Its once-only guards are cleared too, so a later load in
// the same worker installs it again rather than finding it "already there".

const require = createRequire(import.meta.url);
const realConnect = net.Socket.prototype.connect;
const realFetch = globalThis.fetch;
let isLocalHost;

beforeAll(() => {
  ({ isLocalHost } = require('../support/network-sandbox.cjs'));
});

afterAll(() => {
  net.Socket.prototype.connect = realConnect;
  globalThis.fetch = realFetch;
  delete globalThis.__e2eNetworkSandbox;
  delete globalThis.__e2eSocketSandbox;
});

describe('isLocalHost', () => {
  it.each(['localhost', '127.0.0.1', '127.0.0.2', '127.255.255.254', '::1', '[::1]', '0.0.0.0'])('allows %s', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  // A `127.` prefix used to be enough, so a DNS name that starts with it
  // reached the real connect and could resolve to a public address.
  it.each(['127.example.com', '127.0.0.1.nip.io', '127.attacker.test', 'smtp.gmail.com', '128.0.0.1', '10.0.0.1'])(
    'refuses %s',
    (host) => {
      expect(isLocalHost(host)).toBe(false);
    },
  );
});

describe('the socket sandbox', () => {
  it('refuses a 127.-prefixed DNS name before resolving it', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const error = await new Promise((resolve) => {
        net.connect(25, '127.example.com').on('error', resolve);
      });
      expect(error.code).toBe('ECONNREFUSED');
      // The sandbox's own refusal, not a DNS failure (ENOTFOUND) or a real one.
      expect(error.message).toContain('e2e network sandbox');
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('blocked outbound connection to 127.example.com'));
    } finally {
      stderr.mockRestore();
    }
  });
});
