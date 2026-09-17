import { noStoreJson, safeBearerEqual } from "../_utils/cronAuth";
import { envPositiveMs } from "../_utils/env";

// Pinned to Node so `node:crypto` (transitively used by `safeBearerEqual`)
// is available — same constraint as /api/repo-refresh and /api/work-status.
export const runtime = "nodejs";

// The auth check below reads `request.headers`, which already opts this
// route out of static caching in Next 14, but pinning `force-dynamic`
// makes the intent explicit so a future refactor (e.g. moving auth into
// middleware) can't silently restore static eligibility.
export const dynamic = "force-dynamic";

// ── Why this route has a wall-clock budget of its own ───────────────────────
// Every downstream bounds ITSELF, and for a while that was mistaken for the
// orchestrator being bounded. It is not, because those budgets ADD UP while the
// steps run one after another:
//
//   /api/work-status    ~10 s  — portfolio (10 s) and boards (6 s) concurrently
//   /api/repo-refresh   ~30 s  — TWO warm fetches, each CRON_WARM_TIMEOUT_MS (15 s)
//   /api/seo-report     ~20 s  — token exchange, then 3 queries, each 10 s
//
// Sixty seconds of legitimate, in-budget work, against a function limit that
// this route now declares for itself (`maxDuration` below) rather than inheriting
// from whatever the account's default happens to be. A slow-but-healthy night
// got the function KILLED — no body, no per-step results, no verdict for cron
// monitoring to read, and the collected results thrown away at the moment they
// were most worth having. Adding the seo-report step is what pushed it over; the
// shape was already there.
//
// Two fixes, and both are needed — the second is not redundant:
//
//   1. The three steps run CONCURRENTLY (they share nothing: separate handlers,
//      separate caches, and `revalidateTag` targets that do not overlap). Worst
//      case becomes the SLOWEST step, ~30 s, not the sum.
//   2. One shared deadline bounds the run regardless. Concurrency alone cannot
//      do that: `callInternal` previously passed no `AbortSignal` at all, so a
//      downstream exceeding its OWN budget — a cold start, a hung body read, a
//      platform stall — hung this route with no bound whatsoever. Their budgets
//      are promises they make to themselves, not guarantees to their caller.
//
// Because the steps are concurrent, ONE `AbortSignal.timeout` shared by all
// three IS the overall deadline — no per-call arithmetic, and no way for the
// per-step budgets to drift out of step with the total.
//
// ── The ceiling this budget is measured against, declared rather than assumed ─
// A wall-clock budget is only a bound if it expires BEFORE the platform kills
// the function, and that made the previous default a bet on an unstated fact.
// It was 45 s against a "60 s, lower on smaller plans" comment, in a repository
// whose four other GitHub routes size themselves to 9 s because they assume a
// 10 s Hobby ceiling. Under the smaller of its own two claims the signal could
// not fire at all: the function would be terminated at 10 s with no body, no
// per-step results and no verdict — exactly the outcome this budget exists to
// prevent, reintroduced by the number chosen to prevent it.
//
// So the duration is now DECLARED. `maxDuration` is the route-segment config
// Vercel reads at deploy time, which turns a plan mismatch into a deployment
// error instead of a 01:00 kill, and gives the budget below something real to
// be a fraction of. (The 9 s budgets elsewhere are not wrong — a route that
// declares nothing takes the account's default, and those were written against
// the older, smaller one. Verify the account's ceiling in the Vercel project
// settings before raising this.)
export const maxDuration = 60;

// 75% of the declared duration, expressed as arithmetic so the two cannot drift
// apart in a later edit. The remaining quarter is the margin the response
// itself needs: aborting the steps is not the end of the work, it is the point
// at which this route still has to key the results, log, and serialise a body a
// cron monitor can read.
//
// That leaves real headroom over the ~30 s worst case of three concurrent cold
// starts, which is what the budget is for — returning the results we DID
// collect, with a 502 the monitor can see, rather than being killed holding
// them.
const RUN_BUDGET_CEILING_MS = maxDuration * 1000 * 0.75;

// ── The env override can lower this, never raise it ─────────────────────────
// Deriving the DEFAULT from `maxDuration` closed the drift between the budget
// and the ceiling it is measured against — but only for deployments that leave
// the knob alone. `envPositiveMs` accepts any finite positive number, so
// `CRON_RUN_BUDGET_MS=120000` reinstated exactly the failure the paragraph
// above describes: a deadline that cannot expire before the platform kills the
// function, which is no deadline at all, with the collected results discarded
// at 60 s.
//
// Nor is that a different hazard from the one already defended against.
// `envPositiveMs` refuses `Infinity` precisely because it would switch the
// bound off — and any value at or past the ceiling switches it off just as
// completely, so the guard was rejecting the SYMBOLIC way to disable the budget
// while accepting every numeric one.
//
// Clamped rather than rejected because module scope has no good failure mode:
// throwing takes the cron down over a tuning knob, and falling back to the
// default would silently overrule an operator who meant to lower it. `Math.min`
// leaves the knob doing the one thing it is for — making the run give up
// SOONER, which is what exercising the breach path needs — while keeping the
// platform-derived margin out of reach of an env var. A value above the ceiling
// therefore takes effect AS the ceiling; this comment is its documentation,
// since the knob is deliberately absent from `.env.example` alongside
// `CRON_WARM_TIMEOUT_MS` and `SEO_REPORT_TIMEOUT_MS`.
// `Math.round` on the OUTSIDE, and it is not a duplicate of the one inside
// `envPositiveMs`. That one normalises what came from the environment; the
// `Math.min` here introduces a second operand the helper never saw, and
// `RUN_BUDGET_CEILING_MS` is arithmetic over a fraction that is meant to be
// edited (the comment above invites exactly that). At 0.75 of 60 000 it lands on
// a whole millisecond, but a fraction with more places would not, and the
// ceiling WINS the `Math.min` in the ordinary case — so the fractional value
// would be the one reaching `AbortSignal.timeout`, which rejects it outright
// with `ERR_OUT_OF_RANGE`. Created inside the handler, so that throw is the cron
// dying with no body and no per-step results.
const RUN_BUDGET_MS = Math.round(
  Math.min(
    envPositiveMs(process.env.CRON_RUN_BUDGET_MS, RUN_BUDGET_CEILING_MS),
    RUN_BUDGET_CEILING_MS,
  ),
);

// Aborting does not stop the downstream — that function keeps running and its
// warm still lands. It only stops US waiting, which is the right trade for a
// warming cron: the work completes either way, and the verdict gets reported.

// Hit a downstream cron endpoint with the bearer token the upstream Vercel
// Cron caller gave us. Each downstream already handles its own cache-
// busting internally (work-status uses ?bust=1 as a handler signal,
// repo-refresh appends a timestamp to its warm fetch), so this layer just
// forwards auth and reports the outcome. Returns `{ ok, status, detail }`
// so the orchestrator can include per-step results in the response.
async function callInternal(baseUrl, path, cronSecret, signal) {
  const res = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    signal,
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Cache-Control": "no-cache",
    },
  });
  let detail = null;
  try {
    detail = await res.text();
  } catch (err) {
    // A DEADLINE BREACH HERE MUST NOT BE SWALLOWED. `fetch` resolves as soon as
    // the response HEADERS arrive, so a downstream can answer 200 and then stall
    // streaming its body — at which point the shared signal aborts this read,
    // not the request. Catching that and carrying on returned `ok: res.ok`,
    // which is TRUE: the step reported success, `allSettled` recorded it
    // fulfilled, and the run could answer an all-green 200 after its own
    // deadline had already expired. A false green is the one outcome this
    // orchestrator exists to prevent, and it is the worst one, because the cron
    // monitor reads the verdict and nothing else.
    //
    // Re-thrown as the signal's own `reason` rather than the body error: an
    // aborted body read surfaces differently across runtimes (`AbortError`, or
    // a `TypeError` wrapping it), while `AbortSignal.timeout`'s reason is always
    // a `TimeoutError`. Throwing it keeps the step classified as a budget breach
    // by the same check a request-level abort takes.
    if (signal?.aborted) throw signal.reason ?? err;
    // Anything else really is just an unreadable body on an otherwise complete
    // response. The status stands and `detail` stays null — `isNotConfigured`
    // already fails closed on a missing body, so a step that needed one to
    // excuse itself counts against the run rather than being forgiven.
  }
  // A 2xx is not a verdict on its own. `/api/repo-refresh` warms TWO caches and
  // deliberately answers 200 when only the experience-summary half failed — a
  // best-effort semantic it documents, and the right one for it, since a
  // non-2xx there is a retry/alert signal about a warm that will refill on the
  // next visitor anyway. But this route read nothing except `res.ok`, so that
  // half-failure arrived as an all-green cron: the body said `ok: false` and
  // nobody looked. The monitor reads the verdict and nothing else, so a step
  // whose own body reports failure must not count as success here.
  const reportedFailure = bodyReportsFailure(detail);
  return {
    ok: res.ok && !reportedFailure,
    status: res.status,
    detail,
    // Marked, not merely folded in, so an operator can tell a step that
    // answered 502 from one that answered 200 and then said it had failed.
    ...(reportedFailure && { bodyReportedFailure: true }),
  };
}

// Did a downstream's own body say it failed?
//
// Only an explicit `ok: false` counts. Fails OPEN — the opposite of
// `isNotConfigured` below, and deliberately: that function answers "may this
// step be excused?", where an ambiguous answer must not excuse anything, while
// this one answers "did the step admit failure?", where inventing an admission
// from a body that says nothing (`/api/work-status` returns no `ok` field at
// all) would turn every healthy run red.
function bodyReportsFailure(detail) {
  if (typeof detail !== "string" || detail.length === 0) return false;
  try {
    return JSON.parse(detail)?.ok === false;
  } catch {
    // Not JSON. The status is the only verdict available, and it stands.
    return false;
  }
}

// Did a downstream answer "I am not configured yet" rather than "I failed"?
//
// `/api/seo-report` is the only step that can say this, and it says it exactly
// one way: HTTP 503 with a `skipped` reason in the body. That is its contract
// with this route — 503 + `skipped` means an integration has not been set up,
// every other non-2xx means something broke.
//
// Fails CLOSED, deliberately. An unreadable body, a 503 with no reason, a 502,
// a 401, a thrown fetch — all read as NOT-skipped and therefore count against
// the run. Treating an ambiguous answer as "skipped" would rebuild the exact
// blind spot this function exists to close.
// `ok: false` is required as well as `skipped`, because the excused answer is a
// SHAPE and half of it was going unchecked: /api/seo-report emits
// `{ ok: false, skipped: '…' }`, and a 503 body that carries a `skipped` string
// without it is something else wearing the contract's clothes — a proxy, an
// error envelope, a future handler reusing the word.
//
// What this does NOT do, said plainly so nobody reads more into it: it still
// excuses ANY reason string. Pinning the exact prose was considered and
// rejected — it would couple this route's green/red to a sentence in another
// file, so rewording that sentence would start counting a legitimately
// unconfigured step against the run, which is the alarm-fatigue failure the
// exclusion exists to prevent. Making it airtight needs a stable machine
// discriminator (a `code`, not a message) on both sides; today the invariant
// "only one condition claims `skipped`" is held by the downstream's own tests.
function isNotConfigured(result) {
  if (result?.status !== 503) return false;
  try {
    const body = JSON.parse(result.detail);
    return body?.ok === false && typeof body?.skipped === "string";
  } catch {
    // Not JSON, or no body at all. That is not a configuration message.
    return false;
  }
}

// Consolidated daily cron — replaces the prior `/api/work-status?bust=1`
// cron entry in vercel.json, now wrapping the work-status bust, the
// repo-refresh warm-up and the Search Console snapshot under a single
// schedule. Consolidation is driven by Hobby's per-day cron-count cap: a
// second standalone cron would silently never run on Hobby.
//
// The steps run CONCURRENTLY under one shared deadline. An earlier note here
// said "daily cadence makes parallelism moot" — true of throughput, and it was
// never the question: the three budgets summed to the platform's own function
// limit, so serial execution risked the run being killed with its results
// uncollected. See RUN_BUDGET_MS above.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "daily-warmup: CRON_SECRET is not set; refusing all requests",
    );
    return noStoreJson({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!safeBearerEqual(request.headers.get("authorization"), cronSecret)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  // Same base-URL resolution pattern as /api/repo-refresh: server-only
  // `BASE_URL` overrides the auto-injected VERCEL_URL; trailing-slash
  // normalization prevents `//api/...` paths that some CDNs reject.
  const baseUrl = (
    process.env.BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  ).replace(/\/+$/, "");

  // The three steps, in the order their results are reported. `seoReport` is the
  // Search Console snapshot (issue #32, W6); it belongs HERE rather than in its
  // own `vercel.json` cron entry for exactly the reason this route exists —
  // Hobby caps cron count, so a second standalone entry would silently never run
  // (risk §10.7). That cap is also why the budget above matters: there is one
  // cron, so a run that gets killed takes every step down with it.
  const STEPS = [
    ["workStatus", "/api/work-status?bust=1"],
    ["repoRefresh", "/api/repo-refresh"],
    ["seoReport", "/api/seo-report"],
  ];

  // One signal for all three. Started HERE rather than at module scope so the
  // budget is per-invocation — a module-level timer would begin at cold start
  // and hand a warm instance an already-expired deadline.
  const runSignal = AbortSignal.timeout(RUN_BUDGET_MS);

  // `allSettled`, not `all`: one step failing must not cancel the others, which
  // is the property the three separate try/catches used to provide. The steps
  // are independent, so a failure anywhere still leaves the rest worth running
  // and worth reporting.
  const settled = await Promise.allSettled(
    STEPS.map(([, path]) => callInternal(baseUrl, path, cronSecret, runSignal)),
  );

  // Logs now interleave, which sequential ordering used to avoid. Accepted:
  // each line names its own step, and readable logs are not worth a killed
  // function. Results are keyed back in declaration order regardless, so the
  // response body reads the same as it always did.
  const results = {};
  settled.forEach((outcome, index) => {
    const [key] = STEPS[index];
    if (outcome.status === "fulfilled") {
      results[key] = outcome.value;
      return;
    }
    // `AbortSignal.timeout` rejects with `TimeoutError`; an explicit abort would
    // be `AbortError`. Both mean the same thing here — we stopped waiting — and
    // both are recorded as such so a budget breach is not misread as a
    // downstream fault by whoever reads the log at 01:00.
    const err = outcome.reason;
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    console.error(
      `daily-warmup: ${key} ${
        timedOut
          ? `exceeded the ${RUN_BUDGET_MS}ms run budget`
          : "failed"
      }:`,
      err,
    );
    // The response carries a VERDICT; the log carries the diagnosis. `err.message`
    // on this path is always transport internals — a rejected `fetch` is a DNS
    // failure, an `ECONNREFUSED` naming the resolved internal host and port, a TLS
    // error or an abort — and this route answers to whoever holds `CRON_SECRET`,
    // not only to Vercel's scheduler. House rule: API routes return display data.
    //
    // Nothing is lost by flattening it. The distinction that changes what an
    // operator DOES is `timedOut` (tighten the budget vs. fix a downstream), and
    // that is a field of its own; the raw error is one line up in `console.error`,
    // where a 01:00 cron failure is read from anyway.
    results[key] = {
      ok: false,
      error: timedOut
        ? `Step exceeded the ${RUN_BUDGET_MS}ms run budget`
        : "Downstream request failed",
      ...(timedOut && { timedOut: true }),
    };
  });

  // 502 on partial failure so platform-level cron monitoring (which
  // typically alarms on non-2xx) catches a degraded run instead of seeing
  // a green 200 with a half-failed body.
  //
  // seo-report counts toward that verdict too, but ONLY once it is configured.
  //
  // It was previously excluded outright, for a reason that was right at the
  // time and stopped being right: it answers 503 while `GSC_SERVICE_ACCOUNT_KEY`
  // is unset, which is the correct state until Search Console verification is
  // done by hand, and alarming nightly about an unconfigured step trains
  // whoever reads the alerts to ignore them. But an UNCONDITIONAL exclusion
  // keeps paying that cost forever: with the credential in place, an expired
  // key, revoked property access, a Search Console outage or an Upstash failure
  // all answer 502 — and the run still returned a green 200 that no cron
  // monitor would ever flag. The report is only worth having if someone finds
  // out when it stops arriving.
  //
  // So the step is optional exactly while the integration is absent, and
  // load-bearing the moment it is not. `isNotConfigured` is what draws that
  // line, and it errs toward counting.
  const seoNotConfigured = isNotConfigured(results.seoReport);
  if (seoNotConfigured) {
    // Said in the body rather than left implicit, so a run that is green
    // BECAUSE a step opted out is distinguishable from one that is green
    // because every step worked.
    results.seoReport.notConfigured = true;
  }

  const allOk = Boolean(
    results.workStatus?.ok &&
      results.repoRefresh?.ok &&
      (results.seoReport?.ok || seoNotConfigured),
  );
  return noStoreJson({ ok: allOk, results }, { status: allOk ? 200 : 502 });
}
