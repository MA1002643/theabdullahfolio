import Chapter from './Chapter';
import NoteCard from '../NoteCard';

// Chapter 6, craft notes (issue #31): one card per decision, each linking to
// the engineering note that records it. The cards wear the About page's
// frame (`abt-frame`, the gold hairline and glow) and carry a two-digit
// numeral (`counters`, formatted in the reader's digits by CaseStudy.jsx) so
// the decisions read as a numbered set. Since the owner request of
// 2026-11-23 each card is a client island (NoteCard.jsx) that reveals as a
// choreographed cascade when it enters the viewport; this file stays a
// Server Component so the words remain server HTML.
//
// Every card's link reads the same ("Read the note"), so on its own it would
// be ambiguous in a links list. The link's NAME stays the visible words (WCAG
// 2.5.3), and `aria-describedby` points at the card's heading, so assistive
// tech announces "Read the note, Motion that is allowed to arrive late".
//
// Plain locale-aware Link (inside NoteCard): /notes/* is prerendered, and
// the prefetch is the default viewport one.
export default function Notes({ anchor, title, number, items, counters = [], readLabel }) {
  return (
    <Chapter anchor={anchor} title={title} number={number} className="cs-notes">
      <ul className="cs-notes__grid">
        {items.map((item, i) => (
          <NoteCard
            key={item.id}
            item={item}
            index={i}
            counter={counters[i]}
            headingId={`${anchor}-${item.id}`}
            readLabel={readLabel}
          />
        ))}
      </ul>
    </Chapter>
  );
}
