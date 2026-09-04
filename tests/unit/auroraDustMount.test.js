// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuroraDustMount from '@/components/AuroraDustMount';

// The aurora mount's gate. It reads the OS motion query itself and waits for
// the intro loader — and now takes a page's own say as `enabled`, which is
// how the guestbook's manual motion toggle reaches it (code review: it
// could reach framer through MotionConfig, but not a media query). The
// Three canvas is replaced by a marker through next/dynamic, and the loader
// is told to have lifted, so what is under test is only the gate.

vi.mock('next/dynamic', async () => {
  const { createElement: h } = await import('react');
  return { default: () => () => h('div', { 'data-testid': 'aurora-canvas' }) };
});
vi.mock('@/hooks/useLoaderRevealed', () => ({ useLoaderRevealed: () => true }));

let osReduced;

beforeEach(() => {
  osReduced = false;
  window.matchMedia = (query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? osReduced : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  cleanup();
});

const canvas = (view) => view.queryByTestId('aurora-canvas');

describe('AuroraDustMount — OS query, loader, and the page\'s own say', () => {
  it('mounts by default once the loader has lifted and the OS allows motion', () => {
    const view = render(createElement(AuroraDustMount));
    expect(canvas(view)).not.toBe(null);
  });

  it('enabled={false} keeps it unmounted whatever the OS says', () => {
    const view = render(createElement(AuroraDustMount, { enabled: false }));
    expect(canvas(view)).toBe(null);
  });

  it('flipping enabled at runtime mounts and unmounts it', () => {
    const view = render(createElement(AuroraDustMount, { enabled: true }));
    expect(canvas(view)).not.toBe(null);
    view.rerender(createElement(AuroraDustMount, { enabled: false }));
    expect(canvas(view)).toBe(null);
    view.rerender(createElement(AuroraDustMount, { enabled: true }));
    expect(canvas(view)).not.toBe(null);
  });

  it('the OS preference still rules when the page says nothing, and when it says yes', () => {
    osReduced = true;
    expect(canvas(render(createElement(AuroraDustMount)))).toBe(null);
    cleanup();
    expect(canvas(render(createElement(AuroraDustMount, { enabled: true })))).toBe(null);
  });
});
