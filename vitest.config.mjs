import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest runner (issue #40 Phase 6, split into projects by issue #92).
//
// One config, five projects, each answering a different question — see
// docs/testing.md for the full map:
//
//   unit       the original suite. Node environment; files that need a DOM opt
//              in per file with the environment pragma.
//   property   fast-check invariants over generated input (tests/property).
//   fitness    architecture rules read from the source tree itself — env
//              hygiene, the API method surface, the client/server contract.
//   component  React components in jsdom via Testing Library + user-event,
//              network answered by MSW (tests/component).
//   api        route handlers invoked directly, outbound HTTP answered by MSW,
//              Redis replaced by a stateful fake (tests/api).
//
// `npm test` runs all five; `npm run test:<project>` runs one. Browser layers
// (e2e, a11y, visual, security, perf) live under Playwright, not here.
const project = (name, overrides = {}) => ({
  extends: true,
  test: {
    name,
    include: [`tests/${name}/**/*.test.{js,jsx}`],
    environment: 'node',
    ...overrides,
  },
});

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
  // kept with src/**/*.js added, the .js exclusion swapped for a node_modules
  // one, and the language pinned to jsx (honoured at runtime ahead of the
  // extension; the option is absent from the type). The repo is
  // JavaScript-only, which is what makes the pin safe — a TypeScript file
  // would need this revisited. The node_modules exclusion is what keeps the
  // pin safe for DEPENDENCIES too: the default include matches a package's
  // .jsx / .ts / .mts files and the src/*.js pattern matches any package that
  // ships a src/ directory, so without it an inlined dependency would be
  // re-parsed as JSX — a .ts file fails outright. Vitest externalises
  // node_modules by default, so this is a guard rather than a hot path.
  // (`esbuild` is the deprecated key on this Vite and does not reach the
  // filter.)
  oxc: {
    include: [/\.(m?ts|[jt]sx)$/, /\/src\/.*\.js$/],
    exclude: [/\/node_modules\//],
    lang: 'jsx',
  },
  test: {
    projects: [
      project('unit'),
      project('property'),
      project('fitness'),
      project('component', {
        environment: 'jsdom',
        setupFiles: ['tests/support/setup-component.js'],
      }),
      project('api', { setupFiles: ['tests/support/setup-api.js'] }),
    ],
    // Coverage is measured over the code the Vitest layers can actually reach.
    // Pages, WebGL scenes and animation-heavy components are the browser
    // layers' job, and counting them here would only turn the percentage into
    // noise. The thresholds are a RATCHET: they sit just under the figure
    // measured when this was introduced (docs/testing.md records it), so a
    // change can raise coverage freely but cannot drop it without touching this
    // file in review.
    coverage: {
      provider: 'v8',
      include: [
        'src/utils/**/*.js',
        'src/lib/**/*.js',
        'src/app/api/**/*.js',
        'src/hooks/**/*.js',
        'src/components/contact/**/*.jsx',
      ],
      exclude: ['**/*.test.*', 'src/lib/og/**'],
      reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      // Measured 2026-09-29 over the include list above: lines 58.96,
      // statements 57.21, functions 59.02, branches 48.68 (1,239 tests).
      thresholds: {
        lines: 58,
        functions: 58,
        branches: 48,
        statements: 56,
      },
    },
  },
});
