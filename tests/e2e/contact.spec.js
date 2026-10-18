import { sendMailOk, validContactMessage } from '../support/fixtures/api.js';
import { expect, settle, test } from '../support/test.js';

// The contact journey in a real browser (issue #92, L5), on every engine and
// device. /api/send-mail is stubbed at the network layer from the shared
// fixture catalogue, so no email is ever sent; everything above that line (the
// form, the offline queue, the toasts, localStorage) is the real site.
//
// The component suite (tests/component/ContactForm.test.jsx) covers the same
// behaviours in jsdom, faster and in more depth. This file exists for what jsdom
// cannot show: real layout and hit-testing, real focus, the real intro loader
// in the way, and the browser's own online/offline machinery.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Stub the send route; returns the list every request is recorded into. */
async function stubSend(page, { status = 200, body = sendMailOk } = {}) {
  const requests = [];
  await page.route('**/api/send-mail', async (route) => {
    const request = route.request();
    requests.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

// Exact match: a substring match on "Message" also finds the button labelled
// "Send message".
const field = (page, label) => page.getByLabel(label, { exact: true });

async function fill(page, msg = validContactMessage()) {
  await field(page, 'Full Name').fill(msg.name);
  await field(page, 'Email').fill(msg.email);
  await field(page, 'Subject').fill(msg.subject);
  await field(page, 'Message').fill(msg.message);
}

const send = (page) => page.getByRole('button', { name: 'Send message' }).click();

test.describe('contact form', { tag: '@cross-browser' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
    await settle(page);
  });

  test('refuses an empty submit, naming each missing field', async ({ page }) => {
    await send(page);
    // Scoped to the form: Next.js mounts its own (empty) role="alert" route
    // announcer on every page.
    await expect(page.locator('form').getByRole('alert')).toHaveText([
      'Full Name is required!',
      'Email is required!',
      'Subject is required!',
      'Message is required!',
    ]);
    await expect(field(page, 'Full Name')).toHaveAttribute('aria-invalid', 'true');
  });

  test('sends the four fields with an idempotency key, and confirms', async ({ page }) => {
    const requests = await stubSend(page);
    await fill(page);
    await send(page);
    await expect(page.getByText('Message sent successfully!')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual(validContactMessage());
    expect(requests[0].key).toMatch(UUID);
    // The form resets for the next message.
    await expect(field(page, 'Full Name')).toHaveValue('', { timeout: 10_000 });
  });

  test('surfaces a server rejection and keeps what was typed', async ({ page, expectErrors }) => {
    expectErrors(/status of 400/); // the browser logs the stubbed 400 itself
    await stubSend(page, { status: 400, body: { errors: ['Disposable email addresses are not allowed.'] } });
    await fill(page);
    await send(page);
    await expect(page.getByText('Disposable email addresses are not allowed.')).toBeVisible();
    await expect(field(page, 'Email')).toHaveValue(validContactMessage().email);
  });

  test('offline: holds the message, then delivers it on reconnect with the same key', async ({ page, context, expectErrors }) => {
    // Next's router prefetches linked routes; offline, those fail and Next logs
    // it. Framework behaviour, not the form's, and only while offline.
    expectErrors(/Failed to fetch RSC payload/, /ERR_INTERNET_DISCONNECTED/);
    await context.setOffline(true);
    await expect(page.getByText(/You’re offline/)).toBeVisible();
    await fill(page);
    await send(page);
    await expect(page.getByText('Saved — it will send when you reconnect.')).toBeVisible();
    const held = await page.evaluate(() => JSON.parse(localStorage.getItem('contact:queue:v1')));
    expect(held).toHaveLength(1);

    const requests = await stubSend(page);
    await context.setOffline(false);
    await expect(page.getByText('Your held message was sent ✦')).toBeVisible({ timeout: 15_000 });
    expect(requests).toHaveLength(1);
    expect(requests[0].key).toBe(held[0].idempotencyKey);
    expect(await page.evaluate(() => localStorage.getItem('contact:queue:v1'))).toBe('[]');
  });

  test('a half-written message survives a reload', async ({ page }) => {
    await field(page, 'Full Name').fill('Grace Hopper');
    await field(page, 'Subject').fill('Compilers');
    // The draft autosave is debounced (600 ms); wait for it to land.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('contact:draft:v1')))
      .toContain('Compilers'); // the LAST field typed, so the save includes both
    await page.reload();
    await settle(page);
    await expect(page.getByText('Restored your unsent message')).toBeVisible();
    await expect(field(page, 'Full Name')).toHaveValue('Grace Hopper');
    await expect(field(page, 'Subject')).toHaveValue('Compilers');
  });
});
