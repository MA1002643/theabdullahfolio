import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../support/intl';
import enDetail from '../../messages/en/ProjectDetail.json';

// The case study's interactive parts (issue #31), driven by role and label:
// the chapter index (rail, phone pill and its sheet: focus in, Tab kept in,
// Escape out, focus back), the hero's outbound links, and the page's ⌘K
// commands. The chapters themselves are server components with no state;
// their HTML is covered by the route's browser layers (/projects/theabdullahfolio and the
// short-form /projects/afaaqx are both in DYNAMIC_SAMPLES).

vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('@/components/pageTransition/PageTransitionProvider', () => ({
  usePageTransition: () => ({ transitioning: false }),
}));

const { default: ChapterIndex } = await import('@/components/case-study/ChapterIndex');
const { default: Hero } = await import('@/components/case-study/chapters/Hero');
const { default: ProjectPalette, buildProjectActions } = await import('@/components/case-study/ProjectPalette');
const { getPaletteActions, resetPaletteRegistry } = await import('@/components/commandPalette/registry');
const { buildSiteActions } = await import('@/components/commandPalette/siteActions');
const { projectGithubUrl } = await import('@/components/footer/footer-data');

const CHAPTERS = [
  { type: 'overview', anchor: 'chapter-overview', title: 'Overview' },
  { type: 'statement', anchor: 'chapter-statement', title: 'The problem' },
  { type: 'stack', anchor: 'chapter-stack', title: 'Built with' },
];
const LABELS = {
  nav: enDetail.index.nav,
  close: enDetail.index.close,
  positions: CHAPTERS.map((_, i) => `Chapter ${i + 1} of ${CHAPTERS.length}`),
};

// The sections a jump lands on, each with the focusable heading the real
// Chapter renders.
function mountSections() {
  for (const c of CHAPTERS) {
    const section = document.createElement('section');
    section.id = c.anchor;
    const h2 = document.createElement('h2');
    h2.tabIndex = -1;
    h2.textContent = c.title;
    section.append(h2);
    document.body.append(section);
  }
}

// The component setup stubs scrollIntoView on HTMLElement.prototype (jsdom has
// none); spy on that stub, so an override on Element.prototype is not shadowed.
let scrollSpy;
beforeEach(() => {
  scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
  vi.stubGlobal('matchMedia', (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  history.replaceState(null, '', '/projects/theabdullahfolio');
});
afterEach(() => {
  scrollSpy.mockRestore();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  resetPaletteRegistry();
});

describe('chapter index: wide rail', () => {
  it('lists every chapter as a real link, the first marked current', () => {
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    const nav = screen.getByRole('navigation', { name: 'Chapters' });
    const list = within(nav).getAllByRole('list')[0];
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(CHAPTERS.map((c) => `#${c.anchor}`));
    expect(links[0]).toHaveAttribute('aria-current', 'location');
    expect(links[1]).not.toHaveAttribute('aria-current');
    // An <ol> holds only <li>: the sliding indicator is the list's sibling.
    expect([...list.children].every((el) => el.tagName === 'LI')).toBe(true);
  });

  it('jumps to the chapter: scrolls, writes the fragment, focuses the heading', () => {
    mountSections();
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    const list = within(screen.getByRole('navigation', { name: 'Chapters' })).getAllByRole('list')[0];
    fireEvent.click(within(list).getByRole('link', { name: 'The problem' }));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(window.location.hash).toBe('#chapter-statement');
    expect(document.activeElement).toHaveTextContent('The problem');
  });

  it('scrolls instantly under reduced motion, read at the moment of the click', () => {
    mountSections();
    vi.stubGlobal('matchMedia', (query) => ({ matches: query.includes('reduce'), media: query }));
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    const list = within(screen.getByRole('navigation', { name: 'Chapters' })).getAllByRole('list')[0];
    fireEvent.click(within(list).getByRole('link', { name: 'Overview' }));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('leaves a modified click to the browser', () => {
    mountSections();
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    const list = within(screen.getByRole('navigation', { name: 'Chapters' })).getAllByRole('list')[0];
    const link = within(list).getByRole('link', { name: 'Overview' });
    const notPrevented = fireEvent.click(link, { metaKey: true });
    expect(notPrevented).toBe(true);
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});

describe('chapter index: phone sheet', () => {
  const pill = () => screen.getByRole('button', { name: /Chapter 1 of 3/ });

  it('opens a modal sheet with focus on its first chapter', () => {
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    expect(pill()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(pill());
    const dialog = screen.getByRole('dialog', { name: 'Chapters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(pill()).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(within(dialog).getByRole('link', { name: 'Overview' }));
  });

  it('closes on Escape, claims the key, and returns focus to the pill', async () => {
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    fireEvent.click(pill());
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(event);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(pill());
  });

  it('keeps Tab inside the sheet, both ways', () => {
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    fireEvent.click(pill());
    const dialog = screen.getByRole('dialog');
    const first = within(dialog).getByRole('link', { name: 'Overview' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it('closes after a jump', async () => {
    mountSections();
    renderWithIntl(<ChapterIndex chapters={CHAPTERS} labels={LABELS} />);
    fireEvent.click(pill());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Built with' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Scrolled by the jump itself, not by the browser following the anchor.
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#chapter-stack');
  });
});

describe('hero', () => {
  const sr = (text) => <span className="sr-only">{text}</span>;
  const labels = {
    linksLabel: 'theabdullahfolio links',
    liveDemo: <>Live demo{sr(' (opens in a new tab)')}</>,
    source: <>Source on GitHub{sr(' (opens in a new tab)')}</>,
    private: 'Private repository',
  };

  it('is the page’s only <h1>, with the visible link words first in each name', () => {
    renderWithIntl(
      <Hero
        name="theabdullahfolio"
        eyebrow="Web · 2025"
        thesis="A personal site built like a product."
        links={{ demo: 'https://ma.codes', source: 'https://github.com/o/r', private: false }}
        labels={labels}
        media={null}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'theabdullahfolio links' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Live demo\s?\(opens in a new tab\)$/ })).toHaveAttribute(
      'href',
      'https://ma.codes',
    );
    expect(screen.getByRole('link', { name: /^Source on GitHub/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never links a private repository', () => {
    renderWithIntl(
      <Hero
        name="AfaaqX"
        eyebrow="System · 2025"
        thesis="x"
        links={{ demo: null, source: null, private: true }}
        labels={labels}
        media={null}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    // No links, so no links landmark either.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByText('Private repository')).toBeInTheDocument();
  });
});

describe('⌘K commands', () => {
  const copy = { section: 'This project', demo: 'Open the live demo', source: 'View this project’s source', jump: (t) => `Jump to ${t}` };

  it('jumps to every chapter, in page order', () => {
    const jump = vi.fn();
    const actions = buildProjectActions({ chapters: CHAPTERS, links: {}, copy, jump });
    expect(actions.map((a) => a.id)).toEqual(['project-chapter-overview', 'project-chapter-statement', 'project-chapter-stack']);
    actions[1].perform();
    expect(jump).toHaveBeenCalledWith('chapter-statement');
  });

  it('opens the demo and a public source, but never duplicates the sitewide View source', () => {
    const openExternal = vi.fn();
    const own = buildProjectActions({
      chapters: [],
      links: { demo: 'https://culina.example/app', source: 'https://github.com/o/culina' },
      copy,
      openExternal,
    });
    expect(own.map((a) => a.id)).toEqual(['project-open-demo', 'project-open-source']);
    expect(own[0].hint).toBe('culina.example');
    own[1].perform();
    expect(openExternal).toHaveBeenCalledWith('https://github.com/o/culina');

    const flagship = buildProjectActions({ chapters: [], links: { source: projectGithubUrl }, copy });
    expect(flagship.map((a) => a.id)).toEqual([]);
  });

  it('registers while mounted, with ids no sitewide command uses', async () => {
    renderWithIntl(
      <ProjectPalette
        projectId={1}
        chapters={CHAPTERS.map((c) => ({ ...c, jumpLabel: `Jump to ${c.title}` }))}
        links={{ demo: 'https://ma.codes', source: null }}
        section="This project"
        demoLabel="Open the live demo"
        sourceLabel="View this project’s source"
      />,
    );
    await waitFor(() => expect(getPaletteActions().length).toBeGreaterThan(0));
    const page = getPaletteActions();
    expect(page.map((a) => a.label)).toContain('Jump to The problem');

    const site = buildSiteActions({
      t: (key) => key,
      pathname: '/projects/theabdullahfolio',
      projects: [{ id: 1, name: 'theabdullahfolio', hint: 'Web', keywords: '' }],
      go: () => {},
      copyText: () => {},
      openExternal: () => {},
      scrollTop: () => {},
      urls: { page: () => '', cv: '', source: projectGithubUrl, email: '' },
    });
    const ids = [...page, ...site].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
