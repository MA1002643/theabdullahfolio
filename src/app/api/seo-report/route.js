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
 * @returns {{client_email: string, private_key: string}|null} Credentials, or
 *   null when absent or undecodable.
 */
function readCredentials() {
  const encoded = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    // Says nothing about the VALUE — only that it did not decode. An error
    // message is a place a secret can leak from.
    console.error(
      'seo-report: GSC_SERVICE_ACCOUNT_KEY is set but is not base64-encoded JSON',
    );
    return null;
  }
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

  // Pages earning impressions that nobody clicks. The cheapest win in SEO: the
  // page already ranks, so the only thing failing is the snippet — and the
  // snippet is entirely within our control, and now contract-tested
  // (tests/unit/metadataContract.test.js).
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

  const credentials = readCredentials();
  // 503, not 500: the route is fine, the credential is absent. Distinguishing
  // them matters because daily-warmup reports this verbatim, and "not configured
  // yet" is a different morning from "the integration broke".
  if (!credentials) {
    return noStoreJson(
      { ok: false, skipped: 'GSC_SERVICE_ACCOUNT_KEY is not configured' },
      { status: 503 },
    );
  }
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
    // A SECOND run on the same UTC day must not become tomorrow's baseline.
    // daily-warmup fires once a day, but this route is callable by hand too —
    // that is what the bearer token is for — and an unconditional write let the
    // second run replace the day's stored snapshot with one captured hours
    // later. Tomorrow then compared against THAT, so everything that happened
    // between the two runs — the new queries, the positions that slipped — was
    // never reported by any run, silently.
    //
    // So both keys hold the FIRST snapshot of their day: `nx` refuses to
    // overwrite the daily key, and `latest` is left alone once it already holds
    // a capture from today. Comparing the dates is safe because both sides are
    // UTC — `capturedAt` is an ISO string and `isoDate` builds from UTC parts.
    //
    // Deliberately NOT `SNAPSHOT_KEY(isoDate(1))` as the baseline: a single
    // missed day (a deploy window, a cron that straddles midnight) would leave
    // that key absent, and an absent baseline makes `deriveFindings` report
    // every query as new. `latest` degrades to "the last day we did capture".
    const isRerun = previous?.capturedAt?.slice(0, 10) === today;
    await Promise.all([
      redis.set(SNAPSHOT_KEY(today), snapshot, {
        ex: SNAPSHOT_TTL_SECONDS,
        nx: true,
      }),
      ...(isRerun ? [] : [redis.set(LATEST_KEY, snapshot)]),
    ]);

    return noStoreJson({
      ok: true,
      storedAs: SNAPSHOT_KEY(today),
      // True when that key and `latest` already held a capture from today, so
      // this run stored nothing and compared against hours-old data. Said out
      // loud because the findings will be near-empty and, without this, an
      // empty report reads as "the site stopped ranking" rather than "you have
      // run this twice today".
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
