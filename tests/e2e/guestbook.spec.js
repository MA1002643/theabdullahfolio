import { expect, test } from '@playwright/test';

// The one smoke test issue #40 Phase 6 asks for: the unauthenticated
// read-only experience renders, the sign-in CTA is offered, and the write
// path is genuinely closed without a session.

test('unauthenticated visitor gets the read-only wall with a sign-in CTA', async ({
  page,
}) => {
  await page.goto('/guestbook');

  // Headline (the h1 carries an aria-label of the clean title, so the
  // accessible name is stable whether the scramble is mid-decode or done).
  await expect(
    page.getByRole('heading', { name: 'GUESTBOOK', level: 1 }),
  ).toBeVisible();

  // Sign-in CTAs appear once the session resolves to unauthenticated — both
  // providers (issue #40 follow-up: Google alongside GitHub).
  await expect(
    page.getByRole('button', { name: /sign in with github/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole('button', { name: /sign in with google/i }),
  ).toBeVisible();

  // And the compose input must NOT exist for a signed-out visitor.
  await expect(page.locator('#guestbook-message')).toHaveCount(0);
});

test('POST /api/guestbook without a session returns 401', async ({
  request,
}) => {
  const res = await request.post('/api/guestbook', {
    data: { message: 'smoke test — should never land' },
  });
  expect(res.status()).toBe(401);
});
