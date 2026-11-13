import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SitePalette from '@/components/commandPalette/SitePalette';
import { resetPaletteRegistry, usePaletteActions } from '@/components/commandPalette/registry';
import { resetAskSession } from '@/components/commandPalette/askSession';
import { RECENTS_KEY } from '@/lib/palette/recents';
import { encodeEvent } from '@/lib/ask/protocol';
import { renderWithIntl } from '../support/intl.jsx';

// The sitewide ⌘K palette (issue #41), as the root layout mounts it: the eager
// shell (hotkey, trigger, contributor registry) and the two deferred chunks
// (the panel, the Ask view) loading for real through next/dynamic. Only the
// edges are doubles — the router, the Ember Passage, the toaster and fetch.
//
// Driven by the keyboard and asserted on what assistive tech reads, then axe
// over the list and the Ask view in English and Arabic.

const nav = vi.hoisted(() => ({ pathname: '/about', push: vi.fn(), replace: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
const passage = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@/components/pageTransition/PageTransitionProvider', () => ({
  usePageTransition: () => ({ navigate: passage.navigate }),
}));
vi.mock('sonner', () => ({ toast: vi.fn() }));

const PROJECTS = [
  { id: 1, name: 'theabdullahfolio', hint: 'Web', keywords: 'portfolio next' },
  { id: 2, name: 'AfaaqX', hint: 'System', keywords: 'stripe payments' },
];

function PageCommands() {
  usePaletteActions('page', PAGE_ACTIONS);
  return null;
}
const pagePerform = vi.fn();
const PAGE_ACTIONS = [
  { id: 'jump-atlas', label: 'Jump to the atlas', section: 'Journey', perform: pagePerform },
];

beforeEach(() => {
  nav.pathname = '/about';
  window.localStorage.clear();
});
afterEach(() => {
  resetPaletteRegistry();
  // The Ask conversations outlive the panel by design (askSession.js), so
  // each test starts with none.
  resetAskSession();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup({ locale = 'en', page = false } = {}) {
  const user = userEvent.setup();
  const utils = renderWithIntl(
    <>
      <button type="button">Somewhere on the page</button>
      {page ? <PageCommands /> : null}
      <SitePalette projects={PROJECTS} />
    </>,
    { locale },
  );
  return { user, ...utils };
}

const input = () => screen.getByRole('combobox');
const options = () => within(screen.getByRole('listbox')).queryAllByRole('option');
const activeOption = () => document.getElementById(input().getAttribute('aria-activedescendant'));
const hotkey = (user) => user.keyboard('{Meta>}k{/Meta}');

// Open, and wait until the deferred copy has filled in the site's own groups.
async function open(user) {
  await hotkey(user);
  await screen.findByRole('dialog', { name: 'Command palette' });
  await waitFor(() => expect(screen.getByRole('option', { name: /AfaaqX/ })).toBeInTheDocument());
}

async function axeViolations(container) {
  const { violations } = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const ndjson = (events) =>
  new Response(
    new ReadableStream({
      start(c) {
        const bytes = new TextEncoder().encode(events.map(encodeEvent).join(''));
        for (let i = 0; i < bytes.length; i += 5) c.enqueue(bytes.slice(i, i + 5));
        c.close();
      },
    }),
    { headers: { 'content-type': 'application/x-ndjson' } },
  );

describe('SitePalette — one palette, every page', () => {
  it('opens on ⌘K with Navigate (minus this page), Projects and Actions', async () => {
    const { user } = setup();
    await open(user);
    const labels = options().map((o) => o.textContent);
    expect(labels.some((l) => l.startsWith('About'))).toBe(false);
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^Home/), expect.stringMatching(/^Privacy/)]));
    expect(screen.getByRole('option', { name: /theabdullahfolio/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Copy link to this page/ })).toBeInTheDocument();
    expect(input()).toHaveFocus();
  });

  it('shows the current page’s contributed commands first', async () => {
    const { user } = setup({ page: true });
    await open(user);
    expect(options()[0]).toHaveTextContent('Jump to the atlas');
    await user.keyboard('{Enter}');
    expect(pagePerform).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ranks the best match first and highlights the matched characters', async () => {
    const { user } = setup();
    await open(user);
    await user.type(input(), 'proj');
    const first = activeOption();
    expect(first).toHaveTextContent(/^Projects/);
    expect(first.querySelector('mark')).toHaveTextContent('Proj');
  });

  it('navigates through the Ember Passage, and remembers the command in Recent', async () => {
    const { user } = setup();
    await open(user);
    await user.type(input(), 'afaaq');
    await user.keyboard('{Enter}');
    expect(passage.navigate).toHaveBeenCalledWith('/projects/2', { label: 'AfaaqX' });
    expect(JSON.parse(window.localStorage.getItem(RECENTS_KEY))).toEqual(['project-2']);

    await hotkey(user);
    await screen.findByRole('dialog');
    await waitFor(() => expect(options()[0]).toHaveTextContent('AfaaqX'));
    expect(options()[0].id).toBe('palette-opt-recent:project-2');
  });

  it('opens from the trigger and gives focus back to it on Escape', async () => {
    const { user } = setup();
    const trigger = await screen.findByRole('button', { name: /^Search & Ask/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await screen.findByRole('dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('has no axe violations open, filtered and with recents', async () => {
    const { user, container } = setup();
    await open(user);
    expect(await axeViolations(container)).toEqual([]);
    await user.type(input(), 'co');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('SitePalette — Ask, the research assistant', () => {
  // An agent run, as the server streams it: a plan that becomes a trace note,
  // a live GitHub check, a cited answer, its sources (one the palette cannot
  // place), and follow-ups.
  const ANSWER = [
    { type: 'meta', facts: 42, model: 'anthropic/claude-haiku-5.5' },
    { type: 'text', text: 'Let me check his GitHub.' },
    { type: 'retract' },
    { type: 'step', id: 't1', tool: 'get_github_activity', status: 'running' },
    { type: 'step', id: 't1', tool: 'get_github_activity', status: 'done', data: { live: true, commits: 1502, contributionsLastYear: 1809, longestStreakDays: 253 } },
    { type: 'step', id: 't2', tool: 'get_current_work', status: 'done', data: { live: false, activePullRequests: 8, recentPushes: 1 } },
    { type: 'text', text: 'He built AfaaqX, a multi-tenant system ' },
    { type: 'source', id: 'P2', kind: 'project', href: '/projects/2', label: 'AfaaqX' },
    { type: 'cite', id: 'P2' },
    { type: 'text', text: ', and has 1,502 commits ' },
    { type: 'source', id: 'L:github', kind: 'live', href: '/about' },
    { type: 'cite', id: 'L:github' },
    { type: 'text', text: '.' },
    { type: 'source', id: 'X', kind: 'page', href: 'https://evil.example/' },
    { type: 'cite', id: 'X' },
    { type: 'followups', questions: ['What did he test?', 'Where is he based?'] },
    { type: 'done', ms: 3900, steps: 1 },
  ];

  async function ask(user, question = 'Has he used Stripe?') {
    await open(user);
    await user.type(input(), question);
    const option = options().at(-1);
    // The question sits inside Unicode isolates (FSI … PDI), so an English
    // question keeps its order inside a right-to-left label.
    expect(option).toHaveTextContent(`Ask Claude: “\u2068${question}\u2069”`);
    // The Ask row is always last; arrow up wraps onto it.
    await user.keyboard('{ArrowUp}');
    expect(activeOption()).toBe(option);
    await user.keyboard('{Enter}');
    return screen.findByRole('combobox', { name: 'Your question' });
  }

  const askOptions = () => within(screen.getByRole('listbox', { name: 'Sources and follow-up questions' })).queryAllByRole('option');

  it('shows its work: the plan, the live check, a cited answer, numbered sources and provenance', async () => {
    const fetchSpy = vi.fn(async () => ndjson(ANSWER));
    vi.stubGlobal('fetch', fetchSpy);
    const { user } = setup();
    const field = await ask(user);
    expect(field).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('Answer ready'));

    const trace = screen.getByRole('region', { name: 'Steps taken' });
    expect(trace).toHaveTextContent('Let me check his GitHub.');
    expect(trace).toHaveTextContent('GitHub: 1,502 commits, 1,809 contributions this year, longest streak 253 days');
    // Pluralised on the raw count (it once read "1 recent pushes"), and a
    // snapshot is labelled as one.
    expect(trace).toHaveTextContent('Current work: 8 open pull requests, 1 recent push · stored snapshot');

    const answer = screen.getByRole('region', { name: 'Answer' });
    expect(answer).toHaveTextContent('He built AfaaqX, a multi-tenant system [1], and has 1,502 commits [2].');
    expect(answer).not.toHaveTextContent('Let me check');

    // Two sources (the off-site one is dropped, and its cite with it), then
    // the follow-ups.
    expect(askOptions().map((o) => o.textContent)).toEqual([
      '[1]AfaaqXSystem',
      '[2]GitHub activitylive',
      'What did he test?',
      'Where is he based?',
    ]);
    expect(screen.getByText(/42 facts · 1 live check · 3\.9 s · claude-haiku-5\.5/)).toBeInTheDocument();
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      question: 'Has he used Stripe?',
      locale: 'en',
      path: '/about',
      history: [],
    });
  });

  it('opens a source with the keyboard, through the Ember Passage', async () => {
    vi.stubGlobal('fetch', async () => ndjson(ANSWER));
    const { user } = setup();
    await ask(user);
    await waitFor(() => expect(askOptions()).toHaveLength(4));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(passage.navigate).toHaveBeenCalledWith('/projects/2', { label: 'AfaaqX' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks a follow-up with the conversation so far', async () => {
    const fetchSpy = vi.fn(async () => ndjson(ANSWER));
    vi.stubGlobal('fetch', fetchSpy);
    const { user } = setup();
    await ask(user);
    await waitFor(() => expect(askOptions()).toHaveLength(4));
    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(body.question).toBe('What did he test?');
    expect(body.history).toEqual([
      { q: 'Has he used Stripe?', a: 'He built AfaaqX, a multi-tenant system, and has 1,502 commits.' },
    ]);
  });

  it('Escape goes back to the full list, keeps the conversation to continue, and a second Escape closes', async () => {
    vi.stubGlobal('fetch', async () => ndjson(ANSWER));
    const { user } = setup();
    await ask(user, 'What is his stack?');
    await waitFor(() => expect(askOptions()).toHaveLength(4));
    await user.keyboard('{Escape}');
    // Back on the whole list, not a filtered one, so any command is a pick away.
    expect(screen.getByRole('combobox', { name: 'Search commands' })).toHaveValue('');
    expect(options().length).toBeGreaterThan(20);

    await user.click(screen.getByRole('option', { name: 'Continue: “\u2068What is his stack?\u2069”' }));
    const answer = await screen.findByRole('region', { name: 'Answer' });
    expect(answer).toHaveTextContent('He built AfaaqX');
    expect(screen.getByRole('heading', { name: 'What is his stack?' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens an empty conversation to type into, with starter questions and a sidebar', async () => {
    const fetchSpy = vi.fn(async () => ndjson(ANSWER));
    vi.stubGlobal('fetch', fetchSpy);
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole('option', { name: 'Ask Claude anything…' }));
    const field = await screen.findByRole('combobox', { name: 'Your question' });
    expect(field).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(askOptions().map((o) => o.textContent)).toEqual([
      'What is his strongest project?',
      'Which technologies does he use most?',
      'What engineering experience does he have?',
      'What is he working on right now?',
    ]);
    const sidebar = screen.getByRole('navigation', { name: 'Conversations' });
    expect(sidebar).toHaveTextContent('Your conversations will appear here.');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await user.type(field, 'Has he shipped anything with payments?{Enter}');
    expect(field).toHaveValue('');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Answer ready'));
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).question).toBe('Has he shipped anything with payments?');
    expect(within(sidebar).getByRole('button', { name: /Has he shipped anything with payments\?/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('asks a typed follow-up in the same thread, and a new conversation starts without history', async () => {
    const fetchSpy = vi.fn(async () => ndjson(ANSWER));
    vi.stubGlobal('fetch', fetchSpy);
    const { user } = setup();
    const field = await ask(user);
    await waitFor(() => expect(askOptions()).toHaveLength(4));
    await user.type(field, 'And testing?{Enter}');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).history).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Answer' })).toHaveLength(2));
    // The earlier turn keeps its sources, as buttons.
    expect(screen.getAllByRole('button', { name: /AfaaqX/ }).length).toBeGreaterThan(0);
    const sidebar = screen.getByRole('navigation', { name: 'Conversations' });
    await waitFor(() => expect(sidebar).toHaveTextContent('2 questions'));

    await user.click(within(sidebar).getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByRole('region', { name: 'Answer' })).not.toBeInTheDocument();
    await user.type(field, 'Where is he based?{Enter}');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchSpy.mock.calls[2][1].body).history).toEqual([]);
    expect(within(sidebar).getByRole('button', { name: /Has he used Stripe\?/ })).not.toHaveAttribute('aria-current');

    // The sidebar's Commands button goes back to the list.
    await user.click(within(sidebar).getByRole('button', { name: /Commands/ }));
    expect(screen.getByRole('combobox', { name: 'Search commands' })).toHaveFocus();
  });

  it('stops an answer with the Stop button, and when the palette closes', async () => {
    let signal;
    vi.stubGlobal('fetch', (_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    });
    const { user } = setup();
    await ask(user);
    await user.click(screen.getByRole('button', { name: 'Stop answering' }));
    expect(signal.aborted).toBe(true);
    expect(await within(screen.getByRole('region', { name: 'Answer' })).findByText('Stopped.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Stopped.');

    await user.type(screen.getByRole('combobox', { name: 'Your question' }), 'Again?{Enter}');
    const second = signal;
    expect(second.aborted).toBe(false);
    await user.keyboard('{Escape}{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(second.aborted).toBe(true);
  });

  it('says plainly when Ask is resting for the day, and leaves the list usable', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'budget' }, { status: 429 }));
    const { user } = setup();
    await ask(user);
    const region = screen.getByRole('region', { name: 'Answer' });
    expect(await within(region).findByText('Ask is resting for today. Try again tomorrow.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ask is resting for today.');
    await user.keyboard('{Escape}');
    expect(input()).toHaveValue('');
    expect(options().length).toBeGreaterThan(20);
  });

  it('offers suggested questions and the fit check when nothing is typed', async () => {
    const { user } = setup();
    await open(user);
    expect(screen.getByRole('option', { name: 'Ask Claude anything…' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'What is his strongest project?' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'What is he working on right now?' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Check a job description against his experience' })).toBeInTheDocument();
  });

  it('has no axe violations once answered, in English and in Arabic', async () => {
    for (const locale of ['en', 'ar']) {
      vi.stubGlobal('fetch', async () => ndjson(ANSWER));
      const { user, container, unmount } = setup({ locale });
      await hotkey(user);
      await screen.findByRole('dialog');
      await waitFor(() => expect(options().length).toBeGreaterThan(20));
      await user.type(input(), 'Stripe?');
      await user.keyboard('{ArrowUp}{Enter}');
      // By id, not by name: in Arabic the listbox is named in Arabic.
      await waitFor(() =>
        expect(within(document.getElementById('ask-options')).getAllByRole('option')).toHaveLength(4),
      );
      expect(await axeViolations(container)).toEqual([]);
      act(() => unmount());
      resetPaletteRegistry();
    }
  });
});

describe('SitePalette — the fit check', () => {
  // Longer than any question (280 characters), as a real posting is.
  const JOB = `Senior Frontend Engineer. React, TypeScript, Next.js, Playwright, accessibility, AWS. ${'You will own features end to end. '.repeat(8)}`;
  const FIT = [
    { type: 'meta', facts: 42, model: 'm' },
    { type: 'source', id: 'P1', kind: 'project', href: '/projects/1', label: 'theabdullahfolio' },
    { type: 'fit-row', row: { requirement: 'React and Next.js', verdict: 'strong', evidence: 'A Next.js 16 portfolio.', sources: ['P1'] } },
    { type: 'fit-row', row: { requirement: 'Accessibility', verdict: 'partial', evidence: 'axe in every language.', sources: [] } },
    { type: 'fit-row', row: { requirement: 'AWS', verdict: 'gap', evidence: '', sources: [] } },
    { type: 'done', ms: 3000, steps: 3 },
  ];

  it('checks a pasted job description requirement by requirement, honestly labelled', async () => {
    const fetchSpy = vi.fn(async () => ndjson(FIT));
    vi.stubGlobal('fetch', fetchSpy);
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole('option', { name: 'Check a job description against his experience' }));
    const field = await screen.findByRole('textbox', { name: 'Job description' });
    expect(field).toHaveFocus();
    await user.click(field);
    await user.paste(JOB);
    await user.keyboard('{Control>}{Enter}{/Control}');

    const results = await screen.findByRole('region', { name: 'Requirements' });
    await waitFor(() => expect(within(results).getAllByRole('listitem')).toHaveLength(3));
    expect(results).toHaveTextContent('1 strong · 1 partial · 1 not shown');
    expect(results).toHaveTextContent('StrongReact and Next.js');
    expect(results).toHaveTextContent('Not shownAWS');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({ mode: 'fit', locale: 'en' });
    expect(screen.getByText(/“Not shown” means this site does not mention it/)).toBeInTheDocument();

    await user.click(within(results).getByRole('button', { name: 'theabdullahfolio' }));
    expect(passage.navigate).toHaveBeenCalledWith('/projects/1', { label: 'theabdullahfolio' });
  });

  it('goes straight to the fit check when a job description is pasted into the palette', async () => {
    vi.stubGlobal('fetch', async () => ndjson(FIT));
    const { user } = setup();
    await open(user);
    await user.click(input());
    await user.paste(JOB);
    expect(await screen.findByRole('textbox', { name: 'Job description' })).toHaveValue(JOB);
    await screen.findByText('1 strong · 1 partial · 1 not shown');
  });

  it('keeps Tab inside the dialog, and Escape goes back to the list', async () => {
    vi.stubGlobal('fetch', async () => ndjson(FIT));
    const { user, container } = setup();
    await open(user);
    await user.click(screen.getByRole('option', { name: 'Check a job description against his experience' }));
    const field = await screen.findByRole('textbox', { name: 'Job description' });
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    }
    expect(await axeViolations(container)).toEqual([]);
    field.focus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('combobox', { name: 'Search commands' })).toBeInTheDocument();
  });
});
