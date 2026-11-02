import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import CommandPalette from '@/components/commandPalette/CommandPalette';
import { routeActions } from '@/components/commandPalette/routes';
import { renderWithIntl } from '../support/intl.jsx';

// The Language group switches locale through the locale-aware router
// (useLocaleSwitch → @/i18n/navigation, issue #82). Mocked so a test can
// assert WHERE a switch goes without an app router mounted.
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/journey',
  useRouter: () => router,
}));

// The ⌘K command palette's keyboard model (issue #92, L3).
//
// It follows the ARIA combobox + listbox pattern: focus STAYS in the input and
// the highlighted option is announced through aria-activedescendant. That
// pattern is easy to half-implement (a highlight a screen reader never hears
// about, a focus that is lost on close), so this suite drives it only with the
// keyboard and asserts on the ARIA a screen reader reads, then runs axe over
// each state the palette can be in.
//
// axe runs in jsdom here, so rules that need real layout (colour contrast) are
// off; the browser a11y layer (tests/a11y) runs the full rule set.

const actions = (perform = vi.fn()) => [
  { id: 'home', label: 'Home', section: 'Navigate', hint: '/', perform: () => perform('home') },
  { id: 'about', label: 'About', section: 'Navigate', hint: '/about', perform: () => perform('about') },
  { id: 'projects', label: 'Projects', section: 'Navigate', keywords: 'work portfolio', perform: () => perform('projects') },
  { id: 'cv', label: 'Download CV', section: 'Actions', perform: () => perform('cv') },
];

// The keyboard model is asserted over a known, short list, so these cases
// leave the palette's own Language group out; the group has its own suite.
function setup(perform, { includeLanguages = false, extra = [] } = {}) {
  const user = userEvent.setup();
  const utils = renderWithIntl(
    <>
      <button type="button">Somewhere on the page</button>
      <CommandPalette actions={[...actions(perform), ...extra]} includeLanguages={includeLanguages} />
    </>,
  );
  return { user, ...utils };
}

async function axeViolations(container) {
  const { violations } = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const input = () => screen.getByRole('combobox', { name: 'Search commands' });
const activeOption = () => {
  const id = input().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

describe('CommandPalette', () => {
  it('renders nothing until opened, then opens on ⌘K / Ctrl+K as a modal dialog', async () => {
    const { user } = setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.keyboard('{Meta>}k{/Meta}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('puts focus in the combobox and announces the highlighted option', async () => {
    const { user } = setup();
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(input()).toHaveFocus());
    expect(input()).toHaveAttribute('aria-controls', 'command-palette-list');
    expect(activeOption()).toHaveTextContent('Home');
    expect(activeOption()).toHaveAttribute('aria-selected', 'true');
  });

  it('moves the highlight with the arrows, wrapping at both ends, focus never leaving the input', async () => {
    const { user } = setup();
    await user.keyboard('{Meta>}k{/Meta}');
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('About');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(activeOption()).toHaveTextContent('Download CV'); // wrapped to the end
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Home'); // wrapped to the start
    expect(input()).toHaveFocus();
    // Exactly one option is ever marked selected.
    expect(screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('filters by label, hint, keywords and section', async () => {
    const { user } = setup();
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(input(), 'portfolio'); // a keyword, not in any label
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Projects']);
    await user.clear(input());
    await user.type(input(), 'actions'); // a section name
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Download CV']);
  });

  it('runs the highlighted action on Enter and closes', async () => {
    const perform = vi.fn();
    const { user } = setup(perform);
    await user.keyboard('{Meta>}k{/Meta}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(perform).toHaveBeenCalledExactlyOnceWith('about');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns focus to where it was when closed with Escape', async () => {
    const { user } = setup();
    const trigger = screen.getByRole('button', { name: 'Somewhere on the page' });
    trigger.focus();
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(input()).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('traps Tab inside the dialog', async () => {
    const { user } = setup();
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(input()).toHaveFocus());
    await user.keyboard('{Tab}');
    expect(input()).toHaveFocus();
  });

  // A role="status" inserted with its text already inside is often not
  // announced, so the region must exist, empty, BEFORE "Nothing matches"
  // arrives, and the same node must take the text (code review).
  it('announces "Nothing matches" as a text change in a status mounted empty', async () => {
    const { user } = setup();
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(input()).toHaveFocus());
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    await user.type(input(), 'zzzz-no-match');
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Nothing matches');

    await user.clear(input());
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toBeEmptyDOMElement();
  });

  it('has no axe violations open, filtered, or empty', async () => {
    const { user, container } = setup();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(await axeViolations(container)).toEqual([]);
    await user.type(input(), 'ab');
    expect(await axeViolations(container)).toEqual([]);
    await user.clear(input());
    await user.type(input(), 'zzzz-no-match');
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(await axeViolations(container)).toEqual([]);
  });
});

// Issue #82: every palette ends with a Language group, one command per
// locale. The label is the ENDONYM, rendered in its own language (so a screen
// reader pronounces it correctly); it is findable by English name and by
// code; running it switches the CURRENT page to that locale.
describe('CommandPalette — the Language group', () => {
  const open = async (user) => {
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(input()).toHaveFocus());
  };

  it('lists every locale by endonym, in its own lang and dir', async () => {
    const { user } = setup(undefined, { includeLanguages: true });
    await open(user);
    const spanish = screen.getByRole('option', { name: /Español/ });
    expect(within(spanish).getByText('Español')).toHaveAttribute('lang', 'es');
    const arabic = screen.getByRole('option', { name: /العربية/ });
    expect(within(arabic).getByText('العربية')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('Language')).toBeInTheDocument();
    // The current locale is marked as such.
    expect(screen.getByRole('option', { name: /English/ })).toHaveTextContent('en · Current');
  });

  it('is searchable by English name and by code', async () => {
    const { user } = setup(undefined, { includeLanguages: true });
    await open(user);
    await user.type(input(), 'spanish');
    const found = screen.getAllByRole('option');
    expect(found).toHaveLength(1);
    expect(within(found[0]).getByText('Español')).toBeInTheDocument();
    await user.clear(input());
    await user.type(input(), 'ja');
    expect(screen.getAllByRole('option').some((o) => o.textContent.startsWith('日本語'))).toBe(true);
  });

  it('switches the current page to the chosen locale', async () => {
    router.replace.mockClear();
    const { user } = setup(undefined, { includeLanguages: true });
    await open(user);
    await user.type(input(), 'german');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace.mock.calls[0][0]).toBe('/journey');
    expect(router.replace.mock.calls[0][1]).toMatchObject({ locale: 'de' });
  });

  it('translates the shared Navigate group from the catalogue, keeping English search terms', async () => {
    const go = vi.fn();
    const { user } = setup(undefined, { extra: routeActions([{ label: 'My Past', href: '/my-past', navKey: 'myPast' }], go) });
    await open(user);
    await user.type(input(), 'my past');
    const option = screen.getByRole('option', { name: /My Past/ });
    expect(option).toHaveTextContent('My Past');
    await user.keyboard('{Enter}');
    expect(go).toHaveBeenCalledWith('/my-past', 'My Past');
  });
});
