import { describe, expect, it } from 'vitest';
import { projectsData } from '@/app/data';
import { LOCALE_CODES, DEFAULT_LOCALE } from '@/i18n/locales';
import {
  assertProjectSlugs,
  projectBySlug,
  projectPath,
  projectRedirects,
  projectSlug,
} from '@/lib/projects/paths';

// Project URLs (issue #31 follow-up): /projects/<slug>, with the old numeric
// URLs redirected. Every project link on the site is built by these helpers,
// so their contract is pinned here; the redirects themselves are exercised on
// a production server in tests/e2e/project-slugs.spec.js.

describe('projectSlug / projectPath', () => {
  it('is the lowercased name, unless data.js pins a slug', () => {
    expect(projectSlug({ name: 'AfaaqX' })).toBe('afaaqx');
    expect(projectSlug({ name: 'AfaaqX', slug: 'afaaq-x' })).toBe('afaaq-x');
    expect(projectPath({ name: 'theabdullahfolio' })).toBe('/projects/theabdullahfolio');
  });

  it('gives every real project a URL-safe, unique slug', () => {
    expect(() => assertProjectSlugs(projectsData)).not.toThrow();
    const slugs = projectsData.map(projectSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('finds a project only by its exact slug', () => {
    const first = projectsData[0];
    expect(projectBySlug(projectsData, projectSlug(first))).toBe(first);
    expect(projectBySlug(projectsData, projectSlug(first).toUpperCase())).toBeUndefined();
    expect(projectBySlug(projectsData, String(first.id))).toBeUndefined();
  });
});

describe('assertProjectSlugs', () => {
  it('fails the build on a slug that collides, needs escaping, or is all digits', () => {
    expect(() => assertProjectSlugs([{ id: 1, name: 'Same' }, { id: 2, name: 'same' }])).toThrow(/share the slug "same"/);
    expect(() => assertProjectSlugs([{ id: 1, name: 'Two Words' }])).toThrow(/not lowercase letters/);
    expect(() => assertProjectSlugs([{ id: 1, name: 'x', slug: '2024' }])).toThrow(/all digits/);
  });
});

describe('projectRedirects', () => {
  const prefixes = LOCALE_CODES.filter((c) => c !== DEFAULT_LOCALE);
  const rules = projectRedirects(projectsData, prefixes);

  it('sends every old numeric URL, in every locale, permanently to its slug', () => {
    expect(rules).toHaveLength(projectsData.length * (1 + prefixes.length));
    expect(rules.every((r) => r.permanent === true)).toBe(true);
    expect(rules).toContainEqual({ source: '/projects/1', destination: '/projects/theabdullahfolio', permanent: true });
    expect(rules).toContainEqual({ source: '/ar/projects/3', destination: '/ar/projects/culina', permanent: true });
  });

  it('never redirects a URL onto itself or onto another numeric URL', () => {
    for (const r of rules) {
      expect(r.destination).not.toBe(r.source);
      expect(r.destination).not.toMatch(/\/projects\/\d+$/);
    }
  });
});
