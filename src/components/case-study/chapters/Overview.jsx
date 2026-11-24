import Chapter from './Chapter';
import { Rise } from '../reveal';
import FactsPlate from '../FactsPlate';

// Chapter 1, overview (issue #31): a short summary and a facts plate. The
// facts are a <dl> (each `div` pairs a <dt> with its <dd>, which HTML
// allows), so a screen reader announces each label with its value; the dl
// and its masks live in FactsPlate, whose entrance writes the ledger fact by
// fact. The plate wears the About page's frame (`abt-frame`). `facts` is
// already resolved by CaseStudy.jsx: authored facts for a full case study,
// derived ones (category, start, repository) for the short form.
export default function Overview({ anchor, title, number, body, facts, factsLabel }) {
  return (
    <Chapter anchor={anchor} title={title} number={number}>
      {body ? (
        <Rise as="p" order={1} className="cs-lede">
          {body}
        </Rise>
      ) : null}
      <FactsPlate facts={facts} label={factsLabel} />
    </Chapter>
  );
}
