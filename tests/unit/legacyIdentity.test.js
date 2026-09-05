import { describe, expect, it } from 'vitest';
import {
  applyReactionMoves,
  classifyAuthor,
  deriveMapping,
  githubIdFromAvatar,
  keyForLogin,
  mergeMappings,
  migrationScriptArgs,
  MIGRATE_IDENTITY_LUA,
  normaliseMapping,
  planAuthor,
  planMessage,
  planReactionFields,
  readMigrationReply,
} from '@/lib/guestbook/legacyIdentity';
import { authorKey, ownsMessage } from '@/lib/guestbook/identity';

// The legacy-identity migration (legacyIdentity.js): rows and reaction
// fields written before identity keys existed are repaired ONLY through an
// authoritative login → account-id mapping — never by treating the login as
// the key — and reaction fields fold to one per person.

const AVATAR = 'https://avatars.githubusercontent.com/u/583231?v=4';
const LEGACY = { name: 'The Octocat', username: 'octocat', avatar: AVATAR };
const KEYED = {
  name: 'The Octocat',
  username: 'octocat-renamed',
  avatar: AVATAR,
  provider: 'github',
  key: 'github:583231',
};
const LEGACY_GOOGLE = { name: 'Gee', username: 'google:42', avatar: null, provider: 'google' };

describe('githubIdFromAvatar — the id the OAuth profile recorded at write time', () => {
  it('reads the numeric id out of the avatar_url path', () => {
    expect(githubIdFromAvatar(AVATAR)).toBe('583231');
    expect(githubIdFromAvatar('https://avatars0.githubusercontent.com/u/7?v=4')).toBe('7');
    expect(githubIdFromAvatar('https://avatars.githubusercontent.com/u/7')).toBe('7');
  });

  it('derives nothing from any other shape', () => {
    expect(githubIdFromAvatar('https://avatars.githubusercontent.com/octocat?v=4')).toBe(null);
    expect(githubIdFromAvatar('https://example.com/u/583231')).toBe(null);
    expect(githubIdFromAvatar('https://avatars.githubusercontent.com/u/abc')).toBe(null);
    expect(githubIdFromAvatar(null)).toBe(null);
    expect(githubIdFromAvatar('')).toBe(null);
  });
});

describe('normaliseMapping — operator input is validated, never coerced', () => {
  it('folds login case and accepts the id as digits, a number, or the key form', () => {
    const m = normaliseMapping({ OctoCat: '583231', hubot: 7, mona: 'github:99' });
    expect([...m]).toEqual([
      ['octocat', '583231'],
      ['hubot', '7'],
      ['mona', '99'],
    ]);
    expect(keyForLogin(m, 'OCTOCAT')).toBe('github:583231');
    expect(keyForLogin(m, 'nobody')).toBe(null);
    expect(keyForLogin(m, 'google:42')).toBe(null);
  });

  it('refuses what is not a login → GitHub id pair', () => {
    expect(() => normaliseMapping({ 'not a login': '1' })).toThrow(/not a GitHub login/);
    expect(() => normaliseMapping({ 'google:42': '1' })).toThrow(/not a GitHub login/);
    expect(() => normaliseMapping({ octocat: 'abc' })).toThrow(/not a GitHub account id/);
    expect(() => normaliseMapping({ octocat: 'google:42' })).toThrow(/not a GitHub account id/);
    expect(() => normaliseMapping({ octocat: '1', OCTOCAT: '2' })).toThrow(/two ids/);
  });

  it('merges left to right, the earlier mapping winning a conflict — reported, not thrown', () => {
    const explicit = normaliseMapping({ octocat: '1' });
    const derived = normaliseMapping({ octocat: '2', hubot: '3' });
    const { mapping, conflicts } = mergeMappings(explicit, derived);
    expect([...mapping]).toEqual([
      ['octocat', '1'],
      ['hubot', '3'],
    ]);
    expect(conflicts).toEqual([{ login: 'octocat', kept: '1', dropped: '2' }]);
  });
});

describe('classifyAuthor — the stored shapes', () => {
  it('names each shape by the fields it carries', () => {
    expect(classifyAuthor(KEYED)).toBe('keyed');
    expect(classifyAuthor(LEGACY)).toBe('legacy-github');
    expect(classifyAuthor({ ...LEGACY, provider: 'github' })).toBe('legacy-github');
    expect(classifyAuthor(LEGACY_GOOGLE)).toBe('legacy-keyed');
    expect(classifyAuthor({ name: 'Someone' })).toBe('anonymous');
    expect(classifyAuthor(null)).toBe('anonymous');
    // A bare login under a non-GitHub provider is not a shape the wall ever
    // wrote — left alone rather than guessed at.
    expect(classifyAuthor({ username: 'gee', provider: 'google' })).toBe('unknown');
  });
});

describe('deriveMapping — what the wall itself recorded', () => {
  it('pairs a keyed row by key + username, and a legacy row by its avatar id', () => {
    const { mapping, conflicts } = deriveMapping([
      KEYED, // octocat-renamed → 583231
      LEGACY, // octocat → 583231 (avatar)
      { username: 'hubot', avatar: 'https://example.com/hubot.png' }, // nothing to derive
      LEGACY_GOOGLE, // not GitHub
      { key: 'google:42', provider: 'google', name: 'Gee' }, // not GitHub
    ]);
    expect([...mapping]).toEqual([
      ['octocat-renamed', '583231'],
      ['octocat', '583231'],
    ]);
    expect(conflicts).toEqual([]);
  });

  it('a login the wall recorded under two different ids is derived for neither', () => {
    const { mapping, conflicts } = deriveMapping([
      { username: 'octocat', avatar: AVATAR },
      { username: 'octocat', avatar: 'https://avatars.githubusercontent.com/u/999?v=4' },
      { username: 'hubot', avatar: 'https://avatars.githubusercontent.com/u/7?v=4' },
    ]);
    expect([...mapping]).toEqual([['hubot', '7']]);
    expect(conflicts).toEqual([{ login: 'octocat', ids: ['583231', '999'] }]);
  });
});

describe('planAuthor — a key only through the mapping', () => {
  it('backfills a legacy GitHub author from the mapping; the row is then owned by its key', () => {
    const mapping = normaliseMapping({ octocat: '583231' });
    const plan = planAuthor(LEGACY, mapping);
    expect(plan.kind).toBe('legacy-github');
    expect(plan.source).toBe('mapping');
    expect(plan.next).toEqual({ ...LEGACY, provider: 'github', key: 'github:583231' });
    // Before: nobody's. After: the account's — and the renamed viewer's, not
    // the login's new holder.
    expect(ownsMessage(LEGACY, { key: 'github:583231' })).toBe(false);
    expect(ownsMessage(plan.next, { key: 'github:583231', username: 'octocat-renamed' })).toBe(true);
    expect(ownsMessage(plan.next, { key: 'github:999', username: 'octocat' })).toBe(false);
  });

  it('an unmapped legacy author gets no key — the avatar id is reported, not adopted', () => {
    const plan = planAuthor(LEGACY, new Map());
    expect(plan.next).toBe(null);
    expect(plan.login).toBe('octocat');
    expect(plan.avatarId).toBe('583231');
    expect(plan.conflict).toBe(false);
  });

  it('flags a mapping that disagrees with the avatar the row recorded; the mapping still wins', () => {
    const plan = planAuthor(LEGACY, normaliseMapping({ octocat: '999' }));
    expect(plan.conflict).toBe(true);
    expect(plan.next.key).toBe('github:999');
  });

  it('a legacy Google row moves its username into key and drops the username', () => {
    const plan = planAuthor(LEGACY_GOOGLE, new Map());
    expect(plan.kind).toBe('legacy-keyed');
    expect(plan.source).toBe('username');
    expect(plan.next).toEqual({ name: 'Gee', avatar: null, provider: 'google', key: 'google:42' });
    expect(plan.next).not.toHaveProperty('username');
    expect(authorKey(plan.next)).toBe(authorKey(LEGACY_GOOGLE));
    // A provider-less legacy Google row takes its provider from the key.
    expect(planAuthor({ username: 'google:42' }, new Map()).next.provider).toBe('google');
  });

  it('a keyed or anonymous author is left exactly alone', () => {
    expect(planAuthor(KEYED, normaliseMapping({ 'octocat-renamed': '1' })).next).toBe(null);
    expect(planAuthor({ name: 'Someone' }, new Map()).next).toBe(null);
    expect(planAuthor(null, new Map()).next).toBe(null);
  });
});

describe('planReactionFields / applyReactionMoves — one reaction per person again', () => {
  const mapping = normaliseMapping({ octocat: '583231', hubot: '7', '123': '456' });

  it('moves a mapped login field under the key when the key is free', () => {
    const map = { octocat: 'fire', 'google:42': 'heart' };
    const { moves, unmapped } = planReactionFields(map, mapping);
    expect(moves).toEqual([{ from: 'octocat', to: 'github:583231', action: 'move' }]);
    expect(unmapped).toEqual([]);
    expect(applyReactionMoves(map, moves)).toEqual({
      'github:583231': 'fire',
      'google:42': 'heart',
    });
  });

  it('where the key already holds a value, that (newer) choice stays and the login field is dropped', () => {
    const map = { octocat: 'fire', 'github:583231': 'heart' };
    const { moves } = planReactionFields(map, mapping);
    expect(moves).toEqual([{ from: 'octocat', to: 'github:583231', action: 'merge' }]);
    expect(applyReactionMoves(map, moves)).toEqual({ 'github:583231': 'heart' });
  });

  it('two logins mapped to one account fold into one field', () => {
    const map = { octocat: 'fire', OctoCat: 'rocket' };
    const { moves } = planReactionFields(map, mapping);
    expect(moves.map((m) => m.action)).toEqual(['move', 'merge']);
    expect(applyReactionMoves(map, moves)).toEqual({ 'github:583231': 'fire' });
  });

  it('an unmapped login is listed and left in place; identity-key fields are never touched', () => {
    const map = { stranger: 'fire', 'github:1': 'heart', 'google:2': 'rocket' };
    const { moves, unmapped } = planReactionFields(map, mapping);
    expect(moves).toEqual([]);
    expect(unmapped).toEqual(['stranger']);
    expect(applyReactionMoves(map, moves)).toEqual(map);
  });

  it('a numeric-looking login is still a login', () => {
    const { moves } = planReactionFields({ 123: 'fire' }, mapping);
    expect(moves).toEqual([{ from: '123', to: 'github:456', action: 'move' }]);
  });
});

describe('planMessage — the whole plan for one row', () => {
  const mapping = normaliseMapping({ octocat: '583231' });

  it('combines the author backfill and the field moves, and says whether anything changes', () => {
    const stored = { id: 'msg_1', author: LEGACY, message: 'hi', createdAt: '2026-03-01T00:00:00.000Z' };
    const plan = planMessage(stored, { octocat: 'fire', hubot: 'heart' }, mapping);
    expect(plan.id).toBe('msg_1');
    expect(plan.changes).toBe(true);
    expect(plan.author.next.key).toBe('github:583231');
    expect(plan.reactions.moves).toHaveLength(1);
    expect(plan.reactions.unmapped).toEqual(['hubot']);
  });

  it('a current row with current fields has no changes', () => {
    const stored = { id: 'msg_2', author: KEYED, message: 'hi', createdAt: '2026-03-01T00:00:00.000Z' };
    const plan = planMessage(stored, { 'github:583231': 'fire' }, mapping);
    expect(plan.changes).toBe(false);
    expect(plan.author.next).toBe(null);
    expect(plan.reactions).toEqual({ moves: [], unmapped: [] });
  });
});

describe('the redis script — one atomic compare-and-set + field fold per message', () => {
  it('guards on the message, compares the row before writing it, and folds fields keeping the keyed value', () => {
    const lua = MIGRATE_IDENTITY_LUA;
    expect(lua).toMatch(/EXISTS.*KEYS\[1\].*== 0.*return nil/s);
    expect(lua).toMatch(/GET.*KEYS\[1\].*== ARGV\[1\].*SET.*KEYS\[1\].*ARGV\[2\]/s);
    expect(lua).toMatch(/HGET.*KEYS\[2\].*from/s);
    expect(lua).toMatch(/HEXISTS.*KEYS\[2\].*to.*== 1.*merged/s);
    expect(lua).toMatch(/HSET.*KEYS\[2\].*to.*value/s);
    expect(lua).toMatch(/HDEL.*KEYS\[2\].*from/s);
    expect(lua).toMatch(/return \{ row, moved, merged \}/);
  });

  it('builds ARGV as [expected row, next row, from, to, …] — or empty row slots for a fields-only fold', () => {
    const moves = [{ from: 'octocat', to: 'github:583231', action: 'move' }];
    expect(
      migrationScriptArgs({ expectedRow: '{"a":1}', nextRow: '{"a":1,"k":2}', moves }),
    ).toEqual(['{"a":1}', '{"a":1,"k":2}', 'octocat', 'github:583231']);
    expect(migrationScriptArgs({ expectedRow: null, nextRow: null, moves })).toEqual([
      '',
      '',
      'octocat',
      'github:583231',
    ]);
    expect(migrationScriptArgs({ moves: [] })).toEqual(['', '']);
  });

  it('reads the reply: nil is a gone message; the row flag and the counts otherwise', () => {
    expect(readMigrationReply(null)).toBe(null);
    expect(readMigrationReply(undefined)).toBe(null);
    expect(readMigrationReply([1, 2, 1])).toEqual({ row: 'written', moved: 2, merged: 1 });
    expect(readMigrationReply(['-1', '0', '0'])).toEqual({ row: 'skipped', moved: 0, merged: 0 });
    expect(readMigrationReply([0, 1, 0])).toEqual({ row: 'unchanged', moved: 1, merged: 0 });
  });
});
