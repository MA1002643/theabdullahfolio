import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { journeyData } from '@/app/data';
import { parseExperienceFromPdf } from '@/utils/experience/pdfExperienceParser';

// ── An HTML record and a PDF one, maintained separately ────────────────────
// Both HTML surfaces now come from ONE array. `/journey` renders `journeyData`,
// and `/about`'s employment figure is derived from that same array by
// `employmentFromJourney` (src/utils/experience/journeyEmployment.js), which
// `/api/experience-summary` calls. The route used to parse
// public/Muhammad_Abdullah_CV.pdf at runtime instead; that is gone, and with it
// the failure this file was originally written against — two pages reporting
// different histories for one job. Two consumers of one array cannot disagree,
// so that is now unrepresentable rather than merely tested for.
//
// (The figure is also a UNION of the role intervals rather than a sum of them,
// because the roles overlap. Not this file's subject, but worth not misstating:
// see the note in journeyEmployment.js.)
//
// WHAT REMAINS, and is why this file is still here: the CV is a THIRD public
// surface, and it is not derived from the array. It is a separately-maintained
// binary, built from LaTeX that does not live in this repository, and #32 W1b
// made it deliberately indexable — its own `/Title`, its own sitemap entry — so
// a recruiter can open it and hold it against the two HTML pages. The site can
// therefore still publish two employment histories: one in HTML from
// `journeyData`, one in a PDF nothing regenerates from it.
//
// ── The precedence rule, as it actually stands ─────────────────────────────
// src/app/data.js documents `journeyData` as the LinkedIn record, owner-supplied
// and cross-checked against the CV, and records LinkedIn winning the BTEC dates
// (2019–2021 with the OCNLR certificate before it, not the CV's 2017 start).
//
// That is a record of one decision, NOT a standing rule that LinkedIn wins — an
// earlier version of this comment read it as one, and it had already been
// overtaken. The Unisys range went the other way: the array carried
// MAY 2023 — SEP 2024 against the CV's APR 2023 — JUL 2024, and on 2026-09-12
// the owner confirmed the CV was right, so data.js was corrected to match it.
// Conflicts are settled per conflict, by the owner, on the evidence.
//
// Which is precisely what makes this file's job a real one. There is no rule
// that resolves a disagreement automatically, so every disagreement has to be
// SEEN. It is not a claim that either document is wrong; it is a claim that
// every difference between them is known, deliberate, and written down. It
// fails in both directions on purpose:
//
//   · a NEW divergence (a CV update, a journeyData edit) fails, because the
//     only alternative is finding out weeks later that the indexed PDF and the
//     site state different dates for the same job — and the likeliest way to
//     find out is a recruiter with both open;
//   · a divergence that has been RESOLVED also fails, so the entry below is
//     deleted with the fix instead of rotting into a false record.
//
// tests/unit/pdfExperienceFixture.test.js pins what the parser reads out of the
// binary. This pins what that means next to the rest of the site.

const CV_PATH = path.join(process.cwd(), 'public', 'Muhammad_Abdullah_CV.pdf');

/**
 * Disagreements between the CV binary and `journeyData`, each with its reason.
 *
 * Keyed by the company name as BOTH sources spell it. Months are `YYYY-MM`,
 * the granularity the two actually share.
 *
 * Two shapes. `{ cv, journey }` declares a date disagreement on a role both
 * documents carry. `{ cv, journey: null }` declares a role the CV presents that
 * `journeyData` has no career entry for — rarer, and worth a harder look before
 * it is written down, since the usual cause is the company being spelled
 * differently in the two sources rather than a decision anyone made.
 */
// Empty, and that is the point — the two documents agree today. The Unisys
// range was the one entry this map ever held: journeyData carried
// MAY 2023 — SEP 2024 against the CV's APR 2023 — JUL 2024, and on 2026-09-12
// the owner confirmed the CV was right, so data.js was corrected and the entry
// removed. Left in place as the mechanism rather than deleted with its last
// tenant: the next CV revision is what this is for.
const KNOWN_DIVERGENCES = {};

/** `YYYY-MM` from either source's date format. */
const month = (value) => (value == null ? null : String(value).slice(0, 7));

describe('the CV and journeyData describe the same roles', () => {
  it('has no divergence that is not written down, and none written down that is fixed', async () => {
    const buffer = await readFile(CV_PATH);
    const { roles } = await parseExperienceFromPdf(buffer);

    // journeyData is the complete record and holds employment the CV does not
    // present (retail, security, the ambassador post). That asymmetry is an
    // editorial choice about what a CV shows, not a disagreement about facts,
    // and it needs no special case: iterating the CV's roles is what makes a
    // journeyData-only entry simply never come up.
    const byOrg = new Map(
      journeyData
        .filter((entry) => entry.type === 'career')
        .map((entry) => [entry.org, entry]),
    );

    const found = {};
    for (const role of roles) {
      const entry = byOrg.get(role.company);
      const cv = { start: month(role.start), end: month(role.end) };

      // THE OTHER DIRECTION IS A DIVERGENCE, and it used to `continue` here
      // under a comment that claimed the asymmetry above excused it. It does
      // not: that excuses journeyData having MORE, while this is the CV having
      // something journeyData lacks, against an array src/app/data.js documents
      // as the complete record.
      //
      // The likelier cause is worse than a missing job. A company respelled in
      // one source and not the other (`Unisys` → `Unisys Ltd`) lands exactly
      // here, and skipping meant that role's dates stopped being compared at
      // all while the suite stayed green — the two documents could then drift
      // apart freely on the one role nobody was checking.
      //
      // Recorded as a divergence with a null `journey` rather than asserted on
      // the spot, so it goes through the same machinery as every other
      // difference: all unmatched roles are reported at once instead of only
      // the first, and one that is genuinely intended can be declared in
      // KNOWN_DIVERGENCES with its reason. A bare assertion here would have no
      // way to say "this is deliberate" except by being weakened, which is how
      // a guard stops guarding.
      if (!entry) {
        found[role.company] = { cv, journey: null };
        continue;
      }

      const journey = { start: month(entry.start), end: month(entry.end) };
      if (cv.start !== journey.start || cv.end !== journey.end) {
        found[role.company] = { cv, journey };
      }
    }

    // Every divergence that exists must be declared...
    for (const [company, actual] of Object.entries(found)) {
      const declared = KNOWN_DIVERGENCES[company];
      expect(
        declared,
        actual.journey === null
          ? `${company} is listed on the CV but has no career entry in ` +
            `journeyData, which src/app/data.js documents as the COMPLETE ` +
            `record. Most likely the company is spelled differently in the ` +
            `two sources — check that first, because a mismatch there also ` +
            `stops this role's dates being compared at all. Otherwise add the ` +
            `role to journeyData, or declare it in KNOWN_DIVERGENCES with ` +
            `journey: null and a reason. Found: ${JSON.stringify(actual)}`
          : `${company} disagrees between the CV and journeyData and is not in ` +
            `KNOWN_DIVERGENCES. Either fix the source that is wrong, or add an ` +
            `entry saying which one wins and why. Found: ${JSON.stringify(actual)}`,
      ).toBeDefined();
      expect(
        { cv: declared.cv, journey: declared.journey },
        `${company} diverges, but not in the way KNOWN_DIVERGENCES records — ` +
          `one of the two sources changed. Re-read both and update the entry.`,
      ).toEqual(actual);
    }

    // ...and every declared divergence must still exist.
    for (const company of Object.keys(KNOWN_DIVERGENCES)) {
      expect(
        found[company],
        `${company} is listed in KNOWN_DIVERGENCES but the CV and journeyData ` +
          `now agree. Delete the entry — a resolved conflict left on file ` +
          `reads as an open one.`,
      ).toBeDefined();
    }
  }, 60_000); // pdfjs cold-starts a fake worker on first parse

  it('agrees on every role not listed as diverging', async () => {
    // The positive half: without this, deleting a comparison would "pass".
    const buffer = await readFile(CV_PATH);
    const { roles } = await parseExperienceFromPdf(buffer);
    const byOrg = new Map(
      journeyData
        .filter((entry) => entry.type === 'career')
        .map((entry) => [entry.org, entry]),
    );

    const shared = roles.filter((role) => byOrg.has(role.company));
    expect(
      shared.length,
      'no CV role matched a journeyData org — the company names have drifted ' +
        'apart and this whole file is comparing nothing',
    ).toBeGreaterThan(0);

    for (const role of shared) {
      if (KNOWN_DIVERGENCES[role.company]) continue;
      const entry = byOrg.get(role.company);
      expect(month(role.start), `${role.company} start`).toBe(
        month(entry.start),
      );
      expect(month(role.end), `${role.company} end`).toBe(month(entry.end));
    }
  }, 60_000);
});
