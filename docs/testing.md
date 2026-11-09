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
| L1 Static | Does the code follow the rules we can check without running it? | ESLint + full `jsx-a11y` | `eslint.config.mjs` | `npm run lint` |
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
| `testHygiene` | No focused or skipped tests; every `@quarantine` and `@webkit-quarantine` links an issue. |
| `browserScripts` | Every `npm run` script that runs `playwright test` builds first; the CI JUnit reporter keeps `includeRetries`, so the run summary can name flaky tests. |
| `routeSegmentConfig` | No file under `src/app` re-exports route segment config (`dynamicParams`, `revalidate`, …) from a sibling: Next 15 reads it only from the file itself and silently applies the default otherwise. |
| `backdropFilterPairing` | No `className` combines a class that sets `backdrop-filter` with one that sets `filter` (both read from `globals.css`, plus Tailwind's own filter utilities), counting the strings inside a template's `${…}` interpolations, every branch. That pair on one element crashed Linux WebKit's web process on every load of `/qualifications`. |
| `escapeOwnership` | Every source that acts on Escape claims it with `claimEscape` (`src/lib/escapeKey.js`), and the privacy notice decides only after dispatch, so one press never both closes something and declines analytics. |
| `tailwindToolchain` | The installed Tailwind major is the one `package.json` declares, and `postcss.config.js` and `src/app/globals.css` are wired the way that major expects. A major bump that changes only the version fails here, not only in `next build`, and not at all on a Vercel deploy that restores a cached `node_modules`. |
| `burnInRange` | Runs `ci.yml`'s own "Find changed browser specs" step against a scratch git repository: a push that only merges `main` into a branch burns in nothing, and a push that adds a spec still burns it in. |
| `workflowActionInputs` | Every `with:` key a workflow passes to a listed action (`actions/labeler`) is one that action declares at the pinned major, wherever the key sits among the step's other keys. GitHub only warns about an unknown input, and the step still goes green. A bump to a new major of a listed action fails here until its row is re-read from that tag's `action.yml`. |
| `ciInstallHermetic` | Every workflow that runs `npm ci` or `npm install` sets `FFMPEG_BIN: /usr/bin/true` in its workflow-level `env`. ffmpeg-static, a devDependency for the local asset scripts, otherwise downloads a ~70 MB binary from GitHub Releases on install, and CI never runs ffmpeg. |
| `localeParamSets` | Every card handler under `[locale]` that closes its param set returns params naming every dynamic segment in its path, `locale` included, for every routed locale; and the `[locale]` layout closes its own set. A list of ids alone prerendered no card, so every project and note `og:image` was a 404, and an open `[locale]` turned `/favicon.ico` into a 500. |
| `i18nCatalogues` | Every file in `messages/en/` is a namespace `src/i18n/namespaces.js` loads (and every loaded namespace has a file), every English message parses as ICU, and the content catalogues are in step with `src/app/data.js` (`scripts/i18n-data.mjs --check`). The cross-locale audit is a separate CI step, below. |
| `logicalCss` | `src/app/globals.css`, parsed with postcss so comments never count, sets no physical inline-axis box property (`margin-left`, `padding-right`, `border-left`, `text-align: left`, `float`, `clear`) outside a short allowlist where each entry says why. A physical margin looks fine in English and sits on the wrong side of every right-to-left page, which nothing else would notice. Also: a `:dir()` selector never shares a selector list (an older browser would drop the whole rule), and `--inline-sign` is 1 and -1. |
| `i18nBudget` | What each route's client message provider receives stays at or under 8 kB gzipped, for every locale × route, measured through the same `loadMessages` → `pickMessages` path the page serialises. `/uses` alone is allowed 9 kB (owner decision, 2026-11-01): it server-renders a description for each of its 42 curated stack tiles, and Russian measured 8,279 bytes after everything not on screen at first paint was deferred. The fitness project runs with Vitest's on-disk module cache off, because a cached compile of the catalogue loader once made every locale measure as English (defects table). |
| `imageLoadingPolicy` | No `next/image` uses the deprecated `priority`. `preload` appears only on an allowlisted image, and each entry records the route and viewport where that image measured as the LCP. An `eager` image that is not preloaded carries `fetchPriority="low"`, because without it React 19's server renderer preloads the image anyway (issue #55). |
| `deferredChunks` | The modules kept out of every first load (the Ember Passage runtime, the `/about` dialogs, framer-motion's feature modules) are statically imported only from inside their own deferred graph, and each entry point is still loaded through `import()`. The bundle budget cannot catch this: its 10 % headroom is larger than the modules (issues #55, #200). |
| `lazyMotion` | framer-motion stays on `LazyMotion` (issue #200): no file in `src/` imports the `motion` component (or a namespace that includes it); `domAnimation` / `domMax` are imported only in `src/lib/motion/{features,layoutFeatures}.js`, which only the loader reaches, through `import()`; every `LazyMotion` is `strict` and the root layout mounts one; every drei `<Html>` body (a separate React root, which inherits no provider) holds its own `<MotionFeatures>`; `AnimatePresence` is imported only through the site wrapper, `src/components/motion/AnimatePresence.jsx`; and no file in the static graph of the three layouts every route renders imports an engine API (`animate`, `useAnimation`, `useAnimate`, …). That last rule is the 16 kB the intro loader's `animate()` held in every first load; `useSpring` is allowed, because deferring its one root-layout user measured as no saving. The `motion`, provider and engine rules failed on `main`; the feature-module rules have nothing to find there. |
| `i18nCatalogueText` | No parsed catalogue string, in any locale, contains a literal escape sequence such as ` `: a real sentence never does, so one that does was double-escaped on its way into the JSON. |

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

Two property suites guard the translation work (#82).
`i18nCatalogue.property.test.js` checks the round-trip the translation script
writes every locale through: flattening a catalogue and rebuilding it in
English's shape (`shapeLike`) must lose, reorder and invent nothing, and any
message must pass the ICU validator as a translation of itself.
`textSegments.property.test.js` checks the splitter behind every per-letter
animation: whatever the text, its pieces join back to the input, and for ASCII
they are exactly the old `split('')` / `split(' ')`, which is what keeps the
English pages unchanged.

Two unit suites pin the deferred-loading primitives (#55).
`deferredChunk.test.js` covers the loader: one shared download, a failure
forgotten so the next call retries, a `preload` that never rejects, and a
fallback that renders nothing. `whenIdle.test.js` covers the scheduler with
both browser APIs stubbed on a fake `window`: the deadline handed to
`requestIdleCallback`, cancellation before the callback runs (only its own),
and the 200 ms `setTimeout` fallback with its `clearTimeout` cancel. The cancel
matters for the Ember Passage provider: a reduced-motion visitor's first effect
schedules the runtime download before hydration reports the real preference,
and the re-render that follows must cancel it before idle arrives.

### L3 · Component tests

`tests/support/setup-component.js` adds jest-dom matchers, the smallest
possible polyfills for APIs jsdom lacks, and the shared MSW server. Framer
Motion animations are skipped so a visibility assertion never depends on how
far a tween had run.

**`m` is the full `motion` here** (issue #200). The site renders framer's `m.*`
components, which take their renderer from the root layout's `<LazyMotion>`. A
component test renders without that layout, and an `m.div` with no provider
never animates and keeps its `initial` style, so every fade-in from opacity 0
would fail `toBeVisible`. `tests/support/setup-motion.js` (the `unit` and
`component` projects) maps `m` to `motion`, which is what every component
rendered before the migration. A test file with its own
`vi.mock('framer-motion', …)` spreads `withFullMotion(actual)` from
`tests/support/motionDouble.js` instead of `actual`. The real asynchronous path
is tested once, against the real `m`, in `lazyMotionFirstPaint.test.jsx`: the
content is in the document before the features arrive, and the entrance plays
when they do.

Four more files cover what happens when the features are late or never come,
each against a stubbed loader. In `motionStaticFallback.test.jsx` the elements
hold their `initial` style while the chunk is only late. Once the loader gives
up, they render at their final state: inherited variants, the last keyframe,
content mounted afterwards, and the layout provider. A gate that opens after
the give-up still reveals what it gates, which the file checks on the real
components the review named: `PageTitle` behind the intro loader, a `/uses`
`Plate` behind its viewport trigger, the preference centre opened behind a
nested `<AnimatePresence>`, a guestbook card with its depth blur off, the `/about` paragraph's scrubbed words, and the `/journey` dial turning with the elected era.
`arcSweepDelayedFeatures.test.jsx` plays the `/about` arcs before the
features land, against the real `m`, and keeps the old `useAnimation` shape
as a case that pins the defect (its controls are lost).
`customCursorDelayedFeatures.test.jsx` keeps the native cursor until a
pointer position arrives after the features. `loaderWrapperRemount.test.jsx`
checks that the remount the fallback causes does not replay the intro.
`loadMotionFeatures.test.js` pins the bound itself: three failed attempts or
8 s, never once the features have landed, never a rejection, and nothing fetched or resolved after it has given up.

**Copy comes from the real catalogues.** Components read their text through
next-intl, so a test renders them with `renderWithIntl` from
`tests/support/intl.jsx`: a real provider holding the real
`messages/<locale>/*.json`, never a mock translator. Assertions stay on the
English a visitor reads, and a test that wants another locale (a right-to-left
layout, Persian digits, an Arabic plural) passes `locale` and gets that
catalogue with English filling any gap, as the site does at runtime. The
English these refactored components render was pinned to the pre-#82 strings
before the copy moved (`workSignal.test.js`, `aboutDiffs.test.js`,
`projectMetaLocale.test.js` and others), so "unchanged in English" is a test
result rather than a claim.

### L4 · API integration tests

Route handlers are imported and called directly. Outbound HTTP goes to MSW.
Redis is `tests/support/fakeRedis.js`, a stateful fake with an atomic
`SET NX`, so the contact route's idempotency state machine runs against real
state. Ten concurrent requests with one key produce exactly one email.

Since #82 an error a visitor reads travels as a stable `code` (plus `values`)
beside the English sentence, and the client words it in the visitor's
language. `send-mail.route.test.js` and `contactGuestbookI18n.test.js` check
that every code, rendered from the English catalogue, equals the sentence the
route sends, so the two cannot drift. `work-status.descriptors.test.js` checks
that the live header's payload carries its message descriptors beside the
unchanged English sentence, on the fresh path and the no-token fallback.

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

**Translated URLs (#82).** Besides the registry's English paths,
`tests/support/routes.js` exports `LOCALE_SAMPLES` (Arabic, right to left in a
joined script; Japanese, CJK with no spaces) and `LOCALIZED_ROUTES`, every
route in both. Two were chosen for being the hardest, not the most read: between
them they exercise every code path a third locale would. `navigation.spec.js`
renders each one (200, one `<h1>`, `lang` and `dir` on `<html>`, the error
sentinel armed, which is what catches a hydration mismatch) and checks it never
scrolls sideways at 390 px. That block is Chromium-only rather than
`@cross-browser`: what breaks per locale breaks on Chromium too, and 30 more
routes on five engines is minutes the repository pays for. `rtl.spec.js` is
the cross-browser part, because bidi resolution is each engine's own: it reads
the footer email glyph by glyph in on-screen order on `/ar/about` and
`/about` and compares it with the address. `routeRegistry.test.js` pins
that the samples are real public locales and that one is right to left. The
keyboard, motion and Web Vitals specs still visit English only; their findings
do not depend on the language.

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
  WCAG 2.0/2.1/2.2 A and AA, and every route again in Arabic and Japanese
  (`LOCALIZED_ROUTES`, L5). Right to left and CJK change what axe measures:
  contrast on another font stack, a mirrored focus order, `lang` on the
  document and on every English island. Full results are attached to the
  report. One axe heuristic does not survive Arabic: before checking label in
  name (2.5.3) it discards text it takes for an icon-font ligature, judged by
  drawing the first character alone, and an Arabic letter's isolated form is
  not its joined form, so it discarded nearly every word and reported
  `/ar/about`'s projects card although the name contains its visible words
  verbatim. For Arabic-script locales the spec sets that check's
  `pixelThreshold` to 1 (the heuristic off, the rule on); the site loads no
  icon font, so nothing real is lost. A localized scan also waits for the language
  suggestion: an English-preferring test browser is always offered English
  there, after a chunk import that could land mid-scan and be measured
  half-faded (an intermittent contrast failure that is not one at rest); waiting
  for it to be fully opaque makes the card part of every localized scan.
- `keyboard.spec.js`: Tabs through every page. At each stop it *measures*
  that the element looks different focused (2.4.7), is on screen and not
  covered (2.4.11), and that focus keeps moving (2.1.2).
- `motion.spec.js`: under `prefers-reduced-motion: reduce`, nothing may loop
  forever (2.2.2): CSS and Web Animations, SMIL, looping video.

A Playwright detail that cost a run: in this version `reducedMotion` must go
inside `contextOptions`. A top-level `reducedMotion` key is silently ignored.

### L7 · Visual regression

Screenshots of the views whose look is stable (`/cv`, `/privacy`, `/notes`,
`/contact`, the 404 page, and `/ar/contact`, `/ar/cv` and `/ja/cv` for a
mirrored form, a mirrored document and Japanese line breaking), with animations
off, reduced motion on and live regions masked.

**Rendered on every push, committed back automatically.**
`.github/workflows/visual-baselines.yml` runs on each push to any branch: it
builds the site, renders every view on `ubuntu-latest` with the same Chromium
install the CI comparison job uses, and commits the images to the branch.
There are two directories, and the difference matters:

| Directory | What it is | Updated |
|---|---|---|
| `tests/visual/__latest__/` | The current render of every view, plus a `README.md` gallery saying which views differ from their baseline. Open it on GitHub to see the site as the last commit renders it. | On **every push**, automatically. |
| `tests/visual/__screenshots__/` | The **reviewed** baselines `ci.yml` compares against. | Seeded automatically the first time (which arms the layer), and per view: a view added since the last promotion has no baseline to protect, so its first render seeds one (`scripts/render-visual-latest.mjs`; the gallery marks it "new view"). Until that image commit lands, CI's visual step fails on the new view, and the checks the image commit dispatches pass. Reviewed baselines are only ever changed deliberately: run the workflow by hand with `promote: true`, or commit the PNGs in a PR. |

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
- `image-loading.spec.js` (issue #55) loads every route at 1440×900 and
  390×844 in one test, and enforces facts rather than timing: every image the
  route preloads is an LCP candidate at one of the two sizes, and an LCP image
  is never `loading="lazy"`. It failed on all 15 routes before #55, where every
  full-bleed background was preloaded and never once the LCP.
- `scripts/check-bundle-budget.mjs` computes first-load JS per route (gzip)
  from the `<script src>` tags in each route's prerendered HTML (module
  scripts only; a dynamic template is budgeted at its largest prerendered
  page), against `bundle-budget.json` (measured + 10%). It read the build
  manifest until Next 16 stopped writing it.
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
  The release tarball is cached (keyed on the pinned version and checksum),
  so a run normally never reaches GitHub Releases; a miss downloads with
  retries, and the checksum is verified on every run, cached or not.
- **CodeQL judges its own results.** Any finding with a security severity of
  7.0 or more (high or critical) fails the job, and every finding is listed in
  the run summary. The repository was private until 2026-11-07, and GitHub
  code scanning is not available on a private personal repository, so the
  workflow was built to skip the upload and keep this gate. Since the
  repository went public, the results also upload as code-scanning alerts.
  The upload still switches off automatically if the repository is ever made
  private again.
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
  Re-measured 2026-11-06 on Stryker 10.1 and Vitest 5: **87.46%**. Stryker
  10.0 could not run Vitest 5's tests against a mutant, so from 2026-10-25 to
  then the nightly read 11.88% (see the defects table).
- **Flake burn-in**: on every push to a branch, each browser spec *that push*
  changed runs five times with retries off (capped at 30 minutes). The range is
  the push's own `before`, from whichever run survives the concurrency group:
  the pull_request run, the branch's push run, or the screenshot commit's
  dispatch, which passes it as `burn_in_base`. A newly opened PR compares
  against `main`. Either way the list is then cut down to specs the branch
  itself changes against its base, so a push that merges `main` in ("Update
  branch") or rebases onto it does not burn in `main`'s specs. Elsewhere CI retries twice and reports tests that passed on
  retry as flaky in the run summary. Two pushes in quick succession cancel the
  first run, so the first push's specs skip burn-in. That is the cost of not
  re-running every spec the PR has ever touched on each push, which took 130
  billed minutes a push on PR #160.
- **Quarantine**: a browser test tagged `@quarantine` (with its issue linked,
  enforced) is left out of every run by `grepInvert` in
  `playwright.config.mjs`, so it no longer gates a merge. The nightly
  `quarantine` job sets `PW_INCLUDE_QUARANTINE=1` and runs only the tagged
  tests, so a parked test still runs every night until it is fixed.
- **WebKit-only quarantine**: `@webkit-quarantine` parks a case on the
  `webkit` and `mobile-safari` projects only. It is for failures of the CI
  runner's Linux WebKit build that Apple's WebKit does not share. Every other
  project still runs the case, so Chromium keeps gating it on every PR. The
  nightly `quarantine-webkit` job runs the tagged cases on both WebKit
  projects with `continue-on-error`: they stay visible without turning the
  nightly red, and a pass there means the tag can go. The issue link is
  enforced the same way (`testHygiene`). Nothing carries the tag today: the
  six cases first parked this way
  ([#198](https://github.com/MA1002643/theabdullahfolio/issues/198)) were
  three real defects and one test bug, all fixed, and the job passes with no
  tests to run. "Cannot reproduce locally" turned out to be wrong: the
  official Playwright image (`mcr.microsoft.com/playwright:v<version>-noble`,
  native arm64 on Apple silicon) runs the same Linux WebKit, and reproduced
  10 of the 12 failures on its first run. Reach for it before parking a
  WebKit-only case.

## CI

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every push and PR, and dispatched onto each screenshot commit | lint + the browser-test count check + the translation audit (`npm run i18n:audit`) · Vitest + coverage · build → bundle scan + budget · E2E (chromium, mobile-chrome) · browser quality (a11y, security, perf and the pseudo-locale `i18n` gate, then visual, each with its own report and summary) · burn-in |
| `security.yml` | PRs, `main`, weekly | CodeQL · OSV · Gitleaks · audit gate |
| `nightly.yml` | daily | WebKit, Firefox, iPhone 14 · quarantined tests · Linux-WebKit-quarantined cases (non-blocking) · mutation testing · every property at ≥ 20,000 runs |
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

**The pseudo-locale gate** (`tests/i18n/pseudo.spec.js`, project `i18n`, run
in the browser-quality job; locally `npm run test:i18n`). The audit above
proves the catalogues are complete; it cannot see a string that never reached a
catalogue. So CI's build job runs `npm run i18n:pseudo`, which writes
`messages/en-XA/` from English (gitignored: it is a pure function of
`messages/en`), and builds with `NEXT_PUBLIC_I18N_PSEUDO=1`, which routes one
hidden locale, `en-XA`. There every catalogue string reads `[Ȧƀǿǿŭŭŧ ḿḗḗ]`:
each ASCII letter swapped for an accented look-alike, each vowel doubled (about
30% longer), the message bracketed, and its ICU arguments, plural keywords and
tag names untouched (`pseudoMessage` in `scripts/i18n-lib.mjs`, which a unit
test runs over every English string). The spec visits every route at
`/en-XA/…` and reads the visible text, the accessible names
(`aria-label`, `title`, `alt`, `placeholder`…) and the document title.
**An ASCII word outside every bracket did not come from a catalogue**, and fails
with the word and the element it sat in. Bracket depth carries across text
nodes, because a message with rich text spans several; a value interpolated
into a message sits inside its brackets and passes. Skipped, each for a stated
reason: `translate="no"` subtrees (names, addresses, data: the HTML attribute
that already means "not to be translated", which also stops a browser
translator mangling them), `lang="en"` islands (English by decision, already
announced), `code`/`pre`/`kbd`/`samp`, and `<time>`, whose words are
`Intl`'s (CLDR has no pseudo-locale data, so they format as English here and
correctly everywhere else). A title is checked without the site-name suffix
(Latin by decision, `docs/seo.md` §18), and not at all on a page whose
canonical points at its English URL, which is how an English-only page declares
itself. `LITERAL_WORDS` in `tests/support/pseudo.js` allows one word (sonner's
`alt` key name) and is meant to stay that short. The pseudo-locale is not in
`LOCALES`, so the sitemap, hreflang, the selector, the audit and the
translator never see it, and Vercel never sets the flag: production has no
`/en-XA`. A unit test pins both.

**The translation audit** (`npm run i18n:audit`, also in the lint job) first
checks that `messages/en/Data.json` is still what `scripts/i18n-data.mjs`
derives from `src/app/data.js`, then diffs every locale's catalogue against
English. It fails on a missing key, an orphan file or key, a namespace nothing
loads, a translation whose placeholders, rich-text tags or `select` branches
differ from English (or whose plural has no `other` branch), and an
**outdated** key: one whose English has changed since it was translated,
detected from the source hash in `messages/.i18n-lock.json` rather than
guessed. Text identical to English is a warning, never a failure, because a
brand or "CV" is often correctly left alone. A missing key would still render,
in English, which is exactly why it has to fail here instead of being found by
a visitor. `docs/seo.md` §10 has the translation runbook.

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
| Burn-in (the range) | "Update branch" on Dependabot's #189, which changed only `package.json`, merged `main` into it. That push's `before...head` range held every spec `main` had gained in the multilingual merge, so the job burned in eight specs × 5 and was cancelled at its 30-minute limit. Nothing failed: it ran out of time. | The step keeps only specs the branch itself changes against its base (`origin/<base>...head`). `burnInRange` (fitness) replays the merge-from-main push and fails on the old step. |
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
| Count check (`--check`) | Vitest 5 made `vitest list` parse files statically by default, so the count `/uses` publishes fell from 1,391 to 1,114 (fitness 120 → 34) while every test still ran: each `it.each` over a list built at collection time read as one case, the error the script exists to avoid. | `scripts/count-vitest-cases.mjs` passes `--staticParse=false`; `browserScripts.test.js` fails if the flag is dropped. |
| E2E (mobile-chrome) | Even on three r162, `/projects/*` tests still timed out now and then on the mobile runner (`/projects/1` failed all three attempts in run 40134171198; the passing ones took 31–60 s against ~11 s elsewhere). CI has no GPU, so the scene's never-ending frame loop ran in SwiftShader on the main thread: measured locally on a Pixel 7 profile, 3.9 fps, 7.9 s of every 8 s in long tasks, and 220 ms for a no-op `evaluate`. Any visitor whose browser falls back to software WebGL gets the same frozen page. | On a software renderer (`src/lib/softwareRenderer.js`) the scene renders at 1× and on demand: a still frame, then no draws. Same measurement after: 0 long tasks, a 1–3 ms `evaluate`; on a GPU it still animates. `softwareRenderer.test.js` pins which renderer strings count as software. |
| Fitness (message budget) | The translation work's own client payload broke the 8 kB-per-route budget its spec set: measured 2026-10-29 in English, `/uses` handed its client provider 10.8 kB gzipped (a description of every tool the live crawl can find, most never rendered) and `/about` 9.1 kB (the whole `Data` namespace for one slice of it). | Routes now name dotted subtrees (`Data.journey`), which `pickMessages` copies out without writing into the shared cached catalogue; the tool descriptions moved to a deferred `UsesTools` namespace that `/uses` fetches alongside its live crawl, shipping only the curated tiles' copy up front. Measured after: 7.0 kB and 6.1 kB. `i18nBudget.test.js` holds every locale × route to the limit, and `i18nMessages.test.js` pins that picking never mutates the cache. |
| Keyboard (2.4.11) | Once the intro seal stopped playing on visits that enter on a sub-page (2026-10-31, for LCP), `keyboard.spec.js` failed on every sub-page: "focused off-screen" on the Home link. `HomeBtn` and `ProjectsBtn` sat at `scale(0)` for a second before popping in, a focusable link with no box. The seal had hidden that second. | Both pop in from 60 % with an opacity fade over 300 ms, never from zero. `loader-inert.spec.js` now also checks that a sub-page entry ships no overlay, is never `inert` and leaves `loaderSeen` unwritten. |
| Unit (translation validator) | `icuProblems` (`scripts/i18n-lib.mjs`), which rejects a machine translation whose ICU structure differs from English, compared raw rich-text tag counts. A tag repeated once per plural branch (`{count, plural, one {<n>{shown}</n> mark} other {<n>{shown}</n> marks}}`) therefore failed in every language with a different number of plural forms: Japanese, Chinese, Turkish, Vietnamese and Indonesian (`other` only), Portuguese (`one`/`many`/`other`), Polish (four). The first full translation run, 2026-10-29, rejected 8 correct batches. | A plural contributes its `other` branch's tags to the message's count, and every branch must carry the same tags as its own `other` (`unevenPlurals` in `icuSignature`), unless English's own branches already differ. Two cases in `i18nLib.test.js`: a tag inside a plural counts once however many branches the target has, and a tag dropped from one branch is still rejected. |
| Owner report (footer language selector) | The footer's language panel opened inside the `<footer>`, which has `overflow-hidden`, and inside the split-flap row's transformed `<span>`. On desktop the overflow sliced the top off the upward panel, and the panel was 95% opaque, so the terminal showed through it. On a phone the transform became the containing block of the `position: fixed` bottom sheet, which collapsed into a 65 px sliver mid-screen. | The panel is portalled to `<body>` and anchored to the trigger's viewport rect (`anchorPanel`, which caps its height by the room on the side it opens to), and is opaque. `tests/component/LanguageSelector.test.jsx` pins the portal, the anchor maths, Escape with focus return, and outside-press. |
| Pseudo-locale (footer) | The footer terminal's link names were a template literal, `${command}, ${handle}: ${description}`, so every language got English punctuation and word order in its accessible names. | One message, `Footer.elsewhere.linkLabel`; Arabic and Japanese now use their own comma. A translator note and a unit test keep the visible command and handle first (WCAG 2.5.3). |
| Pseudo-locale (`/uses`) | A bench station's `name` read "zsh · macOS Terminal · the VS Code terminal": prose in a field no catalogue holds, so "the … terminal" stayed English in every locale. | Names only in `name` (prose lives in the translated `detail`); names across `/uses`, the footer, `/cv`, `/about`, `/projects` and `/journey` marked `translate="no"`. |
| E2E + axe (`/ja`) | `/ja/about` threw React #418 (hydration text mismatch), intermittently `/ja/journey` too. `wordChunks` cut Han and kana with `Intl.Segmenter({ granularity: 'word' })`, whose cuts come from a dictionary, and Chromium ships a smaller CJK dictionary than Node's full ICU: one sentence in 80 cut differently on the server and in the browser, so the rendered spans differed. | A cut that is a pure function of the characters: one chunk per Han or hiragana character, katakana and Latin runs whole, closing punctuation kept with the chunk before it. A unit test makes the word segmenter throw and requires the same output. |
| E2E (`/ar`, phone) | `/ar/privacy` scrolled sideways by 7 px and `/ar/notes/*` by 2 px. Rows and headings inside the English-only islands slide in from the left (their own start); in a left-to-right document that overhang is never scrollable, in a right-to-left one the scroll origin is on the right and it is. | `[dir='rtl'] [lang='en'][dir='ltr'] { overflow-x: clip }` in `globals.css`: the island clips its own overhang, only inside right-to-left pages. |
| Axe (`/ja/journey`, `label-content-name-mismatch`) | The CV link showed 紙版はこちら while its `aria-label` read 紙版：PDF形式のCV: the Japanese translation reworded one of two messages that had to repeat each other, so the accessible name no longer contained the visible words (WCAG 2.5.3). English passed because its two strings happened to agree. | Named from content: no `aria-label`, the visible words then a screen-reader-only continuation (`Journey.endCap.paperHint`), so no translation can drift out of step. |
| Owner review (right-to-left footer) | Text drawn one glyph per inline-block printed backwards in Arabic, Persian, Hebrew and Urdu: inline-blocks are bidi-neutral, so they followed the page's right-to-left direction. The footer email read `moc.liamg@…` and the index's CV row read `VC`. | `DecipherEmail` is `dir="ltr"` (an address is left to right in every language) and `HoverText` is `dir="auto"` (each label takes the direction of its own first letter). Pinned in `tests/component/FooterText.test.jsx`, and measured from on-screen glyph positions in a real browser. |
| Fitness (message budget, local cache) | `i18nBudget` passed locally on 2026-11-01, yet with the cache cleared (as on CI, which caches no `node_modules`) it failed in 16 of 20 locales. Vitest 5 caches each transformed module on disk, keyed on that file’s own source; the loader’s ``import(`../../messages/${locale}/${ns}.json`)`` compiles to the list of catalogue files that existed when it was transformed, and the cached compile dated from when only `en` (and a few `ar`/`es` files) existed. Every other locale fell back to English inside `loadMessages`, so the budget measured English 17 times. The real figures, once measured: `/uses` up to 10.1 kB (Russian), `/about` 9.0 kB, `/journey` 8.6 kB. | The fitness project runs with `fsModuleCache: false` (`vitest.config.mjs`), so a gate never passes on a stale compile. The routes were then brought down: the preference centre’s copy (`Privacy.prefs`, `categories`) is fetched when the dialog opens, or preloaded for an undecided visitor (`usePrivacyCopy.jsx`); `Privacy.status` ships on `/privacy` only; the 404 hands down `NotFound` itself; `/uses` fetches its ⌘K copy (`UsesPalette`) at mount; the category fallback lines moved into the deferred `UsesTools`. Russian `/uses` still measured 8,279 bytes with only first-paint text left, and the owner set `/uses` at 9 kB. `PrivacyConsentUi` and `usesPalette` cover both fetch paths; the cleared-cache run is the regression check for the cache itself. |
| Catalogue text (`fr`, `de`, `es`) | 65 translated strings carried the six characters `\u00a0` where a no-break space belonged. They were double-escaped in the JSON, so they parsed as a backslash and five letters: French visitors read “priorité\u00a0:” on the home page’s live header, and the German and Spanish percent format read `<n>\u00a0%`. No test saw it, because six locale tests still asserted the English fallback from before the catalogues were translated, so French was never rendered with its own words. | Each turned into a real JSON escape for U+00A0. `i18nCatalogueText` (fitness) fails on any parsed string containing an escape sequence; it fails with the old `fr/LiveHeader.json` restored. The six locale tests now take their expected words from the catalogue (`messagesFor`) instead of English. |
| Review (contact name field, bidi) | The name field is `dir="auto"`, and `FireInput` copied that `dir` onto its overlay's text only. That reorders the glyphs but not where the flex overlay places them, so an Arabic name on `/contact` painted at the left edge while the caret sat right, and a Latin name on `/ar/contact` the reverse. | `dir` moved to the `.fire-input-overlay` container (the text inherits it; a `dir` on the child too would make the container's `auto` skip it and resolve left-to-right). `tests/e2e/rtl.spec.js` measures which edge the painted copy hugs, in both directions; all four Chromium and WebKit cases fail without the fix. |
| Review (contact name field, long right-to-left value) | `FireInput` keeps the end of a long value in view itself (the input's own scroll-to-caret is off, because its text is transparent) with `scrollLeft = scrollWidth`. In a right-to-left field `scrollLeft` runs from 0 to a negative number, so that clamped to 0, the start, and a long Arabic name scrolled off the left past the caret. | `sync()` reads the input's resolved direction and pins to `-scrollWidth` when it is right-to-left. `tests/e2e/rtl.spec.js` fills a name longer than the field in each direction and checks that the end sits within the padding; the right-to-left case fails on Chromium and WebKit without the fix. |
| CI (published Vitest count) | `test:count --check` failed on CI: 1,861 collected against a committed 1,862. `i18nCatalogueText` made one case per folder under `messages/`, and the gitignored pseudo-locale `messages/en-XA/` exists only where `npm run i18n:pseudo` has run, so the count depended on the machine. | The test iterates `LOCALE_CODES` from the locale registry. The count is 1,861 with or without the pseudo folder. |
| CI (bundle budget) | After every page moved under `app/[locale]/`, `bundle-budget.json` matched no built route: the gate listed each page as "gone" and "unbudgeted" and measured nothing, which hid about 33–42 kB (gzip) of first-load growth per page from #82's i18n runtime. | Re-baselined with `--update` (measured + 10%), the growth recorded in the changelog. A route rename always needs `--update` in the same change. |
| Owner report (`/ur/contact`, field direction) | Typing started at the left in some contact fields and at the right in others. An empty `dir="auto"` field resolves left-to-right (no letters to go by), so on a right-to-left page the empty name, subject and message waited at the left, while the email, with no `dir`, followed the page to the right and laid typed addresses out right to left. | One rule: empty, a field carries no `dir` and inherits the page's; typed, it takes `auto` (name, subject, message) or `ltr` (email), on the field and its overlay alike (`applyTypedDirection`). `tests/e2e/rtl.spec.js` checks every field empty, with Urdu, with Latin and cleared, on `/contact` and `/ur/contact`. |
| Dependency major (CI config) | Dependabot PR #181 moved `actions/first-interaction` v1 → v3 and changed only the version. v3 renamed every input to snake_case (`issue-message` → `issue_message`), so the welcome step would have run green and posted nothing to every first-time contributor. | Inputs renamed in `issue-triage.yml`. `workflowActionInputs` (fitness) fails on the old keys, naming each one. |
| Mutation (nightly, the tool) | From the Vitest 5 merge (#171, 2026-10-24) the nightly mutation score fell from 87.2% to 11.88%, with 503 mutants "surviving" across all eight modules, `paging.js` at 0%. The suites had not weakened: `@stryker-mutator/vitest-runner` 10.0 did not support Vitest 5, and reported mutants whose tests it could not collect as survivors. Nightly went red for twelve nights while every PR stayed green, because mutation runs only nightly. | Stryker 10.1.1 (Dependabot #192), which adds Vitest 5 support and reports a collection failure as an error rather than a survivor. Re-measured: 87.46%. The `break: 85` threshold is what caught it. |
| Hermetic network (dependency major) | msw 3 (Dependabot #193) renamed `server.listen`'s `onUnhandledRequest` to `onUnhandledFrame` and ignores the old name, falling back to `'warn'`. With only the version bumped, every suite stayed green and an unstubbed request went through to the real network. Shown against a loopback server: the request got a 200. | `MSW_LISTEN_OPTIONS` uses `onUnhandledFrame: 'error'`. **new** `tests/api/mswHermetic.test.js` sends an unstubbed request to a live loopback server and fails if it is answered; it fails on the old option name. |
| Nightly E2E (Firefox), a real defect | Every sub-page failed on Firefox from 2026-10-25: the nightly runner's headless Firefox has no WebGL, three.js threw creating the ambient aurora's renderer, and the throw took the route to Next's bare error screen (`<html id="__next_error__">`, empty title, no `<main>`). Any visitor with WebGL off or blocklisted got the same. Chromium never showed it, because its software rasteriser still hands out a context. | `src/lib/webglSupport.js` probes once on a throwaway canvas. `AuroraDustMount` and the project `SceneLoader` keep their static fallback without WebGL. `webglSupport` and `auroraDustMount` (unit) fail without the guard. Nightly Firefox: 0 failures, from 22. |
| Nightly E2E (WebKit, the test) | The offline contact journey failed on WebKit and the iPhone project: WebKit words a load that fails offline as "Failed to load resource: WebKit encountered an internal error", and the test only expected Chromium's `ERR_INTERNET_DISCONNECTED`. | The WebKit wording is expected in that one offline test. |
| Review (CI, the welcome step) | `actions/first-interaction` v3 welcomes on a PR when either of its checks passes, and its issue check passes for anyone who never opened an issue, so every Dependabot PR would have got the first-PR welcome. Its PR check also ignores the author. | The step is now its own `gh` call: bots are skipped, and only an author's earlier items of the same kind count. |
| Review (fitness parser) | `workflowActionInputs` stopped reading a step at a sibling key (`if:`, `id:`) between `uses:` and `with:`, so those inputs went unchecked. | The parser reads a step's keys in any order; a fixture case fails on the old parser. |
| Production (Vercel logs) | A one-segment path with a dot (`/favicon.ico`, `/ads.txt`, `/wp-config.php`) answered 500: it skips the proxy, reaches `[locale]` as an unknown locale, and Next refuses the request-time render that `notFound()` needs. About 25 in three days. | `dynamicParams = false` on `src/app/[locale]/layout.js`: a 404. `localeParamSets` (fitness). |
| Production (share cards) | Every project and note page advertised an `og:image` / `twitter:image` that answered 404, in every language, from the multilingual merge on: the card handlers listed ids without the locale, and a closed set prerendered none. | Params from `localeParams()` × ids. `localeParamSets` (fitness) fails on the old lists. |
| Perf (image loading, #55) | Replacing the deprecated `priority` with `loading="eager"` on fifteen full-bleed backgrounds changed nothing in the HTML: every one still had a `<link rel=preload>` in the head. React 19's server renderer preloads up to ten non-lazy `<img>` per page and skips only `lazy` and `fetchPriority="low"`. A source-only check had passed. | `fetchPriority="low"` beside each `eager`. `image-loading.spec.js` caught it in the rendered page, and `imageLoadingPolicy` (fitness) now refuses an `eager` image without the hint. Image preloads across the probe fell from 32 to 4. |
| Review (perf, the test) | The first `image-loading.spec.js` asserted only that each preloaded image was on screen. A fixed full-bleed background always is, so the spec passed on the `main` it was written to catch. | It now requires each preload to be an LCP candidate at desktop or phone size, with both sizes measured in one test. Run against `main`, it fails on all 15 routes. |
| Production (owner, phone) | Tapping the homepage language selector focused its search field, which raised the keyboard over the list. Then focusing that field let the whole sheet scroll sideways: its text was 14px, and iOS Safari zooms the page into a focused input smaller than 16px. | A touch or pen press focuses the listbox, which handles the same keys; a mouse or keyboard still opens into the field. The field is 16px below `sm`. `LanguageSelector.test.jsx` covers focus by press type, and `language-selector-mobile.spec.js` taps through `/` and `/ar` at 390px with touch, measuring the panel, the list and the document against the viewport. Both fail on the old component. (Widened 2026-11-08: see the landscape row below.) |
| Review (language selector) | A touch press cancelled by a scroll raises `pointercancel` and no click, so the recorded `touch` press type survived, and the next Enter or Space opened the panel into the listbox instead of the search field. | `onPointerCancel` clears the press type. `LanguageSelector.test.jsx` dispatches pointerdown, pointercancel, then a keyboard click; it fails on the old component. |
| Review (language selector) | The 16px field went back to 14px from `sm` up (`sm:text-sm`), and an iPhone in landscape is 844px wide, so a tap on the field still zoomed the page there. | The field is 16px at every width. `language-selector-mobile.spec.js` gained an 844×390 landscape block, and the component test refuses any smaller size at any breakpoint. |
| Review (test reach) | `language-selector-mobile.spec.js` carried no `@cross-browser` tag, so the two mobile projects never ran it: the iOS Safari fault it exists for was tested only in desktop Chromium. | Tagged, and its `isMobile` override (unsupported in Firefox) removed; the explicit viewport and `hasTouch` keep the tap conditions. Now runs in chromium, firefox, webkit, mobile-chrome and mobile-safari. |
| CI (axe, `/uses`) | The three Instruments tiles failed `label-content-name-mismatch` intermittently (passed on retry). Each carried an `aria-label` with the final figure while its visible digits read 0 in server HTML, or a value mid-climb, so the visible text was not part of the name whenever axe scanned before the count settled. | The tiles are named from their content: an sr-only final figure, the label, the note and an sr-only new-tab warning, with no `aria-label`. `usesInstruments.test.jsx` pins the name. |
| Keyboard (`/uses`) | Intermittently (1 run in 3): a Tab onto a Bench station's link ("Claude Code") was reported obscured by the station's note. Tab scrolled the station in, its reveal gate opened, and the stagger delay then held the link lowered out of its clipping mask while it sat still, so the settle check passed and measured a focus ring on nothing (WCAG 2.4.11). A real keyboard user saw the same blank moment. | `useStagedReveal` now returns `instant` when focus enters an element before it has revealed: it reveals at once and its layers land with a 0s transition. The Bench, Machine, Stack and Instruments plates pass it to `staged`. `stagedRevealFocus.test.jsx` fails on the old hook. |
| Review (deferred dialogs, #55) | `useDeferredMount` reported ready when the import merely settled. After a failed idle fetch, the dialog mounted, its loader failed again, and `next/dynamic` cached `optionalChunk`'s empty fallback, so both `/about` dialogs stayed invisible even after a later fetch got the real module. A click that beat the download (the `\|\| isOpen` mount bypass) did the same. | Ready means the import succeeded; a failure is retried on the next hover, focus, touch or open, and the bypasses are gone. `deferredMount.test.jsx` fails twice and then succeeds, and fails on the old hook. |
| Review (deferred dialogs, #55) | While a dialog's chunk downloaded, its open flag was already true but no backdrop existed, so the other `/about` card stayed clickable: pressing both cards before the chunks arrived mounted both dialogs open, with competing focus traps and scroll locks. | The open requests are mutually exclusive; the latest wins. Two cases in `aboutPage.test.jsx` press both cards in each order and fail on the old code. |
| Review (deferred dialogs, #55) | Escape pressed while either `/about` dialog's chunk was downloading did nothing: the open flag was already set, but the dialog's own Escape listener mounts with the dialog, so the dialog opened later anyway. | The page cancels a pending open itself, claiming the press with `claimEscape`, through a listener that exists only while an open flag is set and that dialog is not mounted, so it never competes with a mounted dialog. **new** `aboutPendingDialogEscape.test.jsx` holds each dialog module behind a gate, presses Escape, then releases the import; it fails on the old code. |
| Review (`/uses` focus reveal) | The first `instant` fix treated a reveal as finished once it was *scheduled*. Focus that arrived during the stagger delay or mid-tween left `instant` false, and a new `transition` prop cannot reach a running framer tween anyway (its target has not changed), so a Bench link could still sit clipped outside its mask. | `useStagedReveal` settles running layers explicitly (`settleRunningLayers`: stop each tween and jump its motion value to the final keyframe; framer 11's `complete()` lands on the *first* keyframe during the delay phase). Two cases in `stagedRevealFocus.test.jsx`, focus in the delay and mid-tween with real framer timing, fail on the old hook. |
| Review (`/uses` editor frame) | The pending-focus fix depends on each caller passing `instant` to its transitions, and `EditorFrame` did not, although its code block is focusable (it scrolls sideways on a phone). Tab onto it before the frame revealed turned `on` true, then the screen ran its 0.65s unroll and the line-by-line typing on schedule, so focus landed on a shut screen and untyped lines. | `EditorFrame` treats `instant` as it treats reduced motion: every layer lands with a 0s transition and the typing and resting carets are not rendered. **new** `editorFrameFocus.test.jsx` renders the real component with the real `usesData.editorFrame`, focuses the `<pre>` before the reveal with real framer timing, and requires the frame open and every line typed within two frames; it fails on the old component. |
| CI (`/uses` focus reveal) | The two running-reveal cases in `stagedRevealFocus.test.jsx` failed in CI and passed locally. `settleRunningLayers` read the layer's target from `value.animation.resolved`, a framer 11 internal; the repo pins framer 14, whose `AsyncMotionValueAnimation` has no `resolved`, so CI stopped the tween mid-way. The local `node_modules` still held framer 11.18.2 from before the upgrade, so every local run tested the wrong version. A second, intermittent fault surfaced on 14: `playedRef` trailed `played` by a passive effect, so a focus right after the reveal committed was misread as pending. | The resting value is read from the layer's own `animate` prop (public API, any version) and jumped to; `complete()` is only a fallback. `playedRef` is set in a layout effect. Verified in a clean `npm ci` copy (framer 14): the file 8 runs in 8, and the full CI command, 1,953 tests with coverage, green. |
| Perf (`/qualifications` preload) | `image-loading.spec.js` failed on every CI run since #55: the preloaded centre certificate was an LCP candidate at neither size. The carousel rendered every card at opacity 0 until its entrance began after hydration, Chrome judges an image at its first paint, and with a warm image cache the certificate had always painted (invisibly) before the fade. A slower local machine measured after the fade and passed. Visitors without JavaScript never saw a card. | The centre card renders at rest and opaque from the server HTML; only the neighbours ripple. Reproduced locally by measuring at CI speed (straight after `load`) in a clean `npm ci` build: failed before, the certificate is the phone LCP after. **new** `qualificationsFirstPaint.test.jsx` server-renders the carousel with motion on and fails on the old code. |
| Review (language selector) | After a touch or pen opened the selector, focus sat on the listbox, which reused the search field's key handler. Shift+Tab hit its unconditional Tab branch, which closed the panel and focused the trigger before the browser could move focus to the search field just before the list, so a visitor on touch with a hardware keyboard could only reach search by closing and reopening the selector. | The listbox has its own handler: Shift+Tab prevents the default, focuses the search field and leaves the panel open; every other key, plain Tab included, behaves as before. Two cases in `LanguageSelector.test.jsx` (touch, pen) fail on the old code; a plain-Tab case pins the close; `language-selector-mobile.spec.js` drives it with a real tap and a real Shift+Tab. |
| Review (language selector) | On the tap-focused listbox Space fell through to the search field's handler, which has no Space case: ArrowDown then Space neither chose the highlighted language nor stopped the list scrolling. Only Enter worked. | The listbox handler takes Space: it prevents the default and chooses the active option, as Enter does (WAI-ARIA listbox). The search field keeps Space for typing. Two cases in `LanguageSelector.test.jsx` (touch, pen) fail on the old code, one pins that the field still types Space, and `language-selector-mobile.spec.js` presses real keys in four browsers. |
| CI (`npm ci`) | Every job of a run failed at `npm ci`: GitHub Releases answered 504, and ffmpeg-static's install step, which downloads an ffmpeg binary from there, exits 1 on any error. No CI step runs ffmpeg; the package exists for the local asset scripts. | Every workflow that installs dependencies sets `FFMPEG_BIN: /usr/bin/true`, which makes the installer report "installed already" and skip the download (shown against a download URL that cannot connect). `ciInstallHermetic` fails a workflow that forgets it. |
| CI (`security.yml`) | The same Releases outage failed Gitleaks before it scanned anything: its install step downloaded the pinned tarball from GitHub Releases with a single `curl` and got a 504. Unlike ffmpeg, the binary is needed, so the download cannot be skipped. | The tarball is cached with `actions/cache@v6`, keyed on the pinned version and its SHA-256, so normal runs never reach Releases. A miss downloads with `curl --retry 6 --retry-all-errors` (plain `--retry` does not retry HTTP errors), shown recovering from two 504s against a local server. The checksum is verified on every run, cached or not. |
| Nightly (Linux WebKit, `/qualifications`) | The WebKit web process crashed on every load, JavaScript or not. Bisected to two of 2,015 CSS rules, then to one element: the carousel's Prev/Next buttons wore `.custom-bg-abt` (`backdrop-filter`) and `.text-fire-amber` (`filter: drop-shadow`) together. GNOME Web and other WebKitGTK browsers run this engine, so real visitors lost the tab too. | The amber moved onto an inner `<span>`. **new** fitness `backdropFilterPairing` keeps the two properties off one element's classes. |
| Nightly (Linux WebKit, `/ar/about`) | React #418 on every `/ar` page with a number: the system ICU 74 that Linux WebKit uses formats bare `ar` with Arabic-Indic digits ("١١"), while Node, Chromium and Apple's WebKit use current CLDR's Western digits ("11"). The catalogue formats its own numbers (`{count, number}`), so `intlTag()` could not fix it alone. | The layout stamps the server's numbering system on `<html data-numbering>` (since the review row above, for every language), and `src/instrumentation-client.js` aligns an engine that disagrees before hydration (`src/i18n/numberingAlignment.js`). Engines that agree are untouched. Unit tests, plus a fast-check property for `pinNumbering`. |
| Review (#198, numbering) | The alignment was decided from the page's own language, once, before hydration. A visit that entered on `/en` (which agrees) installed nothing, and a switch to Arabic is a soft navigation that never re-runs it, so Linux WebKit's client components printed Arabic-Indic digits beside the server's Western ones. Re-reading `<html lang>` at format time could not help either: the new locale's formatters are built during the render, before React commits the new `lang`. | The layout now writes the server's numbering for every site language (`data-numbering="ar:latn de:latn …"`), and the engine aligns every language it disagrees on up front, never reading the page again. **new** unit case: enter on English, then format Arabic while the document still says English. It fails with the old module. |
| Review (#198, subclassing) | The alignment's `construct` trap dropped `newTarget`, so on an engine with the wrappers installed, `class X extends Intl.NumberFormat` (or `DateTimeFormat` / `RelativeTimeFormat`) built a plain native instance without `X`'s methods, in every locale. | `Reflect.construct(target, args, newTarget)`. **new** unit case subclasses all three in a pinned and an unpinned locale. |
| Review (#198, fitness guard) | `backdropFilterPairing` matched a template literal whole and blanked its `${…}`, so `` `custom-bg-abt ${on ? 'text-fire-amber' : ''}` `` read as `custom-bg-abt` alone and the crashing pair passed. | A small scanner replaces the regexes: it reads quoted strings, template text, and the strings inside interpolations, recursively, and finds the end of an attribute by balanced braces. **new** cases for the conditional template and a nested one. |
| Nightly (Linux WebKit, privacy notice) | A closed header popover's panel stayed mounted, and a live `role="dialog"`, through its exit fade, so the notice's last-resort Escape stood down for a second press made during the fade. Linux WebKit holds the panel for one to three seconds, so the test's presses 400 ms apart all landed inside it, but the window exists on every engine. | The leaving panel is `inert` (`useIsPresent` in `MetricPopover`), and the notice ignores inert dialogs. **new** e2e case: two presses back to back reach the notice. It fails on Chromium with the fix undone. |
| Nightly (Linux WebKit iPhone, test bug) | `rtl.spec.js` read the footer email's glyphs sorted by `x` alone. The runner's fonts set the address one glyph too wide for 390px, its last `m` wrapped to a second line, and the test read `…abdullamh…gmail.co`. The page was right: each glyph is an inline-block, so the line may break between any two. | `visualText()` reads line by line, then left to right. |
| Review (#200, separate root) | drei's `<Html>` mounts the laptop screen in its own React root, which does not inherit the layout's `LazyMotion`, so every `m.*` on `/projects/[id]`'s screen had no renderer: the boot sequence stayed at opacity 0. | The screen gets its own `<MotionFeatures>`; the `lazyMotion` fitness rule requires one in every `<Html>`. |
| Review (#200, no terminal fallback) | The feature loader retried forever, so a chunk gone for good (deleted by a deploy) kept every entrance at its `initial` style for the visit: page content invisible after a successful hydration. | The loader gives up after three failures or 8 s, without rejecting, and the provider remounts its subtree in framer's static mode, which renders every `m.*` at its `animate` target with no renderer. |
| Review (#200, cursor) | The custom cursor hid the OS cursor on the first pointer move, but before the features land its `m.*` dot cannot follow a motion value, so the visitor had a frozen cursor and no native one. | A position counts only after the features have committed; if they never do, the native cursor stays. |
| Review (#200, tween clock) | `tweenValue` started its clock on the first frame while the intro loader's beats start at the call, so a late first frame left the counter under 100 % at the build beat and stopped the wipe short. | The clock starts at `performance.now()` on invocation; the tests stub it on the same clock as rAF. |
| Review (#200, arcs) | The `/about` rank and activity arcs started `useAnimation` controls from an effect. A viewport trigger that fired before the features chunk reached no visual element, and the chunk's arrival did not rerun the effect, so the arc stayed empty until the card re-entered the viewport. | Declarative props from `arcSweep.js`, and a remount per play. |
| Review (#200, nested presence) | `AnimatePresence` gives a child mounted after its first render its own presence, overriding the static fallback: the preference centre opened after a give-up was invisible while it took focus and locked scrolling, and so were guestbook cards when the layout chunk failed. | The site's `AnimatePresence` wrapper re-applies the static presence; a fitness rule bans framer's direct. |
| Review (#200, gated content) | The first fallback only blocked the initial animation, and framer reads that once per element, so content behind a reveal gate (`PageTitle`, the `/uses` plates) stayed at its hidden target when the gate opened. | `MotionConfig isStatic`: styles follow props on every render, with no renderer. |
| Review (#200, frozen motion values) | In static mode nothing subscribes to a MotionValue, so an effect made only of them froze at its first reading: the `/about` paragraph's scroll-scrubbed words stayed at opacity 0, and the `/journey` dial kept its first angle while `canTab` enabled the current era's year buttons, leaving focusable years off its visible arc. | `useStaticMotion()`: the words take opacity 1, and the dial's angle and label opacities come from `active` as plain numbers. |

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
