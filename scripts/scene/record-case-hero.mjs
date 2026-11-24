// Record the live homepage for the case-study hero loop (issue #31, owner
// 2026-11-21). Headful Chromium on purpose: headless software raster fakes
// jank and misses GPU-only rendering (see the memory of both), and this clip
// IS the page's testimony, so it is captured the way a visitor sees it.
//
//   node scripts/scene/record-case-hero.mjs [url] [outDir]
//
// Defaults: https://ma.codes/ into .scene-work/case-hero/. Hand the saved
// .webm to finish-case-hero.mjs, which finds the orbit's loop pair, closes
// the seam exactly, and exports every shipped rung and the hero.webp still.
//
// What the settle wait covers, in order: the intro seal (home entry plays
// it), the staggered 8-button reveal (~2.1s after the loader lifts), the
// orbit-tip window (dismissal pre-seeded below, belt and braces), and the
// render loop easing up to the ambient 9°/s. Consent is pre-seeded DECLINED
// so no notice pops and no analytics load; the orbit tip's localStorage key
// is pre-seeded so a "first visit" hint can never surface mid-take.
//
// The recording length leaves room to hunt a full orbit label cycle: eight
// distinct buttons at 9°/s repeat exactly every 40s, and the finisher wants
// candidates on both sides of one cycle from several reference frames.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL_ = process.argv[2] ?? 'https://ma.codes/';
const OUT_DIR = process.argv[3] ?? '.scene-work/case-hero';
const SETTLE_MS = 28_000;
const RECORD_MS = 85_000;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2, // compositor renders 3200×2000; the 1600×1000 screencast is supersampled
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  recordVideo: { dir: OUT_DIR, size: { width: 1600, height: 1000 } },
});
await context.addInitScript(() => {
  try {
    localStorage.setItem(
      'ma:consent:v1',
      JSON.stringify({ version: 1, analytics: false, decidedAt: new Date().toISOString() }),
    );
    localStorage.setItem('nav-orbit-tip:dismissed', 'true');
  } catch {}
});

const page = await context.newPage();
console.log('navigating to', URL_);
await page.goto(URL_, { waitUntil: 'load', timeout: 60_000 });
console.log(`loaded; settling ${SETTLE_MS}ms (seal, reveal, ambient spin)…`);
await page.waitForTimeout(SETTLE_MS);
console.log(`recording ${RECORD_MS}ms…`);
await page.waitForTimeout(RECORD_MS);
const video = page.video();
await context.close(); // finalizes the file
console.log('saved:', await video.path());
await browser.close();
