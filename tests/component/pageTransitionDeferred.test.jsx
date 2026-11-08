import { act, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../support/intl';

// The Ember Passage runtime is a deferred chunk (issue #55). The provider
// keeps the phase machine and the still; the live overlay, the WebGL swarm and
// the ember field arrive through `import()` in idle time. These pin the three
// promises that split makes: a reduced-motion visitor never downloads it, a
// click that beats the download still gets a passage (the still), and once
// it has landed the passage is live.

const runtime = vi.hoisted(() => ({ imports: 0, warmed: 0 }));

vi.mock('@/components/pageTransition/passageRuntime', () => {
  runtime.imports += 1;
  return {
    EmberPassageOverlay: ({ label }) => <div data-testid="live-passage">{label}</div>,
    warmSwarm: () => {
      runtime.warmed += 1;
      return () => {};
    },
    warmEmberField: () => () => {},
  };
});

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

const setReducedMotion = (reduce) => {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
};

// A fresh provider module per test: its deferred chunk memoises the download
// at module scope, exactly as it does across a real visit.
async function renderProvider() {
  const { default: PageTransitionProvider, usePageTransition } = await import(
    '@/components/pageTransition/PageTransitionProvider'
  );
  function Go() {
    const { navigate } = usePageTransition();
    return (
      <button type="button" onClick={() => navigate('/about')}>
        go
      </button>
    );
  }
  return renderWithIntl(
    <PageTransitionProvider>
      <Go />
    </PageTransitionProvider>,
  );
}

const idle = () => act(() => new Promise((r) => setTimeout(r, 400)));

beforeEach(() => {
  vi.resetModules();
  runtime.imports = 0;
  runtime.warmed = 0;
});

afterEach(() => vi.unstubAllGlobals());

describe('Ember Passage, deferred runtime (issue #55)', () => {
  it('under reduced motion never downloads the runtime, and plays the still', async () => {
    setReducedMotion(true);
    const { getByRole, getByText, queryByTestId } = await renderProvider();
    await idle();
    fireEvent.click(getByRole('button', { name: 'go' }));
    await idle();
    expect(getByText('About')).toBeTruthy();
    expect(queryByTestId('live-passage')).toBeNull();
    expect(runtime.imports).toBe(0);
  });

  it('a click before the idle download gets the still, and asks for the runtime', async () => {
    setReducedMotion(false);
    const { getByRole, getByText, queryByTestId } = await renderProvider();
    fireEvent.click(getByRole('button', { name: 'go' }));
    expect(getByText('About')).toBeTruthy();
    expect(queryByTestId('live-passage')).toBeNull();
    // Requested by the click itself, ready for the next navigation.
    await waitFor(() => expect(runtime.imports).toBe(1));
  });

  it('once the idle download lands, the passage is live and the swarm is warmed', async () => {
    setReducedMotion(false);
    const { getByRole, findByTestId } = await renderProvider();
    await waitFor(() => expect(runtime.warmed).toBe(1));
    fireEvent.click(getByRole('button', { name: 'go' }));
    expect((await findByTestId('live-passage')).textContent).toBe('About');
  });
});
