'use client';

import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { m, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStaticMotion } from '@/components/motion/useStaticMotion';
import { useDirection } from '@/i18n/useDirection';
import { DIAGRAMS, pathEnds } from './diagrams';

// M7: the architecture diagram draws itself (issue #31).
//
// Each edge is dashed to its MEASURED length (getTotalLength(), never
// pathLength="1": normalised lengths drift from the rendered stroke at some
// scales, the /about SVG lesson) and its dash offset runs from that length
// to 0 across the edge's slice of the chapter's scroll window. A port (a
// small disc) marks where each wire meets a box, lighting as its wire
// arrives. Nodes appear as the first edge that touches them begins.
//
// Nodes are HTML, inside <foreignObject> (owner review, 2026-11-15): SVG
// <text> cannot wrap, so a label longer than its box simply ran out of it —
// in English already, and worse in German or Russian. As HTML the label
// wraps, and the card wears the About page's frame (`abt-frame`, the gold
// hairline and glow) by sharing the class rather than a copied colour. The
// <foreignObject> is larger than the card by `PAD` on every side so the glow
// is not clipped, and the card is centred inside it.
//
// Right to left: the wiring is mirrored across the diagram's width by an SVG
// transform, and each node is placed at `width − x`, so a request still
// travels in the reading direction while the labels keep their own text
// direction (they are never inside the mirroring transform).
//
// Drawn complete on the server, before measurement, under reduced motion and
// in static mode. The SVG is presentational (aria-hidden): the figure's text
// equivalent is the list CaseStudy renders beside it.

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const DRAW_START = 0.05;
const DRAW_SPAN = 0.8;
const PAD = 16;
const PORT_R = 3.5;

function Ports({ d }) {
  const { start, end } = pathEnds(d);
  return (
    <>
      <circle cx={start[0]} cy={start[1]} r={PORT_R} className="cs-diagram__port" />
      <circle cx={end[0]} cy={end[1]} r={PORT_R} className="cs-diagram__port" />
    </>
  );
}

function Edge({ d, length, progress, range, plain }) {
  const offset = useTransform(progress, range, [length ?? 0, 0]);
  const portOpacity = useTransform(progress, [range[0], range[0] + (range[1] - range[0]) * 0.3], [0, 1]);
  if (plain || length == null) {
    return (
      <g>
        <path d={d} className="cs-diagram__edge" />
        <Ports d={d} />
      </g>
    );
  }
  return (
    <g>
      <m.path d={d} className="cs-diagram__edge" style={{ strokeDasharray: length, strokeDashoffset: offset }} />
      <m.g style={{ opacity: portOpacity }}>
        <Ports d={d} />
      </m.g>
    </g>
  );
}

function Node({ x, y, box, label, progress, range, plain }) {
  const opacity = useTransform(progress, range, [0, 1]);
  const Tag = plain ? 'g' : m.g;
  return (
    <Tag style={plain ? undefined : { opacity }}>
      <foreignObject
        x={x - box.w / 2 - PAD}
        y={y - box.h / 2 - PAD}
        width={box.w + PAD * 2}
        height={box.h + PAD * 2}
        className="cs-diagram__slot"
      >
        <div className="cs-diagram__well">
          <div className="abt-frame cs-card cs-diagram__node" style={{ width: box.w, minHeight: box.h }}>
            <span className="cs-diagram__title">{label?.title}</span>
            <span className="cs-diagram__detail">{label?.detail}</span>
          </div>
        </div>
      </foreignObject>
    </Tag>
  );
}

export default function ArchitectureDiagram({ diagram, labels }) {
  const spec = DIAGRAMS[diagram];
  const ref = useRef(null);
  const pathRefs = useRef([]);
  const [lengths, setLengths] = useState(null);
  const reduced = useReducedMotion();
  const isStatic = useStaticMotion();
  const { isRtl } = useDirection();
  const plain = reduced || isStatic;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.9', 'end 0.55'] });

  useIsoLayoutEffect(() => {
    setLengths(pathRefs.current.map((p) => (p?.getTotalLength ? p.getTotalLength() : null)));
  }, [diagram]);

  if (!spec) return null;
  const n = spec.edges.length;
  const edgeRange = (i) => {
    const start = DRAW_START + (i / n) * DRAW_SPAN;
    return [start, start + DRAW_SPAN / n];
  };
  // A node appears with the first edge that touches it; a node no edge
  // touches appears with the first edge.
  const firstEdge = (id) => {
    const i = spec.edges.findIndex((e) => e.from === id || e.to === id);
    return i === -1 ? 0 : i;
  };
  const mirror = isRtl ? `translate(${spec.width} 0) scale(-1 1)` : undefined;
  const nodeX = (x) => (isRtl ? spec.width - x : x);

  return (
    <div ref={ref} className="cs-diagram">
      {/* Hidden measuring copies: lengths are read once from real paths. */}
      <svg aria-hidden="true" width="0" height="0" className="absolute" focusable="false">
        {spec.edges.map((e, i) => (
          <path key={i} ref={(el) => (pathRefs.current[i] = el)} d={e.d} />
        ))}
      </svg>
      <svg viewBox={spec.viewBox} aria-hidden="true" focusable="false" className="cs-diagram__svg">
        <g transform={mirror}>
          {spec.edges.map((e, i) => (
            <Edge
              key={`${e.from}-${e.to}`}
              d={e.d}
              length={lengths?.[i]}
              progress={scrollYProgress}
              range={edgeRange(i)}
              plain={plain}
            />
          ))}
        </g>
        <g>
          {spec.nodes.map((node) => {
            const [start] = edgeRange(firstEdge(node.id));
            return (
              <Node
                key={node.id}
                x={nodeX(node.x)}
                y={node.y}
                box={spec.box}
                label={labels[node.id]}
                progress={scrollYProgress}
                range={[start, start + 0.06]}
                plain={plain || lengths == null}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
