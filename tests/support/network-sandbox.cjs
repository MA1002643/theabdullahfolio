// Network sandbox for the Playwright test server (issue #92). Preloaded with
// `node --require` via NODE_OPTIONS in playwright.config.mjs, so it runs before
// Next boots and wraps the one outbound HTTP API every route here uses: fetch.
// It also guards the layer below fetch, raw TCP (second half of this file),
// because one route does not use fetch at all: /api/send-mail speaks SMTP
// through nodemailer, straight over net/tls.
//
// Any request to a host other than this machine is REFUSED with the same error
// shape a real network failure produces (a TypeError, as undici throws), and
// one line goes to stderr naming the origin. The routes already treat that
// shape as "upstream down" and serve their fallbacks, so the pages under test
// see exactly what they would see if GitHub were unreachable, and the log
// shows which feature tried.
//
// Why a sandbox and not just blank credentials: blank credentials make routes
// SKIP most calls, by their own choice. A route that forgot to check, or a
// dependency that phones home, would still reach the internet from CI, and a
// spec could quietly come to depend on that call succeeding. Here it cannot.
//
// CommonJS on purpose: `--require` loads CJS, and this file must work before
// any ESM loader exists in the process.

'use strict';

const net = require('node:net');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

// This machine: a named local host, or any 127/8 address, but only as an IPv4
// LITERAL. A bare `127.` prefix also passed DNS names such as
// `127.example.com`, which the real connect would resolve, possibly to a
// public address (code review).
function isLocalHost(host) {
  return LOCAL_HOSTS.has(host) || (net.isIPv4(host) && host.startsWith('127.'));
}
const realFetch = globalThis.fetch;

if (typeof realFetch === 'function' && !globalThis.__e2eNetworkSandbox) {
  globalThis.__e2eNetworkSandbox = true;
  globalThis.fetch = function sandboxedFetch(input, init) {
    let url;
    try {
      url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    } catch {
      // Relative or malformed: not an outbound request; let fetch decide.
      return realFetch(input, init);
    }
    if (LOCAL_HOSTS.has(url.hostname)) return realFetch(input, init);
    process.stderr.write(`[e2e network sandbox] blocked outbound fetch to ${url.origin}\n`);
    return Promise.reject(
      new TypeError('fetch failed', {
        cause: new Error(`e2e network sandbox: ${url.origin} is not reachable from the test server`),
      }),
    );
  };
}

// ── Raw TCP ─────────────────────────────────────────────────────────────────
// Wrapping fetch left every other client unrestricted, and the one that
// mattered was SMTP: playwright.config.mjs blanked the outbound credentials
// but not SMTP_* or RECEIVER_EMAIL, so an un-stubbed valid POST to
// /api/send-mail could deliver real mail from the test server (code review).
// The config now points SMTP at a dead local port; this makes it structural.
// Every TCP client in Node, nodemailer's net.connect and tls.connect among
// them, ends in net.Socket#connect, so a connection to a host other than this
// machine is refused there, with the ECONNREFUSED a real refusal carries,
// emitted asynchronously as the real one is. Unix-socket (IPC) connects pass.
if (!globalThis.__e2eSocketSandbox) {
  globalThis.__e2eSocketSandbox = true;
  const realConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function sandboxedConnect(...args) {
    // net.connect() hands over its arguments pre-normalised, as an array.
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    let host;
    if (first !== null && typeof first === 'object') {
      if (first.path) return realConnect.apply(this, args);
      host = first.host ?? 'localhost';
    } else if (typeof first === 'number' || /^\d+$/.test(String(first))) {
      host = typeof args[1] === 'string' ? args[1] : 'localhost';
    } else {
      return realConnect.apply(this, args);
    }
    if (isLocalHost(host)) return realConnect.apply(this, args);
    process.stderr.write(`[e2e network sandbox] blocked outbound connection to ${host}\n`);
    const error = Object.assign(new Error(`connect ECONNREFUSED: e2e network sandbox: ${host} is not reachable from the test server`), {
      code: 'ECONNREFUSED',
    });
    process.nextTick(() => this.destroy(error));
    return this;
  };
}

// For tests/unit/networkSandbox.test.js. Harmless under `--require`, where
// nothing reads it.
module.exports = { isLocalHost };
