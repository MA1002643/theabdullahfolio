import { fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { projectsData } from '@/app/data';
import { server } from '../support/msw/server.js';
import { githubStatsApiHandler } from '../support/msw/handlers.js';
import { renderWithIntl } from '../support/intl';

// The /about page body and its Project Progress dialog, rendered against the
// real English catalogue (issue #82). The copy moved from JSX literals into
// About.json / Experience.json; these assert the English a visitor sees and the
// accessible names a screen reader hears are what they were.

vi.mock('@/hooks/useProjectProgress', () => ({
  useProjectProgress: () => ({
    failed: false,
    refetch: () => {},
    data: {
      schemaVersion: 2,
      overallCompletion: 50,
      doneItems: 5,
      totalItems: 10,
      trackedCount: 1,
      totalProjects: 2,
      lastSynced: null,
      categoryBreakdown: [{ label: 'Web', count: 2 }],
      projects: [
        { id: 1, name: 'culina', category: 'Web', tracked: true, completionPercent: 50, doneItems: 5, totalItems: 10, columns: [{ name: 'Done', count: 5 }, { name: 'Todo', count: 5 }] },
        { id: 2, name: 'auxo', category: 'Web', tracked: false, repo: null, completionPercent: 0, doneItems: 0, totalItems: 0, columns: [] },
      ],
    },
  }),
}));

const failAll = () =>
  server.use(
    githubStatsApiHandler(),
    http.get('*/api/experience-summary', () => new HttpResponse(null, { status: 503 })),
    http.get('*/api/github-skills', () => new HttpResponse(null, { status: 503 })),
  );

describe('About page body', () => {
  // The page module is large (every card, framer-motion, the fluid scale), so
  // its first import alone can outlast the default 5s on a loaded machine.
  it('renders the moved copy and the projects card name unchanged', { timeout: 60_000 }, async () => {
    failAll();
    const { default: AboutDetails } = await import('@/components/about');
    const { getByText, container } = renderWithIntl(<AboutDetails />);
    expect(getByText('Architect of Enchantment')).toBeTruthy();
    expect(container.textContent).toContain('My journey in web development is powered by an array of mystical tools');
    expect(getByText('Projects shipped')).toBeTruthy();
    expect(getByText('Years in the craft')).toBeTruthy();
    expect(getByText('completed projects')).toBeTruthy();

    const button = container.querySelector('[aria-haspopup="dialog"]');
    const label = button.getAttribute('aria-label');
    expect(label).toMatch(new RegExp(`^Projects shipped: ${projectsData.length} completed projects\\. `));
    expect(label).toMatch(/\. View progress: opens live project progress\.$/);
    // The legend is folded in as "Label N, Label N" — the words the card shows.
    expect(label).toMatch(/(Web|System|AI|Mobile) \d+(, (Web|System|AI|Mobile) \d+)*\./);
  });
});

describe('Deferred dialogs (issue #55)', () => {
  // Both dialogs left the route's first load: each is a next/dynamic chunk,
  // mounted once fetched. Pressing the card must still open the dialog,
  // populated by the page-level data hook, even when the press beats the
  // idle-time fetch.
  it('the projects card opens the Project Progress dialog through the lazy chunk', { timeout: 60_000 }, async () => {
    failAll();
    const { default: AboutDetails } = await import('@/components/about');
    const { container, findByRole, queryByRole } = renderWithIntl(<AboutDetails />);
    expect(queryByRole('dialog', { name: 'Project progress' })).toBeNull();
    const card = container.querySelector('[aria-haspopup="dialog"]');
    fireEvent.click(card);
    const dialog = await findByRole('dialog', { name: 'Project progress' }, { timeout: 10_000 });
    expect(dialog).toBeTruthy();
    expect(card.getAttribute('aria-expanded')).toBe('true');
    // Populated on first open, from the page's own fetch.
    expect(await findByRole('button', { name: /^culina, Web\. 50% complete/ })).toBeTruthy();
  });

  // While a chunk downloads, its dialog's open flag is already true but there
  // is no backdrop yet, so the other card is still clickable. Both dialogs then
  // mounted open, each with its own focus trap and body-scroll lock. The open
  // requests are mutually exclusive: the latest one wins.
  const COMPLETE_EXPERIENCE = {
    personalProjects: {
      firstRepoDate: '2020-01-01',
      months: 60,
      display: '5+ years',
      complete: true,
      repos: [{ name: 'older', createdAt: '2020-01-01T00:00:00Z' }],
    },
    employment: { months: 90, display: '7+ years', roles: [] },
    total: { months: 150, display: '12+ years' },
  };

  const renderBothCards = async () => {
    server.use(
      githubStatsApiHandler(),
      http.get('*/api/experience-summary', () => HttpResponse.json(COMPLETE_EXPERIENCE)),
      http.get('*/api/github-skills', () => new HttpResponse(null, { status: 503 })),
    );
    const { default: AboutDetails } = await import('@/components/about');
    const utils = renderWithIntl(<AboutDetails />);
    const projectsCard = utils.container.querySelector('[aria-haspopup="dialog"][aria-label^="Projects shipped"]');
    // The years card becomes a button only once its data has landed.
    const yearsCard = await utils.findByRole('button', { name: /^Years in the craft/ }, { timeout: 10_000 });
    return { ...utils, projectsCard, yearsCard };
  };

  it('a second card pressed while the first dialog is loading replaces it', { timeout: 60_000 }, async () => {
    const { projectsCard, yearsCard, findByRole, queryByRole } = await renderBothCards();
    fireEvent.click(projectsCard);
    fireEvent.click(yearsCard);
    expect(await findByRole('dialog', { name: 'Experience by category' }, { timeout: 10_000 })).toBeTruthy();
    expect(queryByRole('dialog', { name: 'Project progress' })).toBeNull();
    expect(projectsCard.getAttribute('aria-expanded')).toBe('false');
    expect(yearsCard.getAttribute('aria-expanded')).toBe('true');
  });

  it('and the other way round', { timeout: 60_000 }, async () => {
    const { projectsCard, yearsCard, findByRole, queryByRole } = await renderBothCards();
    fireEvent.click(yearsCard);
    fireEvent.click(projectsCard);
    expect(await findByRole('dialog', { name: 'Project progress' }, { timeout: 10_000 })).toBeTruthy();
    expect(queryByRole('dialog', { name: 'Experience by category' })).toBeNull();
    expect(yearsCard.getAttribute('aria-expanded')).toBe('false');
    expect(projectsCard.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Project Progress dialog', () => {
  it('renders its copy, row names and the plural/percent messages', async () => {
    const { default: ProjectProgressPopup } = await import('@/components/about/ProjectProgressPopup');
    // The page owns the data since issue #55 (the dialog's chunk is deferred),
    // so the dialog is handed what the mocked hook returns.
    const { useProjectProgress } = await import('@/hooks/useProjectProgress');
    const { getByText, getByRole } = renderWithIntl(
      <ProjectProgressPopup open onClose={() => {}} triggerRef={{ current: null }} progress={useProjectProgress()} />,
    );
    expect(getByRole('dialog', { name: 'Project progress' })).toBeTruthy();
    expect(getByRole('button', { name: 'Close project progress' })).toBeTruthy();
    expect(getByText('Delivery telemetry')).toBeTruthy();
    expect(getByText('2 projects')).toBeTruthy();
    expect(getByText('Awaiting first sync')).toBeTruthy();
    expect(
      getByRole('button', {
        name: 'culina, Web. 50% complete, 5 of 10 board items done. Toggle board breakdown.',
      }),
    ).toBeTruthy();
    expect(getByRole('button', { name: 'auxo, Web. not tracked. Toggle board breakdown.' })).toBeTruthy();
  });
});
