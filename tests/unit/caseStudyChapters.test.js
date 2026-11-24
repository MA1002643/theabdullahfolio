import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectsData } from '@/app/data';
import { assertCaseStudy, chapterAnchor, deriveChapters, siblingsOf, STACK_GROUPS } from '@/lib/caseStudy/chapters';
import { FIGURE_SOURCES, resolveFigure } from '@/lib/caseStudy/figures';
import { groupStack, LANGUAGE_ICONS, languageStackItems } from '@/lib/caseStudy/stack';
import { resolveStackVersion } from '@/lib/caseStudy/versions';
import { DIAGRAMS, diagramNodeIds, pathEnds } from '@/components/case-study/diagrams';
import { STACK_ICON_COLORS, STACK_ICONS, stackIconColor } from '@/components/case-study/stackIcons';
import enDetail from '../../messages/en/ProjectDetail.json';

// The project page's chapter list, outcome figures and stack (issue #31).
// One derivation feeds the rendered sections, the chapter index, the ⌘K
// jumps and Ask, so these cases pin the list itself; the invariants over
// arbitrary inputs are in tests/property/caseStudyChapters.property.test.js.

const flagship = projectsData.find((p) => p.caseStudy);
const types = (project, options) => deriveChapters(project, options).chapters.map((c) => c.type);

describe('deriveChapters', () => {
  it('renders the authored chapters in array order, nothing appended', () => {
    const authored = flagship.caseStudy.chapters.map((c) => c.type);
    expect(types(flagship)).toEqual(authored);
    expect(deriveChapters(flagship).form).toBe('full');
  });

  it('gives every chapter its #chapter-<type> anchor', () => {
    for (const c of deriveChapters(flagship).chapters) expect(c.anchor).toBe(`chapter-${c.type}`);
    expect(chapterAnchor('notes')).toBe('chapter-notes');
  });

  it('builds the short form from the listing fields', () => {
    const plain = { id: 99, name: 'x', category: 'Web' };
    expect(types(plain)).toEqual(['overview']);
    expect(types(plain, { hasLanguages: true })).toEqual(['overview', 'stack']);
    expect(deriveChapters(plain).form).toBe('short');
  });
});

describe('assertCaseStudy', () => {
  const withChapters = (chapters) => ({ id: 7, caseStudy: { chapters } });

  it('accepts every case study in data.js', () => {
    for (const p of projectsData) expect(() => assertCaseStudy(p)).not.toThrow();
  });

  it('names the project and the problem when the data is malformed', () => {
    expect(() => assertCaseStudy(withChapters([]))).toThrow(/projects\[7\]\.caseStudy\.chapters/);
    expect(() => assertCaseStudy(withChapters([{ type: 'bogus' }]))).toThrow(/unknown chapter type "bogus"/);
    expect(() => assertCaseStudy(withChapters([{ type: 'notes' }, { type: 'notes' }]))).toThrow(/appears twice/);
    expect(() => assertCaseStudy(withChapters([{ type: 'gallery', items: [{ id: 'a' }, {}] }]))).toThrow(
      /every entry needs an id/,
    );
    expect(() => assertCaseStudy(withChapters([{ type: 'gallery', items: [{ id: 'a' }, { id: 'a' }] }]))).toThrow(
      /duplicate id/,
    );
  });

  it('rejects a stack chapter whose items are missing, ungrouped or unlabelled', () => {
    expect(() => assertCaseStudy(withChapters([{ type: 'stack' }]))).toThrow(/stack\.items must be a non-empty array/);
    expect(() =>
      assertCaseStudy(withChapters([{ type: 'stack', items: [{ id: 'x', group: 'nope', label: 'X' }] }])),
    ).toThrow(/group must be one of/);
    expect(() =>
      assertCaseStudy(withChapters([{ type: 'stack', items: [{ id: 'x', group: 'languages' }] }])),
    ).toThrow(/needs a label/);
  });
});

describe('siblingsOf', () => {
  it('wraps at both ends, so the first and last projects keep two neighbours', () => {
    const first = projectsData[0];
    const last = projectsData.at(-1);
    expect(siblingsOf(projectsData, first).previous).toBe(last);
    expect(siblingsOf(projectsData, last).next).toBe(first);
  });
});

describe('outcome figures', () => {
  it('derives every flagship figure from a real source, never a typed number', () => {
    const outcomes = flagship.caseStudy.chapters.find((c) => c.type === 'outcomes');
    for (const item of outcomes.items) {
      expect(item.derive, item.id).toBeTruthy();
      expect(Number.isInteger(resolveFigure(item)), item.id).toBe(true);
      expect(resolveFigure(item)).toBeGreaterThan(0);
    }
  });

  it('counts the locales the site actually serves', () => {
    expect(resolveFigure({ derive: 'locales' })).toBe(FIGURE_SOURCES.locales());
    expect(resolveFigure({ derive: 'rtlLocales' })).toBe(4);
  });

  it('fails the build on a typo or a missing value', () => {
    expect(() => resolveFigure({ id: 'x', derive: 'nope' })).toThrow(/unknown derive key "nope"/);
    expect(() => resolveFigure({ id: 'x' })).toThrow(/numeric value or a derive key/);
    expect(resolveFigure({ id: 'x', value: 12 })).toBe(12);
  });
});

describe('the Built with chapter', () => {
  const stack = flagship.caseStudy.chapters.find((c) => c.type === 'stack');

  it('buckets items by group in display order and drops empty groups', () => {
    const items = [
      { id: 'a', group: 'tooling' },
      { id: 'b', group: 'languages' },
      { id: 'c', group: 'tooling' },
    ];
    expect(groupStack(items)).toEqual([
      { group: 'languages', items: [items[1]] },
      { group: 'tooling', items: [items[0], items[2]] },
    ]);
    expect(groupStack([])).toEqual([]);
  });

  it('turns repository languages into tiles, most used first', () => {
    const items = languageStackItems(['JavaScript', 'CSS', 'Shell', 'Objective-C++']);
    expect(items.map((i) => i.id)).toEqual(['javascript', 'css', 'shell', 'objective-c']);
    expect(items.every((i) => i.group === 'languages')).toBe(true);
    expect(items[0].icon).toBe('javascript');
    // An unmapped language still renders — as a monogram tile, not a hole.
    expect(items[3].icon).toBeNull();
    for (const name of Object.keys(LANGUAGE_ICONS)) {
      expect(STACK_ICONS[LANGUAGE_ICONS[name]], name).toBeTruthy();
    }
  });

  it('reads every version from the lockfile, never from a typed number', () => {
    for (const item of stack.items) {
      expect(item.version, `${item.id} must not type a version`).toBeUndefined();
      const version = resolveStackVersion(item);
      if (item.pkg || item.derive) {
        expect(version, item.id).toMatch(/^\d+(\.\d+(\.\d+)?)?/);
      } else {
        expect(version, item.id).toBeNull();
      }
    }
    expect(() => resolveStackVersion({ pkg: 'not-a-real-dependency' })).toThrow(/not a dependency/);
  });

  it('pairs every mark with a brand colour, and gives a monogram none', () => {
    // The tiles wear brand colours (owner request, 2026-11-23): a mark with
    // no entry here would silently render in the page gold instead of its
    // own colour, so the map must cover every slug.
    for (const slug of Object.keys(STACK_ICONS)) {
      expect(STACK_ICON_COLORS[slug], slug).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(stackIconColor('javascript')).toBe(STACK_ICON_COLORS.javascript);
    expect(stackIconColor('not-a-slug')).toBeNull();
    expect(stackIconColor(undefined)).toBeNull();
  });

  it('names only icons that exist, and English copy for every group', () => {
    for (const item of stack.items) {
      if (item.icon) expect(STACK_ICONS[item.icon], `${item.id} icon "${item.icon}"`).toBeTruthy();
      expect(STACK_GROUPS, item.id).toContain(item.group);
    }
    for (const group of STACK_GROUPS) {
      expect(enDetail.stack.groups[group], group).toBeTruthy();
    }
  });
});

describe('case-study images', () => {
  // Found while building #31: data.js named ten screenshots under
  // public/projects/theabdullahfolio/ that did not exist, and every check
  // passed while the page printed alt text where each image belonged.
  it('names only files that exist in public/', () => {
    const srcs = [];
    for (const p of projectsData) {
      const cs = p.caseStudy;
      if (!cs) continue;
      if (cs.hero) srcs.push(cs.hero.src);
      for (const c of cs.chapters) {
        for (const s of c.steps ?? []) if (s.media) srcs.push(s.media.src);
        for (const item of c.items ?? []) if (item.src) srcs.push(item.src);
      }
    }
    expect(srcs.length).toBeGreaterThan(0);
    const missing = srcs.filter((src) => !existsSync(join(process.cwd(), 'public', src)));
    expect(missing).toEqual([]);
  });
});

describe('architecture diagrams', () => {
  it('has English copy for every node of every diagram', () => {
    for (const key of Object.keys(DIAGRAMS)) {
      for (const id of diagramNodeIds(key)) {
        expect(enDetail.diagrams[key]?.[id]?.title, `${key}.${id}.title`).toBeTruthy();
        expect(enDetail.diagrams[key]?.[id]?.detail, `${key}.${id}.detail`).toBeTruthy();
      }
    }
  });

  it('only draws edges between nodes that exist', () => {
    for (const spec of Object.values(DIAGRAMS)) {
      const ids = new Set(spec.nodes.map((n) => n.id));
      for (const e of spec.edges) {
        expect(ids.has(e.from), e.from).toBe(true);
        expect(ids.has(e.to), e.to).toBe(true);
      }
    }
  });

  it('names a diagram in data.js only if it is drawn', () => {
    for (const p of projectsData) {
      const arch = p.caseStudy?.chapters.find((c) => c.type === 'architecture');
      if (arch) expect(DIAGRAMS[arch.diagram], arch.diagram).toBeTruthy();
    }
  });

  it('reads both ends of every wire, and refuses a command it cannot', () => {
    expect(pathEnds('M856 510 H876 V410 H896')).toEqual({ start: [856, 510], end: [896, 410] });
    expect(pathEnds('M540 152 V268')).toEqual({ start: [540, 152], end: [540, 268] });
    expect(() => pathEnds('M0 0 C10 10 20 20 30 30')).toThrow(/unsupported command "C"/);
    // Every edge's ports land on a box edge: half-width or half-height away
    // from the node's centre, so a re-laid diagram cannot leave a port
    // floating in space.
    for (const spec of Object.values(DIAGRAMS)) {
      const byId = new Map(spec.nodes.map((n) => [n.id, n]));
      for (const e of spec.edges) {
        const { start, end } = pathEnds(e.d);
        for (const [point, node] of [
          [start, byId.get(e.from)],
          [end, byId.get(e.to)],
        ]) {
          const dx = Math.abs(point[0] - node.x);
          const dy = Math.abs(point[1] - node.y);
          const onInlineEdge = dx === spec.box.w / 2 && dy <= spec.box.h / 2;
          const onBlockEdge = dy === spec.box.h / 2 && dx <= spec.box.w / 2;
          expect(onInlineEdge || onBlockEdge, `${e.from}→${e.to} at ${point}`).toBe(true);
        }
      }
    }
  });
});
