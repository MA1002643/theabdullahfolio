import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AUTHORED_TYPES, deriveChapters } from '@/lib/caseStudy/chapters';
import { groupStack } from '@/lib/caseStudy/stack';

// The chapter list's invariants (issue #31). The index, its phone sheet, the
// ⌘K jumps and the rendered sections all read deriveChapters, so whatever
// chapters a project authors, in whatever order:
//   - the authored order is kept, with nothing appended;
//   - every type appears once, so every anchor (and every DOM id) is unique;
//   - every anchor is the `#chapter-<type>` fragment the page renders.
// And however a stack chapter's items are grouped, grouping loses nothing.

// The smallest valid chapter of each type: `stack` is the one type whose
// shape the build-time validator constrains (non-empty items, each in a real
// group, each labelled).
const minimalChapter = (type) =>
  type === 'stack' ? { type, items: [{ id: 'x', group: 'languages', label: 'X' }] } : { type };

const authored = fc.shuffledSubarray([...AUTHORED_TYPES], { minLength: 1 });

describe('deriveChapters', () => {
  it('keeps the authored order exactly', () => {
    fc.assert(
      fc.property(authored, (list) => {
        const project = { id: 1, caseStudy: { chapters: list.map(minimalChapter) } };
        const { form, chapters } = deriveChapters(project);
        expect(form).toBe('full');
        expect(chapters.map((c) => c.type)).toEqual(list);
      }),
    );
  });

  it('never repeats an anchor', () => {
    fc.assert(
      fc.property(authored, fc.boolean(), (list, hasLanguages) => {
        const project = { id: 1, caseStudy: { chapters: list.map(minimalChapter) } };
        const anchors = deriveChapters(project, { hasLanguages }).chapters.map((c) => c.anchor);
        expect(new Set(anchors).size).toBe(anchors.length);
        for (const a of anchors) expect(a).toMatch(/^chapter-[a-z]+$/);
      }),
    );
  });

  it('gives the short form overview first, and a stack only with languages', () => {
    fc.assert(
      fc.property(fc.boolean(), (hasLanguages) => {
        const types = deriveChapters({ id: 1 }, { hasLanguages }).chapters.map((c) => c.type);
        expect(types[0]).toBe('overview');
        expect(types.includes('stack')).toBe(hasLanguages);
        expect(types.length).toBe(hasLanguages ? 2 : 1);
      }),
    );
  });
});

describe('groupStack', () => {
  const groups = ['languages', 'frameworks', 'libraries', 'tooling'];
  const item = fc.record({
    id: fc.uuid(),
    group: fc.constantFrom(...groups),
  });

  it('keeps every item exactly once, in its group, in authored order', () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), (items) => {
        const grouped = groupStack(items);
        // Nothing lost, nothing invented.
        const flat = grouped.flatMap((g) => g.items);
        expect(flat.length).toBe(items.length);
        // Groups appear in display order, only when non-empty.
        const order = grouped.map((g) => g.group);
        expect(order).toEqual(groups.filter((g) => items.some((i) => i.group === g)));
        // Within a group, the authored order is kept.
        for (const g of grouped) {
          expect(g.items).toEqual(items.filter((i) => i.group === g.group));
        }
      }),
    );
  });
});
