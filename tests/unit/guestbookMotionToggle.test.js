// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrefs, togglePref } from '@/lib/guestbook/prefs';

// The guestbook's manual motion toggle, end to end. It used to reach framer
// alone, through MotionConfig: the aurora mount read the OS media query
// directly and the CSS shimmer on a pending card was gated only by that
// query, so "motion off" still left both visibly running (code review). The
// page now exposes the one verdict three ways — MotionConfig for framer,
// `data-motion` on its wrapper for CSS, `enabled` for the aurora mount —
// and this suite drives the real page through the real preference store,
// with the heavy children replaced by probes that report what they were
// handed. The CSS side is a source contract: the shimmer must carry both
// gates, the OS query's and the attribute's.

vi.mock('next/image', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ alt }) => h('img', { alt }) };
});
vi.mock('@/components/PageTitle', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ title }) => h('h1', null, title) };
});
vi.mock('@/components/guestbook/GuestbookTitle', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ title }) => h('h1', null, title) };
});
vi.mock('@/components/AuroraDustMount', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ enabled }) =>
      h('div', { 'data-testid': 'aurora', 'data-enabled': String(enabled) }),
  };
});
// The app slot becomes a probe of what a component sees under the page's
// MotionConfig through the PROJECT hook — what every card, pill and glyph
// in the tree now imports. (framer's own useReducedMotion reads the OS query
// alone and never saw the toggle — that was the deeper half of this
// finding; the second reading below pins that framer's raw answer stays
// "no" while the project hook says "yes".)
vi.mock('@/components/guestbook/GuestbookApp', async () => {
  const { createElement: h } = await import('react');
  const { useReducedMotion } = await import('@/hooks/useReducedMotion');
  const { useReducedMotion: useOsOnly } = await import('framer-motion');
  const MotionProbe = () => {
    const reduced = useReducedMotion();
    const osOnly = useOsOnly();
    return h('div', {
      'data-testid': 'probe',
      'data-reduced': String(reduced),
      'data-os-only': String(osOnly),
    });
  };
  return { default: MotionProbe };
});

const motionOn = () => {
  if (!getPrefs().motion) togglePref('motion');
};

beforeEach(() => {
  // The OS says nothing about motion: every "off" below is the toggle's.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  window.scrollTo = () => {};
  motionOn();
});

afterEach(() => {
  cleanup();
  motionOn();
});

describe('/guestbook — one motion switch, every layer', () => {
  it('motion on: framer sees no reduction, the aurora is enabled, the wrapper says on', async () => {
    const { default: Guestbook } = await import('@/app/(sub pages)/guestbook/page');
    const { container, getByTestId } = render(createElement(Guestbook));
    expect(container.querySelector('[data-motion]').dataset.motion).toBe('on');
    expect(getByTestId('aurora').dataset.enabled).toBe('true');
    expect(getByTestId('probe').dataset.reduced).toBe('false');
  });

  it('toggling motion off reaches all three at once — and back', async () => {
    const { default: Guestbook } = await import('@/app/(sub pages)/guestbook/page');
    const { container, getByTestId } = render(createElement(Guestbook));

    act(() => togglePref('motion'));
    expect(container.querySelector('[data-motion]').dataset.motion).toBe('off');
    expect(getByTestId('aurora').dataset.enabled).toBe('false');
    expect(getByTestId('probe').dataset.reduced).toBe('true');
    // The OS still says nothing — only the project hook carries the toggle.
    expect(getByTestId('probe').dataset.osOnly).toBe('false');

    act(() => togglePref('motion'));
    expect(container.querySelector('[data-motion]').dataset.motion).toBe('on');
    expect(getByTestId('aurora').dataset.enabled).toBe('true');
    expect(getByTestId('probe').dataset.reduced).toBe('false');
  });

  it('the wrapper generates no box of its own', async () => {
    const { default: Guestbook } = await import('@/app/(sub pages)/guestbook/page');
    const { container } = render(createElement(Guestbook));
    expect(container.querySelector('[data-motion]').className).toContain('contents');
  });
});

describe('globals.css — the guestbook shimmer is gated by the toggle as well as the OS', () => {
  // vitest runs from the repo root (vitest.config.mjs); import.meta.url is
  // not a file: URL under the jsdom environment, so resolve from cwd.
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
  // The body of the first rule whose selector line matches.
  const ruleBody = (selectorLine) => {
    const at = css.indexOf(`${selectorLine} {`);
    if (at < 0) return null;
    return css.slice(at, css.indexOf('}', at));
  };

  it('the shimmer runs by default and the OS query stills it', () => {
    expect(ruleBody('.gb-pending::after')).toMatch(/animation:\s*gb-shimmer/);
    const osGate = css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .gb-pending::after {');
    expect(osGate).toBeGreaterThan(-1);
    expect(css.slice(osGate, css.indexOf('}', osGate))).toMatch(/animation:\s*none/);
  });

  it("[data-motion='off'] stills it too", () => {
    const body = ruleBody("[data-motion='off'] .gb-pending::after");
    expect(body).not.toBe(null);
    expect(body).toMatch(/animation:\s*none/);
    expect(body).toMatch(/opacity:\s*0/);
  });
});
