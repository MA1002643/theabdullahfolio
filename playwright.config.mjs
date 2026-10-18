import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Browser test config (issue #40 Phase 6; grown into the browser layers of
// issue #92). Runs against a PRODUCTION server (`next start` via the repo's
// Node-version guard) on a dedicated port so it never fights the dev server on
// 3000 — this repo's dev tooling actively kills competing dev servers, so the
// test server must not look like one. `npm run build` must have run first; the
// `test:e2e` script chains it.
//
// ── Projects ────────────────────────────────────────────────────────────────
// Each project is one QUESTION, and docs/testing.md maps them:
//
//   chromium        every e2e spec, desktop Chrome — the full behavioural suite.
//   webkit/firefox  the @cross-browser subset on the other two engines.
//   mobile-chrome   the @cross-browser subset on a Pixel 7 (touch, 412px).
//   mobile-safari   the same on an iPhone 14 (WebKit, touch, 390px).
//   a11y            axe (WCAG 2.2 AA), keyboard traversal, motion — tests/a11y.
//   security        served headers and API hardening — tests/security.
//   perf            in-browser Web Vitals — tests/perf.
//   visual          screenshot baselines — tests/visual, LINUX ONLY (below).
//
// PRs run chromium + mobile-chrome + a11y + security + perf (+ visual on the
// Linux runner); the nightly workflow adds webkit, firefox and mobile-safari.
//
// ── Why the visual project is Linux-only ────────────────────────────────────
// Font rasterisation differs between macOS and Linux by a pixel here and there,
// which is a diff on every glyph. Baselines are rendered in the official
// Playwright Linux container (`npm run test:visual:update` runs Docker) and CI
// compares on Linux. On a Mac the project is simply not defined, rather than
// defined and skipped: a run that cannot compare honestly should not report.
//
// And only once baselines EXIST. They are rendered by the "Visual baselines"
// workflow on GitHub's amd64 runners (Chromium will not run under Docker's
// amd64 emulation on Apple silicon, and an arm64 render could differ from CI
// by a pixel). Until the first set is committed the layer is not armed rather
// than failing every PR on "snapshot missing". The workflow's --update-snapshots
// run sets VISUAL=1 to render them.
const HAS_BASELINES = existsSync(new URL('./tests/visual/__screenshots__', import.meta.url));
const RUN_VISUAL = process.env.VISUAL === '1' || (process.platform === 'linux' && HAS_BASELINES);

const CI = Boolean(process.env.CI);

// The subset every engine and device runs: journeys a visitor on ANY browser
// takes. Engine-specific rendering is the visual layer's business, not this.
const CROSS_BROWSER = /@cross-browser/;

export default defineConfig({
  testDir: 'tests',
  // Only *.spec.js. The Vitest suites under tests/ are *.test.js(x); without
  // this Playwright's default match would try to run them too.
  testMatch: '**/*.spec.js',
  timeout: 60 * 1000,
  // 15 s, not the 10 s first used: a loaded run (2.7× slower, 2026-09-30)
  // failed three otherwise-green assertions on this budget alone, all of
  // which pass in isolation. Auto-waiting means a fast pass is not slowed.
  expect: { timeout: 15 * 1000 },
  // Retries in CI only, so a flake is REPORTED as flaky (retried and passed)
  // instead of hidden. Locally a failure should fail, loudly, the first time.
  retries: CI ? 2 : 0,
  forbidOnly: CI,
  // Quarantine (docs/testing.md, Maintenance): a test tagged `@quarantine`,
  // with its issue linked (tests/fitness/testHygiene.test.js), is left out of
  // every run, so it is not a merge gate, unless PW_INCLUDE_QUARANTINE=1. The
  // nightly `quarantine` job sets it and runs ONLY the tagged tests, so a
  // parked test keeps running, visibly, until it is fixed. Every project
  // inherits this; none sets its own `grepInvert`.
  grepInvert: process.env.PW_INCLUDE_QUARANTINE === '1' ? undefined : /@quarantine/,
  // One server, shared; parallel workers against it are fine (every spec is
  // read-only or stubs its writes), but CI runners are 4-core.
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never' }],
        // Overridable so a job that runs Playwright twice (ci.yml `quality`)
        // keeps both reports: each run otherwise rewrites this one file.
        // `includeRetries` writes each failed attempt as <flakyFailure> /
        // <rerunFailure>; without it (the default) a retried pass is a bare
        // passing <testcase> and scripts/test-summary.mjs can never name it.
        [
          'junit',
          {
            outputFile: process.env.PLAYWRIGHT_JUNIT_FILE || 'test-results/playwright-junit.xml',
            includeRetries: true,
          },
        ],
      ]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Image-cache warm-ups (tests/warmup/images.setup.js says why). Each one
    // matches its dependant's viewport and pixel ratio, so it requests the same
    // image widths; `--project=chromium` runs its warm-up first automatically.
    { name: 'warm-desktop', testDir: 'tests/warmup', testMatch: '*.setup.js', use: { ...devices['Desktop Chrome'] } },
    { name: 'warm-mobile', testDir: 'tests/warmup', testMatch: '*.setup.js', use: { ...devices['Pixel 7'] } },
    // axe.spec.js scans "desktop" at 1440×900 with reduced motion, not at
    // Desktop Chrome's 1280×720, and the width changes the image sizes the
    // browser picks: /qualifications' certificate cards ask for w=384 at 1280
    // but w=640 at 1440. So warm-desktop did not cover that scan. Its first visit
    // queued every w=640 encode itself (35 s in the quality job; over 60 s, a
    // timeout, in PR burn-in), and each later visit took about 11 s.
    // Match axe's exact context, reduced motion included: it decides which
    // lazy images load at all.
    {
      name: 'warm-axe-desktop',
      testDir: 'tests/warmup',
      testMatch: '*.setup.js',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } },
    },
    { name: 'chromium', testDir: 'tests/e2e', dependencies: ['warm-desktop'], use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', testDir: 'tests/e2e', grep: CROSS_BROWSER, use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', testDir: 'tests/e2e', grep: CROSS_BROWSER, use: { ...devices['Desktop Firefox'] } },
    {
      name: 'mobile-chrome',
      testDir: 'tests/e2e',
      grep: CROSS_BROWSER,
      dependencies: ['warm-mobile'],
      use: { ...devices['Pixel 7'] },
    },
    { name: 'mobile-safari', testDir: 'tests/e2e', grep: CROSS_BROWSER, use: { ...devices['iPhone 14'] } },
    // The three Desktop Chrome quality projects visit every route cold too, so
    // they share the desktop warm-up. Without it, PR #160's burn-in ran axe on
    // /qualifications while the warm-up encoded the same images, and the page
    // missed the 60 s limit with retries off.
    {
      name: 'a11y',
      testDir: 'tests/a11y',
      dependencies: ['warm-desktop', 'warm-axe-desktop'],
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'security', testDir: 'tests/security', dependencies: ['warm-desktop'], use: { ...devices['Desktop Chrome'] } },
    { name: 'perf', testDir: 'tests/perf', dependencies: ['warm-desktop'], use: { ...devices['Desktop Chrome'] } },
    ...(RUN_VISUAL
      ? [
          {
            name: 'visual',
            testDir: 'tests/visual',
            snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1280, height: 800 },
              deviceScaleFactor: 1,
              // Inside contextOptions: a top-level `reducedMotion` is not a test
              // option in this Playwright and would be silently ignored.
              contextOptions: { reducedMotion: 'reduce' },
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: 'node scripts/next-cmd.mjs start -p 3100',
    port: 3100,
    // Never silently adopt whatever is on 3100. Playwright's usual
    // `!process.env.CI` idiom reuses ANY process on the port WITHOUT applying
    // the env block below — so a stale `next start` (old build, real Redis,
    // no AUTH_SECRET) could be what the specs actually hit; and since
    // `test:e2e` now builds first, "reuse" would mean testing the build
    // BEFORE the one just produced. Reuse is an explicit opt-in for iterating
    // on specs against a server you started yourself with the same env:
    //   E2E_REUSE_SERVER=1 npx playwright test
    // Otherwise an occupied port is a loud error, not a silent substitution.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 120 * 1000,
    env: {
      // ── The network sandbox (issue #92) ─────────────────────────────────
      // Preloaded into the server process: any `fetch` to a host other than
      // this machine REJECTS, and says so on stderr. Blanking credentials
      // (below) makes the routes skip most outbound calls, but only by the
      // routes' own choice; the sandbox makes it structural. A spec that
      // passes here cannot secretly depend on GitHub, Spotify or Abstract
      // being up, because none of them is reachable from this server.
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ./tests/support/network-sandbox.cjs`.trim(),
      NEXT_TELEMETRY_DISABLED: '1',
      GUESTBOOK_DRIVER: 'json',
      // A served production REFUSES the json driver (store.js — one env-var
      // mistake on Vercel would make every write non-durable) unless this
      // second, e2e-only variable is set to exactly this value. This server
      // is hermetic and disposable, so here it is right; nowhere else.
      GUESTBOOK_ALLOW_JSON_IN_PRODUCTION: 'e2e-non-durable',
      // Hermetic means NOTHING reaches the live store. Playwright merges this
      // block over the parent process.env, and `next start` loads .env.local
      // besides — either can carry the real Upstash credentials — while the
      // presence path keys on `redisAvailable` alone by design (it ignores
      // GUESTBOOK_DRIVER), so the smoke spec's un-stubbed heartbeat would land
      // in production's "here now" set. An EMPTY value is still a defined
      // variable: it overrides the shell AND blocks .env.local (Next never
      // overwrites a variable that is already set), and redisDriver reads
      // empty as unconfigured → in-memory presence, in-memory limiter.
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      // The same treatment for every other outbound credential (issue #92):
      // empty, so .env.local cannot supply a real one to the test server.
      GITHUB_TOKEN: '',
      GITHUB_PROJECT_TOKEN: '',
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_CLIENT_SECRET: '',
      SPOTIFY_REFRESH_TOKEN: '',
      ABSTRACT_API_KEY: '',
      OPENAI_API_KEY: '',
      AI_GATEWAY_API_KEY: '',
      GSC_SERVICE_ACCOUNT_KEY: '',
      NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
      // Mail too, and not by blanking alone: /api/send-mail does not use
      // fetch, so the fetch sandbox never saw it, and a blank SMTP_HOST is
      // not "no mail", it is nodemailer's default of localhost:587. Point the
      // transport at a local port nothing serves, with no account and no
      // recipient, so an un-stubbed valid POST fails before anything leaves.
      // network-sandbox.cjs also refuses any non-local TCP connection, so a
      // host supplied some other way is stopped there too.
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1',
      SMTP_SECURE: 'false',
      SMTP_USER: '',
      SMTP_PASS: '',
      RECEIVER_EMAIL: '',
      AUTH_SECRET: randomBytes(32).toString('base64'),
      // The gate secrets, minted per run exactly like AUTH_SECRET (issue #92):
      // set, so tests/security/api-hardening.spec.js exercises the real 401
      // path of every gate rather than its "not configured" fallback; random,
      // so no value exists anywhere a person could reuse. No spec knows them.
      CRON_SECRET: randomBytes(32).toString('hex'),
      GITHUB_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
      LOCATION_INGEST_TOKEN: randomBytes(32).toString('hex'),
      LOCATION_INGEST_QUERY_TOKEN: randomBytes(32).toString('hex'),
      // `next start` runs in production mode, where Auth.js refuses untrusted
      // hosts — trust the test server's own localhost:3100.
      AUTH_TRUST_HOST: 'true',
    },
  },
});
