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

test('a /guestbook#msg_… deep link flips to the right page and reveals the card', async ({
  page,
}) => {
  await stubSession(page);
  // Nine marks with PAGE_SIZE 8 → msg_9 (oldest, last in the list) lives on
  // page 2. The link must flip there and bring the card to reading height.
  const messages = [9, 8, 7, 6, 5, 4, 3, 2, 1].map(mark).reverse();
  await page.route(LIST_ROUTE, (route) =>
    route.fulfill({ json: { messages, count: messages.length } }),
  );

  await page.goto('/guestbook#msg_9');

  await expect(page.locator('#msg_9')).toBeInViewport({ timeout: 20_000 });
  await expect(page.getByText('Page 2 of 2')).toBeAttached();
});
