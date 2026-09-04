// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignaturePad } from '@/hooks/useSignaturePad';
import { strokeSegments } from '@/lib/guestbook/signature';

// The pad's canvas painters against the serialiser they must agree with.
// jsdom has no 2D context, so a recording one is installed: every path
// command the pad issues is captured as an op, and the ops are compared with
// strokeSegments — the geometry strokesToPath ships. What these pin down:
//   · pointer-up paints the tail (last midpoint → last sample) that the live
//     midpoint curves leave out, so the ink on screen ends where the posted
//     path ends;
//   · the resize repaint traces the serialiser's segments exactly, tail
//     included;
//   · a two-sample stroke and a dot get no phantom tail.

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

// A canvas jsdom can size and capture on: a fixed css box, one recording
// context per node, and pointer-capture stubs (jsdom implements none).
function makeCanvas(w = 200, h = 80) {
  const node = document.createElement('canvas');
  Object.defineProperty(node, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: h, configurable: true });
  const ctx = recordingContext();
  node.getContext = () => ctx;
  node.setPointerCapture = () => {};
  node.hasPointerCapture = () => true;
  node.releasePointerCapture = () => {};
  return { node, ctx };
}

const ev = (x, y, t = 0) => ({ pointerId: 1, clientX: x, clientY: y, timeStamp: t });

// The path ops (moveTo / lineTo / quadraticCurveTo) after a given index.
const pathOps = (ops, from = 0) =>
  ops.slice(from).filter(([name]) => /^(moveTo|lineTo|quadraticCurveTo)$/.test(name));

// What tracing a segment list should record, from an explicit start.
const traced = (stroke) => [
  ['moveTo', stroke[0].x, stroke[0].y],
  ...strokeSegments(stroke).map((s) =>
    s.type === 'Q'
      ? ['quadraticCurveTo', s.ctrl.x, s.ctrl.y, s.to.x, s.to.y]
      : ['lineTo', s.to.x, s.to.y],
  ),
];

let resizeCallbacks;

beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb) {
        resizeCallbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function draw(pad, points) {
  act(() => {
    pad.handlers.onPointerDown(ev(points[0].x, points[0].y, 0));
    points.slice(1).forEach((p, i) => {
      pad.handlers.onPointerMove(ev(p.x, p.y, (i + 1) * 16));
    });
  });
}

const STROKE = [
  { x: 10, y: 10 },
  { x: 20, y: 12 },
  { x: 30, y: 20 },
  { x: 40, y: 30 },
  { x: 50, y: 31 },
];

describe('useSignaturePad — the canvas paints the serialiser\'s geometry', () => {
  it('pointer-up paints the tail from the last midpoint to the last sample', () => {
    const { result } = renderHook(() => useSignaturePad());
    const { node, ctx } = makeCanvas();
    act(() => result.current.canvasRef(node));
    draw(result.current, STROKE);

    // While the pen is down the ink stops at the last midpoint…
    const segments = strokeSegments(STROKE);
    const lastCurve = segments[segments.length - 2];
    const live = pathOps(ctx.ops);
    expect(live[live.length - 1]).toEqual([
      'quadraticCurveTo',
      lastCurve.ctrl.x,
      lastCurve.ctrl.y,
      lastCurve.to.x,
      lastCurve.to.y,
    ]);
    expect(live.some(([n, x, y]) => n === 'lineTo' && x === 50 && y === 31)).toBe(false);

    // …and lifting the pen paints exactly the serialiser's tail: from that
    // midpoint, a straight line to the final sample.
    const before = ctx.ops.length;
    act(() => result.current.handlers.onPointerUp(ev(50, 31, 80)));
    const tail = segments[segments.length - 1];
    expect(tail).toEqual({ type: 'L', from: lastCurve.to, to: { x: 50, y: 31 } });
    expect(pathOps(ctx.ops, before)).toEqual([
      ['moveTo', tail.from.x, tail.from.y],
      ['lineTo', 50, 31],
    ]);

    // The posted path ends where the ink now ends (200×80 box → ×0.5).
    expect(result.current.toPathString()).toMatch(/ L 25\.0 15\.5$/);
  });

  it('a two-sample stroke has no separate tail: its straight lead already is one', () => {
    const { result } = renderHook(() => useSignaturePad());
    const { node, ctx } = makeCanvas();
    act(() => result.current.canvasRef(node));
    draw(result.current, STROKE.slice(0, 2));
    expect(pathOps(ctx.ops)).toEqual([
      ['moveTo', 10, 10],
      ['lineTo', 20, 12],
    ]);

    const before = ctx.ops.length;
    act(() => result.current.handlers.onPointerUp(ev(20, 12, 16)));
    expect(pathOps(ctx.ops, before)).toEqual([]);
    expect(result.current.toPathString()).toBe('M 5.0 5.0 L 10.0 6.0');
  });

  it('a dot (down-up, no movement) paints nothing extra and serialises as a dot', () => {
    const { result } = renderHook(() => useSignaturePad());
    const { node, ctx } = makeCanvas();
    act(() => result.current.canvasRef(node));
    act(() => result.current.handlers.onPointerDown(ev(30, 20, 0)));
    const before = ctx.ops.length;
    act(() => result.current.handlers.onPointerUp(ev(30, 20, 5)));
    expect(pathOps(ctx.ops, before)).toEqual([]);
    expect(result.current.toPathString()).toBe('M 15.0 10.0 L 15.0 10.0');
  });

  it('the resize repaint traces exactly the serialiser\'s segments, tail included', () => {
    const { result } = renderHook(() => useSignaturePad());
    const { node, ctx } = makeCanvas(200, 80);
    act(() => result.current.canvasRef(node));
    draw(result.current, STROKE);
    act(() => result.current.handlers.onPointerUp(ev(50, 31, 80)));

    // The box doubles; the observer fires; the pad rescales and repaints.
    Object.defineProperty(node, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: 160, configurable: true });
    const before = ctx.ops.length;
    act(() => resizeCallbacks.forEach((cb) => cb()));

    const doubled = STROKE.map((p) => ({ x: p.x * 2, y: p.y * 2 }));
    expect(pathOps(ctx.ops, before)).toEqual(traced(doubled));
    // …and the serialised signature is unchanged by the resize.
    expect(result.current.toPathString()).toMatch(/ L 25\.0 15\.5$/);
  });
});

// getContext('2d') is nullable — canvas disabled by policy, a headless or
// resource-starved renderer, a lost context. The pad's canvas mounts when the
// optional signature panel opens, so a throw on attach would take the panel
// (and the preset marks beside the pad) down with it. Every canvas path must
// no-op instead, the way the reaction burst already does; the pad's state
// machine keeps working so a clear still clears.
describe('useSignaturePad — no 2D context', () => {
  function contextlessCanvas() {
    const node = document.createElement('canvas');
    Object.defineProperty(node, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: 80, configurable: true });
    node.getContext = () => null;
    node.setPointerCapture = () => {};
    node.hasPointerCapture = () => true;
    node.releasePointerCapture = () => {};
    return node;
  }

  it('attaching, drawing, resizing and clearing all no-op instead of throwing', () => {
    const { result } = renderHook(() => useSignaturePad());
    const node = contextlessCanvas();
    expect(() => act(() => result.current.canvasRef(node))).not.toThrow();

    expect(() => {
      draw(result.current, STROKE);
      act(() => result.current.handlers.onPointerUp(ev(50, 31, 80)));
    }).not.toThrow();
    expect(result.current.hasInk).toBe(true);

    // The observer fires on a box change: the repaint must no-op too.
    Object.defineProperty(node, 'clientWidth', { value: 400, configurable: true });
    expect(() => act(() => resizeCallbacks.forEach((cb) => cb()))).not.toThrow();

    expect(() => act(() => result.current.clear())).not.toThrow();
    expect(result.current.hasInk).toBe(false);
    expect(result.current.toPathString()).toBe(null);

    // Detach is clean as well.
    expect(() => act(() => result.current.canvasRef(null))).not.toThrow();
  });
});
