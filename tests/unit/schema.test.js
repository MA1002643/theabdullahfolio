import { describe, expect, it } from 'vitest';
import { journeyData, projectsData, usesData } from '@/app/data';
import { pruneEmpty, serializeJsonLd } from '@/components/seo/JsonLd';
import {
  PERSON_ID,
  WEBSITE_ID,
  breadcrumbList,
  personGraph,
  profilePage,
  projectId,
  projectPage,
  projectsCollection,
  qualificationsPage,
  sectionPage,
} from '@/lib/seo/schema';
import {
  ORIGIN,
  credentialsFromJourney,
  knowsAboutFromStack,
} from '@/lib/seo/site';

// ── Structured-data tests (issue #32, W2 + W5) ──────────────────────────────
// Two classes of failure here, and neither surfaces in production:
//
//   1. A BROKEN GRAPH. Google's Rich Results Test validates each node's own
//      properties; it does not check that `{'@id': '…#person'}` resolves to a
//      node that exists. A typo in one id leaves the reference dangling, every
//      validator stays green, and the entity silently stops being connected —
//      which is the entire point of P3.
//   2. A `null` or `undefined` LEAKING into output. `"codeRepository": null` is
//      an error in the Rich Results Test, and the builders compose from real
//      data where fields are legitimately absent (private repos have no public
//      URL, ongoing study has no end date).
//
// Plus the serialiser, which is a security boundary rather than a formatting
// concern — see the module note in JsonLd.jsx.

/** Every `@id` DEFINED anywhere in a JSON-LD document. */
function definedIds(node, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) definedIds(item, found);
    return found;
  }
  if (node && typeof node === 'object') {
    // A node DEFINES an id when it also says what type it is. An object holding
    // only `@id` is a reference, not a definition — that distinction is the
    // whole test.
    if (node['@id'] && node['@type']) found.add(node['@id']);
    for (const value of Object.values(node)) definedIds(value, found);
  }
  return found;
}

/** Every `@id` REFERENCED (as a bare pointer) in a JSON-LD document. */
function referencedIds(node, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) referencedIds(item, found);
    return found;
  }
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === '@id') found.add(node['@id']);
    for (const value of Object.values(node)) referencedIds(value, found);
  }
  return found;
}

/** Assert no nullish value survived into a document. */
function expectNoNullish(node, path = '$') {
  if (Array.isArray(node)) {
    node.forEach((item, index) => expectNoNullish(item, `${path}[${index}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      expect(value, `${path}.${key} is nullish`).not.toBeNull();
      expect(value, `${path}.${key} is undefined`).not.toBeUndefined();
      expectNoNullish(value, `${path}.${key}`);
    }
  }
}

describe('root entity graph', () => {
  const graph = personGraph();

  it('defines the Person and WebSite nodes once each', () => {
    const ids = definedIds(graph);
    expect(ids.has(PERSON_ID)).toBe(true);
    expect(ids.has(WEBSITE_ID)).toBe(true);

    // Exactly one Person node. Two definitions of one `@id` is how "has schema"
    // degrades back into unconnected blobs.
    const people = graph['@graph'].filter((node) => node['@type'] === 'Person');
    expect(people).toHaveLength(1);
  });

  it('carries the identity properties an answer engine needs', () => {
    const person = graph['@graph'].find((node) => node['@type'] === 'Person');

    expect(person.name).toBe('Muhammad Abdullah');
    expect(person.jobTitle).toBe('Software Engineer');
    expect(person.url).toBe(`${ORIGIN}/`);
    // `sameAs` is what lets an engine merge this node with the GitHub and
    // LinkedIn profiles it already holds. Without it the graph is a stranger.
    expect(person.sameAs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('github.com'),
        expect.stringContaining('linkedin.com'),
      ]),
    );
  });

  it('resolves every reference within the document', () => {
    const defined = definedIds(graph);
    const dangling = [...referencedIds(graph)].filter((id) => !defined.has(id));
    expect(dangling, `dangling @id references: ${dangling.join(', ')}`).toEqual(
      [],
    );
  });

  it('omits knowsAbout entirely when no skill data is supplied', () => {
    // P4: absent rather than empty. `"knowsAbout": []` is a claim that the
    // person knows about nothing.
    const person = personGraph()['@graph'].find(
      (node) => node['@type'] === 'Person',
    );
    expect(pruneEmpty(person)).not.toHaveProperty('knowsAbout');
  });

  it('leaks no nullish values', () => {
    expectNoNullish(pruneEmpty(graph));
  });
});

describe('per-surface documents', () => {
  it('/about attaches derived expertise to the same Person node', () => {
    const knowsAbout = knowsAboutFromStack(usesData.stack);
    const doc = profilePage({ knowsAbout });

    expect(doc['@type']).toBe('ProfilePage');
    // Same `@id` as the root graph's Person — JSON-LD merges nodes sharing an
    // id, so this ADDS expertise to the existing entity rather than creating a
    // second one.
    expect(doc.mainEntity['@id']).toBe(PERSON_ID);
    expect(doc.mainEntity.knowsAbout.length).toBeGreaterThan(10);
    // Derived from the /uses stack, so the schema claim and the visible page
    // cannot disagree.
    expect(doc.mainEntity.knowsAbout).toContain('TypeScript');
    expect(doc.mainEntity.knowsAbout).toContain('Next.js');
    // The long tail of micro-packages is excluded deliberately: `knowsAbout`
    // takes topics, and `nodemon` is not one.
    expect(doc.mainEntity.knowsAbout).not.toContain('nodemon');
    // No duplicates — the groups are concatenated, so a tool listed twice in
    // the source data would otherwise appear twice here.
    expect(new Set(doc.mainEntity.knowsAbout).size).toBe(
      doc.mainEntity.knowsAbout.length,
    );
    expectNoNullish(pruneEmpty(doc));
  });

  it('/projects lists every project, in order, by reference', () => {
    const doc = projectsCollection(projectsData);
    const list = doc.mainEntity;

    expect(list['@type']).toBe('ItemList');
    expect(list.numberOfItems).toBe(projectsData.length);
    expect(list.itemListElement).toHaveLength(projectsData.length);

    list.itemListElement.forEach((element, index) => {
      // 1-based ordinals: several consumers treat position 0 as missing.
      expect(element.position).toBe(index + 1);
      // A REFERENCE to the node defined on the detail page, not a copy of it.
      expect(element.item['@id']).toBe(projectId(projectsData[index].id));
      expect(Object.keys(element.item)).toEqual(['@id']);
    });
    expectNoNullish(pruneEmpty(doc));
  });

  it('/projects/[id] describes a public project with its repository', () => {
    const project = projectsData.find((p) => !p.private);
    const doc = pruneEmpty(projectPage(project));
    const code = doc['@graph'].find(
      (node) => node['@type'] === 'SoftwareSourceCode',
    );

    expect(code['@id']).toBe(projectId(project.id));
    expect(code.codeRepository).toBe(`https://github.com/${project.repo}`);
    // Straight from data.js — the repository's creation date, not invented.
    expect(code.dateCreated).toBe(project.date);
    expect(code.genre).toBe(project.category);
    expect(code.author['@id']).toBe(PERSON_ID);
    expectNoNullish(doc);
  });

  it('/projects/[id] omits codeRepository for a private project', () => {
    // Pointing a public schema property at a URL that answers 404 to every
    // reader is worse than saying nothing. `pruneEmpty` is what enforces it, so
    // the assertion is made against the pruned document that actually ships.
    const project = projectsData.find((p) => p.private);
    expect(
      project,
      'the fixture assumes at least one private project',
    ).toBeTruthy();

    const doc = pruneEmpty(projectPage(project));
    const code = doc['@graph'].find(
      (node) => node['@type'] === 'SoftwareSourceCode',
    );

    expect(code).not.toHaveProperty('codeRepository');
    // Everything else still present — the omission must be surgical.
    expect(code.name).toBe(project.name);
    expect(code.dateCreated).toBe(project.date);
  });

  it('/projects/[id] carries a terminating breadcrumb trail', () => {
    const doc = projectPage(projectsData[0]);
    const trail = doc['@graph'].find(
      (node) => node['@type'] === 'BreadcrumbList',
    );

    expect(trail.itemListElement).toHaveLength(3);
    expect(trail.itemListElement[0].item).toBe(`${ORIGIN}`);
    expect(trail.itemListElement[1].item).toBe(`${ORIGIN}/projects`);
    // The LAST crumb carries no `item`: it is the current page, and a self-link
    // is what makes the Rich Results Test warn about a non-terminating trail.
    expect(trail.itemListElement[2].item).toBeUndefined();
    expect(trail.itemListElement[2].name).toBe(projectsData[0].name);
  });

  it('/qualifications attaches real credentials to the Person', () => {
    const credentials = credentialsFromJourney(journeyData);
    const doc = pruneEmpty(qualificationsPage(credentials));

    expect(credentials.length).toBeGreaterThan(0);
    expect(doc.mainEntity['@id']).toBe(PERSON_ID);

    for (const credential of doc.mainEntity.hasCredential) {
      expect(credential['@type']).toBe('EducationalOccupationalCredential');
      expect(credential.name).toBeTruthy();
      // The awarding body is the half that makes a credential checkable.
      expect(credential.recognizedBy.name).toBeTruthy();
      expect(credential.credentialCategory).toMatch(/^(degree|diploma)$/);
      // Dated by the award, which every surviving entry has.
      expect(credential.dateCreated).toMatch(/^\d{4}-\d{2}/);
    }

    expectNoNullish(doc);
  });

  it('leaves study still in progress out of hasCredential', () => {
    // `hasCredential` is defined as "a credential AWARDED to the Person", so an
    // entry with no completion cannot appear under it at all. An earlier cut
    // dated every record by `start` to avoid claiming a completion that had not
    // happened — which made the DATE honest and left the possession claim
    // false. This is the guard for that distinction.
    const ongoing = journeyData.filter((e) => e.type === 'education' && !e.end);
    expect(
      ongoing.length,
      'fixture assumes journeyData still has an in-progress education entry',
    ).toBeGreaterThan(0);

    const credentials = credentialsFromJourney(journeyData);
    const nameOf = (entry) => String(entry.title).split(' · ')[0].trim();

    for (const entry of ongoing) {
      expect(
        credentials.map((c) => c.name),
        `${nameOf(entry)} has not been awarded (end: null) and must not be ` +
          'claimed as a held credential',
      ).not.toContain(nameOf(entry));
    }

    // Every record that IS emitted carries its own completion date.
    for (const credential of credentials) {
      const source = journeyData.find(
        (e) => e.type === 'education' && nameOf(e) === credential.name,
      );
      expect(credential.date).toBe(source.end);
    }
  });

  it('classifies and de-duplicates a credential name once it is awarded', () => {
    // Synthetic on purpose: the real BSc is still in progress, so the `degree`
    // branch of the category rule and the org-suffix strip have no live case
    // left to cover. Both are derived from the title, so a change to either
    // would otherwise go unnoticed until the degree is conferred.
    const [credential] = credentialsFromJourney([
      {
        type: 'education',
        title: 'BSc (Hons) Software Engineering · MMU',
        org: 'MMU',
        start: '2021-09',
        end: '2026-06',
      },
    ]);

    expect(credential.type).toBe('degree');
    // The organisation suffix is not stated twice (once in the name, once in
    // recognizedBy), which would read as two different credentials to a
    // consumer de-duplicating on name.
    expect(credential.name).toBe('BSc (Hons) Software Engineering');
    expect(credential.date).toBe('2026-06');
  });

  it('section pages declare themselves part of the site and about the person', () => {
    const doc = pruneEmpty(
      sectionPage({
        path: '/uses',
        name: 'Uses',
        description: 'x'.repeat(120),
      }),
    );
    const page = doc['@graph'].find((node) => node['@type'] === 'WebPage');

    expect(page['@id']).toBe(`${ORIGIN}/uses#page`);
    expect(page.isPartOf['@id']).toBe(WEBSITE_ID);
    expect(page.about['@id']).toBe(PERSON_ID);
    expectNoNullish(doc);
  });

  it('breadcrumbList terminates on any trail length', () => {
    const trail = breadcrumbList([
      { name: 'Home', path: '/' },
      { name: 'Uses', path: '/uses' },
    ]);
    expect(trail.itemListElement[0].item).toBe(ORIGIN);
    expect(trail.itemListElement[1].item).toBeUndefined();
  });
});

describe('JSON-LD serialiser', () => {
  // This is a security test, not a formatting one. `<script
  // type="application/ld+json">` is a RAW TEXT element: the HTML parser ends it
  // at the first `</script`, and it does not understand JSON strings — so a
  // `</script>` inside a quoted value closes the tag and everything after it is
  // parsed as HTML. The guestbook makes this non-theoretical: user-authored
  // content lives on this origin.

  it('neutralises a script-closing payload', () => {
    const payload = '</script><img src=x onerror=alert(1)>';
    const output = serializeJsonLd({ name: payload });

    // The only thing that actually matters: no `<` survives, so the element
    // cannot be closed early no matter what the value contained.
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
    expect(output.toLowerCase()).not.toContain('</script');
  });

  it('escapes losslessly — the data a consumer parses is unchanged', () => {
    // The part that is easy to get wrong. HTML entities are NOT decoded inside a
    // raw-text element, so escaping `<` as `&lt;` would leave those four
    // characters in the value and CHANGE THE DATA. JSON's own `<` is
    // decoded by the JSON parser back to `<`, so the value round-trips exactly.
    const value = { name: 'a < b && c > d', note: 'plain' };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });

  it('escapes the line separators that break eval-based consumers', () => {
    const value = { note: `a b c` };
    const output = serializeJsonLd(value);

    expect(output).not.toContain(' ');
    expect(output).not.toContain(' ');
    // Still lossless.
    expect(JSON.parse(output)).toEqual(value);
  });

  it('also escapes & so no consumer can decode an entity out of it', () => {
    expect(serializeJsonLd({ a: '&lt;' })).not.toContain('&');
  });
});

describe('pruneEmpty', () => {
  it('drops nullish, empty strings, empty arrays and emptied objects', () => {
    expect(
      pruneEmpty({
        keep: 'yes',
        nul: null,
        und: undefined,
        empty: '',
        arr: [],
        obj: { onlyEmpty: null },
        nested: { keep: 1, drop: undefined },
      }),
    ).toEqual({ keep: 'yes', nested: { keep: 1 } });
  });

  it('keeps 0 and false, which are meaningful values', () => {
    // A `priority: 0` or an `isAccessibleForFree: false` is a statement, not an
    // absence. Pruning by truthiness instead of by nullishness would silently
    // delete both.
    expect(pruneEmpty({ zero: 0, no: false })).toEqual({ zero: 0, no: false });
  });

  it('returns undefined for a value that reduces to nothing', () => {
    // What makes `<JsonLd>` render no tag at all rather than an empty one.
    expect(pruneEmpty({ a: null, b: {} })).toBeUndefined();
    expect(pruneEmpty([])).toBeUndefined();
  });
});
