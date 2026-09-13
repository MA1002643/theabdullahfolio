// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useExperienceSummary } from '@/hooks/useExperienceSummary';

// ── What a partial poll must NOT leave behind ───────────────────────────────
// `/api/experience-summary` marks a response `partial` when GitHub failed or
// paginated incompletely. The hook adopts such a payload only when it has
// nothing better, and skips both the localStorage write and the change diff —
// a half-answer is not a baseline, and the personal side vanishing and coming
// back is not growth to announce.
//
// That early return then has to clear the four "what changed this poll"
// indicators, because they describe the LAST comparison and no comparison
// happened. Left standing they are not a momentary flicker: polling is ten
// minutes apart, and the breakdown modal's per-row heartbeat is armed by set
// MEMBERSHIP and fired when the section scrolls into view — so a stale set can
// light rows up as "newly added" in a modal opened much later, crediting a poll
// that observed nothing.
//
// The same shape was fixed once already in the normal path, where "only set
// when truthy" left a stale sentence on screen across no-diff polls.

const USERNAME = 'MA1002643';

/** A complete payload whose repo list differs from `BASE`, so a diff fires. */
const withRepo = (name, createdAt) => ({
  generatedAt: '2026-09-13T00:00:00.000Z',
  partial: false,
  personalProjects: {
    firstRepoDate: '2020-01-01',
    months: 60,
    display: '5+ years',
    complete: true,
    repos: [{ name, createdAt, url: `https://github.com/x/${name}` }],
  },
  employment: { months: 90, display: '7+ years', roles: [] },
  total: { months: 150, display: '12+ years' },
});

const PARTIAL = {
  generatedAt: '2026-09-13T00:10:00.000Z',
  partial: true,
  personalProjects: null,
  employment: { months: 90, display: '7+ years', roles: [] },
  total: null,
};

/** Queue of responses `fetch` hands out, one per poll. */
const respondWith = (...payloads) => {
  let call = 0;
  return vi.fn(async () => {
    const body = payloads[Math.min(call, payloads.length - 1)];
    call += 1;
    return { ok: true, status: 200, json: async () => body };
  });
};

const POLL_MS = 10 * 60 * 1000;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  // Installed BEFORE any render. The hook registers its `setInterval` during
  // mount, so faking the clock afterwards leaves that interval on the real one
  // and `advanceTimersByTime` has nothing to advance — the second poll simply
  // never fires and the assertions pass against the FIRST poll's state, which
  // is how a test like this quietly proves nothing.
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Let the pending fetch settle, and optionally drive the clock to the next poll.
 *
 * `advanceTimersByTimeAsync` rather than the sync form because each poll is a
 * chain of awaits (`fetch` → `res.json()`); the sync version fires the timer and
 * returns before any of that resolves.
 */
const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('useExperienceSummary — a partial poll', () => {
  it('clears the change indicators a previous complete poll set', async () => {
    // Seed a baseline so the second poll has something to diff against, then
    // let a complete poll detect a genuinely new repo.
    window.localStorage.setItem(
      `experience-summary:last-payload:${USERNAME}`,
      JSON.stringify({
        personalProjects: {
          firstRepoDate: '2020-01-01',
          months: 60,
          display: '5+ years',
          complete: true,
          repos: [{ name: 'older', createdAt: '2020-01-01T00:00:00Z' }],
        },
        employment: { months: 90, display: '7+ years', roles: [] },
        total: { months: 150, display: '12+ years' },
      }),
    );

    vi.stubGlobal(
      'fetch',
      respondWith(withRepo('brand-new', '2026-09-01T00:00:00Z'), PARTIAL),
    );

    const { result } = renderHook(() => useExperienceSummary(USERNAME));

    // Poll 1 — a real change is detected and announced. Asserted, not assumed:
    // if this were empty the clearing assertions below would be vacuous.
    await settle();
    expect(result.current.addedRepoNames).toContain('brand-new');
    expect(result.current.changeMessage).toBeTruthy();

    // Poll 2 — GitHub degrades.
    await settle(POLL_MS);

    // The regression: all four used to survive the early return.
    expect(result.current.addedRepoNames).toEqual([]);
    expect(result.current.addedRoleKeys).toEqual([]);
    expect(result.current.changedCategories).toEqual([]);
    expect(result.current.changeMessage).toBeNull();
  });

  it('keeps the complete payload it already had', async () => {
    // Clearing the indicators must not be mistaken for clearing the DATA. The
    // years card and the modal keep rendering the last complete answer; only
    // the "this just changed" decoration goes.
    vi.stubGlobal(
      'fetch',
      respondWith(withRepo('kept', '2026-09-01T00:00:00Z'), PARTIAL),
    );

    const { result } = renderHook(() => useExperienceSummary(USERNAME));

    await settle();
    const complete = result.current.data;
    expect(complete).toBeTruthy();
    expect(complete.partial).toBe(false);

    await settle(POLL_MS);

    // Same object, not the partial one — `current ?? payload` kept it.
    expect(result.current.data).toBe(complete);
    expect(result.current.data.total).toBeTruthy();
    expect(result.current.data.partial).toBe(false);
  });

  it('adopts a partial payload when it has nothing better, still with no indicators', async () => {
    // A cold client during an outage: the employment half is worth showing, and
    // none of it is a "change".
    vi.stubGlobal('fetch', respondWith(PARTIAL));

    const { result } = renderHook(() => useExperienceSummary(USERNAME));

    await settle();
    expect(result.current.data).toBeTruthy();
    expect(result.current.data.partial).toBe(true);
    expect(result.current.data.employment.months).toBe(90);
    expect(result.current.changeMessage).toBeNull();
    expect(result.current.addedRepoNames).toEqual([]);
    expect(result.current.addedRoleKeys).toEqual([]);
    expect(result.current.changedCategories).toEqual([]);
  });

  it('does not write a partial payload to the instant-paint store', async () => {
    // The other half of the early return, pinned here because this suite is
    // where someone will look after changing it.
    vi.stubGlobal('fetch', respondWith(PARTIAL));

    const { result } = renderHook(() => useExperienceSummary(USERNAME));
    await settle();
    expect(result.current.data).toBeTruthy();

    expect(window.localStorage.getItem(`experience-summary:last-payload:${USERNAME}`)).toBe(
      null,
    );
  });
});
