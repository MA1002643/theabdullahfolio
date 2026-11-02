import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import LiveMaintenanceHeader from '@/components/home/LiveMaintenanceHeader';
import { server } from '../support/msw/server.js';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithIntl } from '../support/intl.jsx';

// The live maintenance header's words (issue #82). Every label, count and
// announcement now comes from messages/<locale>/LiveHeader.json, so this suite
// checks the three things a catalogue move can silently break:
//
//   1. English still reads exactly as it did, ICU plurals included (the
//      screen-reader summary is the densest sentence on the strip);
//   2. a non-English page words the server's DESCRIPTOR, not the English
//      sentence beside it — and falls back to that sentence for a payload
//      cached before descriptors existed;
//   3. the focus queue's arrow keys follow reading direction: → steps forward
//      in LTR, ← in RTL.
//
// MSW plays /api/work-status. Animations complete on their first frame
// (setup-component.js), and jsdom reports no hover, so the hover hints stay
// closed and the sr-only twins are what carry the facts.

const item = (number, title) => ({
  type: 'pr',
  number,
  title,
  repo: 'ma.codes',
  nameWithOwner: 'MA1002643/theabdullahfolio',
  url: `https://github.com/MA1002643/theabdullahfolio/pull/${number}`,
  createdAt: new Date(Date.now() - 3600e3).toISOString(),
  updatedAt: new Date(Date.now() - 60e3).toISOString(),
});

const payload = (over = {}) => ({
  state: 'live',
  headline: 'Live development in progress',
  message: 'Live update: shipping changes right now — currently focused on #82 Multilingual support.',
  secondaryMessage: null,
  messageDescriptor: {
    key: 'message.liveWithTop',
    values: { number: '82', title: 'Multilingual support' },
  },
  secondaryMessageDescriptor: null,
  meta: {
    activePrs: 1,
    activeIssues: 0,
    recentPushes: 2,
    topItems: [item(82, 'Multilingual support')],
    byRepo: { 'ma.codes': { activePrs: 1, activeIssues: 0, recentPushes: 2 } },
    breakdown: { prs: [item(82, 'Multilingual support')], issues: [], pushes: [] },
    confidence: 0.6,
    lastUpdated: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...over.meta,
  },
  ...over,
  ...(over.meta ? { meta: { ...payload().meta, ...over.meta } } : {}),
});

const serve = (body, status = 200) =>
  server.use(http.get('*/api/work-status', () => HttpResponse.json(body, { status })));

// Generous ceiling for the fetch → skeleton exit → strip mount hand-off:
// Testing Library's 1s default flaked once under a concurrent eslint run.
const SLOW = { timeout: 5000 };

const announcer = (container) =>
  container.querySelector('[aria-live="polite"][aria-atomic="true"]');

describe('LiveMaintenanceHeader — English', () => {
  it('announces the status in one stable English summary, plurals intact', async () => {
    serve(payload());
    const { container } = renderWithIntl(<LiveMaintenanceHeader />);
    await waitFor(() =>
      expect(announcer(container)).toHaveTextContent(
        'Status: live. Current focus: pull request 82, Multilingual support. ' +
          '1 active pull request, 0 open issues, and 2 pushes in the last 24 hours.',
      ),
      SLOW,
    );
    expect(screen.getByRole('region', { name: 'Live maintenance status' })).toBeInTheDocument();
    // The field eyebrows and the legend trigger, straight from the catalogue
    // (found, not got: the skeleton exits before the strip mounts).
    expect((await screen.findAllByText('PRs', {}, SLOW)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Focus · PR').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', {
        name: 'Open pull request #82: Multilingual support on GitHub',
      }).length,
    ).toBeGreaterThan(0);
  });

  it('pluralises the summary for many', async () => {
    serve(payload({ meta: { activePrs: 3, activeIssues: 1, recentPushes: 1 } }));
    const { container } = renderWithIntl(<LiveMaintenanceHeader />);
    await waitFor(() =>
      expect(announcer(container)).toHaveTextContent(
        '3 active pull requests, 1 open issue, and 1 push in the last 24 hours.',
      ),
      SLOW,
    );
  });

  it('says so, in English, when the API is down', async () => {
    serve({ error: 'boom' }, 500);
    renderWithIntl(<LiveMaintenanceHeader />);
    expect(
      await screen.findByText(
        'Live status temporarily unavailable. Showing maintenance fallback.',
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
  });
});

describe('LiveMaintenanceHeader — other locales', () => {
  // The secondary message surfaces on the ODD beats of the 12s rotation
  // clock, so these drive the clock with fake timers, one beat at a time,
  // until `expected` shows (the clock's first tick can land before the
  // data-driven beat reset settles, so "exactly one beat" is not stable).
  const secondaryBeat = async (body, locale, expected) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serve(body);
      const view = renderWithIntl(<LiveMaintenanceHeader />, { locale });
      await waitFor(() => expect(announcer(view.container).textContent).not.toBe(''), SLOW);
      for (let beat = 0; beat < 4; beat += 1) {
        if (view.container.textContent.replace(/\s+/g, ' ').includes(expected)) break;
        await act(async () => {
          vi.advanceTimersByTime(12_000);
        });
      }
      expect(view.container).toHaveTextContent(expected);
      return view;
    } finally {
      vi.useRealTimers();
    }
  };
  const shipping = (over) =>
    payload({
      state: 'shipping',
      secondaryMessage: 'ENGLISH SENTENCE FROM THE API.',
      secondaryMessageDescriptor: {
        key: 'message.secondary',
        values: { count: 2, number: '82', title: 'Multilingual support' },
      },
      ...over,
    });

  it('renders the API sentence verbatim in English', async () => {
    const { container } = await secondaryBeat(shipping(), 'en', 'ENGLISH SENTENCE FROM THE API.');
    const isolated = [...container.querySelectorAll('bdi')].map((node) => node.textContent);
    expect(isolated).not.toContain('#82 Multilingual support');
  });

  it('words the secondary DESCRIPTOR elsewhere, the GitHub title isolated in <bdi>', async () => {
    // The words are the fr catalogue's, formatted from the descriptor's key
    // and values — not the API's English sentence. Whitespace is normalised
    // because French sets a no-break space before its colon.
    const fr = createTranslator({ locale: 'fr', messages: messagesFor('fr'), namespace: 'LiveHeader' });
    const expected = fr
      .markup('message.secondary', { count: 2, number: '82', title: 'Multilingual support', bdi: (c) => c })
      .replace(/\s+/g, ' ');
    const { container } = await secondaryBeat(shipping(), 'fr', expected);
    expect(container).not.toHaveTextContent('ENGLISH SENTENCE FROM THE API.');
    const isolated = [...container.querySelectorAll('bdi')].map((node) => node.textContent);
    expect(isolated).toContain('#82 Multilingual support');
  });

  it('falls back to the sentence when a cached payload has no descriptor', async () => {
    const legacy = shipping();
    delete legacy.secondaryMessageDescriptor;
    await secondaryBeat(legacy, 'fr', 'ENGLISH SENTENCE FROM THE API.');
  });

  it('steps the focus queue forward with → in LTR and ← in RTL', async () => {
    const items = [item(82, 'First item'), item(90, 'Second item'), item(95, 'Third item')];
    const queue = { meta: { topItems: items, breakdown: { prs: items, issues: [], pushes: [] } } };
    // Which item the FOCUS link names after one key press from the head.
    const after = async (locale, key) => {
      serve(payload(queue));
      const view = renderWithIntl(<LiveMaintenanceHeader />, { locale });
      const [link] = await screen.findAllByRole('link', { name: /First item/ }, SLOW);
      fireEvent.keyDown(link, { key });
      // `#number: title` is the one part of the label every locale keeps.
      const [now] = screen.getAllByRole('link', { name: /#\d+\s*:\s*(First|Second|Third) item/ });
      const name = now.getAttribute('aria-label');
      view.unmount();
      return name.match(/(First|Second|Third) item/)[0];
    };
    // Forward is one step on; back wraps to the end of the queue.
    expect(await after('en', 'ArrowRight')).toBe('Second item');
    expect(await after('en', 'ArrowLeft')).toBe('Third item');
    expect(await after('ar', 'ArrowLeft')).toBe('Second item');
    expect(await after('ar', 'ArrowRight')).toBe('Third item');
    // Four full mounts in one case: past vitest's 5s default under load.
  }, 20_000);
});
