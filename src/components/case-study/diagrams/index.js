// Architecture diagrams for the case studies (issue #31, M7), keyed by the
// `diagram` field of an `architecture` chapter in data.js.
//
// Geometry only. The node labels are visitor-facing copy and live in
// messages/<locale>/ProjectDetail.json under `diagrams.<key>.<nodeId>`
// (`title` and `detail`), so the same drawing reads in every language. Each
// node is rendered as HTML inside a <foreignObject> of `box` size (owner
// review, 2026-11-15: SVG <text> cannot wrap, and three English details
// already ran past their 168-unit boxes; a German or Russian label would
// have run further). The box is sized for a two-line detail, and a longer
// label wraps and grows the card instead of escaping it.
//
// `edges` are listed in DRAW ORDER: the diagram draws them one after another
// as the chapter scrolls through, and each node appears when the first edge
// touching it starts to draw (its `order` below), so the system assembles
// itself in the order a request travels through it. Paths are orthogonal so
// they read as wiring rather than decoration, and each starts and ends on a
// box edge: box half-width is 92, half-height 42.
//
// Under right to left the wiring is mirrored across `width`
// (ArchitectureDiagram.jsx), so a request still travels in the reading
// direction; the HTML labels are placed at the mirrored x, never transformed.

const BOX = { w: 184, h: 84 };

const theabdullahfolio = {
  viewBox: '0 0 1080 660',
  width: 1080,
  box: BOX,
  nodes: [
    { id: 'visitor', x: 100, y: 310, order: 0 },
    { id: 'edge', x: 316, y: 310, order: 1 },
    { id: 'app', x: 540, y: 310, order: 2 },
    { id: 'content', x: 540, y: 110, order: 3 },
    { id: 'notes', x: 540, y: 510, order: 4 },
    { id: 'client', x: 764, y: 310, order: 5 },
    { id: 'api', x: 764, y: 510, order: 6 },
    { id: 'kv', x: 988, y: 410, order: 7 },
    { id: 'github', x: 988, y: 510, order: 8 },
    { id: 'gateway', x: 988, y: 610, order: 9 },
  ],
  edges: [
    { from: 'visitor', to: 'edge', d: 'M192 310 H224' },
    { from: 'edge', to: 'app', d: 'M408 310 H448' },
    { from: 'content', to: 'app', d: 'M540 152 V268' },
    { from: 'notes', to: 'app', d: 'M540 468 V352' },
    { from: 'app', to: 'client', d: 'M632 310 H672' },
    { from: 'client', to: 'api', d: 'M764 352 V468' },
    { from: 'api', to: 'kv', d: 'M856 510 H876 V410 H896' },
    { from: 'api', to: 'github', d: 'M856 510 H896' },
    { from: 'api', to: 'gateway', d: 'M856 510 H876 V610 H896' },
  ],
};

export const DIAGRAMS = Object.freeze({ theabdullahfolio });

/** Node ids of a diagram, in reading order (used by the text equivalent). */
export const diagramNodeIds = (key) =>
  [...(DIAGRAMS[key]?.nodes ?? [])].sort((a, b) => a.order - b.order).map((n) => n.id);

/**
 * The two ends of an orthogonal path made of absolute M, H and V commands
 * (the only commands the diagrams use), for the ports drawn where a wire
 * meets a box. Throws on any other command, so a curve added to a future
 * diagram fails loudly here instead of drawing its ports at the wrong spot.
 *
 * @param {string} d
 * @returns {{ start: [number, number], end: [number, number] }}
 */
export function pathEnds(d) {
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  let x = 0;
  let y = 0;
  let start = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === 'M') {
      x = Number(tokens[i + 1]);
      y = Number(tokens[i + 2]);
      i += 2;
      start ??= [x, y];
    } else if (t === 'H') {
      x = Number(tokens[i + 1]);
      i += 1;
    } else if (t === 'V') {
      y = Number(tokens[i + 1]);
      i += 1;
    } else if (/[A-Za-z]/.test(t)) {
      throw new Error(`pathEnds: unsupported command "${t}" in "${d}"`);
    }
  }
  return { start: start ?? [x, y], end: [x, y] };
}
