// @vitest-environment jsdom
import { createElement, forwardRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The composer stays editable while a send is in flight — the optimistic
// clear's whole point — so the settle step must only touch what the visitor
// has NOT touched since (code review): a failed request used to overwrite a
// draft typed in the meantime with the old message, and a success used to
// wipe a signature drawn in the meantime. MessageInput is rendered for real;
// its heavy children are stand-ins that keep the contract (a plain input the
// native-value writer can drive, a signature probe that can "draw").

const toastMock = vi.fn();
toastMock.error = vi.fn();
toastMock.success = vi.fn();
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/components/contact/FireInput', async () => {
  const { createElement: h, forwardRef: fwd } = await import('react');
  return { default: fwd((props, ref) => h('input', { ...props, ref })) };
});
vi.mock('@/components/contact/MessageRefine', () => ({ default: () => null }));
vi.mock('@/components/guestbook/SignatureField', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ onSignatureChange, resetSignal }) =>
      h('div', { 'data-testid': 'pad', 'data-reset': String(resetSignal) }, [
        h('button', { key: 'a', type: 'button', 'data-testid': 'draw-a', onClick: () => onSignatureChange('M 1 1 L 2 2') }),
        h('button', { key: 'b', type: 'button', 'data-testid': 'draw-b', onClick: () => onSignatureChange('M 5 5 L 9 9') }),
      ]),
  };
});
vi.mock('@/hooks/useCardTilt', () => ({
  useCardTilt: () => ({ style: null, glareStyle: null, handlers: {} }),
}));
vi.mock('@/hooks/useMagneticPull', () => ({
  useMagneticPull: () => ({ style: null, handlers: {}, release: () => {} }),
}));
vi.mock('@/hooks/useUiSound', () => ({ useUiSound: () => () => {} }));
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

const USER = { key: 'github:583231', username: 'octocat', name: 'Octo', image: null };

// A submit the test settles by hand, so edits can land while it is pending.
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function mount() {
  const { default: MessageInput } = await import('@/components/guestbook/MessageInput');
  const pending = [];
  const onSubmit = vi.fn(() => {
    const d = deferred();
    pending.push(d);
    return d.promise;
  });
  const utils = render(createElement(MessageInput, { user: USER, onSubmit, submitting: false }));
  const input = utils.container.querySelector('#guestbook-message');
  const form = utils.container.querySelector('form');
  const type = (value) => fireEvent.change(input, { target: { value } });
  const send = () => fireEvent.submit(form);
  const settle = async (ok) => {
    await act(async () => {
      pending.shift().resolve(ok);
      await Promise.resolve();
    });
  };
  return { ...utils, input, onSubmit, type, send, settle };
}

beforeEach(() => {
  window.localStorage.clear();
  toastMock.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('MessageInput — a send in flight never clobbers edits made since', () => {
  it('a failed send with the field still empty restores the message (the original contract)', async () => {
    const { input, type, send, settle } = await mount();
    type('first message');
    send();
    expect(input.value).toBe('');
    await settle(false);
    expect(input.value).toBe('first message');
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('a failed send does NOT overwrite a draft typed meanwhile — it offers the earlier text back instead', async () => {
    const { input, type, send, settle } = await mount();
    type('first message');
    send();
    type('a second draft, started while the first was in flight');
    await settle(false);
    expect(input.value).toBe('a second draft, started while the first was in flight');

    expect(toastMock).toHaveBeenCalledTimes(1);
    const [title, opts] = toastMock.mock.calls[0];
    expect(title).toMatch(/earlier message wasn’t sent/);
    expect(opts.description).toBe('first message');
    // Taking the offer is the visitor's explicit choice to replace the draft.
    act(() => opts.action.onClick());
    expect(input.value).toBe('first message');
  });

  it('a successful send folds the pad away only if the signature is still the one that was sent', async () => {
    const { getByTestId, onSubmit, type, send, settle } = await mount();
    type('with a signature');
    fireEvent.click(getByTestId('draw-a'));
    send();
    expect(onSubmit).toHaveBeenLastCalledWith('with a signature', 'M 1 1 L 2 2');
    // A new signature, drawn while the send is pending, is the NEXT message's.
    fireEvent.click(getByTestId('draw-b'));
    await settle(true);
    expect(getByTestId('pad').dataset.reset).toBe('0');

    // …and it goes out with that next message, untouched by the success.
    type('the next one');
    send();
    expect(onSubmit).toHaveBeenLastCalledWith('the next one', 'M 5 5 L 9 9');
    await settle(true);
    // Nothing drawn since: this time the pad folds.
    expect(getByTestId('pad').dataset.reset).toBe('1');
  });

  it('a successful send with the signature untouched folds the pad (the original contract)', async () => {
    const { getByTestId, type, send, settle } = await mount();
    type('signed');
    fireEvent.click(getByTestId('draw-a'));
    send();
    await settle(true);
    expect(getByTestId('pad').dataset.reset).toBe('1');
  });
});
