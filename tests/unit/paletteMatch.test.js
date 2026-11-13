import { describe, expect, it } from 'vitest';
import { fold, matchLabel, rankActions } from '@/lib/palette/match';

// The sitewide palette's ranked matcher (issue #41 §3.3). These pin the tier
// order a reader expects and the two details that are easy to get wrong:
// folding (case + diacritics) and highlight ranges reported against the
// ORIGINAL label even when folding changes its length.

const action = (id, label, extra = {}) => ({ id, label, perform: () => {}, ...extra });
const ids = (result) => result.items.map((a) => a.id);
const slice = (text, ranges) => ranges.map(([a, b]) => text.slice(a, b)).join('|');

describe('matchLabel — the tiers', () => {
  it('ranks prefix > word prefix > substring > subsequence', () => {
    const q = fold('pro');
    const prefix = matchLabel('Projects', q).score;
    const word = matchLabel('Go to Projects', q).score;
    const inner = matchLabel('Improve', q).score;
    const subsequence = matchLabel('Portfolio', q).score;
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThan(subsequence);
  });

  it('returns null when the letters are not all there in order', () => {
    expect(matchLabel('Journey', fold('zz'))).toBeNull();
    expect(matchLabel('Contact', fold('tcon'))).toBeNull();
  });

  it('highlights the contiguous run for a substring and each run for a subsequence', () => {
    expect(slice('Go to Projects', matchLabel('Go to Projects', fold('proj')).ranges)).toBe('Proj');
    expect(slice('Qualifications', matchLabel('Qualifications', fold('qlf')).ranges)).toBe('Q|l|f');
  });

  it('folds case and diacritics: "resume" finds "Résumé" and highlights all of it', () => {
    const hit = matchLabel('Résumé', fold('resume'));
    expect(hit).not.toBeNull();
    expect(slice('Résumé', hit.ranges)).toBe('Résumé');
  });

  it('keeps ranges on the original string when folding changes its length (İ → i̇)', () => {
    // "İ" lowercases to two code units and loses its dot mark, so the folded
    // string and the label differ in length before the match.
    const label = 'İstanbul Uses';
    const hit = matchLabel(label, fold('uses'));
    expect(slice(label, hit.ranges)).toBe('Uses');
  });

  it('treats an astral-plane character as one unit in the ranges', () => {
    const label = '🚀 Launch';
    expect(slice(label, matchLabel(label, fold('launch')).ranges)).toBe('Launch');
    expect(slice(label, matchLabel(label, fold('🚀')).ranges)).toBe('🚀');
  });
});

describe('rankActions', () => {
  const ACTIONS = [
    action('a', 'Go to About', { section: 'Navigate', keywords: 'bio me' }),
    action('p', 'Go to Projects', { section: 'Navigate' }),
    action('x', 'theabdullahfolio', { section: 'Projects', keywords: 'portfolio next.js' }),
    action('y', 'AfaaqX', { section: 'Projects', keywords: 'stripe payments' }),
    action('c', 'Copy link', { section: 'Actions' }),
    action('ask', 'Ask: x', { section: 'Ask', always: true }),
  ];

  it('returns everything, in order, for an empty or blank query', () => {
    expect(ids(rankActions(ACTIONS, ''))).toEqual(ACTIONS.map((a) => a.id));
    expect(ids(rankActions(ACTIONS, '   '))).toEqual(ACTIONS.map((a) => a.id));
  });

  it('finds an action by its keywords, without a highlight', () => {
    const result = rankActions(ACTIONS, 'stripe');
    expect(ids(result)).toEqual(['y', 'ask']);
    expect(result.ranges.has('y')).toBe(false);
  });

  it('needs every word of a multi-word query somewhere in the action', () => {
    expect(ids(rankActions(ACTIONS, 'next portfolio'))).toEqual(['x', 'ask']);
    expect(ids(rankActions(ACTIONS, 'next stripe'))).toEqual(['ask']);
  });

  it('orders sections by their best member and keeps them contiguous', () => {
    // "pro" is a word prefix in "Go to Projects" (800) but only a subsequence
    // in theabdullahfolio's label — so Navigate ranks above Projects.
    const result = ids(rankActions(ACTIONS, 'pro'));
    expect(result.indexOf('p')).toBeLessThan(result.indexOf('x'));
    const sections = result.map((id) => ACTIONS.find((a) => a.id === id).section);
    const runs = sections.filter((s, i) => s !== sections[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
  });

  it('keeps `always` actions, unscored, at the very end', () => {
    expect(ids(rankActions(ACTIONS, 'zzzz'))).toEqual(['ask']);
    expect(ids(rankActions(ACTIONS, 'copy')).at(-1)).toBe('ask');
  });

  it('a boost breaks a tie without overriding a better tier', () => {
    const list = [action('one', 'Contact'), action('two', 'Contact', { boost: 5 })];
    expect(ids(rankActions(list, 'cont'))).toEqual(['two', 'one']);
    const tiers = [action('sub', 'Accent', { boost: 50 }), action('pre', 'Contact')];
    // "c" prefix (1000) beats "c" substring + boost (600 + 50).
    expect(ids(rankActions(tiers, 'c'))[0]).toBe('pre');
  });

  it('skips holes in the list', () => {
    expect(ids(rankActions([null, action('a', 'About'), undefined], 'ab'))).toEqual(['a']);
  });
});
