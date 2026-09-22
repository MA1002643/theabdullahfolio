import { describe, expect, it } from 'vitest';

import { journeyData, projectsData } from '@/app/data';
import { pruneEmpty } from '@/components/seo/JsonLd';
import { buildCv } from '@/lib/cv/buildCv';
import { cvPage } from '@/lib/seo/schema';
import { legalOrgName } from '@/lib/seo/site';

// ── Why this file exists ────────────────────────────────────────────────────
// /cv is the page most likely to be read by a person deciding whether to make
// contact, and the one whose content is derived rather than written. That
// combination is the risk: a derivation bug here is a factual error about
// someone's employment history, published on the page where it matters most,
// and it looks perfectly plausible on screen.
//
// So these assert the properties a reader would have to know the data to check
// — that nothing is dropped, nothing is invented, and the ordering is the one a
// CV reader expects — rather than snapshotting the rendered output.

const cv = buildCv();

describe('coverage: every journey entry reaches exactly one section', () => {
  it('loses nothing', () => {
    // The failure this catches is silent by nature: a `type` value that matches
    // no section filter simply vanishes from the page, and the page still looks
    // complete because nothing renders a gap.
    const rendered = [
      ...cv.experience,
      ...cv.education,
      ...cv.activities,
    ].map((entry) => entry.id);

    expect(rendered.slice().sort()).toEqual(
      journeyData.map((entry) => entry.id).sort(),
    );
  });

  it('files nothing twice', () => {
    const rendered = [...cv.experience, ...cv.education, ...cv.activities].map(
      (entry) => entry.id,
    );
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it('keeps representation posts out of employment', () => {
    // journeyData draws this line itself (`milestone` vs `career`) and the page
    // must not quietly erase it: a voluntary course-rep post listed under
    // Experience is a claim about employment that the source data does not make.
    const milestoneIds = journeyData
      .filter((entry) => entry.type === 'milestone')
      .map((entry) => entry.id);

    for (const id of milestoneIds) {
      expect(cv.experience.map((entry) => entry.id)).not.toContain(id);
      expect(cv.activities.map((entry) => entry.id)).toContain(id);
    }
  });
});

describe('ordering', () => {
  it('runs reverse-chronologically by start date', () => {
    const starts = cv.experience.map((entry) => entry.start);
    const sorted = starts.slice().sort().reverse();
    expect(starts).toEqual(sorted);
  });

  it('puts the current roles first', () => {
    // Not implied by the sort above — it holds only because the ongoing roles
    // also happen to be the most recently started. Asserted separately so a
    // future entry that breaks the coincidence is caught rather than absorbed.
    const firstFinished = cv.experience.findIndex((entry) => !entry.ongoing);
    const lastOngoing = cv.experience.map((e) => e.ongoing).lastIndexOf(true);
    if (firstFinished !== -1 && lastOngoing !== -1) {
      expect(lastOngoing).toBeLessThan(firstFinished);
    }
  });
});

describe('what each row states', () => {
  it('never prints the organisation twice', () => {
    // `title` is stored as "DevOps Engineer · C365Cloud" and `org` as
    // "C365Cloud". Rendering the stored title beside the stored org is the
    // obvious implementation and prints the employer twice on every row.
    for (const entry of cv.experience) {
      expect(entry.role).not.toContain(' · ');
      expect(entry.role).not.toContain(entry.org);
    }
  });

  it('uses the array\'s own date label rather than a second formatting', () => {
    for (const entry of [...cv.experience, ...cv.education]) {
      const source = journeyData.find((row) => row.id === entry.id);
      expect(entry.dates).toBe(source.dateLabel);
    }
  });

  it('states no computed tenure anywhere', () => {
    // A tenure baked at build time is wrong by construction for an ongoing
    // role — it freezes on the build date and drifts further every day the site
    // is not rebuilt. The date range is the only figure that stays true, so
    // nothing on this model may look like a duration.
    const durationish = /\b\d+\s*(yr|year|mo|month)s?\b/i;
    for (const entry of [...cv.experience, ...cv.education, ...cv.activities]) {
      expect(entry.dates).not.toMatch(durationish);
    }
  });
});

describe('projects', () => {
  it('lists public projects only', () => {
    const listed = cv.projects.map((project) => project.id);
    for (const project of projectsData) {
      if (project.private) expect(listed).not.toContain(project.id);
      else expect(listed).toContain(project.id);
    }
  });

  it('runs newest first', () => {
    const dates = cv.projects.map((project) => project.date);
    expect(dates).toEqual(dates.slice().sort().reverse());
  });
});

describe('the published JSON-LD', () => {
  const published = pruneEmpty(
    cvPage({
      experience: cv.experience,
      education: cv.education,
      knowsAbout: ['JavaScript'],
    }),
  );

  it('declares itself a ProfilePage about the site-wide Person', () => {
    expect(published['@type']).toBe('ProfilePage');
    expect(published['@id']).toBe('https://ma.codes/cv#page');
    // The SAME `@id` the root layout's graph defines, which is what makes this
    // a node merge rather than a competing second person.
    expect(published.mainEntity['@id']).toBe('https://ma.codes/#person');
  });

  it('ties the HTML CV to the PDF', () => {
    expect(published.significantLink).toBe(
      'https://ma.codes/Muhammad_Abdullah_CV.pdf',
    );
  });

  it('states each role title once', () => {
    const names = published.mainEntity.hasOccupation.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    // Vacuity guard — an empty list would satisfy the uniqueness check above.
    expect(names).toContain('Software Engineer');
  });

  it('publishes institutions under a resolvable name', () => {
    const names = published.mainEntity.alumniOf.map((org) => org.name);
    // "MMU" is the label the timeline shows and is not an entity any consumer
    // can resolve. The published claim must be the institution's own name.
    expect(names).not.toContain('MMU');
    expect(names).toContain('Manchester Metropolitan University');
  });

  it('passes an unmapped organisation through unchanged', () => {
    // Adding an institution to journeyData must never require editing the map
    // first — an unmapped label degrades to today's behaviour rather than to
    // undefined.
    expect(legalOrgName('Somewhere Not In The Map')).toBe(
      'Somewhere Not In The Map',
    );
  });

  it('makes no single-employer claim', () => {
    // `worksFor` takes one Organization, and the current state is two
    // concurrent roles. Publishing either one asserts an exclusivity the data
    // does not support — see the note on cvPage.
    expect(published.mainEntity).not.toHaveProperty('worksFor');
  });

  it('omits the occupation list entirely when there is no experience', () => {
    const empty = pruneEmpty(cvPage({ experience: [], education: [] }));
    expect(empty.mainEntity ?? {}).not.toHaveProperty('hasOccupation');
    expect(empty.mainEntity ?? {}).not.toHaveProperty('alumniOf');
  });
});
