import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { journeyData } from '@/app/data';
import { parseExperienceFromPdf } from '@/utils/experience/pdfExperienceParser';

// ── Two public surfaces describe the same employment, from two sources ──────
// `/journey` renders `journeyData`, which src/app/data.js documents as the
// LinkedIn record, owner-supplied and cross-checked against the CV, "where the
// two disagreed, LinkedIn won". `/about`'s employment figure comes from
// somewhere else entirely: `/api/experience-summary` parses
// public/Muhammad_Abdullah_CV.pdf at runtime and sums the roles it finds.
//
// So the precedence rule is written down for ONE of the two consumers, and the
// other silently reports the source the rule says loses. Where the documents
// disagree, the site states two different employment histories — and the CV is
// not an internal artefact: #32 W1b made it deliberately indexable, with its
// own `/Title` and a sitemap entry, so a recruiter can open it and compare.
//
// This file exists so that divergence is ENUMERATED rather than implied. It is
// not a claim that the CV is wrong; it is a claim that every disagreement
// between the two is known, deliberate, and written down. It fails in both
// directions on purpose:
//
//   · a NEW divergence (a CV update, a journeyData edit) fails, because the
//     only alternative is noticing weeks later that two pages disagree;
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

    // Only roles BOTH sources carry can be compared. The CV lists the software
    // roles; journeyData is the complete record and also holds employment the
    // CV does not present (retail, security, the ambassador post). That is an
    // editorial choice about what a CV shows, not a disagreement about facts,
    // so a journeyData-only entry is not a divergence.
    const byOrg = new Map(
      journeyData
        .filter((entry) => entry.type === 'career')
        .map((entry) => [entry.org, entry]),
    );

    const found = {};
    for (const role of roles) {
      const entry = byOrg.get(role.company);
      if (!entry) continue; // On the CV, not on /journey — see above.

      const cv = { start: month(role.start), end: month(role.end) };
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
        `${company} disagrees between the CV and journeyData and is not in ` +
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
