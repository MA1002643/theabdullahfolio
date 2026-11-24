import Chapter from './Chapter';
import StatementFill from '../StatementFill';

// Chapter 2, the problem statement (issue #31, M4). The chapter is tall and
// the statement pins inside it (`.cs-statement` in globals.css), so the
// word-by-word fill spans more than a viewport of scroll. The full sentence
// is server HTML; StatementFill only recolours its words.
export default function Statement({ anchor, title, number, body }) {
  return (
    <Chapter anchor={anchor} title={title} number={number} className="cs-chapter--statement">
      <StatementFill text={body} className="cs-statement__text" />
    </Chapter>
  );
}
