import HeroTitle from '../HeroTitle';
import HeroMedia from '../HeroMedia';
import { HeroReveal, Rise } from '../reveal';
import { dur, stagger } from '@/lib/motion/caseStudy';

// Chapter 0, the hero (issue #31): eyebrow, the project name as the page's
// only <h1>, a one-line thesis, the outbound links, and the hero media.
//
// Choreography (M1): eyebrow, then the name, then the thesis line by line,
// then the links, each on the stagger token after what it depends on. All of
// it waits for the Ember Passage to lift (HeroReveal). The media is the LCP
// candidate and is never faded: it is painted at once and only its transform
// moves with scroll (M2).

const NAME_AT = stagger.line;
const THESIS_AT = NAME_AT + dur.base * 0.5;
const LINKS_AT = THESIS_AT + dur.base;

export default function Hero({ name, eyebrow, thesis, links, labels, media }) {
  return (
    <header className="cs-hero">
      <HeroReveal>
        {/* The header is full-width so the media can bleed (M2); the text
            keeps the content column through this wrapper. */}
        <div className="cs-hero__inner">
          <div className="cs-hero__text">
            <Rise as="p" delay={0} className="cs-eyebrow">
              {eyebrow}
            </Rise>
            <HeroTitle
              as="h1"
              text={name}
              delay={NAME_AT}
              className="cs-hero__title"
              translate="no"
            />
            {thesis ? (
              <HeroTitle
                as="p"
                text={thesis}
                delay={THESIS_AT}
                className="cs-hero__thesis"
                fire
              />
            ) : null}
            {/* A navigation landmark, as the old intro had: a screen-reader user
              jumps straight to a project's outbound links. Only when there is
              a link: an empty landmark announces somewhere to go and has none. */}
            {links.demo || links.source ? (
              <Rise as="nav" delay={LINKS_AT} aria-label={labels.linksLabel}>
                <ul className="cs-hero__links">
                  {links.demo ? (
                    <li>
                      <a
                        href={links.demo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cs-cta abt-frame"
                      >
                        {labels.liveDemo}
                      </a>
                    </li>
                  ) : null}
                  {links.source ? (
                    <li>
                      <a
                        href={links.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cs-link"
                      >
                        {labels.source}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </Rise>
            ) : null}
            {links.private ? (
              <Rise as="p" delay={LINKS_AT} className="cs-muted">
                {labels.private}
              </Rise>
            ) : null}
          </div>
        </div>
        {media ? <HeroMedia {...media} /> : null}
      </HeroReveal>
    </header>
  );
}
