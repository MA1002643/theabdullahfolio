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

/**
 * A LATER degraded payload that got further than `PARTIAL` did.
 *
 * This is what a second attempt during an outage actually looks like: the
 * pagination that failed on page one reached a page or two, so the repo list is
 * longer and the span is anchored further back — still flagged partial, still
 * without a `total`, and strictly more informative than the answer before it.
 */
const BETTER_PARTIAL = {
  generatedAt: '2026-09-13T00:20:00.000Z',
  partial: true,
  personalProjects: {
    firstRepoDate: '2021-01-01',
    months: 40,
    display: '3+ years',
    complete: false,
    repos: [
      { name: 'one', createdAt: '2023-01-01T00:00:00Z' },
      { name: 'two', createdAt: '2022-01-01T00:00:00Z' },
      { name: 'three', createdAt: '2021-01-01T00:00:00Z' },
    ],
  },
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

/**
 * One good poll, then a failing one — an HTTP error rather than a payload.
 *
 * `ok: false` rather than a thrown network error because it exercises the
 * hook's own `throw` on a bad status, which is the path most likely to be
 * refactored; a rejected `fetch` lands in the same catch.
 */
const respondThenFail = (payload) => {
  let call = 0;
  return vi.fn(async () => {
    call += 1;
    if (call === 1) return { ok: true, status: 200, json: async () => payload };
    return { ok: false, status: 503, statusText: 'Service Unavailable' };
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

  it('replaces a held partial with a newer, better partial', async () => {
    // `current ?? payload` kept ANYTHING already in state, so the first
    // degraded answer a cold client happened to receive became permanent for
    // the rest of the visit — even as later polls returned more repos and a
    // longer span. Only a COMPLETE answer earns that protection.
    vi.stubGlobal('fetch', respondWith(PARTIAL, BETTER_PARTIAL));

    const { result } = renderHook(() => useExperienceSummary(USERNAME));

    await settle();
    expect(result.current.data.personalProjects).toBeNull();

    await settle(POLL_MS);

    expect(result.current.data.personalProjects.repos).toHaveLength(3);
    expect(result.current.data.personalProjects.firstRepoDate).toBe('2021-01-01');
    // Still a degraded answer in every other respect: no total, no indicators,
    // and nothing written to the instant-paint store.
    expect(result.current.data.total).toBeNull();
    expect(result.current.changeMessage).toBeNull();
    expect(result.current.addedRepoNames).toEqual([]);
    expect(
      window.localStorage.getItem(
        `experience-summary:last-payload:${USERNAME}`,
      ),
    ).toBe(null);
  });

  it('keeps a stored complete answer that predates the partial flag', async () => {
    // The instant-paint hydration path. Entries written before `partial`
    // existed carry no flag at all, and they are complete by construction —
    // only complete payloads are ever written — so "not marked partial" must
    // read as complete, or a degraded poll would displace a good stored answer
    // on the visit after a deploy.
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
    vi.stubGlobal('fetch', respondWith(PARTIAL));

    const { result } = renderHook(() => useExperienceSummary(USERNAME));
    await settle();

    expect(result.current.data.total).toEqual({
      months: 150,
      display: '12+ years',
    });
    expect(result.current.data.personalProjects.repos).toHaveLength(1);
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

// ── The other early exit ────────────────────────────────────────────────────
// A poll that THREW made no comparison either, so it leaves the four indicators
// describing the last poll that did — the same defect as the partial branch
// above, reached through the catch instead of the early return. It was fixed on
// one path and not the other, which is exactly the failure mode the shared
// `clearChangeIndicators` step was introduced to prevent.
describe('useExperienceSummary — a failed poll', () => {
  const SEEDED_BASELINE = {
    personalProjects: {
      firstRepoDate: '2020-01-01',
      months: 60,
      display: '5+ years',
      complete: true,
      repos: [{ name: 'older', createdAt: '2020-01-01T00:00:00Z' }],
    },
    employment: { months: 90, display: '7+ years', roles: [] },
    total: { months: 150, display: '12+ years' },
  };

  beforeEach(() => {
    // The hook logs the failure by design ("don't throw — the about page should
    // still render"). Silenced so a passing run is not noisy, and spied rather
    // than blanked so the logging itself can be asserted.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('clears the change indicators a previous complete poll set', async () => {
    window.localStorage.setItem(
      `experience-summary:last-payload:${USERNAME}`,
      JSON.stringify(SEEDED_BASELINE),
    );
    vi.stubGlobal(
      'fetch',
      respondThenFail(withRepo('brand-new', '2026-09-01T00:00:00Z')),
    );

    const { result } = renderHook(() => useExperienceSummary(USERNAME));

    // Poll 1 — a real change, asserted so the clearing below is not vacuous.
    await settle();
    expect(result.current.addedRepoNames).toContain('brand-new');
    expect(result.current.changeMessage).toBeTruthy();

    // Poll 2 — the endpoint answers 503.
    await settle(POLL_MS);

    expect(result.current.error).toBeTruthy();
    // The regression: all four used to survive the catch.
    expect(result.current.addedRepoNames).toEqual([]);
    expect(result.current.addedRoleKeys).toEqual([]);
    expect(result.current.changedCategories).toEqual([]);
    expect(result.current.changeMessage).toBeNull();
  });

  it('keeps the last good payload and the stored baseline', async () => {
    // Clearing the decoration is not clearing the answer. The years card and
    // the modal keep rendering what the last successful poll returned, and the
    // diff baseline in localStorage is untouched — so the NEXT successful poll
    // still compares against real data rather than starting from nothing and
    // announcing the whole payload as new.
    vi.stubGlobal(
      'fetch',
      respondThenFail(withRepo('kept', '2026-09-01T00:00:00Z')),
    );

    const { result } = renderHook(() => useExperienceSummary(USERNAME));

    await settle();
    const complete = result.current.data;
    expect(complete?.partial).toBe(false);
    const storedAfterSuccess = window.localStorage.getItem(
      `experience-summary:last-payload:${USERNAME}`,
    );
    expect(storedAfterSuccess).toBeTruthy();

    await settle(POLL_MS);

    expect(result.current.data).toBe(complete);
    expect(
      window.localStorage.getItem(
        `experience-summary:last-payload:${USERNAME}`,
      ),
    ).toBe(storedAfterSuccess);
  });
});
