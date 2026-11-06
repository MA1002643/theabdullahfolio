import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Form from '@/components/contact/Form';
import { CONTACT_CLIENT_LIMITS } from '@/lib/contactLimits';
import { DRAFT_KEY, QUEUE_KEY } from '@/lib/contact';

import { validContactMessage } from '../support/fixtures/api.js';
import { sendMailHandler, sendMailNetworkError } from '../support/msw/handlers.js';
import { server } from '../support/msw/server.js';
import { IntlWrapper } from '../support/intl.jsx';

// Issue #82: these components read their copy through next-intl, so every
// render runs inside the REAL English catalogue (tests/support/intl.jsx).
const renderIntl = (ui, options) => render(ui, { wrapper: IntlWrapper, ...options });

// The contact form, rendered in jsdom and driven the way a person drives it
// (issue #92, L3): found by its LABELS, typed into with real keyboard events,
// submitted by clicking the button a screen reader announces. The network is
// MSW, so the request the form builds (body, headers) is what gets asserted,
// and the offline queue runs its real code against a stubbed `navigator.onLine`.
//
// Nothing here reaches into React state or react-hook-form internals. If the
// form were rewritten on a different library tomorrow with the same behaviour,
// every case below would still pass. That is the point of testing behaviour.

// Framer applies even a skipped animation on its next frame, so an element is
// briefly at its `initial` opacity when first found. "Is visible" therefore
// means "becomes visible", not "was visible at the instant the query landed".
async function visible(found) {
  const el = await found;
  await waitFor(() => expect(el).toBeVisible());
  return el;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const user = userEvent.setup();
  renderIntl(
    <>
      <Form />
      <Toaster />
    </>,
  );
  const field = (label) => screen.getByLabelText(label);
  const fill = async (msg = validContactMessage()) => {
    await user.type(field('Full Name'), msg.name);
    await user.type(field('Email'), msg.email);
    await user.type(field('Subject'), msg.subject);
    // Pasted rather than typed: 100 characters of per-key events add nothing
    // the name/email/subject fields have not already exercised.
    await user.click(field('Message'));
    await user.paste(msg.message);
  };
  const submit = () => user.click(screen.getByRole('button', { name: 'Send message' }));
  return { user, field, fill, submit };
}

async function goOffline() {
  online = false;
  await act(async () => window.dispatchEvent(new Event('offline')));
}
async function goOnline() {
  online = true;
  await act(async () => window.dispatchEvent(new Event('online')));
}

describe('ContactForm — accessible structure', () => {
  it('labels every field, so it can be found (and announced) by name', () => {
    const { field } = setup();
    expect(field('Full Name')).toHaveAttribute('type', 'text');
    expect(field('Email')).toHaveAttribute('type', 'email');
    expect(field('Subject')).toHaveAttribute('type', 'text');
    expect(field('Message').tagName).toBe('TEXTAREA');
    expect(field('Full Name')).toHaveAttribute('autocomplete', 'name');
    expect(field('Email')).toHaveAttribute('autocomplete', 'email');
  });

  it('offers one submit button with a stable accessible name', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Send message' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeEnabled();
  });
});

describe('ContactForm — client validation', () => {
  it('announces all four required errors and ties each to its field', async () => {
    const { field, submit } = setup();
    await submit();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual([
      'Full Name is required!',
      'Email is required!',
      'Subject is required!',
      'Message is required!',
    ]);
    for (const [label, message] of [
      ['Full Name', 'Full Name is required!'],
      ['Email', 'Email is required!'],
      ['Subject', 'Subject is required!'],
      ['Message', 'Message is required!'],
    ]) {
      expect(field(label)).toHaveAttribute('aria-invalid', 'true');
      expect(field(label)).toHaveAccessibleDescription(message);
    }
  });

  it('enforces the shared client limits (lib/contactLimits.js), not typed-in copies', async () => {
    const { user, field, submit } = setup();
    await user.type(field('Full Name'), 'x'.repeat(CONTACT_CLIENT_LIMITS.name.min - 1));
    await user.click(field('Message'));
    await user.paste('y'.repeat(CONTACT_CLIENT_LIMITS.message.min - 1));
    await submit();
    await visible(screen.findByText(`Name should be at least ${CONTACT_CLIENT_LIMITS.name.min} characters long.`));
    await visible(screen.getByText(`Message should be at least ${CONTACT_CLIENT_LIMITS.message.min} characters long.`));
  });

  it('refuses an address longer than the shared limit before it is sent', async () => {
    // The server refuses it too (tests/api/send-mail.route.test.js); a form
    // looser than the server would park the message in the offline queue to be
    // retried forever.
    const { user, field, submit } = setup();
    await user.click(field('Email'));
    await user.paste(`${'a'.repeat(CONTACT_CLIENT_LIMITS.email.max)}@example.com`);
    await submit();
    const error = await screen.findByText(`Email should be at most ${CONTACT_CLIENT_LIMITS.email.max} characters long.`);
    await visible(error);
    expect(field('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Email')).toHaveAttribute('aria-describedby', error.id);
  });

  it('clears an error once the field is corrected and resubmitted', async () => {
    const { submit, fill } = setup();
    server.use(sendMailHandler());
    await submit();
    expect(await screen.findAllByRole('alert')).toHaveLength(4);
    await fill();
    await submit();
    await waitFor(() => expect(screen.queryAllByRole('alert')).toHaveLength(0));
  });

  it('sends nothing while the form is invalid', async () => {
    const { submit } = setup();
    // No handler registered: any request fails the suite (onUnhandledFrame).
    await submit();
    await screen.findAllByRole('alert');
  });
});

describe('ContactForm — sending', () => {
  it('posts exactly the four fields, with the idempotency key in a header', async () => {
    const requests = [];
    server.use(sendMailHandler({ record: (r) => requests.push(r) }));
    const { fill, submit } = setup();
    const msg = validContactMessage();
    await fill(msg);
    await submit();

    await visible(screen.findByText('Message sent successfully!'));
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual(msg); // no key, no extras in the body
    expect(requests[0].headers['idempotency-key']).toMatch(UUID);
    expect(requests[0].headers['content-type']).toBe('application/json');
  });

  it('marks the button busy and disabled while in flight (no double send)', async () => {
    // Hold the response until the test lets it go, counting what arrives.
    let release;
    let received = 0;
    const gate = new Promise((resolve) => (release = resolve));
    server.use(
      http.post('*/api/send-mail', async () => {
        received += 1;
        await gate;
        return HttpResponse.json({ success: true });
      }),
    );
    const { fill, submit, user } = setup();
    await fill();
    await submit();
    const button = screen.getByRole('button', { name: 'Send message' });
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toBeDisabled();
    await user.click(button); // ignored while disabled
    release();
    await visible(screen.findByText('Message sent successfully!'));
    expect(received).toBe(1);
  });

  it('shows each server validation error and keeps the message for editing', async () => {
    server.use(
      sendMailHandler({
        status: 400,
        body: { errors: ['Disposable email addresses are not allowed.', 'Subject is required.'] },
      }),
    );
    const { fill, submit, field } = setup();
    await fill();
    await submit();
    // Toasts stack, so only the newest is painted on top; what matters is that
    // each one is rendered into the notification live region.
    expect(await screen.findByText('Disposable email addresses are not allowed.')).toBeInTheDocument();
    expect(await screen.findByText('Subject is required.')).toBeInTheDocument();
    expect(field('Full Name')).toHaveValue(validContactMessage().name);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
  });
});

describe('ContactForm — never loses a message', () => {
  it('parks a message in the queue when the server fails (5xx), with its key', async () => {
    const requests = [];
    server.use(sendMailHandler({ status: 503, body: { error: 'down' }, record: (r) => requests.push(r) }));
    const { fill, submit } = setup();
    await fill();
    await submit();

    await visible(screen.findByText('Saved — retrying shortly…'));
    const queue = JSON.parse(window.localStorage.getItem(QUEUE_KEY));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject(validContactMessage());
    // The SAME key as the failed attempt, so the server can dedupe a retry of
    // a send whose response was lost.
    expect(queue[0].idempotencyKey).toBe(requests[0].headers['idempotency-key']);
  });

  it('parks it on a dropped connection too', async () => {
    server.use(sendMailNetworkError());
    const { fill, submit } = setup();
    await fill();
    await submit();
    await visible(screen.findByText('Saved — retrying shortly…'));
    expect(JSON.parse(window.localStorage.getItem(QUEUE_KEY))).toHaveLength(1);
  });

  it('offline → holds without touching the network; reconnect → delivers by itself', async () => {
    const { fill, submit } = setup();
    await goOffline();
    await visible(screen.findByText(/You’re offline/));

    // Offline submit: no handler is registered, so ANY request would fail.
    await fill();
    await submit();
    await visible(screen.findByText('Saved — it will send when you reconnect.'));
    const [held] = JSON.parse(window.localStorage.getItem(QUEUE_KEY));
    expect(held.idempotencyKey).toMatch(UUID);

    // Reconnect: the queue flushes on its own, carrying the original key.
    const delivered = [];
    server.use(sendMailHandler({ record: (r) => delivered.push(r) }));
    await goOnline();
    await visible(screen.findByText('Your held message was sent ✦'));
    expect(delivered).toHaveLength(1);
    expect(delivered[0].headers['idempotency-key']).toBe(held.idempotencyKey);
    expect(delivered[0].body).toEqual(validContactMessage());
    expect(JSON.parse(window.localStorage.getItem(QUEUE_KEY))).toEqual([]);
  });

  it('keeps a held message queued if the retry is dropped again', async () => {
    const { fill, submit } = setup();
    await goOffline();
    await fill();
    await submit();
    await screen.findByText('Saved — it will send when you reconnect.');

    server.use(sendMailNetworkError());
    await goOnline();
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(QUEUE_KEY))).toHaveLength(1),
    );
    expect(screen.queryByText('Your held message was sent ✦')).toBeNull();
  });
});

describe('ContactForm — draft autosave', () => {
  const draft = (fields, savedAt = Date.now()) =>
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ fields, savedAt }));

  it('restores an unsent draft and says so', async () => {
    const msg = validContactMessage();
    draft(msg);
    const { field } = setup();
    const text = await screen.findByText('Restored your unsent message');
    expect(text.closest('[role="status"]')).not.toBeNull(); // announced politely
    await visible(text);
    expect(field('Full Name')).toHaveValue(msg.name);
    expect(field('Message')).toHaveValue(msg.message);
  });

  it('"Clear" empties the form and forgets the draft', async () => {
    draft(validContactMessage());
    const { user, field } = setup();
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(field('Full Name')).toHaveValue('');
    expect(field('Message')).toHaveValue('');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ignores a draft older than a week', () => {
    draft(validContactMessage(), Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { field } = setup();
    expect(field('Full Name')).toHaveValue('');
    expect(screen.queryByText('Restored your unsent message')).toBeNull();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('autosaves what is typed', async () => {
    const { user, field } = setup();
    await user.type(field('Full Name'), 'Grace Hopper');
    await waitFor(
      () => expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY)).fields.name).toBe('Grace Hopper'),
      { timeout: 2000 },
    );
  });
});
