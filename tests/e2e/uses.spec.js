import { expect, test } from '@playwright/test';

// /uses (issue #37) against the production server: the route answers, the
// six plates render with the sitewide title, the Stack plate renders live
// counts from a network-stubbed payload and drops the LIVE claim on an empty
// one, external links are safe, a phone has no horizontal overflow, and
// reduced motion leaves nothing transformed.

const PLATES = ['machine', 'bench', 'stack', 'pipeline', 'instruments', 'bom'];

const LIVE_PAYLOAD = {
  categories: {
    languages: [
      {
        slug: 'javascript',
        displayName: 'JavaScript',
        source: 'skillicons',
        repos: [
          {
            name: 'theabdullahfolio',
            nameWithOwner: 'MA1002643/theabdullahfolio',
            url: 'https://github.com/MA1002643/theabdullahfolio',
          },
        ],
        privateRepoCount: 2,
      },
    ],
    frameworks: [],
    libraries: [],
    tools: [
      { slug: 'vitest', displayName: 'Vitest', source: 'skillicons', repos: [], privateRepoCount: 1 },
    ],
    software: [],
  },
  diff: { added: [], removed: [] },
  fetchedAt: new Date().toISOString(),
};

const EMPTY_PAYLOAD = {
  categories: { languages: [], frameworks: [], libraries: [], tools: [], software: [] },
  diff: { added: [], removed: [] },
  fetchedAt: new Date().toISOString(),
  _fallback: true,
};

const stubSkills = (page, body) =>
  page.route('**/api/github-skills*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );

// The About page's cache would otherwise serve a real payload before the
// stub is consulted — start every run with an empty store.
const clearSkillsCache = (page) =>
  page.addInitScript(() => {
    try {
      window.localStorage.removeItem('skillsCache:v4');
      window.localStorage.removeItem('skillsLastFetched:v4');
    } catch {
      /* storage blocked — nothing to clear */
    }
  });

test('/uses answers 200 with the sitewide title and all six plates', async ({ page }) => {
  await stubSkills(page, LIVE_PAYLOAD);
  const response = await page.goto('/uses');
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Uses/);
  await expect(page.getByRole('heading', { name: 'MY SETUP', level: 1 })).toBeVisible();
  for (const slug of PLATES) {
    await expect(page.locator(`#uses-${slug}`)).toHaveCount(1);
  }
  // Every plate is a labelled region with its own h2.
  await expect(page.getByRole('heading', { name: 'The machine', level: 2 })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Bill of materials', level: 2 })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'What it is made of', level: 2 })).toHaveCount(1);
});

test('the pipeline schematic clips no label and runs its flow once drawn', async ({ page }) => {
  await stubSkills(page, LIVE_PAYLOAD);
  await page.goto('/uses');
  await page.locator('#uses-pipeline').scrollIntoViewIfNeeded();
  await expect(page.locator('#uses-pipeline')).toHaveAttribute('data-revealed', 'true');
  // Every label measured against its box, in the SVG's own units.
  const clipped = await page.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll('.uses-pipeline__svg g')) {
      const rect = g.querySelector('rect.uses-pipeline__node');
      if (!rect) continue;
      const inner = Number(rect.getAttribute('width')) - 24;
      for (const t of g.querySelectorAll('text[data-m]')) {
        if (t.getComputedTextLength() > inner) out.push(t.textContent);
      }
    }
    return out;
  });
  expect(clipped).toEqual([]);
  // The build node names the Node major Vercel resolves from `engines`,
  // never the .nvmrc pin; the cron names its Hobby firing window.
  await expect(page.locator('.uses-pipeline__sub', { hasText: /^next build · Node \d+\.x$/ })).toHaveCount(1);
  await expect(page.locator('.uses-pipeline__sub', { hasText: /\d\d:00–\d\d:59 UTC/ })).toHaveCount(1);
  // After the draw the flow starts: a packet appears and moves.
  const comets = page.locator('.uses-pipeline__comet-head');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.uses-pipeline__comet')].some((g) => Number(g.style.opacity) > 0),
    null,
    { timeout: 15000 },
  );
  const at = async () => (await comets.evaluateAll((els) => els.map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`))).join('|');
  const a = await at();
  await page.waitForTimeout(400);
  expect(await at()).not.toBe(a);
});

test('a live payload renders the ledger: cards with meters and figures, and the LIVE token', async ({
  page,
}) => {
  await clearSkillsCache(page);
  await stubSkills(page, LIVE_PAYLOAD);
  await page.goto('/uses');
  await page.locator('#uses-stack').scrollIntoViewIfNeeded();

  const card = page.locator('#uses-stack .uses-tool[data-slug="javascript"]');
  await expect(card).toHaveCount(1, { timeout: 20_000 });
  // The count-up is gated on the CARD's own meter being on screen (it
  // replays on every entry), not on the plate — bring the card itself in.
  await card.scrollIntoViewIfNeeded();
  // The figure counts up from zero once the card has landed (~0.5s deal +
  // 2s climb), so it needs longer than the default expect timeout to settle.
  await expect(card.locator('.uses-tool__figure')).toHaveText('3 repos · 1 public · 2 private', {
    timeout: 10_000,
  });
  await expect(card.locator('.uses-meter__track')).toHaveAttribute(
    'aria-label',
    'JavaScript: used in 1 public repo · +2 private',
  );
  await expect(card.locator('.uses-tool__desc')).not.toBeEmpty();
  await expect(page.getByRole('heading', { name: 'Languages', level: 3 })).toBeVisible();
  await expect(page.locator('#uses-stack .uses-provenance')).toContainText(/live · 2 tools/);
  await expect(page.locator('#uses-stack .uses-live-dot')).toHaveCount(1);

  // Nothing on the plate is a button or discloses a repository list — that
  // breakdown lives on the About page, once.
  await expect(page.locator('#uses-stack button')).toHaveCount(0);
  await expect(page.locator('#uses-stack [role="tooltip"]')).toHaveCount(0);
});

test('an empty payload keeps the curated set and drops the LIVE claim', async ({ page }) => {
  await clearSkillsCache(page);
  await stubSkills(page, EMPTY_PAYLOAD);
  await page.goto('/uses');
  await page.locator('#uses-stack').scrollIntoViewIfNeeded();

  // Curated cards are there, uncounted…
  const js = page.locator('#uses-stack .uses-tool[data-slug="javascript"]');
  await expect(js).toHaveCount(1);
  await expect(page.locator('#uses-stack .uses-tool[data-slug="nextjs"]')).toHaveCount(1);
  await expect(js.locator('.uses-tool__figure')).toHaveText('curated');
  // …and nothing claims to be live.
  await expect(page.locator('#uses-stack .uses-provenance')).toContainText(/curated/, {
    timeout: 20_000,
  });
  await expect(page.locator('#uses-stack .uses-live-dot')).toHaveCount(0);
});

test('every external link on the page carries rel="noopener noreferrer"', async ({ page }) => {
  await stubSkills(page, LIVE_PAYLOAD);
  await page.goto('/uses');
  const rels = await page
    .locator('main a[target="_blank"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('rel') || ''));
  expect(rels.length).toBeGreaterThan(0);
  for (const rel of rels) {
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  }
});

test('390×844: no horizontal overflow', async ({ page }) => {
  await stubSkills(page, LIVE_PAYLOAD);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/uses');
  await page.locator('#uses-bom').scrollIntoViewIfNeeded();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test('prefers-reduced-motion: the plates render at rest with no transforms', async ({ page }) => {
  await stubSkills(page, LIVE_PAYLOAD);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/uses');
  // Under reduced motion the (pre-existing) PageTitle hydration mismatch
  // makes React replace the whole document with a client render; a locator
  // resolved against the server HTML then detaches mid-action. A plate's
  // `data-revealed="true"` is only ever written client-side, so waiting for
  // it pins the live tree before anything is scrolled.
  await page.waitForSelector('#uses-machine[data-revealed="true"]');
  await page.locator('#uses-bom').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  const offenders = await page.evaluate((plates) => {
    const identity = (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    const bad = [];
    for (const slug of plates) {
      const root = document.getElementById(`uses-${slug}`);
      if (!root) continue;
      for (const el of root.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (!identity(cs.transform)) bad.push(`${slug}:${el.className}`);
        if (el.classList.contains('uses-anim') && cs.opacity !== '1') {
          bad.push(`${slug}:${el.className}:opacity=${cs.opacity}`);
        }
      }
    }
    return bad;
  }, PLATES);
  expect(offenders).toEqual([]);
});
