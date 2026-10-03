// A stateful, in-memory stand-in for the Upstash Redis client (issue #92, L4).
//
// A `vi.fn()` that returns canned values can prove a route CALLED `set`; it
// cannot prove the route is correct when two requests race, because it has no
// state for them to race over. This fake keeps real state with the semantics
// the routes depend on:
//
//   • `set(key, value, { nx, ex })` is ATOMIC: the check and the write happen
//     in one synchronous step, exactly as SET NX is atomic on the server. The
//     promise then resolves on a later macrotask, so two concurrent callers
//     genuinely interleave around it, the way two serverless invocations do.
//   • `ex` is recorded (not enforced), so a test can assert the TTL a route
//     chose without waiting for it to lapse.
//   • `handle.fail(method)` makes the next call(s) to that method reject, which
//     drives the fail-open paths.
//
// Only the commands the routes under test use are implemented. Anything else
// throws, so a route that starts using a new command fails loudly here instead
// of silently receiving `undefined`.

/** @returns {{ client: object, handle: object }} the fake and its test-side view. */
export function createFakeRedis() {
  const store = new Map();
  const ttl = new Map();
  const calls = [];
  const failures = new Map();

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const maybeFail = (method) => {
    const remaining = failures.get(method);
    if (!remaining) return;
    failures.set(method, remaining - 1);
    throw Object.assign(new Error(`fake redis: ${method} unavailable`), { name: 'UpstashError' });
  };

  const commands = {
    async set(key, value, opts = {}) {
      calls.push(['set', key, value, opts]);
      maybeFail('set');
      let result = null;
      if (!(opts.nx && store.has(key))) {
        store.set(key, value);
        if (opts.ex) ttl.set(key, opts.ex);
        result = 'OK';
      }
      await settle();
      return result;
    },
    async get(key) {
      calls.push(['get', key]);
      maybeFail('get');
      await settle();
      return store.has(key) ? store.get(key) : null;
    },
    async del(key) {
      calls.push(['del', key]);
      maybeFail('del');
      const existed = store.delete(key);
      ttl.delete(key);
      await settle();
      return existed ? 1 : 0;
    },
  };

  const client = new Proxy(commands, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined; // never mistaken for a thenable
      return () => {
        throw new Error(`fake redis: command "${String(prop)}" is not implemented`);
      };
    },
  });

  const handle = {
    store,
    ttl,
    calls,
    fail(method, times = 1) {
      failures.set(method, times);
    },
    reset() {
      store.clear();
      ttl.clear();
      calls.length = 0;
      failures.clear();
    },
  };

  return { client, handle };
}
