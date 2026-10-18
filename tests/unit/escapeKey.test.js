// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { afterUnclaimedEscape, claimEscape } from '@/lib/escapeKey';

// The last-resort Escape owner (the privacy notice) must lose to every other
// owner wherever that owner is bound. The regression this guards: the notice
// listened on `document` and read `defaultPrevented` at once, so a `window`
// owner (the 404 page's go-home shortcut) had not run yet, and one press both
// declined analytics and navigated home.

const press = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

describe('Escape ownership', () => {
  const cleanups = [];
  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    vi.useRealTimers();
  });
  const listen = (target, fn) => {
    target.addEventListener('keydown', fn);
    cleanups.push(() => target.removeEventListener('keydown', fn));
  };

  it('yields to an owner on window that runs AFTER the last-resort listener', () => {
    vi.useFakeTimers();
    const lastResort = vi.fn();
    listen(document, (event) => afterUnclaimedEscape(event, lastResort));
    listen(window, (event) => claimEscape(event));

    document.body.dispatchEvent(press());
    vi.runAllTimers();
    expect(lastResort).not.toHaveBeenCalled();
  });

  it('yields to an owner bound on the target, before the last-resort listener', () => {
    vi.useFakeTimers();
    const lastResort = vi.fn();
    listen(document, (event) => afterUnclaimedEscape(event, lastResort));
    listen(document.body, (event) => claimEscape(event));

    document.body.dispatchEvent(press());
    vi.runAllTimers();
    expect(lastResort).not.toHaveBeenCalled();
  });

  it('acts once dispatch is over when nobody claimed the press', () => {
    vi.useFakeTimers();
    const lastResort = vi.fn();
    listen(document, (event) => afterUnclaimedEscape(event, lastResort));
    listen(window, () => {}); // present, but did nothing with it

    document.body.dispatchEvent(press());
    expect(lastResort).not.toHaveBeenCalled(); // never mid-dispatch
    vi.runAllTimers();
    expect(lastResort).toHaveBeenCalledTimes(1);
  });

  it('a cancelled decision never fires (the notice unmounting mid-press)', () => {
    vi.useFakeTimers();
    const lastResort = vi.fn();
    let cancel;
    listen(document, (event) => {
      cancel = afterUnclaimedEscape(event, lastResort);
    });

    document.body.dispatchEvent(press());
    cancel();
    vi.runAllTimers();
    expect(lastResort).not.toHaveBeenCalled();
  });
});
