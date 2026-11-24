import Chapter from './Chapter';
import Walkthrough from '../Walkthrough';

// Chapter 3, the walkthrough (issue #31, M5). `counters` are the step labels
// ("01", "02", …) already formatted in the page's locale by CaseStudy.jsx, so
// the client island receives strings, never a formatter.
export default function WalkthroughChapter({ anchor, title, number, steps, counters }) {
  return (
    <Chapter anchor={anchor} title={title} number={number}>
      <Walkthrough steps={steps} counters={counters} />
    </Chapter>
  );
}
