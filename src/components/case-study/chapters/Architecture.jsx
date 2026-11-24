import Chapter from './Chapter';
import ArchitectureDiagram from '../ArchitectureDiagram';
import { Rise } from '../reveal';

// Chapter 5, architecture (issue #31, M7). The drawing is presentational
// (aria-hidden) and draws itself with scroll; its text equivalent is the
// ordered list below it, in the order a request travels through the system.
// That list is real server HTML, so a screen reader, a crawler and a no-JS
// reader all get the whole system, part by part.
//
// `labels` maps node id to `{ title, detail }`, already translated;
// `nodeIds` is the reading order (diagramNodeIds).
export default function Architecture({ anchor, title, number, body, diagram, labels, nodeIds, listLabel }) {
  return (
    <Chapter anchor={anchor} title={title} number={number} className="cs-architecture">
      {body ? (
        <Rise as="p" order={1} className="cs-body">
          {body}
        </Rise>
      ) : null}
      <figure className="cs-architecture__figure">
        <ArchitectureDiagram diagram={diagram} labels={labels} />
        <ol className="cs-architecture__list" aria-label={listLabel}>
          {nodeIds.map((id) => (
            <li key={id}>
              <span className="cs-architecture__part">{labels[id]?.title}</span>
              {/* The separator is markup, not copy: each half is its own
                  translated string, never a concatenated sentence. */}
              <span className="cs-muted"> · {labels[id]?.detail}</span>
            </li>
          ))}
        </ol>
      </figure>
    </Chapter>
  );
}
