import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDeferredMount } from '@/hooks/useDeferredMount';
import { deferredChunk } from '@/lib/deferredChunk';

// A deferred dialog whose download fails, then succeeds (issue #55).
//
// The fault this pins: `useDeferredMount` once reported ready when the fetch
// merely SETTLED. A failed idle fetch mounted the dynamic component, its loader
// failed too and resolved to optionalChunk's empty fallback, and next/dynamic
// cached that, so the dialog stayed invisible for the rest of the visit even
// after a later fetch downloaded the real module. Ready now means the import
// succeeded, and a failure is retried on the next request.

function Dialog({ open }) {
  return open ? <div role="dialog" aria-label="Details" /> : null;
}

// The same wiring as the /about hero cards: request on intent and on open,
// mount only once ready.
function harness(load) {
  const chunk = deferredChunk(load, 'Dialog');
  const Lazy = dynamic(chunk.loader, { ssr: false });
  return function Card() {
    const [ready, request] = useDeferredMount(chunk);
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onPointerOver={request}
          onClick={() => {
            request();
            setOpen(true);
          }}
        >
          details
        </button>
        {ready && <Lazy open={open} />}
      </>
    );
  };
}

describe('useDeferredMount after a failed download', () => {
  it('opens the real dialog once a retry succeeds, after the idle fetch and an early click both failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue({ default: Dialog });
    const Card = harness(load);
    render(<Card />);

    // The idle-time fetch fails: nothing mounts.
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const button = screen.getByRole('button', { name: 'details' });

    // A click that beats a working connection: the open request fails too.
    await act(async () => fireEvent.click(button));
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();

    // The next intent downloads it, and the already-open dialog appears.
    await act(async () => fireEvent.pointerOver(button));
    expect(await screen.findByRole('dialog', { name: 'Details' })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('never mounts while every download fails', async () => {
    const load = vi.fn().mockRejectedValue(new TypeError('offline'));
    const Card = harness(load);
    render(<Card />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'details' })));
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
