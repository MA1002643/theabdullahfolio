import { act, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../support/msw/server.js';
import { githubStatsApiHandler } from '../support/msw/handlers.js';
import { renderWithIntl } from '../support/intl';

// Escape during a deferred dialog's download (issue #55 review).
//
// A press that beats a dialog's chunk sets its open flag at once, but the
// dialog, and with it its own Escape listener, mounts only once the chunk
// arrives. Escape during that wait used to do nothing, and the dialog opened
// later anyway. The page now cancels the pending open itself.
//
// Each dialog module is held behind a gate the test releases by hand, so the
// Escape lands while the import is provably still pending.

const gates = vi.hoisted(() => {
  const gate = () => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };
  return { experience: gate(), progress: gate() };
});

vi.mock('@/components/about/ExperienceBreakdownModal', async (importOriginal) => {
  await gates.experience.promise;
  return importOriginal();
});
vi.mock('@/components/about/ProjectProgressPopup', async (importOriginal) => {
  await gates.progress.promise;
  return importOriginal();
});

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
      totalProjects: 1,
      lastSynced: null,
      categoryBreakdown: [{ label: 'Web', count: 1 }],
      projects: [
        { id: 1, name: 'culina', category: 'Web', tracked: true, completionPercent: 50, doneItems: 5, totalItems: 10, columns: [{ name: 'Done', count: 5 }, { name: 'Todo', count: 5 }] },
      ],
    },
  }),
}));

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

const renderPage = async () => {
  server.use(
    githubStatsApiHandler(),
    http.get('*/api/experience-summary', () => HttpResponse.json(COMPLETE_EXPERIENCE)),
    http.get('*/api/github-skills', () => new HttpResponse(null, { status: 503 })),
  );
  const { default: AboutDetails } = await import('@/components/about');
  const utils = renderWithIntl(<AboutDetails />);
  const projectsCard = utils.container.querySelector('[aria-haspopup="dialog"][aria-label^="Projects shipped"]');
  const yearsCard = await utils.findByRole('button', { name: /^Years in the craft/ }, { timeout: 10_000 });
  return { ...utils, projectsCard, yearsCard };
};

// Release the gate, let the import and the page's ready state settle.
const release = async (gate, modulePath) => {
  await act(async () => {
    gate.release();
    await import(/* @vite-ignore */ modulePath);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
};

describe('Escape while a deferred /about dialog is still downloading', () => {
  it('cancels the pending Experience dialog, which then stays closed when its chunk arrives', { timeout: 60_000 }, async () => {
    const { yearsCard, findByRole, queryByRole } = await renderPage();
    fireEvent.click(yearsCard);
    expect(yearsCard.getAttribute('aria-expanded')).toBe('true');

    // The press is claimed (so the privacy notice does not also read it as a
    // decline) and the open is cancelled.
    const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notPrevented).toBe(false);
    expect(yearsCard.getAttribute('aria-expanded')).toBe('false');

    await release(gates.experience, '@/components/about/ExperienceBreakdownModal');
    expect(queryByRole('dialog', { name: 'Experience by category' })).toBeNull();

    // Not vacuous: the chunk is here now, and a fresh press opens it.
    fireEvent.click(yearsCard);
    expect(await findByRole('dialog', { name: 'Experience by category' }, { timeout: 10_000 })).toBeTruthy();
  });

  it('cancels the pending Project Progress dialog the same way', { timeout: 60_000 }, async () => {
    const { projectsCard, findByRole, queryByRole } = await renderPage();
    fireEvent.click(projectsCard);
    expect(projectsCard.getAttribute('aria-expanded')).toBe('true');

    const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notPrevented).toBe(false);
    expect(projectsCard.getAttribute('aria-expanded')).toBe('false');

    await release(gates.progress, '@/components/about/ProjectProgressPopup');
    expect(queryByRole('dialog', { name: 'Project progress' })).toBeNull();

    fireEvent.click(projectsCard);
    expect(await findByRole('dialog', { name: 'Project progress' }, { timeout: 10_000 })).toBeTruthy();
  });

  it('leaves an Escape alone when nothing is pending', { timeout: 60_000 }, async () => {
    await renderPage();
    const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notPrevented).toBe(true);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });
});
