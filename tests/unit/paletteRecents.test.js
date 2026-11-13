// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECENTS_KEY,
  RECENTS_MAX,
  pushRecent,
  readRecents,
  recentActions,
} from '@/lib/palette/recents';

// The palette's Recent group (issue #41 §3.5): ids only, newest first, capped,
// and never able to break running a command — storage may be blocked, full
// or tampered with.

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('recents storage', () => {
  it('moves the latest to the front, de-duplicates and caps', () => {
    for (const id of ['a', 'b', 'c', 'a', 'd', 'e', 'f']) pushRecent(id);
    expect(readRecents()).toEqual(['f', 'e', 'd', 'a', 'c']);
    expect(readRecents()).toHaveLength(RECENTS_MAX);
  });

  it('reads tampered or corrupt storage as nothing, dropping bad entries', () => {
    window.localStorage.setItem(RECENTS_KEY, '{not json');
    expect(readRecents()).toEqual([]);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify({ a: 1 }));
    expect(readRecents()).toEqual([]);
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(['ok', 7, null, '', 'x'.repeat(81), 'ok', 'fine']),
    );
    expect(readRecents()).toEqual(['ok', 'fine']);
  });

  it('survives a storage that throws on every call', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readRecents()).toEqual([]);
    expect(() => pushRecent('a')).not.toThrow();
    expect(pushRecent('a')).toEqual(['a']);
  });

  it('stores ids and nothing else', () => {
    pushRecent('go-about');
    expect(JSON.parse(window.localStorage.getItem(RECENTS_KEY))).toEqual(['go-about']);
  });
});

describe('recentActions', () => {
  const actions = [
    { id: 'go-about', label: 'About', section: 'Navigate', perform: () => {} },
    { id: 'ask', label: 'Ask', always: true, perform: () => {} },
    { id: 'ask-suggest-x', label: 'Q', noRecent: true, perform: () => {} },
  ];

  it('resolves ids in recency order as copies with their own ids, skipping the unknown', () => {
    const out = recentActions(['gone', 'go-about', 'ask', 'ask-suggest-x'], actions, 'Recent');
    expect(out).toEqual([
      expect.objectContaining({
        id: 'recent:go-about',
        recentOf: 'go-about',
        label: 'About',
        section: 'Recent',
      }),
    ]);
  });
});
