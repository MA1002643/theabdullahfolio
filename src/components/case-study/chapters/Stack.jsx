import Chapter from './Chapter';
import { Rise } from '../reveal';
import { StackGlyph, stackIconColor } from '../stackIcons';

// The "Built with" chapter (issue #31, owner review 2026-11-15): what the
// project is made of, as tiles grouped by kind: languages, frameworks,
// libraries, testing & tooling. It replaced the "Next project" hand-off.
//
// Every string arrives resolved from CaseStudy.jsx: group names from the
// ProjectDetail catalogue, item copy from the Data catalogue, and each
// version from the lockfile at build (src/lib/caseStudy/versions.js), never
// typed. A full case study authors its items; the short form gets the
// repository's languages (src/lib/caseStudy/stack.js) through the same tiles.
//
// Names and versions are code, not prose: `translate="no"`, and the version
// chip is `dir="ltr"` so "16.4.6" never prints backwards inside a
// right-to-left line. Each group is a list named by its heading, so a screen
// reader hears "Frameworks, list, 4 items" and then each tile's name,
// version and role in that order.
export default function Stack({ anchor, title, number, lead, groups, derivedNote }) {
  let order = 1;
  return (
    <Chapter anchor={anchor} title={title} number={number} className="cs-stack">
      {lead ? (
        <Rise as="p" order={order++} className="cs-lede cs-stack__lead">
          {lead}
        </Rise>
      ) : null}
      {groups.map((group) => {
        const headingId = `${anchor}-${group.id}`;
        const headOrder = order++;
        return (
          <section key={group.id} className="cs-stack__group" aria-labelledby={headingId}>
            <Rise order={headOrder} className="cs-stack__head">
              <h3 id={headingId} className="cs-stack__cat">
                {group.label}
              </h3>
              <span aria-hidden="true" className="cs-stack__rule" />
              <span className="cs-stack__tally" aria-hidden="true">
                {group.count}
              </span>
            </Rise>
            <ul className="cs-stack__grid">
              {group.items.map((item, i) => {
                const mark = stackIconColor(item.icon);
                return (
                <Rise
                  as="li"
                  key={item.id}
                  order={headOrder + 0.5 + i * 0.35}
                  className="abt-frame cs-card cs-stack__tile"
                  style={mark ? { '--mark': mark } : undefined}
                >
                  <span className="cs-stack__icon">
                    <StackGlyph icon={item.icon} label={item.label} className="cs-stack__glyph" />
                  </span>
                  <span className="cs-stack__text">
                    <span className="cs-stack__row">
                      <span className="cs-stack__name" translate="no">
                        {item.label}
                      </span>
                      {item.version ? (
                        <span className="cs-stack__version" translate="no" dir="ltr">
                          <span className="sr-only">{item.versionLabel}</span>
                          <span aria-hidden="true">{item.version}</span>
                        </span>
                      ) : null}
                    </span>
                    {item.body ? <span className="cs-stack__role">{item.body}</span> : null}
                  </span>
                </Rise>
                );
              })}
            </ul>
          </section>
        );
      })}
      {derivedNote ? (
        <Rise as="p" order={order + 1} className="cs-muted cs-stack__note">
          {derivedNote}
        </Rise>
      ) : null}
    </Chapter>
  );
}
