import { describe, expect, it } from 'vitest';
import {
  countTiles,
  groupStack,
  repoCountCopy,
  repoCountShort,
  resolveStack,
} from '@/lib/uses/stack';

// The /uses Stack plate's fail-open decision (issue #37): only a REAL,
// non-empty crawl payload is rendered live; anything else falls back to the
// curated set with the live claim dropped. And the repo-count copy — the
// whole point of a tile — pluralises correctly and says nothing when it has
// nothing to say.

const FALLBACK = {
  languages: [{ slug: 'javascript', displayName: 'JavaScript', source: 'skillicons' }],
  frameworks: [],
  libraries: [{ slug: 'threejs', displayName: 'Three.js', source: 'skillicons' }],
  tools: [],
  software: [],
};

const LIVE = {
  categories: {
    languages: [
      {
        slug: 'javascript',
        displayName: 'JavaScript',
        source: 'skillicons',
        repos: [{ name: 'a', nameWithOwner: 'o/a', url: 'https://github.com/o/a' }],
        privateRepoCount: 3,
      },
    ],
    frameworks: [],
    libraries: [],
    tools: [{ slug: 'vitest', displayName: 'Vitest', source: 'skillicons', repos: [], privateRepoCount: 0 }],
    software: [],
  },
  fetchedAt: '2026-09-05T18:56:59.663Z',
};

describe('resolveStack — live only on a real payload', () => {
  it('renders a non-empty crawl live, grouped in CATEGORY_ORDER with empty categories dropped', () => {
    const out = resolveStack(LIVE, FALLBACK);
    expect(out.live).toBe(true);
    expect(out.fetchedAt).toBe(LIVE.fetchedAt);
    expect(out.groups.map((g) => g.category)).toEqual(['languages', 'tools']);
    expect(countTiles(out.groups)).toBe(2);
  });

  it.each([
    ['null payload', null],
    ['an error body', { error: 'Username not allowed' }],
    ['an empty crawl', { categories: { languages: [], tools: [] }, fetchedAt: 'x' }],
    ['the route fallback shape', { ...LIVE, _fallback: true }],
    ['a payload without categories', { fetchedAt: 'x' }],
    ['a non-object', 'nope'],
  ])('%s → the curated set, live false, no fetchedAt', (_label, payload) => {
    const out = resolveStack(payload, FALLBACK);
    expect(out.live).toBe(false);
    expect(out.fetchedAt).toBeNull();
    expect(out.groups.map((g) => g.category)).toEqual(['languages', 'libraries']);
    expect(out.groups[0].items[0].slug).toBe('javascript');
  });

  it('a missing fetchedAt on a live payload is null, not a fabricated time', () => {
    const { fetchedAt, ...noTime } = LIVE;
    expect(resolveStack(noTime, FALLBACK)).toMatchObject({ live: true, fetchedAt: null });
  });

  it('groupStack tolerates junk input', () => {
    expect(groupStack(null)).toEqual([]);
    expect(groupStack({ languages: 'not an array' })).toEqual([]);
  });
});

describe('repoCountCopy / repoCountShort — the sentence on the chip and the figure on the face', () => {
  it.each([
    [{ repos: [{}], privateRepoCount: 0 }, 'used in 1 public repo', '1'],
    [{ repos: [{}, {}, {}, {}, {}, {}, {}], privateRepoCount: 2 }, 'used in 7 public repos · +2 private', '7 · +2'],
    [{ repos: [], privateRepoCount: 2 }, 'used in 2 private repos', '+2'],
    [{ repos: [], privateRepoCount: 1 }, 'used in 1 private repo', '+1'],
    [{ repos: [{}], privateRepoCount: 1 }, 'used in 1 public repo · +1 private', '1 · +1'],
  ])('%o → %s / %s', (item, sentence, short) => {
    expect(repoCountCopy(item)).toBe(sentence);
    expect(repoCountShort(item)).toBe(short);
  });

  it('a curated tile (no counts) makes no claim at all', () => {
    expect(repoCountCopy({ slug: 'x' })).toBeNull();
    expect(repoCountShort({ slug: 'x' })).toBeNull();
    expect(repoCountCopy({ repos: [], privateRepoCount: 0 })).toBeNull();
    expect(repoCountCopy({ repos: 'junk', privateRepoCount: NaN })).toBeNull();
  });
});
