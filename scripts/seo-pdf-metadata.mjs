#!/usr/bin/env node
// Set the CV PDF's document information dictionary (issue #32, W1b).
//
// ── Why this script exists ──────────────────────────────────────────────────
// The CV is indexable by decision (F6, owner call 2026-09-11). Google builds a
// PDF result's title from the document's internal `/Title`, and this file had
// none — so a recruiter searching the name would have seen a result called
// roughly `Muhammad_Abdullah_CV.pdf`, sitting beside HTML results that were
// carefully titled under #88. It was the only indexable surface on the site
// with no art direction at all.
//
// ── Why a post-process and not `\hypersetup{}` ──────────────────────────────
// Setting `pdftitle` / `pdfauthor` in the LaTeX source is the better approach
// and is not available: THERE IS NO `.tex` IN THIS REPOSITORY. Only the
// compiled PDF is tracked. Until the source is committed (recommended in
// docs/seo.md — it would make the CV reproducible and reviewable like
// everything else here), the metadata has to be written into the binary.
//
// ── Why this is SAFER than regenerating from source ─────────────────────────
// NOT because a page reads this file. None does, and this comment used to say
// otherwise: /api/experience-summary once parsed this exact binary at runtime to
// derive /about's employment figure, where a reflowed text layer silently
// yielded "Employment 0%" rather than an error. That dependency was removed on
// purpose — the route derives employment from `journeyData` via
// src/utils/experience/journeyEmployment.js, and `parseExperienceFromPdf` has no
// production importer at all. Do not reintroduce one on the strength of a
// comment; see next.config.mjs, where the build settings that supported the
// runtime parse were deleted for the same reason.
//
// What still reads this binary is TWO TESTS, and they are why a reflow matters:
//
//   · tests/unit/pdfExperienceFixture.test.js pins what the parser reads out of
//     it — both roles, their exact dates and durations. A reflow makes the
//     regexes miss and fails this test.
//   · tests/unit/cvJourneyConsistency.test.js compares those contents against
//     `journeyData` and fails on any disagreement not written down. The CV is a
//     separately-maintained binary that nothing regenerates from that array, so
//     this is the only thing keeping the INDEXED PDF and the site's HTML record
//     in step.
//
// The second depends on the first: it can only compare while the parser still
// works. So a reflow no longer breaks a page — it quietly removes the only check
// that the published CV and the site still agree, which is a slower and more
// expensive failure than a visibly wrong figure was. docs/seo.md §4 carries the
// full account and says which failure means what.
//
// pdf-lib rewrites only the document information dictionary and the trailer. It
// does not re-lay-out anything, does not re-encode content streams, and does
// not touch the text layer — so the parser sees byte-identical text. That is
// the opposite of recompiling from LaTeX, where every glyph position is
// recomputed. tests/unit/pdfExperienceFixture.test.js proves it either way, and
// was written and passing BEFORE this script was first run.
//
// ── What this script does NOT do ────────────────────────────────────────────
// It does not tag the PDF for accessibility (`/StructTreeRoot`). W1b asks for
// that and it is genuinely not possible here: a tagged PDF requires a semantic
// structure tree built from the document's logical reading order, which only
// the generator knows. pdf-lib can add the object but cannot infer the
// structure, and a tree that mislabels the content is worse for a screen reader
// than an honest absence of one. It needs `\usepackage{tagpdf}` (or a LaTeX
// engine with tagging support) in the source. Recorded as an open item.
//
// Usage:
//   node scripts/seo-pdf-metadata.mjs           # write metadata
//   node scripts/seo-pdf-metadata.mjs --check   # report only, exit 1 if unset
//
// `pdf-lib` is a devDependency, matching how this repo already carries
// `ffmpeg-static`: an occasional maintenance tool, present for scripts and
// absent from the deployed bundle. It is NOT a runtime dependency — nothing
// under `src/` imports it, so `npm ci --omit=dev` still builds and serves the
// site. This script runs BY HAND when the CV is replaced, never during a build.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CV_PATH = path.join(process.cwd(), 'public', 'Muhammad_Abdullah_CV.pdf');

// ── The metadata itself ─────────────────────────────────────────────────────
// `/Title` is the highest-leverage string here: it is literally what the search
// result is called. It follows the same shape as the site's own titles — name
// first (this is a personal brand and the name is the primary query), then the
// role as a qualifier — so the PDF result and the HTML results read as one set
// rather than as a stray file.
const METADATA = {
  title: 'Muhammad Abdullah — Software Engineer CV',
  author: 'Muhammad Abdullah',
  // Shown by some readers under the title, and used by a few indexers as a
  // description fallback. Aligned with the `/` intent map in W7.
  subject:
    'Curriculum vitae of Muhammad Abdullah, a software engineer in Bolton, Greater Manchester — experience, education and technical skills.',
  // Deliberately short and honest. A long keyword list here is the PDF
  // equivalent of a meta-keywords stuffing, which no engine has rewarded for
  // over a decade and which the issue's non-goals rule out.
  keywords: [
    'Muhammad Abdullah',
    'software engineer',
    'CV',
    'curriculum vitae',
    'Next.js',
    'React',
    'TypeScript',
    'Node.js',
  ],
  // `/Lang` is not part of the info dictionary but of the catalog. It tells a
  // screen reader which language to pronounce the text in; without it the
  // reader guesses from its own locale, which mispronounces an English CV for
  // any user whose default is not English. Cheap, real accessibility win —
  // and unlike a structure tree, it needs no knowledge of the layout.
  language: 'en-GB',
};

async function main() {
  const checkOnly = process.argv.includes('--check');

  // Imported dynamically so `--check` can print a useful message when the
  // package is absent rather than failing at module load with a stack trace.
  let PDFDocument;
  let PDFName;
  let PDFString;
  try {
    ({ PDFDocument, PDFName, PDFString } = await import('pdf-lib'));
  } catch {
    console.error(
      'pdf-lib could not be loaded. It is a devDependency of this repo, so a\n' +
        'production-only install will not have it — which is fine, because this\n' +
        'script runs by hand when the CV changes and never during a build. Run:\n' +
        '  npm install',
    );
    process.exit(2);
  }

  const original = await readFile(CV_PATH);

  // `updateMetadata: false` is REQUIRED and easy to miss: pdf-lib otherwise
  // stamps its own `/Producer` and a fresh `/ModDate` on load, so merely
  // opening the file to inspect it would rewrite two fields and make `--check`
  // lie about what is on disk.
  const pdf = await PDFDocument.load(original, { updateMetadata: false });

  // `/Lang` is read the same way it is written — off the raw catalog, because
  // pdf-lib has no getter for it either. It MUST be part of `current` and not
  // just of the write path: `--check` decides its exit code from this object, so
  // a field that is written but not read makes the check pass on a file that is
  // missing it and report "All fields set." Reproduced before fixing, on a CV
  // whose four info fields were intact and whose /Lang had been removed.
  //
  // `decodeText()` rather than `String(value)`: the latter returns the PDF
  // literal-string syntax — `(en-GB)`, parentheses included — which is not a
  // language tag and would be printed as one. Both PDFString and PDFHexString
  // expose `decodeText`; anything else in that slot is not a language tag, so it
  // reads as absent rather than being coerced into a plausible-looking value.
  const langValue = pdf.catalog.get(PDFName.of('Lang'));
  const language =
    langValue && typeof langValue.decodeText === 'function'
      ? langValue.decodeText()
      : undefined;

  const current = {
    title: pdf.getTitle(),
    author: pdf.getAuthor(),
    subject: pdf.getSubject(),
    keywords: pdf.getKeywords(),
    language,
  };

  if (checkOnly) {
    const missing = Object.entries(current)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    console.log('Current CV document info:');
    for (const [key, value] of Object.entries(current)) {
      console.log(`  ${key.padEnd(9)} ${value ? JSON.stringify(value) : '(absent)'}`);
    }
    if (missing.length > 0) {
      console.error(`\nMissing: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log('\nAll fields set.');
    return;
  }

  pdf.setTitle(METADATA.title);
  pdf.setAuthor(METADATA.author);
  pdf.setSubject(METADATA.subject);
  pdf.setKeywords(METADATA.keywords);

  // `/Lang` lives on the catalog, and pdf-lib has no setter for it, so it is
  // set on the raw dictionary.
  pdf.catalog.set(PDFName.of('Lang'), PDFString.of(METADATA.language));

  // `useObjectStreams: false` keeps the output as plain, uncompressed objects.
  // Two reasons, both about not surprising anyone later: the info dictionary
  // stays readable to `strings`/`grep` so a future audit can verify the title
  // without running this script, and it avoids re-packing objects that the
  // original pdfTeX output had left uncompressed — the smallest possible
  // structural change to a file the CV-consistency tests parse.
  const output = await pdf.save({ useObjectStreams: false });
  await writeFile(CV_PATH, output);

  console.log(`Wrote metadata to ${CV_PATH}`);
  console.log(`  before: ${original.length} bytes`);
  console.log(`  after:  ${output.length} bytes`);
  // Both, and in this order: the consistency check can only compare while the
  // parser the fixture pins still works. Neither guards a live page — they keep
  // the indexed PDF and `journeyData` in step.
  console.log(
    '\nNow run the guards that prove the CV still reads and still agrees:\n' +
      '  npx vitest run tests/unit/pdfExperienceFixture.test.js\n' +
      '  npx vitest run tests/unit/cvJourneyConsistency.test.js',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
