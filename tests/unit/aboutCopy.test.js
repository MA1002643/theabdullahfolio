import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import About from '../../messages/en/About.json';
import Experience from '../../messages/en/Experience.json';
import {
  aboutDigits,
  localizeStreakRange,
  localizeWireDate,
  localizeWirePlaceholder,
} from '@/components/about/aboutI18n';
import { buildChangeMessage } from '@/hooks/useExperienceSummary';
import { countUpFormatter } from '@/hooks/useViewportCountUp';
import { diffLanguages } from '@/utils/languageDiff';
import { buildBannerMessage } from '@/utils/skillsDiff';
import { formatDuration } from '@/utils/experience/dateMath';

// The /about copy that moved into About.json / Experience.json (issue #82).
//
// Every expected English string below is what the template literal it replaced
// produced, so a catalogue edit that changes a space, a dash or a plural fails
// here before a visitor sees it. The non-English cases assert STRUCTURE
// (digits, order, untranslated wire text) rather than translations, which the
// pipeline has not produced yet.

const tAbout = createTranslator({ locale: 'en', messages: { About }, namespace: 'About' });
const tExp = createTranslator({ locale: 'en', messages: { Experience }, namespace: 'Experience' });

const lang = (language, percentage) => ({ language, percentage });

describe('diffLanguages — English is unchanged', () => {
  it.each([
    ['one added', [lang('Go', 10)], [lang('Go', 10), lang('Rust', 5)], 'Rust has been added to the top languages.'],
    ['many added', [lang('Go', 10)], [lang('Go', 10), lang('Rust', 5), lang('Zig', 1)], '2 new languages entered the top list.'],
    ['one removed', [lang('Go', 10), lang('Rust', 5)], [lang('Go', 10)], 'Rust dropped out of the top languages.'],
    ['many removed', [lang('Go', 10), lang('Rust', 5), lang('Zig', 1)], [lang('Go', 10)], '2 languages dropped out of the top list.'],
    ['percentage up', [lang('Go', 10)], [lang('Go', 12.34)], 'Go increased by 2.3%.'],
    ['percentage down', [lang('Go', 10)], [lang('Go', 7.5)], 'Go decreased by 2.5%.'],
    ['rank move', [lang('Go', 10), lang('Rust', 10)], [lang('Rust', 10), lang('Go', 10)], 'Rust moved up to #1.'],
    ['rank down', [lang('Go', 10), lang('Rust', 10), lang('Zig', 10)], [lang('Rust', 10), lang('Zig', 10), lang('Go', 10)], 'Go moved down to #3.'],
  ])('%s', (_, prev, next, expected) => {
    expect(diffLanguages(prev, next, tAbout).summaryMessage).toBe(expected);
  });
});

describe('buildBannerMessage (skills) — English is unchanged', () => {
  it('names the category each icon entered, left or moved between', () => {
    expect(
      buildBannerMessage(
        {
          added: [{ name: 'Rust', category: 'languages' }, { name: 'Zod', category: 'libraries' }],
          removed: [{ name: 'Replit', category: 'software' }],
          moved: [{ name: 'Vercel', from: 'tools', to: 'software' }],
        },
        tAbout,
      ),
    ).toBe('Added: Rust (Languages), Zod (Libraries) · Removed: Replit (Software) · Moved: Vercel (Tools → Software)');
  });

  it('keeps a bare name when the category is unknown, and title-cases an unlisted slug', () => {
    expect(buildBannerMessage({ added: [{ name: 'Rust', category: null }] }, tAbout)).toBe('Added: Rust');
    expect(buildBannerMessage({ added: [{ name: 'X', category: 'gadgets' }] }, tAbout)).toBe('Added: X (Gadgets)');
  });

  it('is null when nothing changed', () => {
    expect(buildBannerMessage({}, tAbout)).toBeNull();
  });
});

describe('project count banner — English is unchanged', () => {
  it.each([
    [1, 12, '1 new completed project added — now 12'],
    [3, 14, '3 new completed projects added — now 14'],
  ])('+%i', (delta, count, expected) => {
    expect(tAbout('changes.projects.added', { delta, count })).toBe(expected);
  });
  it('a non-growth change', () => {
    expect(tAbout('changes.projects.updated', { count: 9 })).toBe('Completed projects updated — now 9');
  });
});

describe('experience change messages — English is unchanged', () => {
  const base = {
    total: { months: 50 },
    employment: { months: 10, roles: [{ company: 'Lidl GB', role: 'CA', start: '2021-09' }] },
    personalProjects: { firstRepoDate: '2020-01-01', repos: [{ name: 'a' }] },
  };
  const with_ = (over) => ({ ...base, ...over });

  it('a new role', () => {
    const next = with_({ employment: { ...base.employment, roles: [...base.employment.roles, { company: 'Culina', role: 'Dev', start: '2025-01' }] } });
    expect(buildChangeMessage(base, next, tExp)).toBe('New role detected from resume: Culina');
  });
  it('a bucket crossing, spoken exactly as formatDuration writes it', () => {
    const next = with_({ total: { months: 60 } });
    expect(buildChangeMessage(base, next, tExp)).toBe(`Years of experience updated: ${formatDuration(50)} → ${formatDuration(60)}`);
    expect(buildChangeMessage(base, next, tExp)).toBe('Years of experience updated: 4+ years → 5+ years');
  });
  it.each([
    [1, 'Employment experience updated: +1 month'],
    [2, 'Employment experience updated: +2 months'],
  ])('employment +%i', (delta, expected) => {
    const next = with_({ employment: { ...base.employment, months: 10 + delta } });
    expect(buildChangeMessage(base, next, tExp)).toBe(expected);
  });
  it('one and many new repositories, and a timeline shift', () => {
    const one = with_({ personalProjects: { ...base.personalProjects, repos: [{ name: 'a' }, { name: 'b' }] } });
    expect(buildChangeMessage(base, one, tExp)).toBe('New repository detected: b');
    const many = with_({ personalProjects: { ...base.personalProjects, repos: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } });
    expect(buildChangeMessage(base, many, tExp)).toBe('2 new repositories detected on GitHub');
    const moved = with_({ personalProjects: { ...base.personalProjects, firstRepoDate: '2019-01-01' } });
    expect(buildChangeMessage(base, moved, tExp)).toBe('Personal projects timeline updated');
  });
  it('the duration message matches formatDuration for 0, 1 and many', () => {
    for (const months of [0, 1, 5, 12, 23, 24, 60]) {
      const values = months >= 12 ? { count: Math.floor(months / 12), unit: 'years' } : { count: months, unit: 'months' };
      expect(tExp('duration', values)).toBe(formatDuration(months));
    }
  });
});

describe('aboutDigits', () => {
  it('reproduces the legacy English paint exactly', () => {
    const en = aboutDigits('en');
    expect(en.int(1234)).toBe('1234');
    expect(en.fixed(12.345, 2)).toBe((12.345).toFixed(2));
    expect(en.grouped(12345)).toBe('12,345');
    expect(en.pad2(4)).toBe('04');
  });

  it('paints Persian in its own digits, ungrouped where English was', () => {
    const fa = aboutDigits('fa');
    expect(fa.int(1234)).toBe(new Intl.NumberFormat('fa', { useGrouping: false }).format(1234));
    expect(fa.int(1234)).not.toMatch(/[0-9]/);
    expect(fa.pad2(4)).toBe(new Intl.NumberFormat('fa', { minimumIntegerDigits: 2 }).format(4));
  });
});

describe('count-up formatter option', () => {
  it('defaults to the legacy `${n}` paint', () => {
    expect(countUpFormatter(undefined)(1234)).toBe('1234');
  });
  it('accepts a function or Intl options', () => {
    expect(countUpFormatter((n) => `#${n}`)(3)).toBe('#3');
    expect(countUpFormatter({ locale: 'fa', options: { useGrouping: false } })(12)).toBe(
      new Intl.NumberFormat('fa', { useGrouping: false }).format(12),
    );
  });
});

describe('API wire text', () => {
  it('leaves English exactly as the API sent it', () => {
    expect(localizeWireDate('Oct 12, 2024', 'en')).toBe('Oct 12, 2024');
    expect(localizeStreakRange('Oct 1, 2025 - Present', 'en', tAbout)).toBe('Oct 1, 2025 - Present');
    expect(localizeWirePlaceholder('No description', 'en', tAbout)).toBe('No description');
  });

  it('re-renders dates and placeholders for another locale', () => {
    const expected = new Intl.DateTimeFormat('de', {
      timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(Date.UTC(2024, 9, 12)));
    expect(localizeWireDate('Oct 12, 2024', 'de')).toBe(expected);
    // `tAbout` is English, so the frame and "Present" read in English here —
    // what this pins is that the DATE was re-rendered and the frame applied.
    expect(localizeStreakRange('Oct 12, 2024 - Present', 'de', tAbout)).toBe(`${expected} - Present`);
    expect(localizeStreakRange('No current streak', 'de', tAbout)).toBe('No current streak');
    expect(localizeWirePlaceholder('Unknown', 'de', tAbout)).toBe('Unknown');
    // Unparseable wire text degrades to itself rather than throwing.
    expect(localizeWireDate('N/A', 'de')).toBe('N/A');
  });
});
