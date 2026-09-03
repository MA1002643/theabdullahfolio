import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit-test runner (issue #40 Phase 6). Node environment on purpose — the
// units under test (timeAgo, the signature grammar, the rate limiter, the
// storage drivers) are pure server/shared modules; nothing here needs a DOM.
// The e2e smoke test lives in tests/e2e under Playwright, not vitest.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
