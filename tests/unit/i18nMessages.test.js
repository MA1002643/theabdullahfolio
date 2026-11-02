import { describe, expect, it } from 'vitest';
import { deepMerge, pickMessages } from '@/i18n/messages';

// pickMessages builds what each client provider receives (issue #82). Its
// input is the loader's CACHED catalogue, shared by every page of a build, so
// the one thing it must never do is write into it.

const catalogue = () => ({
  Common: { ok: 'OK' },
  Data: {
    journey: { a: { title: 'A' } },
    projects: { 1: { description: 'One' } },
    categories: { Web: 'Web' },
  },
});

describe('pickMessages', () => {
  it('picks whole namespaces', () => {
    expect(pickMessages(catalogue(), ['Common'])).toEqual({ Common: { ok: 'OK' } });
  });

  it('picks only the named subtree of a dotted path', () => {
    expect(pickMessages(catalogue(), ['Data.journey'])).toEqual({
      Data: { journey: { a: { title: 'A' } } },
    });
  });

  it('combines sibling subtrees of one namespace', () => {
    expect(pickMessages(catalogue(), ['Data.projects', 'Data.categories'])).toEqual({
      Data: { projects: { 1: { description: 'One' } }, categories: { Web: 'Web' } },
    });
  });

  it('skips a path the catalogue does not have', () => {
    expect(pickMessages(catalogue(), ['Nope', 'Data.nope', 'Common.ok.deeper'])).toEqual({});
  });

  it('is order-independent when a namespace and its subtree are both named', () => {
    const a = pickMessages(catalogue(), ['Data', 'Data.journey']);
    const b = pickMessages(catalogue(), ['Data.journey', 'Data']);
    expect(a).toEqual({ Data: catalogue().Data });
    expect(b).toEqual(a);
  });

  it('never writes into the source catalogue', () => {
    const source = catalogue();
    const before = structuredClone(source);
    const out = pickMessages(source, ['Data', 'Data.journey', 'Data.categories']);
    out.Data.injected = true;
    out.Data.journey.injected = true;
    expect(source.Data.injected).toBeUndefined();
    expect(source).toEqual(before);
  });
});

describe('deepMerge', () => {
  it('lays a partial translation over English, keeping English for gaps', () => {
    expect(deepMerge({ a: 'A', b: { c: 'C', d: 'D' } }, { b: { c: 'Ç' } })).toEqual({
      a: 'A',
      b: { c: 'Ç', d: 'D' },
    });
  });
});
