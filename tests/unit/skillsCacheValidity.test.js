// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StackPlate from '@/components/uses/StackPlate';
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
  ])('%s → %s', (_label, input, expected) => {
    expect(hasLiveCategories(input)).toBe(expected);
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
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
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
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
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
  });

  it.each([
    ['the route _fallback shape', { categories: emptyCategories(), _fallback: true }],
    ['a non-fallback crawl that found nothing', { categories: emptyCategories() }],
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
