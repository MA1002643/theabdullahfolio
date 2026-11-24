import { expect, test } from '@playwright/test';

// Project pages moved from /projects/<id> to /projects/<slug> (issue #31
// follow-up). The old URLs are in search results and in links shared over the
// years, so each must answer a PERMANENT redirect to its new address (308, so
// crawlers move the ranking across), in English and under a locale prefix.
// Only a real request to a production server proves the redirect is served;
// tests/unit/projectPaths.test.js pins the rule list itself.

const CASES = [
  ['/projects/1', '/projects/theabdullahfolio'],
  ['/projects/2', '/projects/afaaqx'],
  ['/ar/projects/3', '/ar/projects/culina'],
  ['/ja/projects/11', '/ja/projects/tailorhawk'],
];

for (const [from, to] of CASES) {
  test(`${from} redirects permanently to ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(new URL(res.headers().location, 'http://x').pathname).toBe(to);
  });
}

test('the slug URL is the page itself, with a self-referencing canonical', async ({ request }) => {
  const res = await request.get('/projects/theabdullahfolio', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/projects\/theabdullahfolio"/);
});

test('an unknown slug, and a mis-cased one, answer 404 rather than a second address', async ({ request }) => {
  expect((await request.get('/projects/no-such-project', { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get('/projects/AfaaqX', { maxRedirects: 0 })).status()).toBe(404);
});
