import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { buildSiteActions } from '@/components/commandPalette/siteActions';
import { SITE_ROUTES } from '@/components/commandPalette/routes';
import { ROUTES } from '@/lib/seo/site';
import messages from '../../messages/en/PaletteSite.json';

// The sitewide palette's own commands (issue #41 §3.4), built with spies for
// every side effect.

const t = createTranslator({ locale: 'en', messages: { PaletteSite: messages }, namespace: 'PaletteSite' });
const PROJECTS = [
  { id: 1, name: 'theabdullahfolio', hint: 'Web', keywords: 'portfolio' },
  { id: 2, name: 'AfaaqX', hint: 'System', keywords: 'stripe' },
];

function build(overrides = {}) {
  const deps = {
    t,
    pathname: '/about',
    projects: PROJECTS,
    go: vi.fn(),
    copyText: vi.fn(),
    openExternal: vi.fn(),
    scrollTop: vi.fn(),
    urls: {
      page: () => 'https://ma.codes/about',
      cv: '/cv.pdf',
      source: 'https://github.com/o/r',
      email: 'me@example.com',
    },
    ...overrides,
  };
  return { actions: buildSiteActions(deps), deps };
}

describe('buildSiteActions', () => {
  it('reaches every indexable route except the current page', () => {
    const hrefs = build().actions.filter((a) => a.sectionKey === 'navigate').map((a) => a.hint);
    const indexable = ROUTES.filter((r) => r.indexable).map((r) => r.path);
    expect(new Set(SITE_ROUTES.map((r) => r.href))).toEqual(new Set(indexable));
    expect(hrefs).toEqual(indexable.filter((p) => p !== '/about').sort((a, b) =>
      SITE_ROUTES.findIndex((r) => r.href === a) - SITE_ROUTES.findIndex((r) => r.href === b),
    ));
  });

  it('lists every project, except the one being viewed, and navigates to it', () => {
    const { actions, deps } = build({ pathname: '/projects/2' });
    const projects = actions.filter((a) => a.section === 'Projects');
    expect(projects.map((a) => a.label)).toEqual(['theabdullahfolio']);
    projects[0].perform();
    expect(deps.go).toHaveBeenCalledWith('/projects/1', 'theabdullahfolio');
  });

  it('wires each action to its side effect', () => {
    const { actions, deps } = build();
    const run = (id) => actions.find((a) => a.id === id).perform();
    run('copy-link');
    expect(deps.copyText).toHaveBeenLastCalledWith('https://ma.codes/about', 'Link copied');
    run('copy-email');
    expect(deps.copyText).toHaveBeenLastCalledWith('me@example.com', 'Email address copied');
    run('open-cv');
    expect(deps.openExternal).toHaveBeenLastCalledWith('/cv.pdf');
    run('view-source');
    expect(deps.openExternal).toHaveBeenLastCalledWith('https://github.com/o/r');
    run('back-to-top');
    expect(deps.scrollTop).toHaveBeenCalledTimes(1);
  });

  it('offers only the route jumps until the deferred copy arrives', () => {
    const { actions } = build({ t: null });
    expect(actions.length).toBe(SITE_ROUTES.length - 1);
    expect(actions.every((a) => a.sectionKey === 'navigate')).toBe(true);
  });

  it('keeps English search terms beside the translated ones', () => {
    const copy = build().actions.find((a) => a.id === 'open-cv');
    expect(copy.keywords).toMatch(/resume/);
  });

  it('omits "copy email" when no address is configured', () => {
    const { actions } = build({ urls: { page: () => '', cv: '', source: '', email: '' } });
    expect(actions.some((a) => a.id === 'copy-email')).toBe(false);
  });
});
