import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// Flat config (Next 16 removed `next lint` and the legacy .eslintrc format).
// Same rule set as the .eslintrc.json it replaces: Next's core-web-vitals,
// the full jsx-a11y recommended set, and one override.
//
// jsx-a11y's rules are spread in rather than its flat config, because Next's
// config already registers the `jsx-a11y` plugin and a flat config may not
// define the same plugin twice.
export default defineConfig([
  ...nextVitals,
  { rules: jsxA11y.flatConfigs.recommended.rules },
  {
    rules: {
      // Safari's VoiceOver drops list semantics from a list styled
      // `list-style: none` unless the role is restated (docs/testing.md, L1).
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
      // eslint-plugin-react-hooks 7 (with eslint-config-next 16) added rules
      // that check code is safe for the React Compiler. This site does not
      // use the compiler, and these rules found 133 sites when they arrived,
      // none of them a regression. Warnings, so they stay visible without
      // turning a framework upgrade into a rewrite of every effect;
      // adopting the compiler is its own change.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  globalIgnores(['.next/**', '.next.nosync/**', 'out/**', 'build/**', 'coverage/**']),
]);
