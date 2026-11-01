// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';
import usesMessages from '../../messages/en/Uses.json';
import usesToolsMessages from '../../messages/en/UsesTools.json';
import LiveAge from '@/components/uses/LiveAge';
import ToolGrid from '@/components/uses/ToolGrid';
import { CATEGORY_COPY, TOOL_COPY } from '@/lib/uses/toolCopy';
import { BOM_FALLBACK, BOM_RULES } from '@/lib/uses/buildFacts';
import { DEFAULT_LABELS, buildGraph } from '@/lib/uses/pipelineGraph';
import { repoCountCopy } from '@/lib/uses/stack';
import { formatAge } from '@/utils/formatAge';
import { messagesFor, renderWithIntl } from '../support/intl';

// /uses in the catalogue (issue #82). Three kinds of guarantee:
//
//   1. DRIFT — the Uses catalogue mirrors two English sources that stay the
//      record (toolCopy.js for the tool/category copy, buildFacts.js for the
//      bill's group headings). The translation pipeline reads the catalogue,
//      so a description edited in toolCopy.js and not in the JSON would ship
//      the old sentence to every other language. These fail on any gap.
//   2. ENGLISH PARITY — the sentences that moved from JS string-building into
//      ICU messages render exactly what the old code built.
//   3. OTHER LOCALES — a render in `fa` (RTL, extended Arabic-Indic digits by
//      CLDR default) keeps the structure and switches the digits.

const t = createTranslator({ locale: 'en', messages: { Uses: usesMessages }, namespace: 'Uses' });
const tools = createTranslator({
  locale: 'en',
  messages: { UsesTools: usesToolsMessages },
  namespace: 'UsesTools',
});

const slug = (label) =>
  String(label)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe('Uses + UsesTools catalogues ↔ toolCopy.js', () => {
  it('carries every tool description, rendering byte-identical', () => {
    for (const [key, sentence] of Object.entries(TOOL_COPY)) {
      expect(tools(`tools.${key}`), key).toBe(sentence);
    }
    expect(Object.keys(usesToolsMessages.tools).sort()).toEqual(Object.keys(TOOL_COPY).sort());
  });

  it('carries every category label, strapline and generic line', () => {
    for (const [cat, copy] of Object.entries(CATEGORY_COPY)) {
      for (const field of ['label', 'lay']) {
        expect(t(`toolCopy.categories.${cat}.${field}`), `${cat}.${field}`).toBe(copy[field]);
      }
      // The generic line rides the deferred UsesTools file, not the shipped
      // Uses one: only a crawled tile can need it (ToolTile.jsx).
      expect(tools(`generic.${cat}`), `${cat}.generic`).toBe(copy.generic);
    }
    expect(Object.keys(usesToolsMessages.generic).sort()).toEqual(Object.keys(CATEGORY_COPY).sort());
  });

  it('has a heading for every bill-of-materials group buildFacts can emit', () => {
    const labels = [...BOM_RULES.map((r) => r.label), ...Object.values(BOM_FALLBACK)];
    for (const label of labels) {
      expect(t(`bom.groups.${slug(label)}`), label).toBe(label);
    }
  });
});

describe('English parity of the rewritten sentences', () => {
  it('words repository counts exactly as stack.js repoCountCopy does', () => {
    const repos = (n) => Array.from({ length: n }, (_, i) => ({ name: `r${i}` }));
    for (const [pub, priv] of [[1, 0], [7, 0], [0, 1], [0, 4], [1, 1], [7, 2]]) {
      const item = { repos: repos(pub), privateRepoCount: priv };
      const expected = repoCountCopy(item);
      const actual =
        pub === 0
          ? t('stack.repoCount.private', { priv })
          : priv > 0
            ? t('stack.repoCount.mixed', { pub, priv })
            : t('stack.repoCount.public', { pub });
      expect(actual, `${pub}/${priv}`).toBe(expected);
    }
  });

  it('draws the pipeline with the default labels when none are passed', () => {
    const facts = {
      pipeline: { workflows: ['CI', 'Security'], crons: [{ path: '/api/daily-warmup', schedule: '0 5 * * *' }] },
      instruments: { apiRoutes: 22 },
      node: { vercelMajor: 24 },
    };
    expect(buildGraph(facts)).toEqual(buildGraph(facts, null, DEFAULT_LABELS));
    const kinds = buildGraph(facts).nodes.map((n) => n.kind);
    expect(kinds).toContain('SOURCE');
    expect(kinds).toContain('SCHEDULE');
  });
});

describe('LiveAge — the catalogue grammar', () => {
  const T0 = Date.parse('2026-09-05T22:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });
  const iso = (secondsAgo) => new Date(T0 - secondsAgo * 1000).toISOString();

  it('matches formatAge in every band, in English', () => {
    for (const s of [5, 205, 3600 + 4 * 60, 86400 * 2 + 3 * 3600]) {
      renderWithIntl(createElement(LiveAge, { fetchedAt: iso(s) }));
      expect(document.querySelector('.uses-age').textContent).toBe(
        `verified ${formatAge(iso(s), T0)}`,
      );
      cleanup();
    }
  });

  it('prints the locale’s digits — padded — and still colours every digit run', () => {
    renderWithIntl(createElement(LiveAge, { fetchedAt: iso(185) }), { locale: 'fa' });
    const fa = new Intl.NumberFormat('fa', { useGrouping: false, minimumIntegerDigits: 2 });
    const text = document.querySelector('.uses-age').textContent;
    expect(text).toContain(new Intl.NumberFormat('fa').format(3));
    expect(text).toContain(fa.format(5)); // "05"
    expect(text).not.toMatch(/[0-9]/);
    const ember = [...document.querySelectorAll('.uses-age span')].filter((s) =>
      s.className.includes('ff6d05'),
    );
    expect(ember.map((s) => s.textContent)).toEqual([
      new Intl.NumberFormat('fa').format(3),
      fa.format(5),
    ]);
  });
});

describe('ToolGrid — another locale', () => {
  beforeEach(() => {
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

  it('ranks in the locale’s digits and describes each tool in the locale’s copy', () => {
    const groups = [
      {
        category: 'languages',
        items: [
          { slug: 'javascript', displayName: 'JavaScript', source: 'skillicons', repos: [] },
          { slug: 'typescript', displayName: 'TypeScript', source: 'skillicons', repos: [] },
        ],
      },
    ];
    renderWithIntl(createElement(ToolGrid, { groups, revealed: true, reduceMotion: true }), {
      locale: 'fa',
    });
    const ranks = [...document.querySelectorAll('.uses-tool__rank')].map((r) => r.textContent);
    const two = new Intl.NumberFormat('fa', { useGrouping: false, minimumIntegerDigits: 2 });
    expect(ranks).toEqual([two.format(1), two.format(2)]);
    // The fa catalogue's description, not the English record it translates.
    expect(document.body.textContent).toContain(messagesFor('fa').UsesTools.tools.javascript);
    expect(document.body.textContent).not.toContain(TOOL_COPY.javascript);
  });
});
