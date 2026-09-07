import { describe, expect, it } from 'vitest';
import {
  BUS_Y,
  CORNER_R,
  MARGIN,
  PAD_X,
  VB_MIN_W,
  buildGraph,
  buildTimeline,
  describeSchedule,
  estimateText,
  orthogonalRoute,
  scheduleWindow,
} from '@/lib/uses/pipelineGraph';

// The /uses pipeline schematic as data (issue #37, pipeline pass 2026-09-06):
// every box must be wide enough for its own words, the labels must come from
// the facts, the bus must be drawn once, and every packet in the flow must
// land on the node it lights.

const WORKFLOWS = ['CI', 'AI Code Review', 'Enable Auto-Merge', 'Issue triage', 'Stale', 'Sync README'];
const FACTS = {
  pipeline: {
    workflows: WORKFLOWS,
    crons: [{ path: '/api/daily-warmup', schedule: '0 1 * * *' }],
  },
  instruments: { apiRoutes: 18 },
  node: { engines: '^22.13.0 || ^24.0.0', nvmrc: '22.14.0', vercelMajor: 24 },
  bom: { groups: [{ label: 'Core', items: [{ name: 'next', version: '^14.2.30' }] }] },
};

const byId = (g) => Object.fromEntries(g.nodes.map((n) => [n.id, n]));
const widest = (n) => {
  const e = estimateText(n);
  return Math.max(e.kind, e.title, e.sub);
};

describe('schedule labels', () => {
  it('describes a simple daily expression and shows anything else raw', () => {
    expect(describeSchedule('0 1 * * *')).toBe('daily · 01:00 UTC');
    expect(describeSchedule('30 14 * * *')).toBe('daily · 14:30 UTC');
    expect(describeSchedule('*/5 * * * *')).toBe('*/5 * * * *');
    expect(describeSchedule(null)).toBe('');
  });

  it("gives the Hobby firing window — Vercel promises the hour, not the minute", () => {
    expect(scheduleWindow('0 1 * * *')).toBe('01:00–01:59 UTC');
    expect(scheduleWindow('15 23 * * *')).toBe('23:00–23:59 UTC');
    expect(scheduleWindow('0 * * * *')).toBeNull();
    expect(scheduleWindow(undefined)).toBeNull();
  });
});

describe('buildGraph — layout', () => {
  it('sizes every box to its widest label plus the text inset, so no label overflows', () => {
    const g = buildGraph(FACTS);
    for (const n of g.nodes) {
      expect(n.w - 2 * PAD_X, n.id).toBeGreaterThanOrEqual(widest(n));
    }
  });

  it('re-lays from measured widths and grows the viewBox rather than clipping', () => {
    const base = buildGraph(FACTS);
    const measured = Object.fromEntries(
      base.nodes.map((n) => [n.id, { kind: 40, title: 120, sub: 400 }]),
    );
    const g = buildGraph(FACTS, measured);
    for (const n of g.nodes) expect(n.w, n.id).toBeGreaterThanOrEqual(400 + 2 * PAD_X);
    expect(g.vb.w).toBeGreaterThan(VB_MIN_W);
    for (const n of g.nodes) {
      expect(n.x, n.id).toBeGreaterThanOrEqual(MARGIN);
      expect(n.x + n.w, n.id).toBeLessThanOrEqual(g.vb.w - MARGIN + 0.01);
    }
  });

  it('a row the browser could not measure keeps its estimate', () => {
    const g = buildGraph(FACTS, { actions: { kind: 0, title: 0, sub: 0 } });
    expect(byId(g).actions.w - 2 * PAD_X).toBeGreaterThanOrEqual(widest(byId(g).actions));
  });

  it('fits the default layout in the 1000-unit viewBox with nothing overlapping', () => {
    const g = buildGraph(FACTS);
    expect(g.vb.w).toBe(VB_MIN_W);
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(MARGIN);
      expect(n.x + n.w).toBeLessThanOrEqual(g.vb.w - MARGIN + 0.01);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.h).toBeLessThanOrEqual(g.vb.h);
    }
    const rows = new Map();
    for (const n of g.nodes) rows.set(n.y, [...(rows.get(n.y) || []), n]);
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w + 8);
      }
    }
  });

  it('labels every node from the facts: workflow count, the Vercel Node major, routes, the Next minor', () => {
    const n = byId(buildGraph(FACTS));
    expect(n.actions.sub).toBe('6 workflows · lint · unit · build · e2e');
    expect(n.build.sub).toBe('next build · Node 24.x');
    expect(n.serve.sub).toBe('18 API routes · Next 14.2');
    expect(n.cron.sub).toBe('daily-warmup · 01:00–01:59 UTC');
    expect(n.mail.sub).toBe('contact · Abstract verify');
    expect(Object.keys(n)).toEqual([
      'github', 'actions', 'build', 'serve', 'cron',
      'redis', 'gateway', 'graphql', 'spotify', 'mail',
    ]);
  });

  it('never invents a figure when a fact is missing', () => {
    const g = buildGraph({});
    const n = byId(g);
    expect(n.actions.sub).toBe('lint · unit · build · e2e');
    expect(n.build.sub).toBe('next build');
    expect(n.serve.sub).toBe('API routes · Next');
    expect(n.cron).toBeUndefined();
    expect(g.cron).toBeNull();
    expect(g.laneBox.count).toBe(0);
    expect(g.edges.find((e) => e.id === 'e-cron')).toBeUndefined();
  });

  it('carries one CI lane per workflow, inside the CI node', () => {
    const g = buildGraph(FACTS);
    const a = byId(g).actions;
    expect(g.laneBox.count).toBe(WORKFLOWS.length);
    expect(g.laneBox.x).toBeGreaterThanOrEqual(a.x);
    expect(g.laneBox.x + g.laneBox.w).toBeLessThanOrEqual(a.x + a.w);
    expect(g.laneBox.y + g.laneBox.h).toBeLessThanOrEqual(a.y + a.h);
    // Adding a workflow adds a lane and changes the count on the node.
    const more = buildGraph({ ...FACTS, pipeline: { ...FACTS.pipeline, workflows: [...WORKFLOWS, 'Nightly'] } });
    expect(more.laneBox.count).toBe(7);
    expect(byId(more).actions.sub).toMatch(/^7 workflows/);
  });

  it('routes each service off the bus with rounded corners, straight when directly beneath', () => {
    expect(orthogonalRoute(800, 215, 300, 310)).toBe(
      `M800 215 V${BUS_Y - CORNER_R} Q800 ${BUS_Y} ${800 - CORNER_R} ${BUS_Y} H${300 + CORNER_R} Q300 ${BUS_Y} 300 ${BUS_Y + CORNER_R} V310`,
    );
    expect(orthogonalRoute(800, 215, 900, 310)).toBe(
      `M800 215 V${BUS_Y - CORNER_R} Q800 ${BUS_Y} ${800 + CORNER_R} ${BUS_Y} H${900 - CORNER_R} Q900 ${BUS_Y} 900 ${BUS_Y + CORNER_R} V310`,
    );
    expect(orthogonalRoute(800, 215, 805, 310)).toBe('M800 215 V310');
  });

  it('draws the visible fan once: a trunk, a bus per side, one drop per service', () => {
    const g = buildGraph(FACTS);
    const ids = g.strokes.map((s) => s.id);
    expect(ids.filter((id) => id === 's-trunk')).toHaveLength(1);
    expect(ids.filter((id) => id.startsWith('s-bus-')).length).toBeGreaterThanOrEqual(1);
    for (const s of g.services) expect(ids).toContain(`s-drop-${s.id}`);
    expect(g.strokes.filter((s) => s.id.startsWith('s-drop-')).every((s) => s.head)).toBe(true);
    // The packets ride a full route per service, invisible as a stroke.
    for (const s of g.services) {
      const e = g.edges.find((x) => x.id === `e-${s.id}`);
      expect(e.visible).toBe(false);
      expect(e.d.startsWith(`M${g.fanX} ${g.mainBottom}`)).toBe(true);
    }
  });
});

describe('buildTimeline — the flow', () => {
  const g = buildGraph(FACTS);
  const tl = buildTimeline(g);
  const edge = (id) => g.edges.find((e) => e.id === id);
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  it('walks the rail in order, fans out and back, then drops the cron in', () => {
    const rail = ['e-github', 'e-actions', 'e-build'].map((id) => tl.comets.find((c) => c.edge === id));
    expect(rail.every(Boolean)).toBe(true);
    expect(rail[0].t0).toBeLessThan(rail[1].t0);
    expect(rail[1].t0).toBeLessThan(rail[2].t0);
    expect(rail.map((c) => c.tag)).toEqual(['push', '6/6 ✓', 'deploy']);
    const requests = tl.comets.filter((c) => c.dir === 1 && c.tone === 'ember' && c.edge.startsWith('e-') && g.services.some((s) => `e-${s.id}` === c.edge));
    const responses = tl.comets.filter((c) => c.dir === -1 && c.tone === 'gold');
    expect(requests).toHaveLength(g.services.length);
    expect(responses.length).toBeGreaterThanOrEqual(g.services.length);
    expect(Math.max(...requests.map((c) => c.t0 + c.dur))).toBeLessThanOrEqual(Math.min(...responses.map((c) => c.t0)));
    const cron = tl.comets.find((c) => c.edge === 'e-cron');
    expect(cron.tone).toBe('amber');
    expect(cron.t0).toBeGreaterThan(Math.max(...responses.filter((c) => c.edge !== 'e-graphql').map((c) => c.t0 + c.dur)));
    const warm = tl.comets.filter((c) => c.edge === 'e-graphql' && c.tone === 'amber');
    expect(warm).toHaveLength(1);
    expect(warm[0].t0).toBeGreaterThan(cron.t0 + cron.dur);
  });

  it('every comet rides a real edge and the loop outlasts its last beat', () => {
    for (const c of tl.comets) expect(edge(c.edge), c.edge).toBeDefined();
    const last = Math.max(...tl.comets.map((c) => c.t0 + c.dur), ...tl.hots.map((h) => h.t0 + h.dur));
    expect(tl.period).toBeGreaterThan(last);
  });

  it('every landing lights the node the packet lands on, with a ripple at the entry point', () => {
    for (const c of tl.comets) {
      const target = c.dir === 1 ? edge(c.edge).to : edge(c.edge).from;
      const hot = tl.hots.find((h) => h.node === target && near(h.t0, c.t0 + c.dur));
      expect(hot, `${c.edge} dir ${c.dir}`).toBeDefined();
      expect(hot.at).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    }
  });

  it('the source and the cron light as they emit, so every node takes part in the loop', () => {
    const push = tl.comets.find((c) => c.edge === 'e-github');
    const cron = tl.comets.find((c) => c.edge === 'e-cron');
    expect(tl.hots.find((h) => h.node === 'github' && near(h.t0, push.t0))).toBeDefined();
    expect(tl.hots.find((h) => h.node === 'cron' && near(h.t0, cron.t0))).toBeDefined();
    const lit = new Set(tl.hots.map((h) => h.node));
    for (const n of g.nodes) expect(lit.has(n.id), n.id).toBe(true);
  });

  it('the CI lanes finish before the result leaves, the build fills before the deploy leaves', () => {
    expect(tl.lanes.count).toBe(WORKFLOWS.length);
    expect(tl.lanes.t0 + tl.lanes.dur).toBeLessThanOrEqual(tl.comets.find((c) => c.edge === 'e-actions').t0);
    expect(tl.progress.t0 + tl.progress.dur).toBeLessThanOrEqual(tl.comets.find((c) => c.edge === 'e-build').t0);
  });

  it('holds together without a cron or workflows', () => {
    const bare = buildTimeline(buildGraph({ instruments: { apiRoutes: 3 } }));
    expect(bare.comets.some((c) => c.edge === 'e-cron')).toBe(false);
    expect(bare.comets.some((c) => c.tone === 'amber')).toBe(false);
    expect(bare.lanes.count).toBe(0);
    expect(bare.comets.find((c) => c.edge === 'e-actions').tag).toBe('✓');
    expect(bare.period).toBeGreaterThan(0);
  });
});
