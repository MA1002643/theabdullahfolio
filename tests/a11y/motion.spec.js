import { ALL_ROUTES } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';

// Reduced motion, honoured (issue #92, L6). WCAG 2.2.2 (Pause, Stop, Hide)
// forbids motion that starts automatically, lasts more than five seconds and
// cannot be paused; `prefers-reduced-motion: reduce` is the visitor saying so
// in advance. With it set, no page may keep anything moving FOREVER.
//
// Three kinds of endless motion are checked, because a site can loop in three
// different machineries:
//   • CSS animations and Web Animations with infinite iterations
//     (document.getAnimations(), which sees both);
//   • SVG SMIL <animate repeatCount="indefinite"> on something rendered;
//   • looping <video> that is playing.
// JavaScript rAF loops (framer's repeat: Infinity, canvas) are invisible to all
// three; the site's own useReducedMotion gates are covered by the unit suite.

// Inside contextOptions: this Playwright has no top-level `reducedMotion`
// test option, and a top-level key is silently ignored (the first run of
// this suite scanned with motion ON because of exactly that).
test.use({
  contextOptions: { reducedMotion: 'reduce' },
});

function endlessMotion() {
  const found = [];
  const describe = (el) =>
    el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}` : '?';
  for (const a of document.getAnimations()) {
    const timing = a.effect?.getComputedTiming?.();
    if (a.playState === 'running' && timing?.iterations === Infinity) {
      found.push(`animation "${a.animationName ?? a.id ?? 'waapi'}" on ${describe(a.effect.target)}`);
    }
  }
  for (const node of document.querySelectorAll('animate, animateTransform, animateMotion')) {
    const host = node.closest('svg');
    const shown = host && host.getBoundingClientRect().width > 0 && getComputedStyle(host).visibility !== 'hidden';
    if (shown && node.getAttribute('repeatCount') === 'indefinite') {
      found.push(`SMIL <${node.tagName}> in ${describe(host)}`);
    }
  }
  for (const v of document.querySelectorAll('video')) {
    if (v.loop && !v.paused) found.push(`looping video ${describe(v)}`);
  }
  return found;
}

for (const path of ALL_ROUTES) {
  test(`${path} — nothing moves forever under prefers-reduced-motion`, async ({ page }) => {
    await page.goto(path);
    await settle(page);
    await page.waitForTimeout(2500); // past every entrance; only loops remain
    expect(await page.evaluate(endlessMotion)).toEqual([]);
  });
}
