// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getPaletteActions,
  registerPaletteActions,
  resetPaletteRegistry,
  subscribePaletteActions,
  useContributedActions,
  usePaletteActions,
} from '@/components/commandPalette/registry';

// The contributor registry behind the one sitewide palette (issue #41 §3.1):
// a page's commands are in the palette exactly while the page is mounted.

afterEach(() => {
  cleanup();
  resetPaletteRegistry();
});

const A = [{ id: 'a', label: 'A', perform: () => {} }];
const B = [{ id: 'b', label: 'B', perform: () => {} }];

describe('palette registry', () => {
  it('concatenates sets in registration order and notifies subscribers', () => {
    let notified = 0;
    const unsubscribe = subscribePaletteActions(() => (notified += 1));
    const offA = registerPaletteActions('a', A);
    registerPaletteActions('b', B);
    expect(getPaletteActions().map((x) => x.id)).toEqual(['a', 'b']);
    offA();
    expect(getPaletteActions().map((x) => x.id)).toEqual(['b']);
    expect(notified).toBe(3);
    unsubscribe();
  });

  it('a stale cleanup never removes a newer registration under the same key', () => {
    const offOld = registerPaletteActions('page', A);
    registerPaletteActions('page', B);
    offOld();
    expect(getPaletteActions().map((x) => x.id)).toEqual(['b']);
  });

  it('the hooks contribute while mounted and withdraw on unmount', () => {
    function Page() {
      usePaletteActions('page', A);
      return null;
    }
    let seen = [];
    function Palette() {
      seen = useContributedActions();
      return null;
    }
    const palette = render(<Palette />);
    const page = render(<Page />);
    expect(seen.map((x) => x.id)).toEqual(['a']);
    act(() => page.unmount());
    expect(seen).toEqual([]);
    palette.unmount();
  });
});
