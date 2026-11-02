import { describe, expect, it } from 'vitest';

import { ROUTES } from '@/lib/seo/site';
import { projectsData } from '@/app/data';
import { readNotes } from '@/lib/notes/readNotes';

import { DYNAMIC_SAMPLES, STATIC_ROUTES } from '../support/routes.js';

// The browser suites' hand-written route list (tests/support/routes.js) against
// the sitemap registry (issue #92, L1). Neither is derived from the other on
// purpose, so each can catch the other being wrong. This is the check that
// makes the pair drift-proof: a page added to the registry and not to the
// browser suites (so never axe-scanned, never navigated) fails here, and so does
// a route the suites still visit after the page was deleted.

describe('route registry ⇄ browser-suite route list', () => {
  it('lists exactly the registry routes, in any order', () => {
    expect([...STATIC_ROUTES].sort()).toEqual(ROUTES.map((r) => r.path).sort());
  });

  it('samples a dynamic route that genuinely exists', () => {
    const [project, ...notes] = DYNAMIC_SAMPLES;
    const projectId = Number(project.split('/').pop());
    expect(projectsData.map((p) => p.id)).toContain(projectId);
    const slugs = readNotes().map((n) => n.slug);
    for (const note of notes) {
      expect(note).toMatch(/^\/notes\//);
      expect(slugs).toContain(note.split('/').pop());
    }
  });
});

describe('the localized browser routes (issue #82 follow-up)', async () => {
  const { LOCALE_SAMPLES, LOCALIZED_ROUTES, ALL_ROUTES } = await import('../support/routes.js');
  const { LOCALE_CODES, localeInfo } = await import('@/i18n/locales');

  it('samples real, public locales, and one of them is right to left', () => {
    for (const { code, dir } of LOCALE_SAMPLES) {
      expect(LOCALE_CODES).toContain(code);
      expect(localeInfo(code).dir).toBe(dir);
    }
    expect(LOCALE_SAMPLES.some((l) => l.dir === 'rtl')).toBe(true);
  });

  it('covers every route in every sampled locale, prefixed', () => {
    expect(LOCALIZED_ROUTES).toHaveLength(ALL_ROUTES.length * LOCALE_SAMPLES.length);
    for (const { path, code } of LOCALIZED_ROUTES) expect(path === `/${code}` || path.startsWith(`/${code}/`)).toBe(true);
  });
});
