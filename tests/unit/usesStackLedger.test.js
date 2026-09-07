// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolGrid from '@/components/uses/ToolGrid';
import { usesData } from '@/app/data';
import {
  METER_SEGMENTS,
  maxUsage,
  meterSegments,
  rankByUsage,
  repoFigureParts,
} from '@/lib/uses/stack';
import { CATEGORY_COPY, TOOL_COPY, describeTool } from '@/lib/uses/toolCopy';
import { CATEGORY_ORDER } from '@/utils/skillsIconUrl';

// The /uses Stack ledger (issue #37 §9A as re-laid on 2026-09-05): the copy
// layer a non-engineer reads, the pure meter/ranking arithmetic, and the
// rendered contract — plain-English category sections with tallies, cards
// ranked most-used first with ordinals and descriptions, a two-tone meter
// drawn against the busiest tool with ember digits beside it, nothing that
// is a button or discloses a repository name (that lives on /about), the
// curated state, and the icon-error drop-out. jsdom has no layout: the
// contract is structure and text, not geometry.

const repo = (n) => ({ name: n, nameWithOwner: `o/${n}`, url: `https://github.com/o/${n}` });
const skill = (slug, displayName, repos = [], privateRepoCount = 0) => ({
  slug,
  displayName,
  source: 'skillicons',
  repos,
  privateRepoCount,
});

const GROUPS = [
  {
    category: 'languages',
    items: [
      skill('css', 'CSS'),
      skill('javascript', 'JavaScript', [repo('a')], 2),
      skill('typescript', 'TypeScript', [repo('a'), repo('b'), repo('c'), repo('d')]),
    ],
  },
  {
    category: 'tools',
    items: [skill('vitest', 'Vitest', [], 1), skill('zzz-unknown', 'Mystery', [], 1)],
  },
];

const CURATED = [
  {
    category: 'languages',
    items: [
      { slug: 'javascript', displayName: 'JavaScript', source: 'skillicons' },
      { slug: 'css', displayName: 'CSS', source: 'skillicons' },
    ],
  },
];

beforeEach(() => {
  // Every card and category head owns a framer `useInView` gate, and the
  // tally count-up a second one; jsdom has no IntersectionObserver.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const mount = (groups) =>
  render(createElement(ToolGrid, { groups, revealed: true, reduceMotion: true }));
const cards = () => [...document.querySelectorAll('.uses-tool')];
const card = (slug) => document.querySelector(`.uses-tool[data-slug="${slug}"]`);
const figure = (slug) => card(slug).querySelector('.uses-tool__figure').textContent;
const segs = (slug, cls) => card(slug).querySelectorAll(`.uses-meter__seg.${cls}`).length;

describe('toolCopy — the plain-English layer', () => {
  it('has a label, strapline and generic line for every category', () => {
    for (const c of CATEGORY_ORDER) {
      expect(CATEGORY_COPY[c]?.label, c).toBeTruthy();
      expect(CATEGORY_COPY[c]?.lay, c).toBeTruthy();
      expect(CATEGORY_COPY[c]?.generic, c).toBeTruthy();
    }
  });

  it('describes every tool in the curated set with its own copy, never the generic', () => {
    for (const [category, items] of Object.entries(usesData.stack)) {
      for (const it of items) {
        expect(TOOL_COPY[it.slug], it.slug).toBeTruthy();
        expect(describeTool(it.slug, category), it.slug).not.toBe(CATEGORY_COPY[category].generic);
      }
    }
  });

  it('keeps every line to one sentence that fits two card lines', () => {
    for (const [slug, line] of Object.entries(TOOL_COPY)) {
      expect(line.length, slug).toBeLessThanOrEqual(90);
      expect(line.trim().endsWith('.'), slug).toBe(true);
    }
  });

  it('falls back to the category generic for a slug the crawl adds later', () => {
    expect(describeTool('zzz-unknown', 'tools')).toBe(CATEGORY_COPY.tools.generic);
    expect(describeTool('zzz-unknown', 'not-a-category')).toBe('');
  });
});

describe('stack arithmetic', () => {
  it('ranks most-used first, ties by name, and leaves an uncounted list in hand-set order', () => {
    expect(rankByUsage(GROUPS[0].items).map((i) => i.slug)).toEqual([
      'typescript',
      'javascript',
      'css',
    ]);
    expect(
      rankByUsage([skill('b', 'Beta', [repo('x')]), skill('a', 'Alpha', [repo('y')])]).map(
        (i) => i.slug,
      ),
    ).toEqual(['a', 'b']);
    expect(rankByUsage(CURATED[0].items).map((i) => i.slug)).toEqual(['javascript', 'css']);
  });

  it('scales the meter against the busiest tool and never drowns a small count', () => {
    expect(maxUsage(GROUPS)).toBe(4);
    const [css, javascript, typescript] = GROUPS[0].items;
    const [vitest] = GROUPS[1].items;
    expect(meterSegments(typescript, 4)).toEqual({ lit: 16, public: 16, private: 0 });
    expect(meterSegments(javascript, 4)).toEqual({ lit: 12, public: 4, private: 8 });
    expect(meterSegments(vitest, 4)).toEqual({ lit: 4, public: 0, private: 4 });
    expect(meterSegments(css, 4)).toEqual({ lit: 0, public: 0, private: 0 });
    // One public repo against a hundred still lights a segment…
    expect(meterSegments(skill('x', 'X', [repo('a')]), 100)).toEqual({
      lit: 1,
      public: 1,
      private: 0,
    });
    // …and a mixed count that rounds to nothing still shows BOTH portions.
    expect(meterSegments(skill('x', 'X', [repo('a')], 1), 100)).toEqual({
      lit: 2,
      public: 1,
      private: 1,
    });
    // The busiest tool with a single private repo cannot overflow the track.
    const pubs = Array.from({ length: 31 }, (_, i) => repo(`r${i}`));
    expect(meterSegments(skill('x', 'X', pubs, 1), 32)).toEqual({
      lit: METER_SEGMENTS,
      public: 15,
      private: 1,
    });
    expect(meterSegments(skill('x', 'X', [repo('a')]), 0)).toEqual({
      lit: 0,
      public: 0,
      private: 0,
    });
  });

  it('phrases the figure: mixed, one-sided singular/plural, or nothing', () => {
    const [css, javascript, typescript] = GROUPS[0].items;
    expect(repoFigureParts(javascript)).toEqual([
      { n: 3, unit: 'repos' },
      { n: 1, unit: 'public' },
      { n: 2, unit: 'private' },
    ]);
    expect(repoFigureParts(typescript)).toEqual([{ n: 4, unit: 'public repos' }]);
    expect(repoFigureParts(skill('x', 'X', [repo('a')]))).toEqual([{ n: 1, unit: 'public repo' }]);
    expect(repoFigureParts(GROUPS[1].items[0])).toEqual([{ n: 1, unit: 'private repo' }]);
    expect(repoFigureParts(skill('x', 'X', [], 3))).toEqual([{ n: 3, unit: 'private repos' }]);
    expect(repoFigureParts(css)).toBeNull();
    expect(repoFigureParts(null)).toBeNull();
  });
});

describe('ToolGrid — the ledger', () => {
  it('renders each category as a plain-English section with a tally and strapline', () => {
    mount(GROUPS);
    expect([...document.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'Languages',
      'Tools',
    ]);
    expect([...document.querySelectorAll('.uses-stack__tally')].map((t) => t.textContent)).toEqual(
      ['3 of 5', '2 of 5'],
    );
    expect(
      document.querySelector('[data-category="languages"] .uses-stack__lay').textContent,
    ).toBe(CATEGORY_COPY.languages.lay);
    const section = document.querySelector('[data-category="tools"]');
    expect(section.getAttribute('aria-labelledby')).toBe(section.querySelector('h3').id);
  });

  it('ranks cards most-used first with ordinals, and describes every tool', () => {
    mount(GROUPS);
    const langs = [...document.querySelectorAll('[data-category="languages"] .uses-tool')];
    expect(langs.map((c) => c.dataset.slug)).toEqual(['typescript', 'javascript', 'css']);
    expect(langs.map((c) => c.querySelector('.uses-tool__rank').textContent)).toEqual([
      '01',
      '02',
      '03',
    ]);
    expect(card('javascript').querySelector('.uses-tool__desc').textContent).toBe(
      TOOL_COPY.javascript,
    );
    expect(card('zzz-unknown').querySelector('.uses-tool__desc').textContent).toBe(
      CATEGORY_COPY.tools.generic,
    );
  });

  it('draws a two-tone meter against the busiest tool and phrases the figure with ember digits', () => {
    mount(GROUPS);
    expect(card('typescript').querySelectorAll('.uses-meter__seg').length).toBe(METER_SEGMENTS);
    expect([segs('typescript', 'is-public'), segs('typescript', 'is-private')]).toEqual([16, 0]);
    expect([segs('javascript', 'is-public'), segs('javascript', 'is-private')]).toEqual([4, 8]);
    expect([segs('vitest', 'is-public'), segs('vitest', 'is-private')]).toEqual([0, 4]);
    expect([segs('css', 'is-public'), segs('css', 'is-private')]).toEqual([0, 0]);

    expect(figure('javascript')).toBe('3 repos · 1 public · 2 private');
    expect(
      [...card('javascript').querySelectorAll('.uses-tool__figure b')].map((b) => b.textContent),
    ).toEqual(['3', '1', '2']);
    expect(figure('typescript')).toBe('4 public repos');
    expect(figure('vitest')).toBe('1 private repo');
    expect(figure('css')).toBe('—');

    expect(card('javascript').querySelector('.uses-meter__track').getAttribute('aria-label')).toBe(
      'JavaScript: used in 1 public repo · +2 private',
    );
    expect(card('javascript').querySelector('.uses-tool__figure').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(document.querySelector('.uses-stack').dataset.counted).toBe('true');
    expect(document.querySelector('.uses-stack__key').textContent).toMatch(
      /relative to the most-used tool/,
    );
  });

  it('discloses nothing: no buttons, no tooltip, no repository names', () => {
    mount(GROUPS);
    expect(document.querySelectorAll('.uses-stack button').length).toBe(0);
    expect(document.querySelectorAll('[role="tooltip"]').length).toBe(0);
    expect(document.body.textContent).not.toMatch(/o\/a|github\.com/);
  });

  it('shows the curated set uncounted, in hand-set order, with the crawl note', () => {
    mount(CURATED);
    expect(cards().map((c) => c.dataset.slug)).toEqual(['javascript', 'css']);
    expect(figure('javascript')).toBe('curated');
    expect(card('javascript').querySelectorAll('.is-public, .is-private').length).toBe(0);
    expect(document.querySelector('.uses-stack').dataset.counted).toBe('false');
    expect(document.querySelector('.uses-stack__key').textContent).toMatch(
      /arrive with the live crawl/,
    );
  });

  it('drops a card whose icon fails to load and re-tallies', () => {
    mount(GROUPS);
    fireEvent.error(card('css').querySelector('img'));
    expect(card('css')).toBeNull();
    expect(
      document.querySelector('[data-category="languages"] .uses-stack__tally').textContent,
    ).toBe('2 of 4');
  });
});
