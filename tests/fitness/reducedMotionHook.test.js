import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// One way to read the reduced-motion preference (issue #92).
//
// framer-motion's own useReducedMotion returns the real preference on the
// FIRST client render, which differs from the server's, and that made React
// throw hydration errors on every page for every visitor with reduced motion
// set. src/hooks/useReducedMotion.js is the hydration-safe replacement (and
// also honours the guestbook's MotionConfig toggle). 42 components were moved
// onto it; this keeps the 43rd from quietly bringing the bug back.

const SOURCES = walk('src', /\.(m?js|jsx)$/);

describe('reduced-motion hook', () => {
  it('is never imported from framer-motion directly', () => {
    const offenders = SOURCES.filter((file) => {
      if (file === 'src/hooks/useReducedMotion.js') return false;
      const code = stripComments(read(file));
      return /import\s*\{[^}]*\buseReducedMotion\b[^}]*\}\s*from\s*['"]framer-motion['"]/.test(code);
    });
    expect(
      offenders,
      'Import useReducedMotion from "@/hooks/useReducedMotion" instead: framer-motion’s ' +
        'hook breaks hydration for reduced-motion visitors.',
    ).toEqual([]);
  });

  it('the shared hook itself stays hydration-safe (server snapshot = motion on)', () => {
    const code = stripComments(read('src/hooks/useReducedMotion.js'));
    expect(code).toMatch(/useSyncExternalStore\(\s*subscribe,\s*getSnapshot,\s*getServerSnapshot\s*\)/);
    expect(code).toMatch(/const getServerSnapshot = \(\) => false;/);
  });

  it('the root layout keeps framer-motion honouring the OS preference', () => {
    expect(read('src/app/layout.js')).toMatch(/<MotionPreferences>/);
    expect(read('src/components/MotionPreferences.jsx')).toMatch(/reducedMotion="user"/);
  });
});
