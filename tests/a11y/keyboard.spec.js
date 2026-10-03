import { ALL_ROUTES } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';

// Keyboard traversal of every route (issue #92, L6). axe inspects markup; it
// cannot press Tab. This suite does, up to MAX_STOPS times per page, and at
// every stop checks three WCAG success criteria a markup scan cannot:
//
//   2.4.7  Focus Visible: the focused element LOOKS different from how it looks
//          unfocused. Measured, not assumed: its computed outline, box-shadow,
//          border, background, colour and text decoration (and its parent's, for
//          :focus-within rings) are read focused, then unfocused, and at least
//          one must change.
//   2.4.11 Focus Not Obscured: the focused element is on screen and the topmost
//          thing at its centre, not hidden under a sticky header or overlay.
//   2.1.2  No Keyboard Trap: focus keeps moving; the same element holding it
//          for three presses in a row is a trap.

const MAX_STOPS = 60;

// Genuine 2.4.11 findings that are KNOWN and TRACKED rather than fixed here,
// because each fix is a design decision for its owner, not a line in a testing
// PR. They are REPORTED on every run (as annotations on the test, visible in
// the HTML report and the run summary), never silently dropped, and each rule
// is matched as narrowly as the finding: anything else still fails. Delete an
// entry when its fix lands and the suite is strict for it again. docs/testing.md
// lists them under "Known defects".
const KNOWN = [
  // Empty since 2026-10-03: K1 (privacy notice), K2 (skills scrub strip) and
  // K3 (in-scene laptop links) were all FIXED in issue #92's follow-up. K1 is
  // now verified by the Escape-in-place check below rather than excused.
  // Shape of an entry, for the next finding that genuinely needs its owner:
  //   { id: 'K4 …', why: '…', match: (info) => /* narrow predicate */ false },
]

/**
 * WCAG 2.4.11's own exception, TESTED rather than assumed: content that covers
 * the focused element passes if the visitor can dismiss it without moving
 * focus. The privacy notice is the one such surface (issue #92 made its Escape
 * page-wide for exactly this). Press Escape, then confirm the notice is gone,
 * focus did not move, and the element is no longer covered.
 */
function noticeDismissedInPlace(beforeId) {
  const el = document.activeElement;
  const noticeGone = !document.querySelector('section[aria-label="Privacy notice"]');
  const r = el?.getBoundingClientRect();
  const top = r ? document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1)) : null;
  const visible = !!top && (top === el || el.contains(top) || top.contains(el));
  return { noticeGone, focusKept: el?.dataset?.kbProbe === beforeId, visible };
}

/** Resolve once the focused element's box is unchanged for three frames. */
function settleFocusBox() {
  return new Promise((resolve) => {
    const deadline = performance.now() + 1500;
    let last = '';
    let still = 0;
    const tick = () => {
      const el = document.activeElement;
      const r = el?.getBoundingClientRect();
      const key = r ? [r.top, r.left, r.width, r.height].map(Math.round).join() : '';
      still = key === last ? still + 1 : 0;
      last = key;
      if (still >= 3 || performance.now() > deadline) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Snapshot the focused element: identity, geometry, and whether it looks focused. */
function inspectFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const read = (node) => {
    if (!node) return '';
    const s = getComputedStyle(node);
    return [
      s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow,
      s.borderTopColor, s.borderBottomColor, s.backgroundColor, s.color,
      s.textDecorationLine, s.opacity, s.transform,
    ].join('|');
  };
  const focused = [read(el), read(el.parentElement)];
  el.blur();
  const unfocused = [read(el), read(el.parentElement)];
  el.focus({ focusVisible: true });
  const r = el.getBoundingClientRect();
  // 2.4.11 (Minimum) fails only when the focused element is ENTIRELY hidden by
  // author content; partly covered passes. So sample the centre and four inset
  // corners, and call it obscured only if every visible sample is covered.
  const clampX = (x) => Math.min(Math.max(x, 0), innerWidth - 1);
  const clampY = (y) => Math.min(Math.max(y, 0), innerHeight - 1);
  const inset = (a, b) => a + Math.min(4, (b - a) / 4);
  const samples = [
    [r.left + r.width / 2, r.top + r.height / 2],
    [inset(r.left, r.right), inset(r.top, r.bottom)],
    [r.right - Math.min(4, r.width / 4), inset(r.top, r.bottom)],
    [inset(r.left, r.right), r.bottom - Math.min(4, r.height / 4)],
    [r.right - Math.min(4, r.width / 4), r.bottom - Math.min(4, r.height / 4)],
  ].map(([x, y]) => document.elementFromPoint(clampX(x), clampY(y)));
  const covers = (node) => !!node && node !== el && !el.contains(node) && !node.contains(el);
  const top = samples.find(covers) ?? samples[0];
  const label =
    el.getAttribute('aria-label') ||
    el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40) ||
    el.getAttribute('name') ||
    `.${String(el.className).split(' ')[0]}`;
  // Trap detection happens here, in the page, where element identity exists.
  const same = window.__kbPrevious === el;
  window.__kbPrevious = el;
  return {
    id: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${label}"`,
    same,
    inNotice: !!top?.closest?.('section[aria-label="Privacy notice"]'),
    indicator: focused[0] !== unfocused[0] || focused[1] !== unfocused[1],
    onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    obscured: samples.every(covers),
    obscuredBy: top
      ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 30)} (focus at y ${Math.round(r.top)}-${Math.round(r.bottom)} of ${innerHeight})`
      : '',
  };
}

for (const path of ALL_ROUTES) {
  test(`${path} — every Tab stop is visible, unobscured and escapable`, async ({ page }) => {
    // Up to MAX_STOPS presses, each waiting ≤1.5 s for the focus box to settle:
    // well past the 60 s default on a loaded runner (seen at 2.7× slow).
    test.setTimeout(180_000);
    await page.goto(path);
    await settle(page);
    const problems = [];
    let repeats = 0;
    let stops = 0;

    for (let i = 0; i < MAX_STOPS; i += 1) {
      await page.keyboard.press('Tab');
      // Judge what a person SEES: wait (≤1.5 s) for the focused element's box
      // to hold still for three frames. Reveals that play as a section scrolls
      // in (the footer's split-flap, for one) would otherwise be measured
      // mid-flip, at 1 px tall with the effect's overlay on top.
      await page.evaluate(settleFocusBox);
      const info = await page.evaluate(inspectFocus);
      if (!info) {
        if (stops > 0) break; // focus left the document: one full cycle done
        continue;
      }
      stops += 1;
      repeats = info.same ? repeats + 1 : 0;
      if (repeats >= 2) {
        problems.push(`2.1.2 keyboard trap at ${info.id}`);
        break;
      }
      if (!info.indicator) problems.push(`2.4.7 no visible focus indicator: ${info.id}`);
      const hidden = !info.onScreen
        ? `2.4.11 focused off-screen: ${info.id}`
        : info.obscured
          ? `2.4.11 obscured by ${info.obscuredBy}: ${info.id}`
          : null;
      if (hidden && info.inNotice) {
        const probe = `kb-${i}`;
        await page.evaluate((id) => {
          document.activeElement.dataset.kbProbe = id;
        }, probe);
        // Escape yields to anything the focused control opened itself (a
        // popover on focus), so allow a second press for the notice.
        let after;
        for (let press = 0; press < 3; press += 1) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400); // exit fades
          after = await page.evaluate(noticeDismissedInPlace, probe);
          if (after.noticeGone) break;
        }
        if (!(after.noticeGone && after.focusKept && after.visible)) {
          problems.push(`${hidden} — and Escape did not clear it in place (${JSON.stringify(after)})`);
        }
        continue;
      }
      if (hidden) {
        const known = KNOWN.find((k) => k.match(info));
        if (known) test.info().annotations.push({ type: `known ${known.id}`, description: `${hidden} — ${known.why}` });
        else problems.push(hidden);
      }
    }

    expect(stops, `${path} has no keyboard-focusable content at all`).toBeGreaterThan(0);
    expect([...new Set(problems)]).toEqual([]);
  });
}
