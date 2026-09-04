// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SignatureField from '@/components/guestbook/SignatureField';
import {
  PRESET_MARKS,
  isValidSignaturePath,
} from '@/lib/guestbook/signature';

// The signature field's keyboard path. A canvas is not focusable and has no
// keyboard model, so with drawing as the only input a keyboard-only visitor
// on a device that still reports a pointer had no way to sign (code review).
// The preset marks are the alternative: real buttons beneath the pad — what
// a keyboard can Tab to and press — and the whole panel where there is no
// pointer at all. These tests drive the real component: the marks are
// native buttons (the operability guarantee), choosing one hands the parent
// that mark's path, the two inputs stay exclusive in both directions, and
// Clear / Discard / the post-send reset all drop a chosen mark.
//
// jsdom lays nothing out and has no 2D context, so the pad gets a recording
// context, a fixed css box, and the pointer-capture trio jsdom lacks — the
// same scaffolding the pad's own suite uses.

function recordingContext() {
  const ops = [];
  const rec = (name) => (...args) => ops.push([name, ...args]);
  return {
    ops,
    setTransform: rec('setTransform'),
    save: rec('save'),
    restore: rec('restore'),
    clearRect: rec('clearRect'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    quadraticCurveTo: rec('quadraticCurveTo'),
    arc: rec('arc'),
    stroke: rec('stroke'),
    fill: rec('fill'),
  };
}

let ctx;
let anyPointerNone;

beforeEach(() => {
  anyPointerNone = false;
  // The field asks for `(any-pointer: none)`; framer's useReducedMotion asks
  // for the motion preference. Answer the first from the flag, everything
  // else "no".
  window.matchMedia = (query) => ({
    matches: query === '(any-pointer: none)' ? anyPointerNone : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  window.scrollTo = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  ctx = recordingContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx);
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    get: () => 200,
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    get: () => 80,
    configurable: true,
  });
  HTMLCanvasElement.prototype.setPointerCapture = () => {};
  HTMLCanvasElement.prototype.hasPointerCapture = () => true;
  HTMLCanvasElement.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete HTMLCanvasElement.prototype.clientWidth;
  delete HTMLCanvasElement.prototype.clientHeight;
  delete HTMLCanvasElement.prototype.setPointerCapture;
  delete HTMLCanvasElement.prototype.hasPointerCapture;
  delete HTMLCanvasElement.prototype.releasePointerCapture;
});

function renderField(props = {}) {
  const onSignatureChange = vi.fn();
  const view = render(
    createElement(SignatureField, { onSignatureChange, resetSignal: 0, ...props }),
  );
  return { onSignatureChange, ...view };
}

const openPanel = () =>
  fireEvent.click(screen.getByRole('button', { name: /Add a signature/ }));
const mark = (label) => screen.getByRole('button', { name: label });
const pressed = (label) => mark(label).getAttribute('aria-pressed');
const lastEmit = (fn) => fn.mock.calls[fn.mock.calls.length - 1][0];
const byId = (id) => PRESET_MARKS.find((m) => m.id === id);

// A three-sample stroke through the DOM's own pointer events — what a real
// pen does, not the hook's handlers called by hand.
function drawStroke(canvas) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 20, clientY: 12 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 20 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 30, clientY: 20 });
}

describe('SignatureField — the preset marks are the keyboard path to a signature', () => {
  it('offers every preset as a real, focusable button, and pressing one signs with it', () => {
    const { onSignatureChange } = renderField();
    openPanel();

    for (const { label } of PRESET_MARKS) {
      const button = mark(label);
      // A native button is the operability guarantee: in the Tab order,
      // activated by Space and Enter, with no key handling of our own.
      expect(button.tagName).toBe('BUTTON');
      expect(button.tabIndex).toBe(0);
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
    expect(screen.getByRole('group', { name: 'Or pick a mark' })).toBeTruthy();

    fireEvent.click(mark('Flourish'));
    expect(onSignatureChange).toHaveBeenCalledTimes(1);
    expect(lastEmit(onSignatureChange)).toBe(byId('flourish').d);
    expect(isValidSignaturePath(lastEmit(onSignatureChange))).toBe(true);
    expect(pressed('Flourish')).toBe('true');
  });

  it('a second mark replaces the first; pressing the chosen mark again clears it', () => {
    const { onSignatureChange } = renderField();
    openPanel();

    fireEvent.click(mark('Flourish'));
    fireEvent.click(mark('Wave'));
    expect(lastEmit(onSignatureChange)).toBe(byId('wave').d);
    expect(pressed('Flourish')).toBe('false');
    expect(pressed('Wave')).toBe('true');

    fireEvent.click(mark('Wave'));
    expect(lastEmit(onSignatureChange)).toBe(null);
    expect(pressed('Wave')).toBe('false');
  });

  it('Clear drops a chosen mark', () => {
    const { onSignatureChange } = renderField();
    openPanel();
    fireEvent.click(mark('Spark'));
    expect(pressed('Spark')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(lastEmit(onSignatureChange)).toBe(null);
    expect(pressed('Spark')).toBe('false');
  });

  it('drawing after choosing a mark hands over the drawn path and drops the mark', () => {
    const { onSignatureChange, container } = renderField();
    openPanel();
    fireEvent.click(mark('Orbit'));

    drawStroke(container.querySelector('canvas'));
    const d = lastEmit(onSignatureChange);
    expect(typeof d).toBe('string');
    expect(d.startsWith('M ')).toBe(true);
    expect(d).not.toBe(byId('orbit').d);
    expect(isValidSignaturePath(d)).toBe(true);
    expect(pressed('Orbit')).toBe('false');
  });

  it('choosing a mark after drawing wipes the ink, so the parent holds exactly one', () => {
    const { onSignatureChange, container } = renderField();
    openPanel();
    const canvas = container.querySelector('canvas');

    drawStroke(canvas);
    expect(lastEmit(onSignatureChange)).toMatch(/^M /);
    expect(canvas.className).toContain('border-solid');

    const before = ctx.ops.length;
    fireEvent.click(mark('Flourish'));
    expect(ctx.ops.slice(before).some(([name]) => name === 'clearRect')).toBe(true);
    expect(lastEmit(onSignatureChange)).toBe(byId('flourish').d);
    expect(canvas.className).toContain('border-dashed');
    expect(pressed('Flourish')).toBe('true');
  });

  it('with no pointer at all the panel offers the marks alone — no pad, no hint', () => {
    anyPointerNone = true;
    const { onSignatureChange, container } = renderField();
    openPanel();

    expect(container.querySelector('canvas')).toBe(null);
    expect(screen.queryByText(/stroke weight follows your speed/)).toBe(null);
    expect(screen.getByRole('group', { name: 'Pick a mark' })).toBeTruthy();

    fireEvent.click(mark('Wave'));
    expect(lastEmit(onSignatureChange)).toBe(byId('wave').d);
    expect(pressed('Wave')).toBe('true');
  });

  it('Discard clears a chosen mark; the post-send reset folds the panel without re-emitting', () => {
    const { onSignatureChange, rerender } = renderField();
    openPanel();
    fireEvent.click(mark('Flourish'));

    fireEvent.click(screen.getByRole('button', { name: /Discard signature/ }));
    expect(lastEmit(onSignatureChange)).toBe(null);
    expect(screen.queryByRole('button', { name: 'Flourish' })).toBe(null);

    openPanel();
    fireEvent.click(mark('Spark'));
    const calls = onSignatureChange.mock.calls.length;
    rerender(createElement(SignatureField, { onSignatureChange, resetSignal: 1 }));
    // Folded away — and the parent, which already cleared its own copy,
    // hears nothing more.
    expect(screen.queryByRole('button', { name: 'Spark' })).toBe(null);
    expect(onSignatureChange.mock.calls.length).toBe(calls);

    // Reopening starts clean.
    openPanel();
    expect(pressed('Spark')).toBe('false');
  });
});
