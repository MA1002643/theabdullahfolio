import { ALL_ROUTES } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';

// The image loading policy, checked in the browser (issue #55, L8).
//
// tests/fitness/imageLoadingPolicy.test.js reads the source: no deprecated
// `priority`, and `preload` only on the allowlisted images. This checks what
// the source cannot know, on every route, by loading it at a desktop AND a
// phone size, because the LCP is a different element on each (the home
// backdrop is the LCP on a phone, the <h1> is on desktop):
//
//   1. Every image the route preloads is an LCP candidate at one of the two
//      sizes. One <Image> cannot preload per viewport, so a preload that
//      earns its place on either is right. A preload that is the LCP at
//      neither is bandwidth taken from the fonts and CSS the real LCP is
//      waiting for, which is what fifteen full-bleed backgrounds were doing
//      before #55 (Chrome treats a viewport-covering image as a background,
//      so they never were candidates).
//   2. An LCP that IS an image is never `loading="lazy"`. A lazy image waits
//      for layout before its request starts, the commonest way to make an LCP
//      slow.
//
// It enforces facts about the page, not timing, so a slow runner cannot fail
// it. Both sizes run in ONE test so they share the hermetic page fixture.

const SIZES = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};

async function measure(page, path) {
  await page.goto(path);
  await settle(page);
  return page.evaluate(() => {
    // The source image behind a next/image URL (`/_next/image?url=%2Fa.webp&w=…`),
    // so a preload's srcset, an LCP entry and an <img> compare equal.
    const source = (u) => {
      if (!u) return '';
      try {
        const url = new URL(u.split(' ')[0], location.href);
        return url.searchParams.get('url') || url.pathname;
      } catch {
        return u;
      }
    };
    const entries = window.__lcpEntries;
    const last = entries.at(-1);
    const lcpImage = last?.element?.tagName === 'IMG' ? last.element : null;
    return {
      preloads: [...document.querySelectorAll('link[rel="preload"][as="image"]')].map((link) =>
        source(link.getAttribute('imagesrcset') || link.href),
      ),
      candidates: entries.filter((e) => e.url).map((e) => source(e.url)),
      lcp: lcpImage ? { src: source(lcpImage.currentSrc), loading: lcpImage.getAttribute('loading') } : null,
    };
  });
}

for (const path of ALL_ROUTES) {
  test(`${path} — preloads only an LCP image, and never lazy-loads one`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      window.__lcpEntries = [];
      new PerformanceObserver((list) => window.__lcpEntries.push(...list.getEntries())).observe({
        type: 'largest-contentful-paint',
        buffered: true,
      });
    });

    const runs = {};
    for (const [name, size] of Object.entries(SIZES)) {
      await page.setViewportSize(size);
      runs[name] = await measure(page, path);
      if (runs[name].lcp) {
        expect(runs[name].lcp.loading, `${path}'s LCP image at ${name} size is lazy-loaded`).not.toBe('lazy');
      }
    }

    const candidates = new Set(Object.values(runs).flatMap((r) => r.candidates));
    const preloads = new Set(Object.values(runs).flatMap((r) => r.preloads));
    expect(
      [...preloads].filter((p) => !candidates.has(p)),
      `${path} preloads images that are the LCP at neither desktop nor phone size`,
    ).toEqual([]);
  });
}
