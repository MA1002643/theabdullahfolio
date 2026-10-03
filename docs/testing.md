# Testing

How this repository is tested, why each layer exists, and how to run, debug
and maintain every one of them. Issue
[#92](https://github.com/MA1002643/theabdullahfolio/issues/92) is the plan
this implements.

Every layer answers a question the others cannot. Every command below is the
one CI runs, so if it passes locally it passes in CI.

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

1. **The pyramid is honoured.** About 1,200 fast Vitest tests, fewer DOM
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

### L2 · Unit and property-based tests

The property suites generate thousands of inputs per run and shrink any
failure to a minimal counterexample. fast-check prints the seed, so a CI
failure replays locally with `fc.assert(..., { seed, path })`.

The centrepiece is `guestbookPaging.property.test.js`, a **model-based test**.
It runs random histories of posts, deletes, polls and "load older" (bursts
larger than a page, same-millisecond ties) against a model server that uses
the real paging helpers and the real cursor codec. After every step it
asserts the wall never shows a duplicate, never breaks order, and never loses
a message. Soak it deeper with:

```bash
FC_RUNS=20000 npm run test:property
```

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
host other than localhost.

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

**Debugging a failure.** CI uploads `playwright-report/` and `test-results/`
on failure. Retries record a trace:

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

Never on a Mac: macOS rasterises glyphs differently, and Docker on Apple
silicon cannot run Chromium under amd64 emulation, which is why rendering lives
in CI. With a Linux Docker host, `npm run test:visual:update` renders locally in
the official Playwright image. The `visual` project only exists once baselines
do (`playwright.config.mjs`), so a branch without them never fails on a missing
snapshot.

### L8 · Performance

- `web-vitals.spec.js` measures CLS through load **and a full scroll** on
  every route, enforced at 0.1. LCP is recorded as an annotation only, because
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

**The audit gate.** `npm audit` on `main` reports advisories whose fixes are
all major upgrades (Next 14 → 15, nodemailer 7 → 10, sharp 0.34 → 0.35). A
plain `--audit-level=high` gate could never pass and would be switched off.
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
- **Flake burn-in**: on every PR, each *changed* browser spec runs five times
  with retries off. Elsewhere CI retries twice and reports tests that passed
  on retry as flaky in the run summary.

## CI

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every push and PR | lint · Vitest + coverage · build → bundle scan + budget · E2E (chromium, mobile-chrome) · browser quality (a11y, security, perf, visual) · burn-in |
| `security.yml` | PRs, `main`, weekly | CodeQL · OSV · Gitleaks · audit gate |
| `nightly.yml` | daily | WebKit, Firefox, iPhone 14 · mutation testing · 20,000-run property soak |
| `lighthouse.yml` | PRs, `main` | Lighthouse CI budgets |
| `visual-baselines.yml` | every push (and manual, with `promote`) | render every view, commit `tests/visual/__latest__/` (and seed or promote the baselines) |

Each job writes a Markdown section to the run summary
(`scripts/test-summary.mjs`).

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
| Property | The guestbook paging algorithm silently depends on messages arriving in time order. | The precondition is now documented in `paging.js`; 20,000 generated histories hold under it. |
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

## Maintenance

- **Flake:** fix it or quarantine it with `@quarantine` and an issue link
  (enforced). Never `.skip` it.
- **Snapshots:** reviewed, never rubber-stamped.
- **Budgets and ratchets:** raise freely; lower only in a reviewed diff with a
  reason.
- **Audit waivers:** each expires. Re-assess, upgrade or renew with fresh
  reasoning.
