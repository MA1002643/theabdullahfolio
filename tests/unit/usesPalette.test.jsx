// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { SITE_ROUTES, routeActions, routesExcept } from '@/components/commandPalette/routes';
import paletteMessages from '../../messages/en/UsesPalette.json';
import { renderWithIntl } from '../support/intl.jsx';

// /uses' ⌘K action set (issue #37). The builder is pure, so the shape is
// pinned directly; the plate jump reads prefers-reduced-motion AT PERFORM
// TIME (the Journey rationale — the list is memoed once). The component
// itself is exercised through the builder because everything it adds is
// wiring (router, transition provider, clipboard, toast).

// The palette routes through the locale-aware navigation (issue #82).
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/pageTransition/PageTransitionProvider', () => ({
  usePageTransition: () => ({ navigate: null }),
}));
vi.mock('sonner', () => ({ toast: vi.fn() }));
// The shared palette, reduced to the action list it was handed.
vi.mock('@/components/commandPalette/CommandPalette', () => ({
  default: ({ actions }) => (
    <ul>
      {actions.map((a) => (
        <li key={a.id} data-id={a.id}>
          {a.label}
        </li>
      ))}
    </ul>
  ),
}));

const setReducedMotion = (matches) => {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
};

let scrollSpy;
beforeEach(() => {
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy;
  setReducedMotion(false);
});
afterEach(() => {
  delete Element.prototype.scrollIntoView;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const LINES = ['{', '  "editor.formatOnSave": true', '}'];

// The REAL English catalogue (issue #82), never a mock translator: the
// labels asserted below are the ones a visitor reads.
const t = createTranslator({
  locale: 'en',
  messages: { UsesPalette: paletteMessages },
  namespace: 'UsesPalette',
});

async function build(overrides = {}) {
  const { buildUsesActions } = await import('@/components/uses/UsesPalette');
  const deps = {
    t,
    frameLines: LINES,
    motionOn: true,
    go: vi.fn(),
    copyText: vi.fn(),
    openExternal: vi.fn(),
    toggleMotion: vi.fn(),
    ...overrides,
  };
  return { actions: buildUsesActions(deps), deps };
}

describe('buildUsesActions — the action list', () => {
  it('lists six plate jumps, the two page actions, every other route, and the motion toggle', async () => {
    const { actions } = await build();
    const ids = actions.map((a) => a.id);
    expect(ids.slice(0, 6)).toEqual([
      'jump-machine',
      'jump-bench',
      'jump-stack',
      'jump-pipeline',
      'jump-instruments',
      'jump-bom',
    ]);
    expect(ids).toContain('copy-settings');
    expect(ids).toContain('open-repos');
    expect(ids.at(-1)).toBe('toggle-motion');

    const sections = new Set(actions.map((a) => a.section));
    expect(sections).toEqual(new Set(['Uses', 'Navigate', 'Preferences']));

    // Plate jumps read "Jump to 00 The machine" with the ordinal as the hint.
    const machine = actions.find((a) => a.id === 'jump-machine');
    expect(machine.label).toBe('Jump to 00 The machine');
    expect(machine.hint).toBe('00');
  });

  it('navigates to every site route except /uses, through the shared registry', async () => {
    const { actions } = await build();
    const hrefs = actions.filter((a) => a.section === 'Navigate').map((a) => a.hint);
    expect(hrefs).toEqual(routesExcept('/uses').map((r) => r.href));
    expect(hrefs).not.toContain('/uses');
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/journey', '/guestbook', '/my-past']));
    // The registry itself carries the new route for the other two palettes.
    expect(SITE_ROUTES.map((r) => r.href)).toContain('/uses');
  });

  it('a route action performs through `go` with href and label', async () => {
    const { actions, deps } = await build();
    actions.find((a) => a.id === 'go-journey').perform();
    expect(deps.go).toHaveBeenCalledWith('/journey', 'Journey');
  });

  it('copy-settings writes exactly the editor frame lines, newline-joined', async () => {
    const { actions, deps } = await build();
    actions.find((a) => a.id === 'copy-settings').perform();
    expect(deps.copyText).toHaveBeenCalledWith('{\n  "editor.formatOnSave": true\n}');
  });

  it('open-repos opens the GitHub repositories tab through the injected opener', async () => {
    const { actions, deps } = await build();
    actions.find((a) => a.id === 'open-repos').perform();
    expect(deps.openExternal).toHaveBeenCalledWith(
      'https://github.com/MA1002643?tab=repositories',
    );
  });

  it('the motion toggle reports its state as the hint and performs the toggle', async () => {
    const on = await build({ motionOn: true });
    expect(on.actions.at(-1).hint).toBe('on');
    const off = await build({ motionOn: false });
    expect(off.actions.at(-1).hint).toBe('off');
    off.actions.at(-1).perform();
    expect(off.deps.toggleMotion).toHaveBeenCalledTimes(1);
  });
});

describe('plate jumps — reduced motion is read when the action runs', () => {
  it('scrolls smoothly by default and instantly under prefers-reduced-motion', async () => {
    const { actions } = await build();
    const plate = document.createElement('section');
    plate.id = 'uses-bench';
    document.body.appendChild(plate);
    const jump = actions.find((a) => a.id === 'jump-bench');

    jump.perform();
    expect(scrollSpy).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' });
    expect(scrollSpy.mock.contexts.at(-1)).toBe(plate);

    // The preference flips AFTER the list was built — a perform-time read
    // must see it.
    setReducedMotion(true);
    jump.perform();
    expect(scrollSpy).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('a missing plate is a silent no-op', async () => {
    const { actions } = await build();
    expect(() => actions.find((a) => a.id === 'jump-bom').perform()).not.toThrow();
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});

// The palette's copy is fetched at mount, not shipped with the page (issue
// #82, the 8 kB budget). Until it lands the palette still offers every route
// jump; the page's own actions then arrive in the locale's words.
describe('UsesPalette — deferred copy', () => {
  it('offers the route jumps at once and its own actions once the locale’s copy is in', async () => {
    const { default: UsesPalette } = await import('@/components/uses/UsesPalette');
    const fa = (await import('../../messages/fa/UsesPalette.json')).default;
    const { container } = renderWithIntl(<UsesPalette frame={{ lines: LINES }} />, { locale: 'fa' });
    const ids = () => [...container.querySelectorAll('li')].map((li) => li.dataset.id);
    expect(ids()).toEqual(routeActions(routesExcept('/uses'), () => {}).map((a) => a.id));
    expect(ids()).not.toContain('copy-settings');
    await waitFor(() => expect(ids()).toContain('copy-settings'));
    expect(container.querySelector('[data-id="copy-settings"]').textContent).toBe(fa.copySettings);
  });
});
