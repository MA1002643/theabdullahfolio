// The /uses pipeline schematic, as pure data (issue #37, owner pass
// 2026-09-06). No DOM and no React here: the plate hands in the build facts
// and, once mounted, the widths Chromium actually measured for each label,
// and gets back node boxes, edge paths and the flow choreography. Keeping it
// pure means the layout ("nothing overflows its box") and the timeline
// ("every beat is ordered and every lane maps to a real workflow") are pinned
// by unit tests without a browser.
//
// Coordinate system: one SVG viewBox, 1000 units wide at minimum (it grows if
// the labels need more room — the drawing scales down rather than clipping a
// word), 404 tall. A main rail of four nodes at RAIL_Y, the cron above the
// last one, and the services in a row below, fed from the runtime node by an
// orthogonal bus — a trunk drops to BUS_Y, runs along it, and a rounded
// corner drops into each service (circuit-schematic routing, not five
// crossing béziers).

export const VB_MIN_W = 1000;
export const VB_H = 404;
export const MARGIN = 16;
export const PAD_X = 12;
export const MIN_W = 112;
export const RAIL_Y = 176;
export const MAIN_H = 78;
export const CRON_Y = 30;
export const CRON_H = 58;
export const BUS_Y = 262;
export const SERVICE_Y = 318;
export const SERVICE_H = 66;
export const HEAD_GAP = 8;
export const CORNER_R = 10;
export const BAR_H = 2.5;
const RAIL_GAP_MIN = 28;
const SERVICE_GAP = 16;

// Glyph advances in user units for the schematic's two faces, calibrated
// against getComputedTextLength() in Chromium (Menlo 10.5px ≈ 6.6/char,
// Inter 600 13px ≈ 6.9/char, the 8.5px tracked eyebrow ≈ 6.3/char). These
// size the server render; the plate re-measures on mount and re-lays with
// the real widths, so a face that renders wider never clips.
export const EST = { kind: 6.3, title: 6.9, sub: 6.6 };

export const estimateText = (node) => ({
  kind: node.kind.length * EST.kind,
  title: node.title.length * EST.title,
  sub: node.sub.length * EST.sub,
});

// "0 1 * * *" → "daily · 01:00 UTC"; anything else is shown raw.
export function describeSchedule(schedule) {
  const m = typeof schedule === 'string' && schedule.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!m) return schedule || '';
  const hh = String(m[2]).padStart(2, '0');
  const mm = String(m[1]).padStart(2, '0');
  return `daily · ${hh}:${mm} UTC`;
}

// The window the job actually fires in. Vercel's Hobby plan schedules crons
// to the hour, not the minute: "a cron job configured as `0 1 * * *` will
// trigger anywhere between 1:00 am and 1:59 am" (docs/cron-jobs/usage-and-
// pricing). The schematic shows that window rather than a precision the
// platform does not promise. Null for anything but a simple daily expression.
export function scheduleWindow(schedule) {
  const m = typeof schedule === 'string' && schedule.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!m) return null;
  const hh = String(m[2]).padStart(2, '0');
  return `${hh}:00–${hh}:59 UTC`;
}

const cronName = (c) => c.path.replace(/^\/api\//, '');

// Baselines for the three text rows inside a node of height h.
const textRows = (h) =>
  h === MAIN_H
    ? { kind: 17, title: 36, sub: 53 }
    : h === SERVICE_H
      ? { kind: 16, title: 34, sub: 50 }
      : { kind: 15, title: 32, sub: 47 };

// A row the browser could not measure (jsdom, a font not yet loaded) keeps
// its estimate rather than collapsing the box to the rows it could.
const nodeWidth = (node, measure) => {
  const est = estimateText(node);
  const m = measure && measure[node.id];
  const row = (k) => (m && m[k] > 0 ? m[k] : est[k]);
  return Math.max(MIN_W, Math.ceil(Math.max(row('kind'), row('title'), row('sub')) + PAD_X * 2));
};

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// A rounded-corner orthogonal route from (x0, y0) down to the bus, along it,
// and down to (x1, y1). Straight when the target sits under the source.
export function orthogonalRoute(x0, y0, x1, y1) {
  const r = CORNER_R;
  if (Math.abs(x1 - x0) < 2 * r + 2) return `M${x0} ${y0} V${y1}`;
  const s = x1 < x0 ? -1 : 1;
  return (
    `M${x0} ${y0} V${BUS_Y - r} Q${x0} ${BUS_Y} ${x0 + s * r} ${BUS_Y} ` +
    `H${x1 - s * r} Q${x1} ${BUS_Y} ${x1} ${BUS_Y + r} V${y1}`
  );
}

export function buildGraph(facts, measure = null) {
  const workflows = facts?.pipeline?.workflows ?? null;
  const crons = facts?.pipeline?.crons ?? null;
  const apiRoutes = facts?.instruments?.apiRoutes ?? null;
  const vercelMajor = facts?.node?.vercelMajor ?? null;
  const nextVersion =
    facts?.bom?.groups?.flatMap((g) => g.items).find((i) => i.name === 'next')?.version ?? null;
  const nextLabel = nextVersion
    ? `Next ${nextVersion.replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.')}`
    : 'Next';

  const mainSpecs = [
    { id: 'github', kind: 'SOURCE', title: 'GitHub', sub: 'git push · main' },
    {
      id: 'actions',
      kind: 'CI',
      title: 'GitHub Actions',
      sub: workflows
        ? `${workflows.length} workflows · lint · unit · build · e2e`
        : 'lint · unit · build · e2e',
    },
    {
      id: 'build',
      kind: 'BUILD',
      title: 'Vercel build',
      // Vercel deploys the newest supported major inside package.json
      // `engines.node` — never the .nvmrc pin, which is local-dev only.
      sub: vercelMajor ? `next build · Node ${vercelMajor}.x` : 'next build',
    },
    {
      id: 'serve',
      kind: 'RUNTIME',
      title: 'Fluid compute',
      sub: apiRoutes != null ? `${apiRoutes} API routes · ${nextLabel}` : `API routes · ${nextLabel}`,
    },
  ];

  const cronSpec =
    crons && crons.length > 0
      ? {
          id: 'cron',
          kind: 'SCHEDULE',
          title: crons.length === 1 ? 'cron' : `${crons.length} crons`,
          sub:
            crons.length === 1
              ? `${cronName(crons[0])} · ${
                  scheduleWindow(crons[0].schedule) ?? describeSchedule(crons[0].schedule)
                }`
              : crons.map(cronName).join(' · '),
        }
      : null;

  // Every external system the API routes talk to, left to right. Redis
  // backs the guestbook (messages, presence, reactions), the live-location
  // store and the contact form's send dedupe; the AI Gateway serves the
  // refine endpoint; GitHub's GraphQL API feeds stats, skills, progress and
  // work status; Spotify the now-playing card; the contact form goes out
  // over SMTP after an Abstract email-reputation check.
  const serviceSpecs = [
    { id: 'redis', kind: 'STORE', title: 'Upstash Redis', sub: 'guestbook · location · dedupe' },
    { id: 'gateway', kind: 'GATEWAY', title: 'AI Gateway', sub: 'refine-message' },
    { id: 'graphql', kind: 'GRAPHQL', title: 'GitHub GraphQL', sub: 'stats · skills · progress' },
    { id: 'spotify', kind: 'REST', title: 'Spotify', sub: 'now playing' },
    { id: 'mail', kind: 'MAIL', title: 'SMTP', sub: 'contact · Abstract verify' },
  ];

  // ── Widths, then the viewBox they need ─────────────────────────────
  const mainW = mainSpecs.map((n) => nodeWidth(n, measure));
  const serviceW = serviceSpecs.map((n) => nodeWidth(n, measure));
  const cronW = cronSpec ? nodeWidth(cronSpec, measure) : 0;
  const railNeed = 2 * MARGIN + sum(mainW) + 3 * RAIL_GAP_MIN;
  const servicesNeed = 2 * MARGIN + sum(serviceW) + (serviceSpecs.length - 1) * SERVICE_GAP;
  const vbW = Math.max(VB_MIN_W, Math.ceil(railNeed), Math.ceil(servicesNeed));

  // ── The rail: four nodes spread across the width ───────────────────
  const railGap = (vbW - 2 * MARGIN - sum(mainW)) / 3;
  const mainTop = RAIL_Y - MAIN_H / 2;
  const mainBottom = RAIL_Y + MAIN_H / 2;
  let x = MARGIN;
  const main = mainSpecs.map((n, i) => {
    const node = { ...n, x, w: mainW[i], y: mainTop, h: MAIN_H, text: textRows(MAIN_H) };
    x += mainW[i] + railGap;
    return node;
  });
  const serve = main[3];
  const fanX = serve.x + serve.w / 2;

  // ── The cron, centred over the runtime node ────────────────────────
  const cron = cronSpec
    ? {
        ...cronSpec,
        w: cronW,
        x: Math.min(Math.max(MARGIN, fanX - cronW / 2), vbW - MARGIN - cronW),
        y: CRON_Y,
        h: CRON_H,
        text: textRows(CRON_H),
      }
    : null;

  // ── The services, right-aligned under the runtime node ─────────────
  let sx = vbW - MARGIN - (sum(serviceW) + (serviceSpecs.length - 1) * SERVICE_GAP);
  const services = serviceSpecs.map((s, i) => {
    const node = { ...s, x: sx, w: serviceW[i], y: SERVICE_Y, h: SERVICE_H, text: textRows(SERVICE_H) };
    sx += serviceW[i] + SERVICE_GAP;
    return node;
  });
  const cx = (s) => s.x + s.w / 2;
  // Fan order: nearest the trunk first, so the signal reads as spreading.
  const fanOrder = [...services].sort((a, b) => Math.abs(cx(a) - fanX) - Math.abs(cx(b) - fanX));

  // ── Edges the packets travel (rail, cron, and one full route per service)
  const edges = [
    ...main.slice(0, -1).map((n, i) => {
      const x2 = main[i + 1].x - HEAD_GAP;
      return {
        id: `e-${n.id}`,
        from: n.id,
        to: main[i + 1].id,
        d: `M${n.x + n.w} ${RAIL_Y} H${x2}`,
        head: { x: x2, y: RAIL_Y, dir: 'right' },
        visible: true,
        drawDelay: 0.1 + i * 0.42,
      };
    }),
    ...(cron
      ? [
          {
            id: 'e-cron',
            from: 'cron',
            to: 'serve',
            d: `M${fanX} ${cron.y + cron.h} V${mainTop - HEAD_GAP}`,
            head: { x: fanX, y: mainTop - HEAD_GAP, dir: 'down' },
            visible: true,
            drawDelay: 1.45,
          },
        ]
      : []),
    ...services.map((s) => ({
      id: `e-${s.id}`,
      from: 'serve',
      to: s.id,
      d: orthogonalRoute(fanX, mainBottom, cx(s), SERVICE_Y - HEAD_GAP),
      head: { x: cx(s), y: SERVICE_Y - HEAD_GAP, dir: 'down' },
      visible: false,
    })),
  ];

  // ── The visible fan: trunk, bus(es), drops — drawn once, never overlapped
  const r = CORNER_R;
  const straight = services.filter((s) => Math.abs(cx(s) - fanX) < 2 * r + 2);
  const left = services.filter((s) => cx(s) <= fanX - (2 * r + 2)).sort((a, b) => cx(b) - cx(a));
  const right = services.filter((s) => cx(s) >= fanX + (2 * r + 2)).sort((a, b) => cx(a) - cx(b));
  const strokes = [
    { id: 's-trunk', d: `M${fanX} ${mainBottom} V${BUS_Y - r}`, drawDelay: 1.5 },
  ];
  if (left.length) {
    const end = cx(left[left.length - 1]) + r;
    strokes.push({
      id: 's-bus-left',
      d: `M${fanX} ${BUS_Y - r} Q${fanX} ${BUS_Y} ${fanX - r} ${BUS_Y} H${end}`,
      drawDelay: 1.65,
    });
  }
  if (right.length) {
    const end = cx(right[right.length - 1]) - r;
    strokes.push({
      id: 's-bus-right',
      d: `M${fanX} ${BUS_Y - r} Q${fanX} ${BUS_Y} ${fanX + r} ${BUS_Y} H${end}`,
      drawDelay: 1.65,
    });
  }
  straight.forEach((s) => {
    strokes.push({
      id: `s-drop-${s.id}`,
      d: `M${fanX} ${BUS_Y - r} V${SERVICE_Y - HEAD_GAP}`,
      head: { x: fanX, y: SERVICE_Y - HEAD_GAP, dir: 'down' },
      drawDelay: 1.85,
    });
  });
  const dropDelay = (i) => 1.85 + i * 0.1;
  left.forEach((s, i) => {
    const c = cx(s);
    strokes.push({
      id: `s-drop-${s.id}`,
      d: `M${c + r} ${BUS_Y} Q${c} ${BUS_Y} ${c} ${BUS_Y + r} V${SERVICE_Y - HEAD_GAP}`,
      head: { x: c, y: SERVICE_Y - HEAD_GAP, dir: 'down' },
      drawDelay: dropDelay(i),
    });
  });
  right.forEach((s, i) => {
    const c = cx(s);
    strokes.push({
      id: `s-drop-${s.id}`,
      d: `M${c - r} ${BUS_Y} Q${c} ${BUS_Y} ${c} ${BUS_Y + r} V${SERVICE_Y - HEAD_GAP}`,
      head: { x: c, y: SERVICE_Y - HEAD_GAP, dir: 'down' },
      drawDelay: dropDelay(i),
    });
  });

  // ── Node reveal order (each rises as its edge lands) ───────────────
  const landing = Object.fromEntries(fanOrder.map((s, i) => [s.id, 1.95 + i * 0.1]));
  const nodes = [
    { ...main[0], delay: 0 },
    ...main.slice(1).map((n, i) => ({ ...n, delay: 0.1 + i * 0.42 + 0.42 })),
    ...(cron ? [{ ...cron, delay: 1.8 }] : []),
    ...services.map((s) => ({ ...s, delay: landing[s.id] })),
  ];

  // The CI lanes (one per workflow) and the build's progress hairline live
  // along the bottom inside of their nodes.
  const barBox = (n) => ({ x: n.x + PAD_X, y: n.y + n.h - 11, w: n.w - 2 * PAD_X, h: BAR_H });
  const laneBox = { ...barBox(main[1]), count: workflows ? workflows.length : 0, gap: 3 };
  const progressBox = barBox(main[2]);

  return {
    vb: { w: vbW, h: VB_H },
    nodes,
    edges,
    strokes,
    fanX,
    mainTop,
    mainBottom,
    workflows,
    cron,
    // What the daily cron actually reaches: work-status and repo-refresh,
    // both GitHub GraphQL consumers.
    cronTarget: 'graphql',
    services,
    fanOrder: fanOrder.map((s) => s.id),
    laneBox,
    progressBox,
  };
}

// ── The flow: one loop of a commit becoming compute ──────────────────
// Times in seconds from the loop start. Comets ride an edge (`dir` 1 along
// its path, -1 back), nodes go hot when a comet lands (with a ripple at the
// point of entry), the CI lanes fill one workflow at a time, the build's
// hairline fills, and the daily cron drops in at the end to warm the GraphQL
// consumers. The loop rests for a beat and starts again.
export const FLOW = { hop: 0.9, run: 2.2, compile: 1.5, fan: 0.85, stagger: 0.1, rest: 0.25 };

export function buildTimeline(graph) {
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  const leftMid = (n) => ({ x: n.x, y: n.y + n.h / 2 });
  const topMid = (n) => ({ x: n.x + n.w / 2, y: n.y });
  const bottomMid = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h });

  const comets = [];
  const hots = [];
  let t = 0;
  const laneCount = graph.laneBox.count;
  const rightMid = (n) => ({ x: n.x + n.w, y: n.y + n.h / 2 });

  // The source lights as it emits — a push leaves GitHub.
  hots.push({ node: 'github', t0: t, dur: 0.5, at: rightMid(byId.github) });
  comets.push({ edge: 'e-github', t0: t, dur: FLOW.hop, dir: 1, tone: 'ember', tag: 'push' });
  t += FLOW.hop;
  hots.push({ node: 'actions', t0: t, dur: 0.6, at: leftMid(byId.actions) });
  const lanes = { t0: t, dur: laneCount ? FLOW.run : 0.6, count: laneCount };
  t += lanes.dur + FLOW.rest;

  comets.push({
    edge: 'e-actions',
    t0: t,
    dur: FLOW.hop,
    dir: 1,
    tone: 'ember',
    tag: laneCount ? `${laneCount}/${laneCount} ✓` : '✓',
  });
  t += FLOW.hop;
  hots.push({ node: 'build', t0: t, dur: 0.6, at: leftMid(byId.build) });
  const progress = { t0: t, dur: FLOW.compile };
  t += FLOW.compile + FLOW.rest;

  comets.push({ edge: 'e-build', t0: t, dur: FLOW.hop, dir: 1, tone: 'ember', tag: 'deploy' });
  t += FLOW.hop;
  hots.push({ node: 'serve', t0: t, dur: 0.8, big: true, at: leftMid(byId.serve) });
  t += 0.35;

  // Requests fan out nearest-first, responses come back in the same order.
  const fan = graph.fanOrder.filter((id) => edgeIds.has(`e-${id}`));
  fan.forEach((id, j) => {
    const t0 = t + j * FLOW.stagger;
    comets.push({ edge: `e-${id}`, t0, dur: FLOW.fan, dir: 1, tone: 'ember' });
    hots.push({ node: id, t0: t0 + FLOW.fan, dur: 0.5, at: topMid(byId[id]) });
  });
  t += (fan.length - 1) * FLOW.stagger + FLOW.fan + 0.3;
  fan.forEach((id, j) => {
    const t0 = t + j * FLOW.stagger;
    comets.push({ edge: `e-${id}`, t0, dur: FLOW.fan, dir: -1, tone: 'gold' });
    hots.push({ node: 'serve', t0: t0 + FLOW.fan, dur: 0.35, at: bottomMid(byId.serve) });
  });
  t += (fan.length - 1) * FLOW.stagger + FLOW.fan + 0.7;

  // The daily cron: down into the runtime, out to GraphQL, and back.
  if (graph.cron && edgeIds.has('e-cron')) {
    // The schedule fires: the cron lights as its packet leaves.
    hots.push({ node: 'cron', t0: t, dur: 0.5, at: bottomMid(byId.cron) });
    comets.push({ edge: 'e-cron', t0: t, dur: 0.7, dir: 1, tone: 'amber', tag: 'warmup', tagSide: 'right' });
    t += 0.7;
    hots.push({ node: 'serve', t0: t, dur: 0.5, at: topMid(byId.serve) });
    t += 0.25;
    const target = graph.cronTarget;
    if (target && edgeIds.has(`e-${target}`) && byId[target]) {
      comets.push({ edge: `e-${target}`, t0: t, dur: FLOW.fan, dir: 1, tone: 'amber' });
      t += FLOW.fan;
      hots.push({ node: target, t0: t, dur: 0.5, at: topMid(byId[target]) });
      t += 0.3;
      comets.push({ edge: `e-${target}`, t0: t, dur: FLOW.fan, dir: -1, tone: 'gold' });
      t += FLOW.fan;
      hots.push({ node: 'serve', t0: t, dur: 0.4, at: bottomMid(byId.serve) });
    }
  }

  return { period: t + 1.0, comets, hots, lanes, progress, drain: 0.3 };
}
