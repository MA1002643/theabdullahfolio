import { randomBytes } from 'node:crypto';

// Where test credentials come from.
//
// Several suites need SOME value in a credential env var before the code under
// test will run at all: the cron-facing routes (`/api/daily-warmup`,
// `/api/seo-report`, `/api/work-status`, `/api/repo-refresh`) refuse every
// request while `CRON_SECRET` is unset — `Bearer undefined` must never
// authenticate — and the redis driver will not believe Redis is configured
// without `KV_REST_API_TOKEN`. What a suite must not do is spell that value out.
//
// A hard-coded placeholder is still a credential literal written into the
// repository's history, and history is permanent: it survives the commit that
// removes it, in forks, clones, and the events API. CLAUDE.md §1 draws no
// exception for "just a test key" for exactly the reason this file exists — a
// checked-in literal is the one that gets copied into the next suite, then into
// a debug script, then into something pointed at a real deployment, and by then
// it is a shared password nobody remembers choosing.
//
// This is the SAME finding `playwright.config.mjs` already answers for
// `AUTH_SECRET` ("minted FRESH every time Playwright loads this config … a
// committed constant was the finding this replaces"). The unit suites had
// simply diverged from that precedent; this module is it, in the one place the
// next suite needing a credential will find it. Hex rather than that config's
// base64 for no deeper reason than where the values end up — these are spoken
// as HTTP headers, so an unpadded alphabet keeps them boring to read in a
// failure dump.
//
// Generating per run removes the artefact rather than auditing it: there is no
// string in the tree to find, reuse, or leak, and a sweep for credential shapes
// over `tests/` stays empty as suites are added. (Which is also why nothing
// here quotes the literals it replaced.)
//
// Call these once at module scope. Vitest isolates each test FILE in its own
// forked process by default, so a value is unique per suite and per run, and no
// two suites can clobber each other's `process.env`.
//
// A non-secret placeholder does NOT belong here: `KV_REST_API_URL` is pinned to
// `https://unit-test.invalid` precisely so it is readable and, under RFC 2606's
// reserved TLD, unresolvable. Randomising an address would cost that guarantee
// and protect nothing.

/**
 * A credential value for one test suite.
 *
 * Meaningless outside the process that generated it: it authenticates nothing,
 * because whatever checks it is comparing against the same env var this value
 * was just written to — or, as with the mocked Upstash client, never leaves the
 * process at all.
 *
 * Deliberately a function, not an exported constant: a constant would be one
 * value shared by every suite that imported it the moment they shared a module
 * registry (`isolate: false`, or a future pool change), quietly restoring the
 * single reusable credential this replaces.
 *
 * @param {string} [label] Prefix identifying the value in a failure dump.
 * @returns {string} A fresh, high-entropy stand-in for a real credential.
 */
export function freshSecret(label = 'test') {
  return `${label}-${randomBytes(32).toString('hex')}`;
}

/**
 * The bearer secret the cron-protected routes authenticate against.
 *
 * @returns {string} A fresh stand-in for `CRON_SECRET`.
 */
export function freshCronSecret() {
  return freshSecret('test-cron');
}
