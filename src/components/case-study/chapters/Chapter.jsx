import { ChapterReveal } from '../reveal';
import ChapterHeading from '../ChapterHeading';

// Every chapter's frame (issue #31): a real <section> at its `#chapter-<type>`
// anchor, labelled by its <h2>. The heading takes programmatic focus
// (tabIndex -1, kept by ChapterHeading) so a jump from the index or the
// palette continues reading from it, and `scroll-margin` (CSS) clears the
// floating projects button.
//
// `number` is the chapter's two-digit ordinal, already formatted in the
// page's locale by CaseStudy.jsx. It is decoration beside the heading
// (aria-hidden), never part of the heading's name: the index, the ⌘K jumps
// and the heading must keep saying the same words.
//
// Server Component. The reveal scope and the heading's molten entrance are
// client islands; the heading TEXT and everything in `children` is server
// HTML.
export default function Chapter({ anchor, title, number, className = '', children, headingClassName = 'cs-h2' }) {
  const headingId = `${anchor}-title`;
  return (
    <section id={anchor} aria-labelledby={headingId} className={`cs-chapter ${className}`}>
      <ChapterReveal>
        <ChapterHeading id={headingId} text={title} number={number} className={headingClassName} />
        {children}
      </ChapterReveal>
    </section>
  );
}
