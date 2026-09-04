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
  // Next writes JSX in .js files (every app/**/page.js). Vite 8's oxc
  // transform runs only on .ts/.jsx/.tsx by default AND excludes every .js
  // outright, and even once a .js file is let through it is parsed as plain
  // JS from its extension — so a test that imports a page (the guestbook
  // motion-toggle suite does) failed first at import analysis, then on the
  // first JSX expression. Three settings put that right: the default include
  // kept with src/**/*.js added, the .js exclusion lifted, and the language
  // pinned to jsx (honoured at runtime ahead of the extension; the option is
  // absent from the type). The repo is JavaScript-only, which is what makes
  // the pin safe — a TypeScript file would need this revisited. node_modules
  // never match the include, so nothing there is re-parsed. (`esbuild` is
  // the deprecated key on this Vite and does not reach the filter.)
  oxc: {
    include: [/\.(m?ts|[jt]sx)$/, /\/src\/.*\.js$/],
    exclude: [],
    lang: 'jsx',
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
