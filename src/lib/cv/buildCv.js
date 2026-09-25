// The /cv document model (issue #32, W1c).
//
// ── Why an HTML CV exists at all ────────────────────────────────────────────
// docs/seo.md §4 shipped the PDF as a deliberately indexable document and §4's
// closing note flagged an HTML route as "not decided". It is decided here, and
// the reasons are all things a PDF structurally cannot do:
//
//   • A PDF carries no JSON-LD. The single most valuable page for the query
//     this site is trying to win — a person's name plus a role — could state
//     nothing machine-readable about the person it describes.
//   • A PDF is a dead end. Nothing in it links back into the site, so a crawler
//     arriving at the most-shared URL on the domain finds no path onward, which
//     is F8 restated for the one document most likely to be linked externally.
//   • A PDF is a fixed-width page on a phone. The reader most likely to open a
//     CV link from a message is on one.
//
// The PDF is NOT replaced. It stays the artifact people download and attach;
// this is the document they read, and it links to the PDF.
//
// ── Why it derives from journeyData ─────────────────────────────────────────
// P5, and the entity-consistency requirement in §11. `journeyData` is already
// documented in data.js as the complete employment record and is already
// cross-checked against the PDF; `journeyEmployment.js` replaced a runtime PDF
// parse with it for exactly this reason — the CV and the timeline had drifted
// on real dates and nothing caught it. A hand-written HTML CV would be a THIRD
// copy of the same history, which is a third chance to disagree.
//
// The consequence worth stating: this page can only say what journeyData knows.
// Where the PDF carries prose journeyData does not have, the PDF keeps it and
// this page links there rather than inventing a paraphrase (P4).

import { journeyData, projectsData, usesData } from '@/app/data';
import { IDENTITY } from '@/lib/seo/site';

/** Sort key: months since epoch for a `YYYY-MM` string, or -Infinity. */
function startIndex(entry) {
  const [year, month] = String(entry.start ?? '').split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return -Infinity;
  return year * 12 + (month - 1);
}

/**
 * Reverse-chronological by start date, ongoing roles first among equals.
 *
 * Deliberately NOT sorted by end date. A CV reader scans for "what are they
 * doing now", and an ongoing role that started in 2026 belongs above a role
 * that ended in 2026 even though the latter's end date is later. Sorting by end
 * would also need a rule for `end: null`, and every such rule is a lie in one
 * direction — treating null as "infinitely far future" buries finished senior
 * roles beneath ongoing minor ones.
 */
function byRecency(a, b) {
  const delta = startIndex(b) - startIndex(a);
  if (delta !== 0) return delta;
  // Same start month: the one still running is the more current fact.
  if (!a.end && b.end) return -1;
  if (a.end && !b.end) return 1;
  return 0;
}

/**
 * Split one journey title into its role and organisation halves.
 *
 * The array stores `"DevOps Engineer · C365Cloud"` — role and org joined by a
 * middot — and separately stores `org`. Rendering the stored title verbatim
 * beside the stored org prints the organisation twice on every row, so the
 * suffix is stripped here rather than in the component. `org` stays the
 * authority: this only removes a duplicate, it never invents a name.
 */
function splitRole(entry) {
  const [role] = String(entry.title ?? '').split(' · ');
  return role.trim() || String(entry.title ?? '').trim();
}

function toEntry(entry) {
  return {
    id: entry.id,
    role: splitRole(entry),
    org: entry.org,
    // The array's OWN human-authored label ("APR 2026 →"), not a second
    // formatting of start/end. Two derivations of one date are two things to
    // keep in step, and this one is already reviewed in diffs and already
    // rendered on /journey — so the CV and the timeline cannot print different
    // date ranges for the same role.
    //
    // A computed TENURE ("3 yr 2 mo") is deliberately absent. This page is
    // statically rendered, so a tenure for an ongoing role would be frozen at
    // build time and drift further from the truth every day the build is not
    // rerun — a number that is wrong by construction (P4). A date range stays
    // correct forever. /journey computes tenure live in the browser, which is
    // where that is safe to do.
    dates: entry.dateLabel,
    start: entry.start,
    end: entry.end,
    ongoing: !entry.end,
    description: entry.description,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    link: entry.link ?? null,
  };
}

/**
 * The CV document, derived entirely from committed data.
 *
 * @returns {{identity: object, experience: object[], education: object[],
 *   activities: object[], skills: object[], projects: object[]}}
 */
export function buildCv() {
  const byType = (type) =>
    journeyData.filter((entry) => entry?.type === type).sort(byRecency).map(toEntry);

  return {
    identity: {
      name: IDENTITY.name,
      role: IDENTITY.role,
      location: `${IDENTITY.locality}, ${IDENTITY.region}`,
      email: IDENTITY.email,
    },

    experience: byType('career'),
    education: byType('education'),

    // `milestone` entries are the MMU representation roles — Student Ambassador
    // and Course Representative. They are kept OUT of Experience rather than
    // folded in, because journeyData already draws that distinction and
    // collapsing it here would silently promote a voluntary representative post
    // to employment on the one page where that claim carries the most weight.
    activities: byType('milestone'),

    // The same groups `knowsAboutFromStack` reads for `Person.knowsAbout`, kept
    // in the same order so the visible skills list and the schema claim are the
    // same list — §11's requirement, applied to a new surface.
    skills: ['languages', 'frameworks', 'libraries', 'tools', 'software']
      .map((group) => ({
        group,
        items: (usesData.stack?.[group] ?? [])
          .map((item) => item?.displayName)
          .filter(Boolean),
      }))
      .filter((group) => group.items.length > 0),

    // Public projects only, newest first. Private ones are omitted for the same
    // reason `projectPage` withholds their `codeRepository`: a CV line pointing
    // at a repository the reader cannot open is an unverifiable claim, and the
    // projects listing is one click away for the full set.
    projects: projectsData
      .filter((project) => !project.private)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        category: project.category,
        date: project.date,
        repo: project.repo,
      })),
  };
}
