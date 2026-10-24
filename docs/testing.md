# How this site is tested

Every layer of testing behind this site, from static analysis to mutation
testing: the question each answers, why it exists, and how to run and debug it.

Every layer answers a question the others cannot, and each one had to earn its
place the same way: by catching a real defect in this codebase before it
counted as done. Those defects, and what fixed each one, are listed at the end
of this document. Every command below is the one CI runs, so if it passes
locally it passes in CI. The plan this implements is issue #92 in the
repository.

## The layers

| Layer | Question it answers | Tool | Where | Command |
|---|---|---|---|---|
| L1 Static | Does the code follow the rules we can check without running it? | ESLint + full `jsx-a11y` | `.eslintrc.json` | `npm run lint` |
| L1 Fitness | Does the *architecture* still hold? | Vitest | `tests/fitness/` | `npm run test:fitness` |
| L2 Unit | Does each module do what it says? | Vitest | `tests/unit/` | `npm run test:unit` |
| L2 Property | Does it hold for *every* input, not just the ones we thought of? | fast-check | `tests/property/` | `npm run test:property` |
| L3 Component | Does the UI behave, driven the way a person drives it? | Testing Library + user-event + MSW, jsdom | `tests/component/` | `npm run test:component` |
| L4 API | Does each route handler behave, including when its dependencies fail? | Vitest + MSW + a stateful fake Redis | `tests/api/` | `npm run test:api` |
| L5 E2E | Do real journeys work in real browsers? | Playwright (Chromium, WebKit, Firefox, Pixel 7, iPhone 14) | `tests/e2e/` | `npm run test:e2e` |
| L6 A11y | Can everyone use it? | axe-core (WCAG 2.2 AA), keyboard traversal, motion audit | `tests/a11y/` | `npm run test:a11y` |
| L7 Visual | Does it still look right? | Playwright screenshots, Linux-rendered | `tests/visual/` | `npm run test:visual` |
| L8 Perf | Is it still fast and stable? | PerformanceObserver (CLS/LCP), bundle budget, Lighthouse CI | `tests/perf/`, `scripts/check-bundle-budget.mjs` | `npm run test:perf`, `npm run test:bundle` |
| L9 Security | Is it hard to attack, and do secrets stay secret? | Header and API-hardening specs, client-bundle scan, CodeQL, OSV, Gitleaks, audit gate | `tests/security/`, `scripts/scan-client-bundle.mjs`, `security.yml` | `npm run test:security`, `npm run test:audit` |
| L10 Meta | Are the tests themselves any good? | V8 coverage, Stryker mutation testing, flake burn-in | `vitest.config.mjs`, `stryker.config.mjs`, `ci.yml` | `npm run test:coverage`, `npm run test:mutation` |

`npm run test:all` runs the whole PR gate locally: lint, every Vitest project
with coverage, a production build, the bundle checks, then the browser layers.

## Principles

1. **The pyramid is honoured.** Well over a thousand fast Vitest tests, fewer DOM
   tests, a few browser journeys, a handful of screenshots.
2. **Determinism beats coverage.** The network is sealed at every layer (MSW
   fails on any unhandled request; the Playwright server runs inside a fetch
   sandbox; the browser is hermetic). Fixtures are frozen, credentials are
   minted per run, and a suite that flakes is treated as a defect.
3. **One source of truth per concern.** `tests/support/fixtures/api.js` feeds
   both the MSW handlers (Vitest) and `page.route` (Playwright). The browser
   route list is checked against the sitemap registry by a fitness test.
4. **Test behaviour, not implementation.** Components are found by role and
   label, as a screen reader would find them.
5. **No skipped tests on `main`.** `tests/fitness/testHygiene.test.js` fails on
   a committed `.only`, `.skip`, `.todo` or `fixme`.
6. **Secrets stay out, by construction.** Test credentials are random per run
   (`tests/helpers/secrets.js`, `playwright.config.mjs`), and the build output
   is scanned for any credential that reached a browser.

## Layer by layer

### L1 · Static analysis and fitness functions

ESLint runs `next/core-web-vitals` plus the full `plugin:jsx-a11y/recommended`
set. Every exception is disabled at the line, with the reason written beside
it. The one global override allows `role="list"` on `<ul>`/`<ol>`, because
Safari's VoiceOver drops list semantics from a list styled `list-style: none`
unless the role is restated.

Fitness functions read the source tree and enforce architectural rules no
unit test would think to check:

| Suite | Rule |
|---|---|
| `envHygiene` | Every `process.env.X` is documented in `.env.example`; no credential is `NEXT_PUBLIC_`, read from a `"use client"` module, or given a literal fallback. |
| `apiSurface` | The method map of every route is pinned; routes export only verbs and segment config; Node-only imports pin `runtime`; every request body is read through a byte ceiling; `CRON_SECRET` is compared only in constant time. |
| `contactContract` | The contact form's client limits are never looser than the server's, and both read `src/lib/contactLimits.js`. |
| `routeRegistry` | The browser suites' route list equals the sitemap registry. |
| `testHygiene` | No focused or skipped tests; every `@quarantine` links an issue. |
| `browserScripts` | Every `npm run` script that runs `playwright test` builds first; the CI JUnit reporter keeps `includeRetries`, so the run summary can name flaky tests. |
| `routeSegmentConfig` | No file under `src/app` re-exports route segment config (`dynamicParams`, `revalidate`, …) from a sibling: Next 15 reads it only from the file itself and silently applies the default otherwise. |
| `escapeOwnership` | Every source that acts on Escape claims it with `claimEscape` (`src/lib/escapeKey.js`), and the privacy notice decides only after dispatch, so one press never both closes something and declines analytics. |
| `tailwindToolchain` | The installed Tailwind major is the one `package.json` declares, and `postcss.config.js` and `src/app/globals.css` are wired the way that major expects. A major bump that changes only the version fails here, not only in `next build`, and not at all on a Vercel deploy that restores a cached `node_modules`. |

### L2 · Unit and property-based tests

The property suites generate thousands of inputs per run and shrink any
failure to a minimal counterexample. fast-check prints the seed, so a CI
failure replays locally with `fc.assert(..., { seed, path })`.

The centrepiece is `guestbookPaging.property.test.js`, a **model-based test**.
It runs random histories of posts, deletes, polls and "load older" (bursts
larger than a page, same-millisecond ties) against a model server that uses
the real paging helpers and the real cursor codec. After every step it
asserts the wall never shows a duplicate, never breaks order, and never loses
a message. It proves that under one assumption, that a new message sorts above
everything already on the wall, which the model holds by construction (its
same-millisecond ids increase). Production does not enforce it: two visitors
posting in one millisecond get random id tails, so they sort either way round.
`paging.js` records the assumption and what breaks without it.

**Soaking.** `FC_RUNS` raises every property in the layer to at least that
many runs, never fewer than its everyday count:

```bash
FC_RUNS=20000 npm run test:property
```

It reaches every suite because none of them names a raw count:
`tests/support/setup-property.js` sets fast-check's global default, and a
suite that needs more than the default uses `runs(n)` from
`tests/support/fastCheckRuns.js`. A literal `numRuns: 5000` would opt that
property out of the soak silently, so `testHygiene` fails on one. (Until
2026-10-04 only the paging test read `FC_RUNS`, so the nightly "soak" deepened
one file. The first real soak of all of them found a test bug within seconds:
see the defects table.)

### L3 · Component tests

`tests/support/setup-component.js` adds jest-dom matchers, the smallest
possible polyfills for APIs jsdom lacks, and the shared MSW server. Framer
Motion animations are skipped so a visibility assertion never depends on how
far a tween had run.

### L4 · API integration tests

Route handlers are imported and called directly. Outbound HTTP goes to MSW.
Redis is `tests/support/fakeRedis.js`, a stateful fake with an atomic
`SET NX`, so the contact route's idempotency state machine runs against real
state. Ten concurrent requests with one key produce exactly one email.

### L5 · End-to-end

Playwright boots `next start` on port 3100 with every credential blanked and
every gate secret minted at random. `NODE_OPTIONS` preloads
`tests/support/network-sandbox.cjs`, which refuses any server-side fetch to a
host other than localhost, and below fetch any TCP connection to one: the
contact route sends mail through nodemailer over raw sockets, which a fetch
wrapper never sees. Mail is also pointed at a local port nothing serves
(`SMTP_HOST=127.0.0.1`, `SMTP_PORT=1`, no account, no recipient), so an
un-stubbed send fails before it leaves; `api-hardening.spec.js` checks that.

New specs import `test` from `tests/support/test.js`, which adds:

- a **hermetic browser**: foreign origins are answered locally;
- an **error sentinel**: any uncaught exception or `console.error` fails the
  test. Expected errors are declared with `test.use({ allowedErrors })` or the
  per-test `expectErrors()` fixture;
- **WebKit on localhost**: strips the production-only
  `upgrade-insecure-requests` CSP directive, which real WebKit applies even to
  `http://localhost`.

Tags: `@cross-browser` specs run on every engine and device; everything else
runs on Chromium. PRs run `chromium` and `mobile-chrome`; the nightly run adds
`webkit`, `firefox` and `mobile-safari`.

**The image warm-up.** `chromium`, `mobile-chrome`, `a11y`, `security` and
`perf` each depend on a warm-up
project (`tests/warmup/images.setup.js`) that visits every route once, with the
same viewport and pixel ratio, before any spec runs. `a11y` has two:
`warm-desktop` for the keyboard and motion specs, and `warm-axe-desktop` at
axe's 1440×900 with reduced motion, because the viewport decides which image
width the browser asks for (`/qualifications`' cards want `w=384` at 1280 px
and `w=640` at 1440 px). The test server is a
fresh `next start`, so `/_next/image` encodes each image width on its first
request, and AVIF encoding is slow: on a 2-vCPU runner a Pixel 7's first visit
to `/qualifications` queued fifteen encodes at 11 to 43 seconds each, and the
page's `load` event missed the 60-second test limit. The retry passed against
the now-warm cache, so it looked like a flaky page when it was really a cold
cache. Production has no such queue (Vercel's image cache is shared and
persistent), so the fix warms the cache instead of loosening the specs. The
warm-up asserts nothing about the page (an HTTP error still fires `load`, and
the real specs report it), but it does require `load` to arrive: a timed-out
visit is retried once, and a second timeout fails the setup, so no suite runs
against a cache known to be cold. The warm-ups import `hermeticTest` from
`tests/support/test.js`: the same browser interception as every spec, so a
warm-up visit reaches no outside host either, without the error sentinel,
whose findings belong to the suites that depend on it.

**Debugging a failure.** CI uploads `playwright-report/` and `test-results/`
on failure, from the burn-in job too. Retries record a trace, so the burn-in
(retries off) has screenshots, video and error context but no trace:

```bash
npx playwright show-report                                      # the HTML report
npx playwright show-trace test-results/<test>/trace.zip         # step-by-step replay
npx playwright test tests/e2e/contact.spec.js --project=chromium --debug
npm run test:e2e:ui                                             # UI mode
```

To iterate against a server you started yourself (with the same environment):
`E2E_REUSE_SERVER=1 npx playwright test`.

### L6 · Accessibility

- `axe.spec.js`: every route plus the 404 page, at 1440 px and 390 px, under
  WCAG 2.0/2.1/2.2 A and AA. Full results are attached to the report.
- `keyboard.spec.js`: Tabs through every page. At each stop it *measures*
  that the element looks different focused (2.4.7), is on screen and not
  covered (2.4.11), and that focus keeps moving (2.1.2).
- `motion.spec.js`: under `prefers-reduced-motion: reduce`, nothing may loop
  forever (2.2.2): CSS and Web Animations, SMIL, looping video.

A Playwright detail that cost a run: in this version `reducedMotion` must go
inside `contextOptions`. A top-level `reducedMotion` key is silently ignored.

### L7 · Visual regression

Screenshots of the views whose look is stable (`/cv`, `/privacy`, `/notes`,
`/contact`, the 404 page), with animations off, reduced motion on and live
regions masked.

**Rendered on every push, committed back automatically.**
`.github/workflows/visual-baselines.yml` runs on each push to any branch: it
builds the site, renders every view on `ubuntu-latest` with the same Chromium
install the CI comparison job uses, and commits the images to the branch.
There are two directories, and the difference matters:

| Directory | What it is | Updated |
|---|---|---|
| `tests/visual/__latest__/` | The current render of every view, plus a `README.md` gallery saying which views differ from their baseline. Open it on GitHub to see the site as the last commit renders it. | On **every push**, automatically. |
| `tests/visual/__screenshots__/` | The **reviewed** baselines `ci.yml` compares against. | Seeded automatically the first time (which arms the layer). After that, only deliberately: run the workflow by hand with `promote: true`, or commit the PNGs in a PR. |

Baselines are not overwritten on every push because a baseline that silently
becomes whatever today's code renders could never catch a regression. The
gallery shows what changed; promoting it is the review.

Every render starts from an **empty** snapshot directory, in CI and in
`npm run test:visual:update` alike. Playwright rewrites the snapshots the
current tests reference but never deletes one whose test was removed or
renamed, so rendering over the old tree would list that orphan in the gallery
as a current view and keep it through a promotion. The local updater replaces
`tests/visual/__screenshots__/` only after its run succeeds.

**The image commit gets its own checks.** A commit pushed with the workflow's
`GITHUB_TOKEN` starts no workflows, so the image commit used to head the
branch with no CI at all, and a PR's required checks would wait on it forever.
`workflow_dispatch` is the one event that token may still raise, so after
pushing, the workflow dispatches `ci.yml` and `security.yml` on the branch, and
their checks land on the image commit. Both key their concurrency group on the
branch name, so the dispatch cancels the superseded pull_request and push runs
rather than running beside them. Not `lighthouse.yml`: the image commit changes
only PNGs, so the pages are the ones the push already audited. A render whose
only change is the gallery README's commit line is not committed, so it
dispatches nothing. It never commits to `main`: `main` only changes through a
pull request, and the merged PR already carried its latest render.

Never on a Mac: macOS rasterises glyphs differently, and Docker on Apple
silicon cannot run Chromium under amd64 emulation, which is why rendering lives
in CI. With a Linux Docker host, `npm run test:visual:update` renders locally in
the official Playwright image. The `visual` project only exists once baselines
do (`playwright.config.mjs`), so a branch without them never fails on a missing
snapshot.

### L8 · Performance

- `web-vitals.spec.js` measures CLS through load **and a full scroll** on
  every route, enforced at 0.1. It is scored as Core Web Vitals scores it:
  the largest session window (shifts under 1 s apart, at most 5 s long), not
  the sum of every shift in the page's life. LCP is recorded as an annotation only, because
  runner timing is noise.
- `scripts/check-bundle-budget.mjs` computes first-load JS per route (gzip)
  from the build manifest, against `bundle-budget.json` (measured + 10%).
  After a deliberate change, run `npm run test:bundle:update` and explain the
  new number in review.
- Lighthouse CI (`lighthouserc.json`) is unchanged: a11y, best practices and
  SEO enforced at 100 on six routes.

### L9 · Security

- `headers.spec.js` asserts the served headers on every route: CSP
  (`frame-ancestors`, `object-src`, `base-uri`, `form-action`), `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`.
- `api-hardening.spec.js` sends hostile requests over HTTP: forged and missing
  bearers, header injection, oversized and malformed bodies, anonymous writes,
  forged webhook signatures, and checks no error leaks a stack trace.
- `scripts/scan-client-bundle.mjs` scans everything a browser can download for
  the **values** of configured credentials, server-only credential **names**
  in client JS, and token **shapes** (GitHub, OpenAI, Anthropic, AWS, Slack,
  PEM). It reports variable names, never values. A value already committed
  in public source (the contact address) is reported as public by design.
- `security.yml`: CodeQL `security-extended`, OSV-Scanner (informational),
  Gitleaks over full history, and `scripts/audit-gate.mjs`.
- **OSV is informational, and looks it.** It reads the whole lockfile, dev
  tooling included, so it always lists the advisories the audit gate already
  waives. Its scan step may fail without failing the job; a notice and the run
  summary say findings exist. The audit job is the gate.
- **Gitleaks runs the CLI, not the action.** The pinned release binary
  (checksum-verified) scans every commit on every event. The marketplace
  action needed a token to list a PR's commits, then scanned only those, so on
  a pull request it was neither working nor "full history".
- **On a private repository.** GitHub code scanning is not available on a
  private personal repository, so CodeQL cannot upload alerts there. The
  workflow skips the upload while the repository is private and judges the
  SARIF itself instead: any finding with a security severity of 7.0 or more
  (high or critical) fails the job, and every finding is listed in the run
  summary. Made public, the results upload as code-scanning alerts as well.
- **Gitleaks false positives** are recorded in `.gitleaksignore`, one
  fingerprint (commit, file, rule, line) per reviewed finding, never a path or
  a rule. A real secret added to the same file later is still caught.

**The audit gate.** When it was written, `npm audit` on `main` reported 45
advisories whose fixes were all major upgrades, so a plain
`--audit-level=high` gate could never pass and would have been switched off.
(Those upgrades have since landed: sharp 0.35, then Next 15, React 19 and
nodemailer 10 on 2026-10-11, which left the production audit at zero and the
allowlist empty.)
Instead `.github/audit-allowlist.json` lists each known advisory with a
written exposure assessment and an **expiry date**. The gate fails on any new
high or critical advisory, on any expired entry, and on any entry that no
longer matches (so upgrades clean it up). Renewing an entry means re-reading
the advisory.

### L10 · Tests that test the tests

- **Coverage** (`npm run test:coverage`) is measured over the code Vitest can
  reach: utils, lib, API routes, hooks and the contact components. The
  thresholds in `vitest.config.mjs` (measured 2026-09-29: lines 58.96%,
  branches 48.68%) are a ratchet set just under the measured
  figure, so coverage can rise freely but can only fall in a reviewed diff.
- **Mutation testing** (`npm run test:mutation`, nightly) makes deliberate
  bugs in the critical modules and checks a test catches each one. Measured
  2026-09-29: **87.2%** over eight modules (79.6% on the first run, which
  exposed the two gaps the rank oracle and the contact-client suite now
  close). The `break` score of 85 in `stryker.config.mjs` is the ratchet.
- **Flake burn-in**: on every push to a branch, each browser spec *that push*
  changed runs five times with retries off (capped at 30 minutes). The range is
  the push's own `before`, from whichever run survives the concurrency group:
  the pull_request run, the branch's push run, or the screenshot commit's
  dispatch, which passes it as `burn_in_base`. A newly opened PR compares
  against `main`. Elsewhere CI retries twice and reports tests that passed on
  retry as flaky in the run summary. Two pushes in quick succession cancel the
  first run, so the first push's specs skip burn-in. That is the cost of not
  re-running every spec the PR has ever touched on each push, which took 130
  billed minutes a push on PR #160.
- **Quarantine**: a browser test tagged `@quarantine` (with its issue linked,
  enforced) is left out of every run by `grepInvert` in
  `playwright.config.mjs`, so it no longer gates a merge. The nightly
  `quarantine` job sets `PW_INCLUDE_QUARANTINE=1` and runs only the tagged
  tests, so a parked test still runs every night until it is fixed.

## CI

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every push and PR, and dispatched onto each screenshot commit | lint + the browser-test count check · Vitest + coverage · build → bundle scan + budget · E2E (chromium, mobile-chrome) · browser quality (a11y, security, perf, then visual, each with its own report and summary) · burn-in |
| `security.yml` | PRs, `main`, weekly | CodeQL · OSV · Gitleaks · audit gate |
| `nightly.yml` | daily | WebKit, Firefox, iPhone 14 · quarantined tests · mutation testing · every property at ≥ 20,000 runs |
| `lighthouse.yml` | `main`; a PR only while it carries the `lighthouse` label | Lighthouse CI budgets |
| `visual-baselines.yml` | every push (and manual, with `promote`) | render every view, commit `tests/visual/__latest__/` (and seed or promote the baselines) on any branch but `main` when a screenshot changed, then dispatch `ci.yml` and `security.yml` onto that commit |

Each job writes a Markdown section to the run summary
(`scripts/test-summary.mjs`). A job that runs Playwright twice gives the second
run its own JUnit file, HTML report and output directory
(`PLAYWRIGHT_JUNIT_FILE`, `PLAYWRIGHT_HTML_OUTPUT_DIR`, `--output`): Playwright
empties its output directory when it starts, so sharing one meant the visual
run replaced the a11y/security/perf report and discarded its traces.

**Both test counts `/uses` publishes** come from the runners' own collected
lists, not from reading the test files: `npm run test:count` writes
`tests/browser-cases.json` from `playwright test --list` and
`tests/vitest-cases.json` from `vitest list`. Most browser tests are generated
in loops, and on the Vitest side an `it.each` over a list built at collection
time, or a table held in a variable, runs many cases from one line; a text
count expands neither. The lint job fails a PR that changes either set of tests
without regenerating its file.

## Known defects

None open. Every finding the suites tracked has been fixed (table below). The
keyboard spec keeps its `KNOWN` list, empty, as the documented way to track a
future finding that genuinely needs its owner; anything not on it fails.

## Defects the suites caught and this work fixed

| Layer | Defect | Fix |
|---|---|---|
| Fitness | Nine environment variables read by the code but documented nowhere in `.env.example`. | Documented, with defaults. |
| Fitness | `/api/work-status` compared `CRON_SECRET` with `===`, which returns at the first differing byte (a timing side channel). | Switched to the shared constant-time `safeBearerEqual`. |
| Fitness / API | `/api/send-mail`, the one public unauthenticated POST, parsed any body in full before validating it, and answered malformed JSON with a 500, which the client retries forever. | 16 KB counted-read ceiling (413) and a 400 for malformed JSON. |
| Fitness | The contact form's field limits existed twice, held together by a comment. | One shared module; the client is pinned never looser than the server. |
| Property | The guestbook paging algorithm silently depends on messages arriving in time order. | The assumption is now documented in `paging.js`; 20,000 generated histories hold under it. It is not enforced: same-millisecond posts from two visitors sort by a random id tail (corrected 2026-10-18). |
| Property | The rank badge could disagree with the percentile printed beside it ("62.50%" ranked B-). | The level is derived from the displayed percentile. |
| Component + axe | The ⌘K palette's empty state sat inside `role="listbox"` and was never announced. | Moved outside as a polite status. |
| Lint (`jsx-a11y`) | Language rows on `/about` opened their popover by focus, but Enter/Space could not reopen it after Escape. | Keyboard handler and button role. |
| E2E (chaos) | A failed deferred chunk load (the three.js backdrops) blanked `/contact`, `/about` and project pages with Next's "Application error". | `optionalChunk()`: a decorative chunk that fails renders nothing. |
| E2E (hermetic network) | Every project page fetched its HDR map from `raw.githack.com`, an undisclosed third party. | Self-hosted in `public/hdri/`. |
| Security | The site sent no `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`, and advertised `X-Powered-By: Next.js`. | All added; the powered-by header removed. |
| Axe | Four text colours on `/uses` under 4.5:1; scrollable code blocks, tables and the pipeline diagram unreachable by keyboard at phone width; overlapping carousel links under 24 px. | Colours raised minimally; scrollers focusable; only the centred card's link is live. |
| Keyboard | Page content stayed focusable behind the opaque intro loader; the privacy notice hid focused controls; two `/about` controls had no visible focus. | `inert` behind the loader; `scroll-padding-bottom` and a footer spacer from the notice's measured height; a focus ring; a focused orbit button rises above the laptop. |
| Motion | The project-title bloom pulsed forever under `prefers-reduced-motion`. | Gated. |
| Mutation | The property suites checked the rank calculator's shape, not its values (73.8% mutation score). | A differential oracle with an independent erf; targeted survivor cases. |
| Error sentinel (reduced motion) | React hydration errors #418/#423/#425 on **every page** for visitors with reduced motion: framer-motion's `useReducedMotion` returns the real preference on the first client render. | `src/hooks/useReducedMotion.js` rebuilt on `useSyncExternalStore` (server snapshot = motion on); 42 components moved onto it; a root `<MotionConfig reducedMotion="user">`; a fitness test bans the direct import. |
| Keyboard (K1) | On the non-scrolling homepage the privacy notice could cover focused controls, and closed on Escape only with focus inside it. | Page-wide Escape as a last resort, yielding to the palette, open dialogs and text fields. The keyboard spec verifies WCAG 2.4.11's dismiss-in-place exception instead of excusing it. |
| Keyboard (K2) | Tab reached `/about` skill icons that had not scrolled into the strip, and every inactive category's icons. | Focus drives the scrub: the scroll position that reveals the focused icon is computed from the scrub's own geometry. |
| Keyboard (K3) | "Live Demo" and "GitHub" on every project page did nothing: `GlowButton` was a `<button>` that ignored `href`. The 3D-projected copies also sat where they were not painted. | Real links from each project's `demoLink`/`repo`; the in-scene copies pointer-only and `aria-hidden`; an accessible pair in the page intro. |
| Keyboard | On every project page the footer started ~160 px down and covered the 3D scene, because `<main>` held only fixed-position content. | `<main>` takes a full viewport on project pages. |
| Audit gate | A new high-severity nodemailer advisory (GHSA-v53p-9fqp-m79j, quadratic backtracking in its address parser) was reachable through the contact form's email field, which had no length limit beyond the 16 KB body ceiling. The patched nodemailer is a major version next-auth does not yet allow. | The address is capped at 254 characters (the RFC 5321 maximum) on both client and server, from the shared limits module; the waiver records why the remaining cost is bounded. |
| Review (E2E) | Projects 8–11 are `private: true`, but the links fix above derived "Source on GitHub" from every `repo`, so their pages linked to repositories that answer 404. | `source` is withheld for private records, and a demo equal to the repo URL is dropped too; the e2e fixture now includes a private project and asserts no link anywhere on its page points at the repo. |
| Review (keyboard) | `FloatingSoundToggle` and `NowPlaying` rendered beside the intro loader's `inert` boundary, not inside it, so the sound button could take focus under the opaque loader on a touch device. | Both moved inside `LoaderWrapper`. `loaderInertBoundary` (fitness) pins the layout, because the hermetic server renders neither control; `loader-inert.spec.js` checks in the browser that nothing outside the loader is focusable while it covers the page. |
| Review (`/uses`) | The browser-test figure `/uses` publishes was counted from the spec text, which cannot expand generated tests: `axe.spec.js` counted 2 of its 32. | The figure comes from Playwright's own collected list (`tests/browser-cases.json`), checked in CI. |
| Review (sitemap) | The project pages' scene loads its environment map by URL, which no import walk reaches, so replacing it would not move the eleven pages' `lastModified`. | Listed in `PROJECT_SOURCES`; the drift test now recognises public assets loaded by URL. |
| Review (chaos, the test) | The lazy-chunk test armed its fault after `settle()`, which waits for the intro loader, and the aurora and project-scene chunks start loading on that signal or earlier. It passed while aborting nothing. | The fault is armed by a `load` listener registered before navigation, any chunk carrying three.js is aborted whenever it is requested (found by its body, since the names are hashed), and the test fails if nothing was aborted. |
| Review (perf, the test) | `web-vitals.spec.js` summed every layout shift across a multi-second scroll, so a long page could fail the 0.1 budget while its real CLS passed. | Session windows, maximum kept. |
| CI (`security.yml`) | Gitleaks failed every pull request with a 403 (the action lists the PR's commits through the API, which this workflow's token may not), and on a PR it would have scanned only the PR's commits anyway. | The pinned gitleaks CLI over the full history, no token. Verified locally: 385 commits, no leaks, `.gitleaksignore` honoured. |
| CI (`security.yml`) | OSV-Scanner, meant to be informational, showed as a failed check on every PR: `continue-on-error` on the job keeps the workflow green but not the job. | Moved to the step, with a notice when findings exist. |
| Review (warm-up, the test) | The image warm-up swallowed its own timeout and reported success, sending the dependent suites into the cold-cache state it exists to prevent. | One bounded retry, then the setup fails. |
| Property soak (the test) | The first real 20,000-run soak drew the secret "SWo" and failed redaction, but the redaction was correct: the test searched the whole output for the secret, and "password" contains "swo". | The check now compares whole tokens. A defect in the test, recorded because the soak that found it had never actually run. |
| Review (scripts) | `npm run test:a11y`, `test:security`, `test:perf`, `test:visual` and `test:e2e:ui` start `next start` without building, so on a fresh checkout they failed before collecting a test. | Each builds first. `browserScripts.test.js` fails on any script that runs `playwright test` unbuilt. |
| Review (CI summary) | The JUnit reporter's `includeRetries` defaults to off, so a test that passed on retry left no trace in the XML and the run summary's flaky list was always empty. | Turned on for the CI reporter, and pinned by `browserScripts.test.js`. |
| Review (CI summary) | Once retries were recorded, the summary still named a test flaky if the word "flaky" appeared anywhere in it, so a hard failure whose message said "flaky upstream" was reported as passed on retry. | `scripts/junit-flaky.mjs` matches only `<flakyFailure>`/`<flakyError>` elements; `junitFlaky.test.js`. |
| Review (hermetic network) | The test server blanked every outbound credential but SMTP's, and the fetch sandbox cannot see nodemailer's raw sockets, so an un-stubbed valid contact POST could send real mail. The image warm-ups, on the base Playwright fixture, also reached third-party hosts from the browser. | SMTP pointed at a dead local port; the sandbox refuses non-local TCP; the warm-ups use `hermeticTest`. |
| Review (hermetic network, the test) | The socket sandbox allowed any host starting `127.`, so a DNS name such as `127.example.com` reached the real connect and could resolve to a public address. | 127/8 is allowed only as an IPv4 literal; `networkSandbox.test.js` refuses `127.`-prefixed names and checks the socket refuses before resolving. |
| Review (e2e coverage) | The privacy notice's four Escape journeys carried no `@cross-browser` tag, so they ran on desktop Chromium only, and the palette test's WebKit (⌘K) branch never ran. | One tagged `test.describe`: the journeys now run on WebKit, Firefox and both phones too. |
| Review (screen reader) | The ⌘K palette's "Nothing matches" status was inserted with its text already inside, which screen readers often do not announce, so an unmatched query could still be silent. | The status is mounted empty with the palette and only its text changes, as the privacy notice's live region does (`CommandPalette.test.jsx`). |
| Review (keyboard) | When the track had a Spotify URL, the Now Playing card was a link with no key handler, so Escape on it while expanded was claimed by nobody: with the privacy notice open it declined analytics instead of collapsing the console. | The link passes Escape, and only Escape, to the card's handler; Enter and Space stay native (`NowPlaying.test.jsx`). |
| Review (contact form) | The message field accepts exactly 500 and exactly 50 characters, but its errors said "less than 500" and "more than 50". | "At most" and "at least", matching the other fields. |
| Burn-in (warm-up) | The first desktop axe scan of `/qualifications` timed out: axe scans at 1440 px, where the cards ask for `w=640`, but the warm-up ran at 1280 px, which asks for `w=384`. So the scan met a cold cache (35 s in the quality job, over 60 s in burn-in; about 11 s once warm). | A `warm-axe-desktop` project at axe's exact viewport and motion setting, which `a11y` depends on. |
| Burn-in (the tests) | `/notes/discoverability`, the longest page, outran two flat limits when other tests ran beside it: the keyboard walk took the full 180 s on all five repeats and failed once, and the CLS scroll failed three times out of five at 60 s. Alone they take 55 s and 37 s. | The keyboard limit is now 5 s per stop (`MAX_STOPS × 5 s`), and the CLS test's limit is 120 s. Neither measures speed, so the limits only have to catch a hang. |
| E2E (the test) | The ⌘K palette test failed whenever the CI runner was under load. The runner draws the Ember Passage's WebGL swarm in software, and `/about` committed about 18 s after Enter, past the 15 s limit. | The test runs under reduced motion, so the passage takes its static branch. The test covers the palette and history, not the passage. |
| Review (`/about`) | The Enter/Space fix above gave every language row `role="button"` and a Tab stop, so a language with no repository breakdown was announced as a disabled button and still took focus. | Button role and Tab stop only on rows that open a breakdown; the rest stay plain statistics. `tests/component/LanguagesCard.test.jsx`. |
| Upgrade (keyboard) | After the React 19 upgrade the page was never `inert` under the intro loader: LoaderWrapper passed `inert=""`, the form React 18 needed, and React 19 reads an empty string as `false` and drops the attribute. All four `loader-inert.spec.js` cases failed. | `inert={covered}`, a real boolean. |
| Upgrade (build) | After the Next 15 upgrade both `twitter-image.js` routes re-exported `dynamicParams` from their sibling; Next 15 ignores a re-exported segment config with one build warning, so the param sets reopened while the build stayed green. | Declared in each file; the `routeSegmentConfig` fitness test fails on any re-export. |
| Review (keyboard) | The privacy notice's page-wide Escape inferred "nobody else owns this" from dialog markup and read `defaultPrevented` on the spot, from a `document` listener. Owners on `window` run after it, and most owners never prevented default: on the 404 page one press declined analytics **and** went home, and the about-page popovers and the orbit tip double-dismissed the same way. | Every owner claims the key (`claimEscape`); the notice decides after dispatch (`afterUnclaimedEscape`). `escapeKey.test.js` covers both listener orders, `escapeOwnership` (fitness) fails on an unclaimed handler, and the e2e spec checks the 404 case (it fails without the fix with an `analytics:false` record). |
| Review (visual) | Both visual renderers wrote over the existing snapshot tree, so a removed or renamed view's PNG survived: listed in `__latest__` as current, kept on promotion, and left behind by `npm run test:visual:update`. | Both render into an empty tree; the local updater clears its output only after a successful run. |
| Review (`/uses`) | After the Vitest layers were split, the published Vitest case total still came from a lexical scanner: the text read `routeSegmentConfig` (an `it.each(files)` over every app source file) as 2 cases of 80 and `contactContract` as 3 of 9, publishing 1,195 against Vitest's 1,356. | Taken from `vitest list` into `tests/vitest-cases.json`, checked in CI like the browser count; the scanner is gone. |
| Review (keyboard) | The page left `inert` when the loader's reveal began, but the overlay stays mounted and mostly opaque for the 520 ms wipe (or reduced-motion cross-fade), so Tab in that window reached controls still hidden behind it. | `inert` until the overlay is removed. `loader-inert.spec.js` samples every frame until then; before the fix it found 6 exposed frames. |
| Review (keyboard) | ⌘K during the intro loader opened the palette while the page was `inert`, so its input could not take focus and nothing retried: Esc and the arrow keys did nothing. | `LoaderWrapper` fires `loaderuncovered` once `inert` is gone, and the palette defers a covered ⌘K to it (`useCommandPalette.test.js`). |
| Review (security) | The audit gate read an error-only `npm audit` response as a clean one: it kept npm's stdout, defaulted the missing `vulnerabilities` field to an empty map, and with the allowlist empty reported zero advisories and passed. A registry outage would have turned the gate green. | `scripts/audit-gate.mjs` refuses a report with an `error`, no JSON, or a missing or malformed `vulnerabilities` map. `tests/unit/auditGate.test.js` runs the real script against a fake `npm` on `PATH`. |
| Review (keyboard) | Tabbing to an `/about` skill icon that had not scrolled into the stage dismissed its repository panel at once: focus opened the panel from the icon's off-stage rect, then the stage's own reveal scroll reached the panel's close-on-scroll listener. Writing the test found a second defect underneath: the browser's focus-scroll also scrolled the row's `overflow: hidden` wrapper sideways, on top of the scrub's translate, so the "revealed" icon landed a full row-width off the stage. | Keyboard focus now opens the panel once the focus-driven scrolling has settled, from the icon's final rect, and the reveal resets that sideways scroll. `tests/e2e/skills-keyboard-popover.spec.js`, in full motion. |
| Review (e2e) | Three `seo.spec.js` focus tests waited for `__loaderDone`, which fires as the reveal starts, while the page stays `inert` for the 520 ms wipe. A fast run focused an inert link (a no-op) and read the still-clipped panel. One of them had no loader wait at all, and passed only because a 1px nav overlaps nothing. | Each now also waits for the `[inert]` boundary to detach before focusing. |
| Owner report (`/journey` atlas) | A role started in the current month got an 8px bar closed on the NOW line, and its caption was printed outside the bar with no border. The newest role also sat on a lower lane, because lanes were packed oldest-first. | Open bars too short for their caption now widen left to hold it, with the right edge still on the NOW line, and lanes pack newest-first. `tests/unit/timelineAtlasLayout.test.js` (its two atlas cases fail on the old code). |
| Build (dependency major) | Dependabot PR #169 moved Tailwind 3 → 4 in `package.json` alone and was merged with its checks red, because `main` requires no status checks. Every later CI build, Lighthouse and visual run failed (v4 no longer ships the `tailwindcss` PostCSS plugin), and E2E and browser quality, which wait on the build, never ran. Vercel kept deploying because it restored a cached `node_modules` holding v3, so the live site looked healthy; the next uncached deploy would have failed. | Tailwind returned to `^3.4.19`; Dependabot ignores Tailwind majors until the migration is done on its own branch. `tailwindToolchain` (fitness) fails on any disagreement between the installed major, the PostCSS plugin and the stylesheet entry (all three cases fail with v4 installed over the v3 setup). |
| E2E (mobile-chrome) | The production minor-and-patch batch (#162) moved `three` 0.162 → 0.186, a semver "minor" for a 0.x package but 24 three.js releases. On a software-rendered Pixel 7 the project scene starved the main thread: the intro loader never finished, a 15 s `waitForFunction` took 51 s to time out, and five `/projects/*` tests failed on every retry. It went unseen on `main` because the Tailwind build failure above stopped E2E from running. | `three` back on `^0.162.0` (a branch differing only in that passed mobile-chrome 59/59 with no retries); Dependabot ignores three.js minors and majors until the upgrade has its own branch. |
| Axe (`label-content-name-mismatch`) | axe 4.14 promoted WCAG 2.5.3 (Label in Name) out of "experimental", and it failed on 15 routes: seven controls whose accessible names left out, reordered or ran together their visible words. The footer GitHub CTA (every page), the footer terminal links, both `/about` stat cards, the `/uses` meters, and the `/journey` timeline bars, milestone link and CV link. A voice-control user operates a control by saying what it shows. | Each name now contains its visible words as one run, in order: the CTA names itself from content plus sr-only text; the others start with or follow their visible text; whitespace breaks the stacked parts into words (nothing renders). The axe layer is the regression test; `experiencePresentation.test.js` pins the cards' order with axe's tokenising. |

## Maintenance

- **Every new issue re-considers this plan.** This document has to cover what
  the project is now, not what it was when #92 closed. Each issue checks,
  while planning and again before its commit, which layer each new page,
  route, interaction, journey, animation, piece of logic or outside host
  belongs to, and lands those tests and any update here in the same commit.
  The checklist is §3 of the repository's `CLAUDE.md`. Much of it is not
  enforced by CI, so it is a habit, not a gate.
- **Flake:** fix it or quarantine it with `@quarantine` and an issue link
  (enforced). Never `.skip` it.
- **Snapshots:** reviewed, never rubber-stamped.
- **Budgets and ratchets:** raise freely; lower only in a reviewed diff with a
  reason.
- **Audit waivers:** each expires. Re-assess, upgrade or renew with fresh
  reasoning.
