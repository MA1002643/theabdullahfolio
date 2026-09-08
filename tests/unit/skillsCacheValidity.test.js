// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StackPlate from '@/components/uses/StackPlate';
import { groupStack } from '@/lib/uses/stack';
import {
  SKILLS_CACHE_KEY,
  SKILLS_LAST_FETCHED_KEY,
  emptyCategories,
  hasLiveCategories,
} from '@/utils/skillsIconUrl';

// The shared skills cache contract (issue #37). `skillsCache:v4` is written by
// the About card and read by BOTH the About card and the /uses Stack plate, so
// an entry there is taken as proof of a live crawl by whichever page is
// visited next. The bug this suite pins: freshness was being used as a proxy
// for truth. A `_fallback` payload (GitHub unreachable) and a crawl that found
// nothing both serialise to `emptyCategories()` — truthy, valid JSON,
// indistinguishable from a real payload by presence alone — so a young empty
// entry made the plate announce "Stack verified against GitHub" over nothing
// AND take its served-from-cache early return, suppressing the live fetch for
// the rest of the TTL. A recovered GitHub could not be picked up until the
// entry aged out.
//
// `hasLiveCategories` is the single predicate all four sites now share (the
// two readers, the two writers) so "verified" and the visible `● LIVE` token
// can never disagree.

const LIVE_CATEGORIES = {
  languages: [
    {
      slug: 'javascript',
      displayName: 'JavaScript',
      source: 'skillicons',
      repos: [{ name: 'a', nameWithOwner: 'o/a', url: 'https://github.com/o/a' }],
      privateRepoCount: 0,
    },
  ],
  frameworks: [],
  libraries: [],
  tools: [],
  software: [],
};

const FALLBACK = {
  languages: [{ slug: 'python', displayName: 'Python', source: 'skillicons' }],
  frameworks: [],
  libraries: [],
  tools: [],
  software: [],
};

describe('hasLiveCategories — the one emptiness test the cache is written and read through', () => {
  it.each([
    ['a real crawl', LIVE_CATEGORIES, true],
    ['every category present but empty (the _fallback shape)', emptyCategories(), false],
    ['a single populated category', { tools: [{ slug: 'vitest' }] }, true],
    ['an object of empty arrays', { languages: [], tools: [] }, false],
    ['a category holding a non-array', { languages: 'javascript' }, false],
    ['an empty object', {}, false],
    ['null', null, false],
    ['undefined', undefined, false],
    // `JSON.parse` is happy to hand back an array, and `Object.values` works on
    // one — so an array would slip past a bare `typeof === 'object'` test.
    ['an empty array', [], false],
    ['an array of skills (a half-written entry)', [{ slug: 'javascript' }], false],
    ['a string', 'nope', false],
    // Every renderer walks CATEGORY_ORDER and skips slug-less entries
    // (groupStack, SkillsCard's grid, flattenCategories). A payload whose only
    // content sits under an unknown key, or whose items can't be drawn, is
    // therefore EMPTY on screen — so it must not read as a live crawl.
    ['content under an unknown category only', { unexpected: [{ slug: 'x' }] }, false],
    ['a known category holding unusable items', { languages: [1, 2] }, false],
    ['a known category of slug-less objects', { languages: [{ displayName: 'JS' }] }, false],
    ['one known category among unknown ones', { unexpected: [1], tools: [{ slug: 'vitest' }] }, true],
  ])('%s → %s', (_label, input, expected) => {
    expect(hasLiveCategories(input)).toBe(expected);
  });

  // The invariant that keeps the claim honest: "this is a live crawl" is true
  // exactly when the plate has a tile to show. If the two ever drift apart
  // again, the plate can announce itself verified over an empty grid.
  it.each([
    ['a real crawl', LIVE_CATEGORIES],
    ['the empty shape', emptyCategories()],
    ['content under an unknown key', { unexpected: [{ slug: 'x' }] }],
    ['undrawable items', { languages: [1, 2] }],
    ['a mix of known and unknown', { unexpected: [1], tools: [{ slug: 'vitest' }] }],
    ['junk', 'nope'],
    ['null', null],
  ])('%s: hasLiveCategories agrees with groupStack having tiles', (_label, input) => {
    expect(hasLiveCategories(input)).toBe(groupStack(input).length > 0);
  });
});

describe('StackPlate — a fresh cache entry is only served when it holds tools', () => {
  let fetchMock;

  beforeEach(() => {
    // framer's useInView needs an IntersectionObserver; jsdom has none. This
    // one reports the target as on-screen immediately so the plate's viewport
    // gate opens and the effect under test actually runs.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback) {
          this.callback = callback;
        }
        observe(target) {
          this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    // Stubbed, not assigned: a bare `window.matchMedia = …` is not undone by
    // vi.unstubAllGlobals, so it would outlive this file's afterEach and make
    // any later test that wants a different query result order-dependent.
    // jsdom ships no matchMedia of its own, so unstubbing restores `undefined`
    // — which every caller here already guards for.
    vi.stubGlobal('matchMedia', (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    window.localStorage.clear();
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: emptyCategories() }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const writeCache = (categories, ageMs = 0) => {
    window.localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(categories));
    window.localStorage.setItem(SKILLS_LAST_FETCHED_KEY, String(Date.now() - ageMs));
  };

  const status = (container) => container.querySelector('[role="status"]')?.textContent ?? '';

  it('a fresh entry holding a real crawl is served: verified, and no fetch', async () => {
    writeCache(LIVE_CATEGORIES);
    const { container } = render(createElement(StackPlate, { fallback: FALLBACK }));

    await waitFor(() => expect(status(container)).toBe('Stack verified against GitHub.'));
    expect(fetchMock).not.toHaveBeenCalled();
    // The cache's write time is a RECORDED moment, not a guess, so unlike an
    // undated payload it earns the age readout.
    expect(container.textContent).toContain('ago');
  });

  it('a fresh but EMPTY entry is a miss: nothing is announced, and the live fetch still runs', async () => {
    writeCache(emptyCategories());
    const { container } = render(createElement(StackPlate, { fallback: FALLBACK }));

    // The regression: this used to read as a cache HIT.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(status(container)).toBe('');
  });

  it.each([
    ['an array', '[]'],
    ['an array of skills', '[{"slug":"javascript"}]'],
    ['a category holding a string', '{"languages":"javascript"}'],
    ['a bare null', 'null'],
    // Nothing here survives CATEGORY_ORDER, so the grid would draw nothing —
    // serving it would pin an empty plate for a TTL and call it verified.
    ['content under unknown keys only', '{"unexpected":[{"slug":"x"}]}'],
    ['a known category of undrawable items', '{"languages":[1,2]}'],
  ])('a fresh entry that parses to %s is a miss, not a crash', async (_label, raw) => {
    window.localStorage.setItem(SKILLS_CACHE_KEY, raw);
    window.localStorage.setItem(SKILLS_LAST_FETCHED_KEY, String(Date.now()));
    const { container } = render(createElement(StackPlate, { fallback: FALLBACK }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(status(container)).toBe('');
  });
});

describe('StackPlate — only a verified crawl is announced and persisted', () => {
  let fetchMock;

  const mountWith = (payload) => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }));
    vi.stubGlobal('fetch', fetchMock);
    return render(createElement(StackPlate, { fallback: FALLBACK }));
  };

  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback) {
          this.callback = callback;
        }
        observe(target) {
          this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    // Stubbed, not assigned: a bare `window.matchMedia = …` is not undone by
    // vi.unstubAllGlobals, so it would outlive this file's afterEach and make
    // any later test that wants a different query result order-dependent.
    // jsdom ships no matchMedia of its own, so unstubbing restores `undefined`
    // — which every caller here already guards for.
    vi.stubGlobal('matchMedia', (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const status = (container) => container.querySelector('[role="status"]')?.textContent ?? '';

  it('a real crawl is announced and cached', async () => {
    const { container } = mountWith({
      categories: LIVE_CATEGORIES,
      fetchedAt: '2026-09-05T18:56:59.663Z',
    });

    await waitFor(() => expect(status(container)).toBe('Stack verified against GitHub.'));
    expect(JSON.parse(window.localStorage.getItem(SKILLS_CACHE_KEY))).toEqual(LIVE_CATEGORIES);
    // The age readout is earned: the server dated the crawl, so it is shown.
    expect(container.textContent).toContain('ago');
  });

  // The route is cached for 10 minutes behind `stale-while-revalidate=300`, so
  // an undated payload may be a crawl a quarter of an hour old. Stamping the
  // client's clock would claim a freshness the server never asserted — and
  // `resolveStack` already rules it out ("null, not a fabricated time"). The
  // plate must not reintroduce it.
  it('a live crawl with NO fetchedAt still goes live, but shows no age', async () => {
    const { container } = mountWith({ categories: LIVE_CATEGORIES });

    await waitFor(() => expect(status(container)).toBe('Stack verified against GitHub.'));
    expect(container.textContent).toContain('live');
    expect(container.textContent).not.toContain('ago');
  });

  it.each([
    ['a non-string fetchedAt', 1757100000000],
    ['a null fetchedAt', null],
  ])('%s is not dressed up as a time', async (_label, fetchedAt) => {
    const { container } = mountWith({ categories: LIVE_CATEGORIES, fetchedAt });

    await waitFor(() => expect(status(container)).toBe('Stack verified against GitHub.'));
    expect(container.textContent).not.toContain('ago');
  });

  it.each([
    ['the route _fallback shape', { categories: emptyCategories(), _fallback: true }],
    ['a non-fallback crawl that found nothing', { categories: emptyCategories() }],
    // Passes a bare "is anything here?" test but renders nothing, because the
    // grid only ever walks CATEGORY_ORDER.
    ['a payload whose content sits under unknown keys', { categories: { unexpected: [{ slug: 'x' }] } }],
    ['a payload whose items have no slug to draw', { categories: { languages: [1, 2] } }],
  ])('%s is neither announced nor cached', async (_label, payload) => {
    const { container } = mountWith(payload);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The second half of the report: a payload with no tools must not claim
    // verified, and must not poison the entry the About card shares.
    await waitFor(() => expect(container.textContent).toContain('GitHub unreachable'));
    expect(status(container)).toBe('');
    expect(window.localStorage.getItem(SKILLS_CACHE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SKILLS_LAST_FETCHED_KEY)).toBeNull();
  });
});
