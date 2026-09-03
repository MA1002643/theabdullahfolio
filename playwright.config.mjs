import { defineConfig } from '@playwright/test';

// E2E smoke config (issue #40 Phase 6). Runs against a PRODUCTION server
// (`next start` via the repo's Node-version guard) on a dedicated port so it
// never fights the dev server on 3000 — this repo's dev tooling actively
// kills competing dev servers, so the test server must not look like one.
// `npm run build` must have run first; the `test:e2e` script chains it.
//
// AUTH_SECRET here is a knowingly fake constant so the Auth.js session
// endpoint boots (the smoke test needs `unauthenticated`, not a crash) — it
// is not a credential and must never be a real value.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60 * 1000,
  use: {
    baseURL: 'http://localhost:3100',
  },
  webServer: {
    command: 'node scripts/next-cmd.mjs start -p 3100',
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      GUESTBOOK_DRIVER: 'json',
      AUTH_SECRET: 'insecure-playwright-smoke-test-secret',
      // `next start` runs in production mode, where Auth.js refuses untrusted
      // hosts — trust the test server's own localhost:3100.
      AUTH_TRUST_HOST: 'true',
    },
  },
});
