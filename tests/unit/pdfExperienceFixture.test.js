import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseExperienceFromPdf } from '@/utils/experience/pdfExperienceParser';

// ── The guard that had to exist BEFORE the CV PDF was touched ───────────────
// Issue #32, W1b + risk §10.3.
//
// HISTORY, because it explains the shape of this file: /api/experience-summary
// used to parse `public/Muhammad_Abdullah_CV.pdf` AT RUNTIME through
// `parseExperienceFromPdf` to derive the employment figure on /about, and W1b
// had to rewrite that binary to set its `/Title` and `/Author` so Google names
// the search result properly instead of falling back to the filename. A
// rewritten PDF can reflow its text layer, the parser's regexes stop matching,
// `roles` comes back EMPTY, and /about renders "Employment 0%" — no exception,
// no log line, HTTP 200, because an empty parse is indistinguishable from a CV
// with no jobs on it. The parser was guarded by NO test, so that would have
// shipped silently.
//
// THAT RUNTIME DEPENDENCY IS GONE. /about now derives employment from
// `journeyData` (src/utils/experience/journeyEmployment.js), so a parser
// regression can no longer empty a page. This file did not become pointless
// when that changed — it changed job:
//
//   · The CV is a deliberately-indexed public document (W1b gave it a `/Title`
//     and a sitemap entry), so what it CONTAINS still matters to a recruiter
//     who opens it, and this is the only thing that reads it.
//   · tests/unit/cvJourneyConsistency.test.js compares those contents against
//     `journeyData` and fails when the two documents disagree. It can only do
//     that while the parser still works, which is what this file pins.
//
// So the assertions below are unchanged and still meaningful: they are now a
// statement about the DOCUMENT rather than about a live page.
//
// The numbers below were measured against the pre-change binary. They are
// pinned deliberately rather than asserted loosely (`roles.length > 0`): a
// loose assertion passes when the parser finds ONE role out of two, which is
// exactly the partial-match failure a text reflow produces.
//
// IF THIS TEST FAILS after a CV update, the PDF is the thing that changed. Do
// not relax the assertions to make it pass — either restore the layout the
// parser reads, or update the parser and re-pin these values ON PURPOSE. If
// the new CV genuinely states different dates, that is a real edit to the
// record: re-pin here AND reconcile `journeyData`, or
// cvJourneyConsistency.test.js will (correctly) fail next.

const CV_PATH = path.join(process.cwd(), 'public', 'Muhammad_Abdullah_CV.pdf');

// The roles the CV's Experience section contains, as the parser sees them.
// `months` is derived from the date range, so pinning it also pins that the
// range itself parsed — a reflow that merged two lines would typically still
// yield a title and a company while producing a nonsense duration.
//
// These are what the BINARY says, which is a separate question from what the
// site holds to be true — and the values must be pinned as the former even when
// the two agree. This file's job is to detect the parser losing its grip on the
// binary, so it has to expect what the binary actually contains; agreement with
// `journeyData` is not the thing being asserted here, and reading it that way is
// how the two files' jobs get merged and both get weaker.
//
// They do agree today. The Unisys range below (APR 2023 – JUL 2024) was once the
// exception: `journeyData` carried MAY 2023 – SEP 2024 against it, and on
// 2026-09-12 the owner confirmed the CV was right, so src/app/data.js was
// corrected to match. Whether they agree is asserted in
// tests/unit/cvJourneyConsistency.test.js, which fails on any difference that is
// not written down — so if a future CV revision reintroduces one, fix it THERE
// by correcting a source, rather than by editing the numbers below to make this
// file quiet.
const EXPECTED_ROLES = [
  {
    company: 'C365Cloud',
    role: 'DevOps Engineer',
    start: '2026-02-01',
    end: '2026-05-01',
    months: 3,
  },
  {
    company: 'Unisys',
    role: 'Software Engineer (Industrial Placement)',
    start: '2023-04-01',
    end: '2024-07-01',
    months: 15,
  },
];

describe('CV PDF → experience parser contract', () => {
  it('extracts exactly the roles /about depends on', async () => {
    const buffer = await readFile(CV_PATH);
    const { roles } = await parseExperienceFromPdf(buffer);

    // Count first and as its own assertion: when this is the failing line the
    // message says "expected 2, got 0", which names the problem immediately.
    // Asserting the array shape first would report a diff of two objects
    // against an empty array, which is the same information buried.
    expect(roles).toHaveLength(EXPECTED_ROLES.length);

    for (const [index, expected] of EXPECTED_ROLES.entries()) {
      // `toMatchObject`, not `toEqual`: the parser also emits a `display`
      // string ("3+ months with C365Cloud as a DevOps Engineer") whose exact
      // wording is presentation and may legitimately be reworded. The facts
      // are what this test owns.
      expect(roles[index]).toMatchObject(expected);
    }
  }, 60_000); // pdfjs cold-starts a fake worker on first parse

  it('still yields a non-trivial text layer', async () => {
    const buffer = await readFile(CV_PATH);
    const { rawText } = await parseExperienceFromPdf(buffer);

    // A PDF rewritten in a way that destroys its text layer entirely — the
    // worst realistic outcome of a bad re-tag — produces a near-empty string
    // while every other assertion above could in principle still be satisfied
    // by a cached result. Measured at 4,923 characters before the metadata
    // change; the bound is deliberately loose because the text layer is
    // allowed to change when the CV's CONTENT does. It is not allowed to
    // vanish.
    expect(rawText.length).toBeGreaterThan(3000);

    // The section heading the parser slices the roles out of. If this is
    // absent, `extractExperienceBlock` returns nothing and the role count
    // above is zero for a reason that has nothing to do with the regexes.
    expect(rawText).toMatch(/experience/i);
  }, 60_000);
});
