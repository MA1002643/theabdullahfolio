import { expect, test } from '@playwright/test';

// Signed-in composer coverage (the smoke spec covers the signed-out wall).
// No real OAuth happens here: /api/auth/session is stubbed at the network
// layer, which is all SessionProvider reads to decide the compose slot — the
// server-side POST gate stays untested on purpose (the smoke spec already
// proves it 401s without a session). The wall data is stubbed too, so these
// tests are hermetic: no json store state, no Redis, no flakes from real
// messages left by earlier runs.

const FAKE_SESSION = {
  user: {
    name: 'Play Wright',
    // The session shape auth.js stamps: the identity key (what the server
    // compares) beside the GitHub login (what the card shows).
    key: 'github:424242',
    username: 'playwright-smoke',
    image: null,
    provider: 'github',
  },
  expires: '2099-01-01T00:00:00.000Z',
};

const DRAFT_KEY = 'guestbook:draft:v1';

// Minimal message in the exact shape GET /api/guestbook serves (enriched with
// aggregate reactions + the viewer's own choice).
const mark = (n) => ({
  id: `msg_${n}`,
  author: {
    name: `Visitor ${n}`,
    username: `visitor${n}`,
    avatar: null,
    provider: 'github',
  },
  message: `Mark number ${n} on the wall`,
  createdAt: new Date(Date.UTC(2026, 0, n, 12)).toISOString(),
  reactions: {},
  viewerReaction: null,
});

// The list route only — /api/guestbook and /api/guestbook?…, never the
// /presence or /reactions subroutes (presence gets its own stub).
const LIST_ROUTE = /\/api\/guestbook(\?.*)?$/;

async function stubSession(page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: FAKE_SESSION }),
  );
  await page.route('**/api/guestbook/presence*', (route) =>
    route.fulfill({ json: { count: 1 } }),
  );
}

// A stub of the PAGED list route: honours ?limit and ?cursor the way the real
// one does — one bounded page, the wall's total, a cursor for the next page —
// so the client's paging is exercised for real. The cursor is opaque to the
// client, so the stub's own (a plain offset) serves as well as the server's.
// Returns the log of requests, so a test can assert how much was fetched.
async function serveWall(page, all) {
  const calls = [];
  await page.route(LIST_ROUTE, (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit'));
    const offset = Number(url.searchParams.get('cursor') || 0);
    calls.push({ limit, offset });
    const end = offset + limit;
    return route.fulfill({
      json: {
        messages: all.slice(offset, end),
        count: all.length,
        nextCursor: end < all.length ? String(end) : null,
      },
    });
  });
  return calls;
}

test('signed-in composer: counter, AI refine affordance, draft autosave + restore', async ({
  page,
}) => {
  await stubSession(page);
  await page.route(LIST_ROUTE, (route) =>
    route.fulfill({ json: { messages: [], count: 0 } }),
  );

  await page.goto('/guestbook');

  const input = page.locator('#guestbook-message');
  await expect(input).toBeVisible({ timeout: 20_000 });

  // Live counter, derived from MESSAGE_MAX (pinned to 150 by validate.js).
  await expect(page.getByText('0/150')).toBeVisible();

  // The ✦ refine affordance appears once there is real content (≥12 chars).
  await input.fill('hello from the smoke test');
  await expect(page.getByText('25/150')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /refine my message/i }),
  ).toBeVisible();

  // Draft autosave: the debounced write lands within ~600ms of settling.
  await page.waitForFunction(
    ([key]) => {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw).value === 'hello from the smoke test' : false;
      } catch {
        return false;
      }
    },
    [DRAFT_KEY],
  );

  // …and a reload restores it, with the banner offering Keep / Clear.
  await page.reload();
  await expect(page.locator('#guestbook-message')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Restored your unsent message')).toBeVisible();
  await expect(page.locator('#guestbook-message')).toHaveValue(
    'hello from the smoke test',
  );
  await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
});

test('skeleton wall holds the space while the first fetch is slow', async ({
  page,
}) => {
  await stubSession(page);
  await page.route(LIST_ROUTE, async (route) => {
    // Slow network: long enough for the skeleton's 200ms anti-flash delay to
    // pass and the ghosts to paint.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ json: { messages: [mark(1)], count: 1 } });
  });

  await page.goto('/guestbook');

  const skeleton = page.getByTestId('gb-skeleton');
  await expect(skeleton).toBeVisible({ timeout: 10_000 });

  // Once the data lands the ghosts leave and the real card takes over.
  await expect(page.locator('#msg_1')).toBeVisible({ timeout: 20_000 });
  await expect(skeleton).toHaveCount(0);
});

// Twenty marks, newest first: msg_20 … msg_1. With PAGE_SIZE 8 that is three
// leaves, and the first fetch (two leaves) leaves msg_4 … msg_1 unloaded.
const TWENTY = Array.from({ length: 20 }, (_, i) => mark(20 - i));

test('the wall is fetched a page at a time: two leaves first, the next one ahead of a flip', async ({
  page,
}) => {
  await stubSession(page);
  const calls = await serveWall(page, TWENTY);

  await page.goto('/guestbook');
  await expect(page.locator('#msg_20')).toBeVisible({ timeout: 20_000 });
  // The rail already knows the whole wall from the server's count…
  await expect(page.getByText('Page 1 of 3')).toBeAttached();
  // …while only the first two leaves were fetched.
  expect(calls).toEqual([{ limit: 16, offset: 0 }]);

  const next = page.getByRole('button', { name: 'Next page' });
  await next.click();
  await expect(page.locator('#msg_12')).toBeVisible();
  await expect(page.getByText('Page 2 of 3')).toBeAttached();
  // Landing on leaf 2 prefetched leaf 3 — exactly the rest of the wall, from
  // the cursor the first page handed back.
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toEqual({ limit: 8, offset: 16 });

  await next.click();
  await expect(page.locator('#msg_1')).toBeVisible();
  await expect(page.getByText('Page 3 of 3')).toBeAttached();
  expect(calls).toHaveLength(2);
});

test('a /guestbook#msg_… deep link walks to the right page and reveals the card', async ({
  page,
}) => {
  await stubSession(page);
  const calls = await serveWall(page, TWENTY);

  // msg_1 is the oldest mark — beyond the first fetch, on the last leaf. The
  // link must fetch its way there, flip to that page and bring the card to
  // reading height.
  await page.goto('/guestbook#msg_1');

  await expect(page.locator('#msg_1')).toBeInViewport({ timeout: 20_000 });
  await expect(page.getByText('Page 3 of 3')).toBeAttached();
  expect(calls).toEqual([
    { limit: 16, offset: 0 },
    { limit: 50, offset: 16 },
  ]);
});
