import { describe, expect, it } from 'vitest';
import {
  REACTION_KEYS,
  emptyReactionCounts,
  toReactionCounts,
} from '@/lib/guestbook/reactions';

// toReactionCounts collapses a stored { user: key } map into public counts.
// The map is data back from storage, so only the vocabulary may count
// (code review): the old `counts[key] !== undefined` test answered true for
// names a plain object inherits — toString, constructor, __proto__ — and
// would have written garbage onto the counts the API sends.

describe('toReactionCounts — counts only the known reaction keys', () => {
  it('collapses a stored { user: key } map into per-key counts', () => {
    expect(toReactionCounts({ ada: 'fire', bob: 'fire', cy: 'heart' })).toEqual({
      fire: 2,
      rocket: 0,
      heart: 1,
    });
  });

  it('an empty, null or absent map is all zeros', () => {
    for (const map of [{}, null, undefined]) {
      expect(toReactionCounts(map)).toEqual(emptyReactionCounts());
    }
  });

  it('a stored value spelling an inherited property name counts nothing and adds nothing', () => {
    const map = {
      a: 'toString',
      b: 'constructor',
      c: '__proto__',
      d: 'hasOwnProperty',
      e: 'valueOf',
      f: 'fire',
    };
    const counts = toReactionCounts(map);
    expect(counts).toEqual({ fire: 1, rocket: 0, heart: 0 });
    // Exactly the vocabulary as own keys — no `toString` string written on
    // top of the inherited method, and the prototype untouched.
    expect(Object.keys(counts)).toEqual(REACTION_KEYS);
    expect(typeof counts.toString).toBe('function');
    expect(Object.getPrototypeOf(counts)).toBe(Object.prototype);
    // What the API would serialise: the three counts and nothing else.
    expect(JSON.parse(JSON.stringify(counts))).toEqual({ fire: 1, rocket: 0, heart: 0 });
  });

  it('a retired or junk value is ignored, not counted under any key', () => {
    const map = { a: 'thumbsup', b: '', c: 'FIRE', d: 42, e: null, f: 'rocket' };
    expect(toReactionCounts(map)).toEqual({ fire: 0, rocket: 1, heart: 0 });
  });
});
