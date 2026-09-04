// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageRefine from '@/components/contact/MessageRefine';

// The refine panel while its host form starts sending. The guestbook composer
// stays mounted after a successful post, so a refine that was merely HIDDEN
// while `disabled` — its stream still running in the hook — used to finish
// and resurface as a stale suggestion beneath the cleared field. The panel
// now aborts and resets the hook the moment `disabled` flips on. The stream
// here is a hand-fed ReadableStream behind a stubbed fetch, driven through
// the real useMessageRefine, so what is asserted is the actual abort and the
// actual absence of the suggestion afterwards.
//
// AnimatePresence is replaced by a pass-through: the real one keeps an EXITING
// element mounted, with its last-rendered props, until its exit animation
// ends — so under jsdom the DOM would show a ghost of the old panel for a
// while after state had already moved on. The exit choreography is not what
// is under test here; the hook's state is, and this makes the DOM mirror it.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AnimatePresence: ({ children }) => children ?? null };
});

function streamedFetch() {
  let push;
  let close;
  const calls = [];
  const body = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      push = (text) => controller.enqueue(enc.encode(text));
      close = () => controller.close();
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }),
  );
  return { calls, push: (t) => push(t), close: () => close() };
}

const MESSAGE = 'hello there, this is a rough draft of my mark';

function renderPanel(props) {
  return render(
    createElement(MessageRefine, {
      message: MESSAGE,
      onAccept: () => {},
      mode: 'guestbook',
      minLength: 12,
      ...props,
    }),
  );
}

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  vi.useRealTimers();
  // jsdom has no scrollTo; something in the motion tree calls it on layout.
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MessageRefine — a send in progress aborts the refine, never just hides it', () => {
  it('disabling mid-stream aborts the request, and the finished stream never resurfaces', async () => {
    const { calls, push, close } = streamedFetch();
    const view = renderPanel({ disabled: false });

    // Start a refine and let the first token land.
    fireEvent.click(screen.getByRole('button', { name: /refine my message/i }));
    await tick();
    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal.aborted).toBe(false);
    await act(async () => {
      push('Hello there — ');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByRole('group', { name: /suggested rewrite/i })).toBeTruthy();
    expect(screen.getByText(/Hello there/)).toBeTruthy();

    // The form starts sending: the panel goes, and so does the request.
    view.rerender(
      createElement(MessageRefine, {
        message: MESSAGE,
        onAccept: () => {},
        mode: 'guestbook',
        minLength: 12,
        disabled: true,
      }),
    );
    await tick();
    expect(screen.queryByRole('group', { name: /suggested rewrite/i })).toBeNull();
    expect(calls[0].init.signal.aborted).toBe(true);

    // The stream nevertheless completes (a buffered body can) — and the send
    // finishes, re-enabling the panel over a cleared field. Nothing of the
    // old rewrite may come back: no panel, no "Use this", just the affordance.
    await act(async () => {
      push('a polished version of my mark.');
      close();
      await new Promise((r) => setTimeout(r, 0));
    });
    view.rerender(
      createElement(MessageRefine, {
        message: MESSAGE,
        onAccept: () => {},
        mode: 'guestbook',
        minLength: 12,
        disabled: false,
      }),
    );
    await tick();
    expect(screen.queryByRole('group', { name: /suggested rewrite/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /use this/i })).toBeNull();
    expect(screen.queryByText(/polished version/)).toBeNull();
    expect(screen.getByRole('button', { name: /refine my message/i })).toBeTruthy();
  });

  it('disabling with a finished suggestion on offer discards it too', async () => {
    const { push, close } = streamedFetch();
    const view = renderPanel({ disabled: false });
    fireEvent.click(screen.getByRole('button', { name: /refine my message/i }));
    await tick();
    await act(async () => {
      push('A finished rewrite.');
      close();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByRole('button', { name: /use this/i })).toBeTruthy();

    view.rerender(
      createElement(MessageRefine, {
        message: MESSAGE,
        onAccept: () => {},
        mode: 'guestbook',
        minLength: 12,
        disabled: true,
      }),
    );
    await tick();
    view.rerender(
      createElement(MessageRefine, {
        message: MESSAGE,
        onAccept: () => {},
        mode: 'guestbook',
        minLength: 12,
        disabled: false,
      }),
    );
    await tick();
    expect(screen.queryByRole('button', { name: /use this/i })).toBeNull();
    expect(screen.queryByText(/finished rewrite/i)).toBeNull();
  });

  it('mounting already disabled is a quiet no-op — nothing is fetched, nothing shown', async () => {
    const { calls } = streamedFetch();
    renderPanel({ disabled: true });
    await tick();
    expect(calls).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /refine my message/i })).toBeNull();
    expect(screen.queryByRole('group', { name: /suggested rewrite/i })).toBeNull();
  });
});
