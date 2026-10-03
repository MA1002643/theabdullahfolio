// Network sandbox for the Playwright test server (issue #92). Preloaded with
// `node --require` via NODE_OPTIONS in playwright.config.mjs, so it runs before
// Next boots and wraps the one outbound HTTP API every route here uses: fetch.
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

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
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
