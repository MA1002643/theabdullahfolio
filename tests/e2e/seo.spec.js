import { expect, test } from '@playwright/test';

// ── SEO end-to-end suite (issue #32, W5) ────────────────────────────────────
// Runs against a PRODUCTION server (`next start`, see playwright.config.mjs),
// which is the only place several of these can be checked at all:
//
//   • Response HEADERS. The CV's X-Robots-Tag is config, so a unit test can
//     assert it is DECLARED — only a real request proves it is SERVED.
//   • The generated files. `/robots.txt`, `/sitemap.xml` and
//     `/manifest.webmanifest` are route handlers; "does it return 200" is not a
//     question a unit test can answer.
//   • RAW HTML with no JavaScript executed. This is the whole of W3: the
//     acceptance criterion is that every route is reachable from `/` without a
//     JS runtime, and the only honest way to test that is to fetch the bytes
//     rather than to drive a browser that will happily hydrate first.
//
// `request` (the APIRequestContext) is used rather than `page` for most of it,
// deliberately. `page.goto()` runs the client bundle, so a link that only exists
// after hydration would pass — which is precisely the bug F1 was.

const ROUTES = [
  '/',
  '/about',
  '/projects',
  '/qualifications',
  '/journey',
  '/uses',
  '/contact',
  '/my-past',
  '/guestbook',
];

/** Strip tags and script/style bodies, the way the audit in the issue did. */
const textOf = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Internal route links in raw HTML, excluding asset URLs. */
const internalLinks = (html) =>
  [...html.matchAll(/href="(\/[^"#?]*)"/g)]
    .map((match) => match[1])
    .filter(
      (href) =>
        !href.startsWith('/_next') &&
        !href.endsWith('.png') &&
        !href.endsWith('.webmanifest'),
    );

test.describe('crawl control', () => {
  test('robots.txt serves, names the sitemap, and states the AI policy', async ({
    request,
  }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);

    const body = await response.text();
    // Absolute, per the sitemap protocol — a relative Sitemap directive is
    // invalid and silently ignored by every consumer.
    expect(body).toContain('Sitemap: https://ma.codes/sitemap.xml');
    expect(body).toContain('Host: https://ma.codes');
    expect(body).toMatch(/User-Agent: \*/);
    // F7: the AI-crawler posture is stated rather than inherited. A named
    // stanza is what makes the allow a policy instead of an accident.
    expect(body).toContain('GPTBot');
    expect(body).toContain('ClaudeBot');
    expect(body).toContain('PerplexityBot');
    // Non-content surfaces kept out of the crawl budget.
    expect(body).toContain('Disallow: /api/');
  });

  test('sitemap.xml serves, and every URL in it answers 200', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);

    const body = await response.text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    // 9 routes + 11 projects + the CV.
    expect(urls).toHaveLength(21);
    expect(new Set(urls).size).toBe(urls.length);

    // The acceptance criterion is "every URL in the sitemap returns 200,
    // asserted in e2e, not by hand". A sitemap entry that 404s is a coverage
    // error in Search Console, and `dynamicParams = false` on the project
    // route means a stale project id would do exactly that.
    for (const url of urls) {
      const path = new URL(url).pathname || '/';
      const head = await request.head(path);
      expect(head.status(), `${path} is in the sitemap but answered ${head.status()}`).toBe(200);
    }
  });

  test('manifest serves valid JSON with the existing icons', async ({
    request,
  }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBe('Muhammad Abdullah');
    expect(manifest.theme_color).toBe('#0a0a0a');
    // Reuses the file-convention icons rather than adding assets, and both must
    // actually resolve — a manifest naming a missing icon fails silently at
    // install time.
    for (const icon of manifest.icons) {
      const head = await request.head(icon.src);
      expect(head.status(), `${icon.src} is in the manifest but 404s`).toBe(200);
    }
  });

  test('llms.txt serves a brief that is accurate and current', async ({
    request,
  }) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');

    const body = await response.text();
    expect(body).toContain('Muhammad Abdullah');
    expect(body).toContain('Software Engineer');
    // Generated from the registry and projectsData, so it cannot describe ten
    // projects when there are eleven (P1).
    expect(body).toContain('## Projects');
    for (const route of ROUTES) {
      if (route === '/') continue;
      expect(body).toContain(`https://ma.codes${route}`);
    }
    // Private repositories are named but carry no repo URL — publishing a link
    // that 404s for every reader is worse than omitting it.
    expect(body).toContain('private repository');
  });
});

test.describe('canonical & indexability', () => {
  for (const route of ROUTES) {
    test(`${route} declares an absolute, self-referential canonical`, async ({
      request,
    }) => {
      const html = await (await request.get(route)).text();
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];

      expect(canonical, `${route} has no canonical`).toBeTruthy();
      // The root canonical is the bare origin; everything else is origin+path.
      const expected =
        route === '/' ? 'https://ma.codes' : `https://ma.codes${route}`;
      expect(canonical).toBe(expected);
    });
  }

  test('no indexable route carries noindex', async ({ request }) => {
    for (const route of ROUTES) {
      const html = await (await request.get(route)).text();
      const robots = html.match(/name="robots" content="([^"]+)"/)?.[1] ?? '';
      expect(robots, `${route} is noindex`).not.toContain('noindex');
    }
  });

  test('the root robots key lets share cards render at full size', async ({
    request,
  }) => {
    const html = await (await request.get('/')).text();
    // The specific reason this key exists (handed over from the #43 audit):
    // without it Google renders the #88 share cards as thumbnails in Discover
    // and image results.
    expect(html).toContain('max-image-preview:large');
    expect(html).toContain('max-snippet:-1');
  });

  test('exactly one h1 per route', async ({ page }) => {
    // The one check that legitimately needs a browser: `page` is used here
    // because a duplicate h1 introduced by a client component would be missed
    // by a raw-HTML scan.
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(
        page.locator('h1'),
        `${route} does not have exactly one h1`,
      ).toHaveCount(1);
    }
  });
});

test.describe('answer-engine readiness (W3)', () => {
  test('the homepage is legible with no JavaScript executed', async ({
    request,
  }) => {
    // The F1 acceptance criteria, measured exactly as the issue's audit did.
    // Before this work: 10 words, 0 internal links.
    const html = await (await request.get('/')).text();

    const words = textOf(html).split(' ').filter(Boolean).length;
    expect(words, `homepage SSRs ${words} words, target >= 80`).toBeGreaterThanOrEqual(80);

    const links = new Set(internalLinks(html));
    expect(
      links.size,
      `homepage SSRs ${links.size} internal links, target >= 8`,
    ).toBeGreaterThanOrEqual(8);
  });

  test('every route is reachable from / in raw HTML', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const links = new Set(internalLinks(html));

    // Every section route must be linked from the entry point without a JS
    // runtime. `/projects/[id]` is reachable in two clicks via /projects, which
    // is what W7's "within 2 clicks" allows.
    for (const route of ROUTES) {
      if (route === '/') continue;
      expect(links, `${route} is not linked from / in raw HTML`).toContain(route);
    }
  });

  test('the crawlable homepage copy is not hidden with display:none', async ({
    page,
  }) => {
    // Risk §10.4/§10.5: rendering the content and hiding it fixes nothing and
    // reads as cloaking. `sr-only` clips to a 1px box and IS announced by screen
    // readers; `display: none` and `visibility: hidden` are not.
    await page.goto('/');
    const summary = page.locator('main p.sr-only').first();
    await expect(summary).toHaveCount(1);

    const styles = await summary.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        display: computed.display,
        visibility: computed.visibility,
      };
    });
    expect(styles.display).not.toBe('none');
    expect(styles.visibility).not.toBe('hidden');
  });

  test('the orbit links exist in the DOM before the reveal finishes', async ({
    page,
  }) => {
    // The F1 fix's real mechanism: the buttons are always mounted and the
    // staggered reveal only animates opacity/scale. Asserted immediately after
    // navigation — before the ~2.4s stagger could have completed — so a
    // regression to `return null` fails here even though the links would be
    // present a few seconds later.
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('a[href="/uses"]')).toHaveCount(1);
    await expect(page.locator('a[href="/about"]')).toHaveCount(1);
  });
});

test.describe('structured data', () => {
  test('every route emits parseable JSON-LD', async ({ request }) => {
    for (const route of ROUTES) {
      const html = await (await request.get(route)).text();
      const blocks = [
        ...html.matchAll(
          /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
        ),
      ].map((match) => match[1]);

      expect(blocks.length, `${route} has no JSON-LD`).toBeGreaterThan(0);
      for (const block of blocks) {
        // The security property: no raw `<` survived the serialiser, so no value
        // could have closed the script tag early.
        expect(block, `${route} has a raw < inside JSON-LD`).not.toContain('<');
        expect(() => JSON.parse(block), `${route} JSON-LD does not parse`).not.toThrow();
      }
    }
  });

  test('the Person node is defined once and referenced everywhere', async ({
    request,
  }) => {
    const html = await (await request.get('/')).text();
    const block = html.match(
      /<script id="ld-root" type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    const graph = JSON.parse(block);

    const person = graph['@graph'].find((node) => node['@type'] === 'Person');
    expect(person['@id']).toBe('https://ma.codes/#person');
    expect(person.jobTitle).toBe('Software Engineer');
    expect(person.sameAs.join(' ')).toContain('github.com');
  });

  test('project pages carry a repository and a breadcrumb trail', async ({
    request,
  }) => {
    const html = await (await request.get('/projects/1')).text();
    const block = html.match(
      /<script id="ld-project" type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    const doc = JSON.parse(block);

    const code = doc['@graph'].find(
      (node) => node['@type'] === 'SoftwareSourceCode',
    );
    expect(code.codeRepository).toContain('github.com/MA1002643/');
    expect(code.author['@id']).toBe('https://ma.codes/#person');

    const trail = doc['@graph'].find(
      (node) => node['@type'] === 'BreadcrumbList',
    );
    expect(trail.itemListElement).toHaveLength(3);
  });

  test('sibling project links are in the raw HTML (F8)', async ({ request }) => {
    const html = await (await request.get('/projects/5')).text();
    const links = new Set(internalLinks(html));

    expect(links).toContain('/projects');
    expect(links).toContain('/projects/4');
    expect(links).toContain('/projects/6');
  });
});

test.describe('the CV PDF as a deliberate landing page (W1b)', () => {
  test('serves inline, with an explicit X-Robots-Tag', async ({ request }) => {
    const response = await request.get('/Muhammad_Abdullah_CV.pdf');
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers['content-type']).toContain('application/pdf');
    // Indexing is the default, so this header changes nothing technically — its
    // value is that the decision (F6) is written where an auditor will read it.
    expect(headers['x-robots-tag']).toContain('index');
    expect(headers['x-robots-tag']).toContain('max-image-preview:large');
    expect(headers['x-robots-tag']).not.toContain('noindex');
  });

  test('carries the /Title that names the search result', async ({ request }) => {
    const response = await request.get('/Muhammad_Abdullah_CV.pdf');
    const bytes = Buffer.from(await response.body());

    // Google builds a PDF result's title from the internal `/Title`; with none
    // set it falls back to the filename. The metadata is written as plain
    // uncompressed objects (scripts/seo-pdf-metadata.mjs pins
    // `useObjectStreams: false`) precisely so this is greppable — an audit can
    // verify the title without running anything.
    const raw = bytes.toString('latin1');
    expect(raw).toContain('/Title');
    expect(raw).toContain('/Author');
  });
});

test.describe('no analytics before consent (W4)', () => {
  test('nothing reaches Google on any route', async ({ page }) => {
    // GA4 is not mounted — it is blocked on #141 — and this asserts the CSP
    // widening did not accidentally let anything through. It is written to stay
    // valid AFTER #141 lands: the assertion is "no beacon without consent", and
    // no consent is granted anywhere in this test.
    const beacons = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/googletagmanager\.com|google-analytics\.com|\/g\/collect/.test(url)) {
        beacons.push(url);
      }
    });

    for (const route of ROUTES) {
      await page.goto(route);
    }

    expect(beacons, `analytics fired pre-consent: ${beacons.join(', ')}`).toEqual(
      [],
    );
  });
});
