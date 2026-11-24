import Chapter from './Chapter';
import CountFigure from '../CountFigure';
import { Rise } from '../reveal';

// Chapter 7, outcomes (issue #31, M8). Every figure is resolved at build by
// CaseStudy.jsx (resolveFigure in src/lib/caseStudy/figures.js), so a count
// is read from the thing it counts and cannot drift (CLAUDE.md §2). The final
// number is in the server HTML; CountFigure only animates the visual digits.
//
// A <dl> again: each figure is announced with its label. Each pair is a tile
// wearing the About page's frame (`abt-frame`).
export default function Outcomes({ anchor, title, number, items, locale, derivedNote }) {
  return (
    <Chapter anchor={anchor} title={title} number={number} className="cs-outcomes">
      <dl className="cs-outcomes__grid">
        {items.map((item, i) => (
          <Rise key={item.id} order={1 + i * 0.5} className="abt-frame cs-card cs-outcomes__item">
            <dt className="cs-outcomes__label">{item.label}</dt>
            <dd className="cs-outcomes__value">
              <CountFigure value={item.value} locale={locale} />
            </dd>
          </Rise>
        ))}
      </dl>
      {derivedNote ? (
        <Rise as="p" order={2 + items.length * 0.5} className="cs-muted cs-outcomes__note">
          {derivedNote}
        </Rise>
      ) : null}
    </Chapter>
  );
}
