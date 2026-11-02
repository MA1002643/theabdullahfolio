import { describe, expect, it } from 'vitest';

import { flatten, icuProblems, icuSignature, shapeLike, sourceHash } from '../../scripts/i18n-lib.mjs';

// The catalogue logic behind `npm run i18n:translate` and `npm run i18n:audit`
// (issue #82). `icuProblems` is the gate every machine translation must pass
// before it is written, so what it accepts and rejects is the contract that
// keeps a translated catalogue from crashing a page at render time.

describe('icuProblems — what a translation may not change', () => {
  it('accepts a rewording that keeps the interface', () => {
    expect(icuProblems('Hello {name}', 'مرحبًا {name}')).toEqual([]);
  });

  it('rejects a dropped or renamed placeholder', () => {
    expect(icuProblems('Hello {name}', 'Hola')).toEqual(['missing argument(s): name']);
    expect(icuProblems('Hello {name}', 'Hola {nombre}')).toEqual([
      'missing argument(s): name',
      'unknown argument(s): nombre',
    ]);
  });

  it('rejects a renamed rich-text tag', () => {
    expect(icuProblems('See the <cv>CV</cv>', 'Voir le <lien>CV</lien>')[0]).toMatch(/tags differ/);
  });

  it('lets plural branches follow the TARGET language, but requires `other`', () => {
    const en = '{count, plural, one {# task} other {# tasks}}';
    // Arabic needs six categories, Japanese one — both are correct.
    expect(
      icuProblems(en, '{count, plural, zero {لا مهام} one {مهمة} two {مهمتان} few {# مهام} many {# مهمة} other {# مهمة}}'),
    ).toEqual([]);
    expect(icuProblems(en, '{count, plural, other {#件のタスク}}')).toEqual([]);
    // Without `other` the message is not valid ICU at all — the parser rejects
    // it, and the gate reports that rather than letting it through.
    expect(icuProblems(en, '{count, plural, one {# tarea}}')[0]).toMatch(/does not parse|no "other" branch/);
  });

  // Defect found 2026-10-29: the first full 19-locale run rejected eight
  // correct batches. A tag repeated once per plural branch occurs once in
  // Japanese (only `other`) and four times in Polish, and the gate compared
  // the raw counts.
  it('counts a tag inside a plural once, however many branches the target has', () => {
    const en = '{count, plural, one {<n>{shown}</n> mark left} other {<n>{shown}</n> marks left}}';
    expect(icuProblems(en, '{count, plural, other {残り<n>{shown}</n>件}}')).toEqual([]);
    expect(
      icuProblems(
        en,
        '{count, plural, one {<n>{shown}</n> znak} few {<n>{shown}</n> znaki} many {<n>{shown}</n> znaków} other {<n>{shown}</n> znaku}}',
      ),
    ).toEqual([]);
  });

  it('still rejects a tag dropped from ONE plural branch', () => {
    const en = '{count, plural, one {<n>#</n> mark} other {<n>#</n> marks}}';
    expect(icuProblems(en, '{count, plural, one {<n>#</n> znak} few {# znaki} other {<n>#</n> znaku}}')).toEqual([
      'plural branch count.few has different rich-text tags from "other"',
    ]);
    // …unless English itself treats its branches unevenly.
    const uneven = '{count, plural, one {a mark} other {<n>#</n> marks}}';
    expect(icuProblems(uneven, '{count, plural, one {un signe} other {<n>#</n> signes}}')).toEqual([]);
  });

  it('requires select branches to be kept exactly', () => {
    const en = '{type, select, pr {pull request} other {issue}}';
    expect(icuProblems(en, '{type, select, pr {PR} other {incidencia}}')).toEqual([]);
    expect(icuProblems(en, '{type, select, other {incidencia}}')).toEqual(['select {type} branches differ']);
  });

  it('rejects ICU that does not parse', () => {
    expect(icuProblems('Hi {name}', 'Hi {name')[0]).toMatch(/does not parse/);
  });
});

describe('catalogue shape', () => {
  const template = { a: { b: 'x', c: 'y' }, d: 'z' };

  it('flattens to dotted paths', () => {
    expect(flatten(template)).toEqual({ 'a.b': 'x', 'a.c': 'y', d: 'z' });
  });

  it('rebuilds in the English order, omitting missing keys', () => {
    expect(shapeLike(template, { d: 'Z', 'a.c': 'Y' })).toEqual({ a: { c: 'Y' }, d: 'Z' });
    expect(Object.keys(shapeLike(template, { d: 'Z', 'a.b': 'X' }))).toEqual(['a', 'd']);
  });

  it('hashes a source string stably and distinctly', () => {
    expect(sourceHash('About')).toBe(sourceHash('About'));
    expect(sourceHash('About')).not.toBe(sourceHash('About '));
    expect(sourceHash('About')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('reads an interface off a message', () => {
    expect(icuSignature('<b>{n, number}</b> of {total}')).toEqual({
      args: ['n', 'total'],
      tags: ['b'],
      selects: {},
      plurals: {},
      unevenPlurals: [],
    });
  });
});
