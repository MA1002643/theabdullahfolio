import crypto from 'node:crypto';

import { noStoreJson, safeBearerEqual } from '../_utils/cronAuth';
import { envPositiveMs } from '../_utils/env';
import { redis } from '@/lib/guestbook/redisDriver';
import { ORIGIN } from '@/lib/seo/site';
import { ASSISTANT_REFERRERS } from '@/lib/seo/analytics';

// ── Search Console feedback loop (issue #32, W6) ────────────────────────────
// The point of this route is worth restating from the issue: the site should
// tell YOU how it is doing, rather than requiring you to remember to go and
// look. Nobody opens the Search Console UI weekly for a personal site, so a
// report that requires it is a report that never gets read.
//
// It pulls Search Analytics, stores a rolling snapshot in Upstash, and derives
// the four things that are actually actionable:
//
//   • new queries this week            — what the site is starting to rank for
//   • positions that dropped > 3       — regressions, while they are still cheap
//   • impressions with CTR < 1%        — a title/description problem, and the
//                                        cheapest win available anywhere in SEO
//   • the geographic split             — who is actually finding it
//
// ── No `googleapis` dependency, deliberately ────────────────────────────────
// The obvious implementation imports `googleapis`, which is an enormous package
// (hundreds of generated API clients) pulled in to call TWO endpoints. This repo
// already talks to GitHub's GraphQL and REST APIs with bare `fetch` and no SDK
// (/api/github-skills, /api/github-stats), so this follows that precedent: sign
// the service-account JWT with `node:crypto` — which is already a dependency of
// the bearer check below — and POST it. About forty lines, versus a dependency
// that would dominate the function bundle.
//
// ── Runtime + auth ──────────────────────────────────────────────────────────
// Node runtime, because `safeBearerEqual` and the RS256 signing both need
// `node:crypto`. Bearer-guarded with the EXISTING `safeBearerEqual` against the
// existing `CRON_SECRET` (P5) — no new secret, no new auth path.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Why this is NOT a second vercel.json cron entry ─────────────────────────
// Hobby caps cron COUNT, so a second standalone entry would silently never run —
// which is precisely why /api/daily-warmup exists at all. This route is invoked
// as a third step in that route's fan-out, and can also be called by hand with
// the bearer token. Risk §10.7.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

// ── Every upstream call is bounded ──────────────────────────────────────────
// This route is a step inside /api/daily-warmup's fan-out, and that orchestrator
// returns ONE response carrying every step's result. An unbounded fetch here is
// therefore not just this route's problem: a stalled token exchange or Search
// Console query holds daily-warmup open until the platform kills the function,
// and the work-status and repo-refresh results — already collected by then —
// are never reported. The cron fails with nothing useful in the log, which is
// the failure mode /api/repo-refresh's CRON_WARM_TIMEOUT_MS exists to prevent
// and the reason /api/work-status bounds each GraphQL query.
//
// Four calls run per invocation: one token exchange, then three analytics
// queries in parallel. At this budget the worst case is ~2 × the bound, well
// inside any platform timeout, and a failure arrives as a 502 the cron can act
// on rather than as a dead function.
const UPSTREAM_TIMEOUT_MS = envPositiveMs(
  process.env.SEO_REPORT_TIMEOUT_MS,
  10000,
);

/**
 * `fetch` that cannot outlive its budget.
 *
 * `AbortSignal.timeout` rather than the AbortController + setTimeout pair the
 * sibling cron routes hand-roll: there is no timer to leak when the request
 * settles first, and it rejects with a DOMException named `TimeoutError`
 * specifically — which is what lets the message below say "timed out" instead
 * of the bare "aborted" an AbortController produces. Same choice, same reason,
 * as /api/spotify/auth.
 *
 * @param {string} url Absolute URL.
 * @param {RequestInit} options Passed through; `signal` is supplied here.
 * @param {string} label Names the call in the error. NEVER interpolate a
 *   credential or a response body into it — this route's errors are returned
 *   to any caller holding CRON_SECRET.
 * @returns {Promise<Response>}
 */
async function fetchBounded(url, options, label) {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new Error(`${label} timed out after ${UPSTREAM_TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

// Upstash keys, namespaced under `seo:` so they are obvious next to the
// guestbook's keys in the same database.
const SNAPSHOT_KEY = (date) => `seo:gsc:${date}`;
const LATEST_KEY = 'seo:gsc:latest';
// 90 days, per W6's "rolling 90-day snapshot". Expressed as a TTL on each daily
// key so expiry is the database's job — a manual prune would be another thing to
// remember, and forgetting it turns a feedback loop into a storage leak.
const SNAPSHOT_TTL_SECONDS = 90 * 24 * 60 * 60;

// GSC data lags by roughly two days and the most recent days are always
// incomplete, so a window ending "today" shows a cliff that looks like a
// catastrophic traffic collapse and is purely an artefact of the lag.
const LAG_DAYS = 3;
const WINDOW_DAYS = 28;

/** `YYYY-MM-DD`, `offsetDays` before today, in UTC. */
function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

/** base64url, which is what JWS requires — not plain base64. */
const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * Decode the service-account credential from the environment.
 *
 * This is a REAL SECRET (CLAUDE.md §1, risk §10.9): its NAME lives in
 * `.env.example`, its value only in Vercel. It is read base64-encoded rather
 * than as raw JSON because a service-account key contains literal newlines
 * inside `private_key`, and every environment-variable UI mangles those
 * differently — base64 survives all of them intact.
 *
 * ABSENT AND INVALID ARE DIFFERENT ANSWERS, and collapsing them was a silent
 * failure of exactly the kind `/api/daily-warmup` was taught to catch. Both used
 * to return null, GET read every null as "not configured", and so a key that was
 * SET but unusable — a truncated paste, a re-encoded value, a rotated key
 * swapped for the wrong JSON — answered 503 `skipped`. daily-warmup honours that
 * as a deliberate opt-out, marks the step `notConfigured` and stays green: the
 * integration was broken, the cron was green, and the only symptom was a report
 * that quietly stopped arriving. That is the same blind spot the verdict fix
 * closed from the other side, re-entered through the credential reader.
 *
 * The distinction is the caller's to act on, so it is returned rather than
 * flattened. Every `reason` names the VARIABLE and the defect's shape, never any
 * part of the value — an error message is a place a secret leaks from, and this
 * route's responses are readable by anyone holding CRON_SECRET.
 *
 * @returns {{state: 'ok', credentials: {client_email: string,
 *   private_key: string}} | {state: 'absent'} | {state: 'invalid',
 *   reason: string}} What the environment holds.
 */
function readCredentials() {
  const encoded = process.env.GSC_SERVICE_ACCOUNT_KEY;
  // The one genuinely quiet case: the integration has not been set up yet, which
  // is the correct state until Search Console verification is done by hand.
  if (!encoded) return { state: 'absent' };

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return {
      state: 'invalid',
      reason: 'GSC_SERVICE_ACCOUNT_KEY is set but is not base64-encoded JSON',
    };
  }

  // Decoding is not enough: this previously returned null with NO log line at
  // all, so a well-formed JSON object of the wrong shape (someone's OAuth client
  // secret, an empty `{}`, a non-object) was the quietest failure of the three.
  // Optional chaining because `JSON.parse` happily yields a number, a string or
  // null, none of which have fields to read.
  //
  // TYPE, not just presence. A truthiness test (`!parsed?.[field]`) passes any
  // non-empty value, so `{"client_email": 42, "private_key": {}}` reached
  // `getAccessToken`, where `crypto.createSign().sign()` threw on the non-string
  // key — and that throw is caught by the handler's outer catch, which answers
  // 502. The run still failed, so nothing was silently green, but it failed as
  // "Search Console query failed" with a Node type error attached, pointing an
  // operator at an upstream outage when the actual fault was the value in their
  // own environment. A whitespace-only string did the same thing one layer
  // deeper, surfacing as an OpenSSL `DECODER routines::unsupported`.
  //
  // What this deliberately does NOT check: whether a non-empty `private_key`
  // string is actually a usable key. A garbage string still reaches the sign
  // and still comes back 502. Telling "not a key" from "a key Google rejected"
  // needs an attempted sign, and a cheap PEM-header sniff would only catch the
  // blatant case while risking a false rejection of a legitimate key format.
  // Type and emptiness are the parts that can be decided here with certainty.
  const unusable = ['client_email', 'private_key'].filter(
    (field) =>
      typeof parsed?.[field] !== 'string' || parsed[field].trim() === '',
  );
  if (unusable.length > 0) {
    return {
      state: 'invalid',
      // The schema, not the secret: WHICH field is unusable is what makes this
      // actionable, and it says nothing about what the value contains. Not
      // worded as "missing", because an absent field and a field holding the
      // wrong type are both caught here and only one of them is missing.
      reason:
        `GSC_SERVICE_ACCOUNT_KEY decoded but ${unusable.join(' and ')} ` +
        (unusable.length === 1
          ? 'must be a non-empty string'
          : 'must each be non-empty strings'),
    };
  }

  return { state: 'ok', credentials: parsed };
}

/**
 * Exchange a service-account credential for an access token.
 *
 * The two-legged OAuth flow: build and self-sign a JWT asserting who we are and
 * what we want, then trade it for a bearer token. No user consent step, which is
 * why a service account is the right credential for a cron job.
 *
 * @param {{client_email: string, private_key: string}} credentials
 * @returns {Promise<string>} An access token.
 */
async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GSC_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      // One hour is the maximum Google accepts. The token is used immediately
      // and never cached, so the lifetime is irrelevant beyond being valid.
      exp: now + 3600,
    }),
  );
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(credentials.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetchBounded(
    TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
      cache: 'no-store',
    },
    // Names the step only. The assertion in the body above is a signed
    // credential and must never reach an error message.
    'token exchange',
  );

  if (!response.ok) {
    // Status only. The body of a failed token exchange echoes parts of the
    // assertion, and this route's response is readable by anyone holding
    // CRON_SECRET.
    throw new Error(`token exchange failed (HTTP ${response.status})`);
  }
  const json = await response.json();
  if (!json.access_token) throw new Error('token exchange returned no token');
  return json.access_token;
}

/**
 * Query Search Analytics for one dimension over the report window.
 *
 * @param {string} token An access token.
 * @param {string} siteUrl The GSC property identifier.
 * @param {string[]} dimensions e.g. `['query']`.
 * @returns {Promise<Array<object>>} Rows, or an empty array.
 */
async function queryAnalytics(token, siteUrl, dimensions) {
  // The property identifier goes in the PATH, so it must be encoded —
  // `sc-domain:ma.codes` contains a colon and a URL-prefix property contains
  // slashes, both of which would otherwise be read as path structure.
  const endpoint =
    `https://searchconsole.googleapis.com/webmasters/v3/sites/` +
    `${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const response = await fetchBounded(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: isoDate(LAG_DAYS + WINDOW_DAYS),
        endDate: isoDate(LAG_DAYS),
        dimensions,
        // Plenty for a site with 21 URLs, and it spares us pagination.
        rowLimit: 1000,
        // WEB only. Discover and News are separate surfaces whose position and
        // CTR are not comparable with search, so folding them in would make
        // every derived figure below meaningless.
        type: 'web',
      }),
      cache: 'no-store',
    },
    // The dimension, not the token in the header above.
    `searchAnalytics(${dimensions.join('+')})`,
  );

  if (!response.ok) {
    throw new Error(
      `searchAnalytics(${dimensions.join('+')}) failed (HTTP ${response.status})`,
    );
  }
  const json = await response.json();
  return json.rows ?? [];
}

/**
 * Derive the actionable findings by comparing this snapshot to the previous one.
 *
 * All comparison happens HERE rather than in the GSC UI, and that is the whole
 * reason snapshots are stored: the API can only report a WINDOW, it cannot tell
 * you what changed since you last looked.
 *
 * @param {object} current This run's snapshot.
 * @param {object|null} previous The last stored snapshot, if any.
 * @returns {object} Findings.
 */
export function deriveFindings(current, previous) {
  const previousQueries = new Map(
    (previous?.queries ?? []).map((row) => [row.query, row]),
  );

  const newQueries = current.queries
    .filter((row) => !previousQueries.has(row.query))
    // Impressions-ordered: a brand-new query with one impression is noise, and
    // there are always dozens of those.
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  const droppedPositions = current.queries
    .map((row) => {
      const before = previousQueries.get(row.query);
      if (!before) return null;
      // GSC positions are "lower is better", so a POSITIVE delta is a DROP.
      // Getting this backwards would report every improvement as a regression.
      const delta = row.position - before.position;
      return delta > 3
        ? {
            query: row.query,
            from: Number(before.position.toFixed(1)),
            to: Number(row.position.toFixed(1)),
            delta: Number(delta.toFixed(1)),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.delta - a.delta);

  // Pages earning impressions that nobody clicks. A list of candidates to
  // INVESTIGATE — deliberately not a diagnosis, and the two caveats are worth
  // stating where the list is built rather than only in the runbook.
  //
  // 1. This filter says NOTHING about rank. A page at average position 40
  //    qualifies exactly like one at position 3, and below the first page a
  //    result collects few clicks however good its snippet is — so a poor
  //    position is on its own a sufficient explanation for low CTR. `position`
  //    is carried on every row below precisely so the reader can rule that out
  //    first; a low-CTR row is only a snippet story once the page ranks well.
  //    (Deliberately NOT filtered on here: a position threshold would silently
  //    drop pages from the report, and the honest split depends on the query,
  //    since an average conceals a page sitting at 4 for one term and 30 for a
  //    long tail.)
  // 2. Even then the snippet is not ours to set. Google composes it, often
  //    ignoring `<meta name="description">` in favour of a passage it picks
  //    from the page, per query; title links get rewritten too. The description
  //    is an input it may take, not the text we publish, so the move is to read
  //    the live result and then fix whichever input it was drawn from. The
  //    contract test (tests/unit/metadataContract.test.js) pins what we send,
  //    which is the half we do control.
  const lowCtrPages = current.pages
    .filter((row) => row.impressions >= 50 && row.ctr < 0.01)
    .map((row) => ({
      page: row.page,
      impressions: row.impressions,
      ctr: Number((row.ctr * 100).toFixed(2)),
      position: Number(row.position.toFixed(1)),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  return { newQueries, droppedPositions, lowCtrPages };
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('seo-report: CRON_SECRET is not set; refusing all requests');
    return noStoreJson({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (!safeBearerEqual(request.headers.get('authorization'), cronSecret)) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const credential = readCredentials();

  // 503 + `skipped` is a CONTRACT, not a convenient status code: it is the one
  // answer daily-warmup does not count against the run (`isNotConfigured`), so
  // saying it means asserting "nothing is wrong, this is not set up yet". Only
  // an absent variable may claim that.
  if (credential.state === 'absent') {
    return noStoreJson(
      { ok: false, skipped: 'GSC_SERVICE_ACCOUNT_KEY is not configured' },
      { status: 503 },
    );
  }

  // A credential that is SET but unusable is a broken configured integration,
  // and must fail the run rather than excuse it. 500 rather than 502 because
  // nothing upstream was reached or misbehaved — this is the server's own
  // configuration, the same class as the missing CRON_SECRET above, and it will
  // not fix itself by being retried tomorrow. Deliberately carries `error` and
  // NOT `skipped`: daily-warmup fails closed on everything that is not
  // 503 + `skipped`, so this counts the moment it is emitted.
  if (credential.state === 'invalid') {
    // Logged as well as returned — the response goes to whoever called the
    // route, but the reason belongs in the platform log where the cron failure
    // will be read from.
    console.error(`seo-report: ${credential.reason}`);
    return noStoreJson(
      { ok: false, error: credential.reason },
      { status: 500 },
    );
  }

  const credentials = credential.credentials;
  if (!redis) {
    return noStoreJson(
      { ok: false, skipped: 'Upstash credentials are not configured' },
      { status: 503 },
    );
  }

  // The GSC property. A Domain property is addressed `sc-domain:ma.codes`, a
  // URL-prefix property `https://ma.codes/`. Overridable because which one
  // exists is a choice made in the Search Console UI, not in this repo.
  const siteUrl =
    process.env.GSC_SITE_URL || `sc-domain:${new URL(ORIGIN).hostname}`;

  try {
    const token = await getAccessToken(credentials);

    // Independent reads, and the route is on a cron budget.
    const [queryRows, pageRows, countryRows] = await Promise.all([
      queryAnalytics(token, siteUrl, ['query']),
      queryAnalytics(token, siteUrl, ['page']),
      queryAnalytics(token, siteUrl, ['country']),
    ]);

    const snapshot = {
      capturedAt: new Date().toISOString(),
      window: {
        start: isoDate(LAG_DAYS + WINDOW_DAYS),
        end: isoDate(LAG_DAYS),
      },
      totals: queryRows.reduce(
        (acc, row) => ({
          clicks: acc.clicks + row.clicks,
          impressions: acc.impressions + row.impressions,
        }),
        { clicks: 0, impressions: 0 },
      ),
      queries: queryRows.map((row) => ({
        query: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
      pages: pageRows.map((row) => ({
        page: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
      countries: countryRows.map((row) => ({
        country: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
      })),
    };

    // Read the previous snapshot BEFORE overwriting `latest`, or the comparison
    // is against this run rather than the last one and every finding is empty.
    const previous = await redis.get(LATEST_KEY);
    const findings = deriveFindings(snapshot, previous);

    const today = isoDate(0);
    const todayKey = SNAPSHOT_KEY(today);

    // A SECOND run on the same UTC day must not become tomorrow's baseline.
    // daily-warmup fires once a day, but this route is callable by hand too —
    // that is what the bearer token is for — and an unconditional write let the
    // second run replace the day's stored snapshot with one captured hours
    // later. Tomorrow then compared against THAT, so everything that happened
    // between the two runs — the new queries, the positions that slipped — was
    // never reported by any run, silently.
    //
    // So both keys hold the FIRST snapshot of their day. The ORDER below is what
    // makes that true even when two invocations overlap:
    //
    //   1. Claim the daily key with `nx`. This is the only atomic step
    //      available, so it — not a date read a moment ago — decides which run
    //      owns the day. An earlier cut derived "is this a rerun?" from the
    //      `latest` value read at the top of the handler, which two concurrent
    //      runs both read BEFORE either had written: both concluded "not a
    //      rerun", both wrote `latest`, and the day's two keys ended up
    //      disagreeing with each other.
    //   2. Whoever loses that claim reads the snapshot that won and republishes
    //      THAT as `latest`. Losing the race is not an error — the key already
    //      holding a value is precisely what a rejected `nx` proves, so the read
    //      cannot come back empty for ordering reasons.
    //
    // Both runs therefore converge on the same pair, in either order, and
    // `latest` can no longer drift away from the daily key it is supposed to
    // mirror. It also makes the write SELF-HEALING: because `latest` is
    // rewritten on every run rather than skipped on a rerun, a `latest` left
    // stale by a half-completed earlier run is repaired by the next one.
    //
    // Deliberately NOT `SNAPSHOT_KEY(isoDate(1))` as the baseline: a single
    // missed day (a deploy window, a cron that straddles midnight) would leave
    // that key absent, and an absent baseline makes `deriveFindings` report
    // every query as new. `latest` degrades to "the last day we did capture".
    const claimedToday = await redis.set(todayKey, snapshot, {
      ex: SNAPSHOT_TTL_SECONDS,
      nx: true,
    });
    // `nx` answers 'OK' when it wrote and null when the key was already there.
    const isRerun = !claimedToday;
    const canonical = isRerun ? await redis.get(todayKey) : snapshot;

    // Guarded rather than written blind: if the daily key somehow went missing
    // between the rejected claim and this read, leaving `latest` alone keeps a
    // real (if stale) baseline, where writing null would erase it and make the
    // next run report every query as new.
    if (canonical) {
      await redis.set(LATEST_KEY, canonical);
    } else {
      console.error(
        `seo-report: ${todayKey} rejected the write but read back empty; ` +
          'leaving the baseline untouched',
      );
    }

    return noStoreJson({
      ok: true,
      storedAs: todayKey,
      // True when today's snapshot already existed, so this run did not become
      // the day's record — either it is a second run (the usual case, and the
      // findings will be near-empty because the baseline is hours old) or it
      // lost a race to an overlapping one. Said out loud because otherwise an
      // empty report reads as "the site stopped ranking" rather than "this has
      // already run today".
      rerun: isRerun,
      window: snapshot.window,
      totals: snapshot.totals,
      comparedAgainst: previous?.capturedAt ?? null,
      findings,
      // Stated in the payload rather than only in the docs, so whoever reads a
      // cron log is told why the assistant numbers are absent here rather than
      // filing it as a bug.
      note:
        'Assistant referrals are not available from Search Console, which ' +
        'reports Google Search only. Track them in GA4 once #141 lands, via ' +
        `ASSISTANT_REFERRERS: ${ASSISTANT_REFERRERS.join(', ')}`,
    });
  } catch (error) {
    console.error('seo-report: Search Console query failed:', error);
    // Message only — never the error object. A failed token exchange can carry
    // request metadata, and this response is readable by anyone with CRON_SECRET.
    return noStoreJson(
      { ok: false, error: error?.message ?? String(error) },
      { status: 502 },
    );
  }
}
