// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The reaction count's roll must obey the page-wide motion verdict (code
// review): RollingCount now reads the shared useReducedMotion — the OS
// preference OR the guestbook's manual switch, which reaches components as a
// MotionConfig with reducedMotion="always" — and renders a stationary number
// when motion is off. Everything framer is real except `motion.span`, which
// becomes a probe so the test can tell a rolling count (a motion element with
// an entry offset) from a stationary one (a plain span).

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  const { createElement: h, forwardRef } = await import('react');
  const MotionSpan = forwardRef(function MotionSpanProbe(
    { initial, animate, exit, transition, children, ...rest },
    ref,
  ) {
    return h(
      'span',
      { ...rest, ref, 'data-motion': 'true', 'data-initial-y': String(initial?.y) },
      children,
    );
  });
  return {
    ...actual,
    motion: new Proxy(actual.motion, {
      get: (target, key) => (key === 'span' ? MotionSpan : target[key]),
    }),
  };
});
vi.mock('@/hooks/useUiSound', () => ({ useUiSound: () => () => {} }));

const message = (fire) => ({
  id: 'msg_1725000000000_0000c0de',
  reactions: { fire, rocket: 0, heart: 0 },
  viewerReaction: null,
});

// The count node inside the 🔥 button: the tabular-nums wrapper's only child.
const fireCount = (container) =>
  container.querySelector('button[aria-label^="Fire"] .tabular-nums').children;

async function mountBar(fire, { motionOff }) {
  const { default: ReactionBar } = await import('@/components/guestbook/ReactionBar');
  const { MotionConfig } = await import('framer-motion');
  const bar = (n) =>
    createElement(ReactionBar, { message: message(n), canReact: true, onReact: async () => {} });
  const wrap = (n) =>
    motionOff ? createElement(MotionConfig, { reducedMotion: 'always' }, bar(n)) : bar(n);
  const utils = render(wrap(fire));
  return { ...utils, update: (n) => utils.rerender(wrap(n)) };
}

beforeEach(() => {
  // The OS says nothing about motion, so every "off" below is the switch's.
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
});

afterEach(() => {
  cleanup();
});

describe('RollingCount — the reaction count obeys the motion switch', () => {
  it('motion on: the count is a motion element that rolls in from below', async () => {
    const { container, update } = await mountBar(1, { motionOff: false });
    const [node] = fireCount(container);
    expect(node.dataset.motion).toBe('true');
    expect(node.dataset.initialY).toBe('10');
    expect(node.textContent).toBe('1');
    update(2);
    // popLayout keeps the outgoing twin while it exits: two nodes mid-roll.
    const nodes = [...fireCount(container)];
    expect(nodes.some((n) => n.textContent === '2' && n.dataset.motion === 'true')).toBe(true);
  });

  it('motion off (the page switch): a stationary number — no motion element, no exiting twin', async () => {
    const { container, update } = await mountBar(1, { motionOff: true });
    let nodes = [...fireCount(container)];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].dataset.motion).toBeUndefined();
    expect(nodes[0].textContent).toBe('1');

    update(2);
    nodes = [...fireCount(container)];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].dataset.motion).toBeUndefined();
    expect(nodes[0].textContent).toBe('2');

    update(1);
    nodes = [...fireCount(container)];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent).toBe('1');
  });

  it('the accessible label carries the count either way', async () => {
    const { container, update } = await mountBar(3, { motionOff: true });
    const button = () => container.querySelector('button[aria-label^="Fire"]');
    expect(button().getAttribute('aria-label')).toBe('Fire — 3');
    update(4);
    expect(button().getAttribute('aria-label')).toBe('Fire — 4');
  });
});
