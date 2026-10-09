import { ALL_ROUTES } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';

// Core Web Vitals measured inside the page (issue #92, L8).
//
// Lighthouse CI measures six routes in a synthetic lab run. This complements
// it on EVERY route, with the browser's own PerformanceObserver, and through a
// scroll to the bottom and back: most layout shift on a site like this happens
// below the fold, as sections reveal, which a load-only lab run never reaches.
//
//   CLS  ENFORCED at 0.1, Google's "good" threshold. Layout shift is a property
//        of the page, not of the machine, so a slow CI runner scores the same
//        as a laptop and a regression is real. Scored the way Core Web Vitals
//        scores it: shifts are grouped into session windows (each shift less
//        than 1 s after the previous one, the window at most 5 s long) and CLS
//        is the LARGEST window, not the sum over the page's life. Summing made
//        a long page's multi-second scroll fail a budget its real CLS passes
//        (code review).
//   LCP  RECORDED, not enforced: it is timing, and a shared runner's timing is
//        noise. Each run attaches it as an annotation for trend-reading, the
//        same honesty lighthouserc.json applies to its performance category.

const CLS_BUDGET = 0.1;

async function observe(page) {
  await page.addInitScript(() => {
    window.__vitals = { cls: 0, lcp: 0, shifts: [] };
    let windowValue = 0;
    let windowStart = 0;
    let lastShift = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue; // shifts caused by the user do not count
        const continues = windowValue > 0 && e.startTime - lastShift < 1000 && e.startTime - windowStart < 5000;
        if (continues) {
          windowValue += e.value;
        } else {
          windowValue = e.value;
          windowStart = e.startTime;
        }
        lastShift = e.startTime;
        window.__vitals.cls = Math.max(window.__vitals.cls, windowValue);
        if (e.value > 0.01) {
          const node = e.sources?.[0]?.node;
          window.__vitals.shifts.push(
            `${e.value.toFixed(3)} ${node ? `${node.nodeName.toLowerCase()}.${String(node.className ?? '').slice(0, 40)}` : ''}`,
          );
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__vitals.lcp = entries[entries.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
}

for (const path of ALL_ROUTES) {
  test(`${path} — CLS ≤ ${CLS_BUDGET} through load and a full scroll`, async ({ page }, testInfo) => {
    await observe(page);
    await page.goto(path);
    await settle(page);
    // Scroll the whole page in viewport-sized steps, then back to the top.
    await page.evaluate(async () => {
      const step = innerHeight * 0.8;
      for (let y = 0; y < document.scrollingElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
    });
    const vitals = await page.evaluate(() => window.__vitals);
    testInfo.annotations.push({ type: 'LCP', description: `${Math.round(vitals.lcp)} ms` });
    testInfo.annotations.push({ type: 'CLS', description: vitals.cls.toFixed(4) });
    expect(
      vitals.cls,
      `${path} shifted ${vitals.cls.toFixed(3)}; largest shifts:\n  ${vitals.shifts.join('\n  ')}`,
    ).toBeLessThanOrEqual(CLS_BUDGET);
  });
}
