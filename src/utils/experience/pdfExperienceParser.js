import { isSoftwareRole } from "./roleKeywords";
import {
  formatDuration,
  monthsBetween,
  parseResumeDateToken,
} from "./dateMath";

// Headings that signal the end of the main Experience block. "Additional
// Experience" is intentionally listed so the parser stops *before* it —
// per the issue #17 spec, only the primary Experience section feeds the
// software-experience aggregate. The role-keyword filter is a second
// gate so a non-software role accidentally inside the main section also
// gets dropped.
const SECTION_TERMINATORS = [
  "Additional Experience",
  "Interpersonal Skills",
  "Languages",
  "Education",
  "Technical Skills",
  "Projects",
  "Personal Profile",
  "Awards",
];

// Match every role line within the experience block. The shape we expect
// (validated against the real CV): "<title> [–|-] <company>, <location>
// (<startDate> [–|-] <endDate>)". The leading `[^•\n]` guard excludes
// bullet sub-items; the en-dash / hyphen alternation covers both common
// glyphs without normalising the source text first. Multiline + global
// so a single `exec` loop reads every role in the block.
const ROLE_LINE_REGEX =
  /^([^•\n]+?)\s+[–-]\s+([^,\n]+),\s+[^()\n]*?\(([^)]+)\)\s*$/gm;

// Resume date ranges use either an en-dash (U+2013) or a plain hyphen,
// flanked by whitespace ("Feb 2024 - Present", "Feb 2024 – Present").
// Mandatory whitespace on both sides is what disambiguates the *range*
// separator from a hyphen that lives *inside* a token — the spec
// (see `parseResumeDateToken`) accepts "Feb-2024" as a month-year, so
// the previous greedy `\s*` form would shred "Feb-2024 - Present" into
// three parts and silently drop the role.
const DATE_RANGE_SEPARATOR = /\s+[–-]\s+/;

// Pull the main Experience block out of the full document text. Returns
// an empty string when the header is missing so the caller can degrade
// gracefully rather than throw — a CV layout change shouldn't take down
// the about page.
function extractExperienceBlock(text) {
  // Anchor on the *line* "Experience" so we don't false-match the word
  // inside Personal Profile prose ("over two years' commercial
  // experience"). The newline before the header is required.
  const startMatch = text.match(/(?:^|\n)Experience\s*\n/);
  if (!startMatch) return "";
  const blockStart = startMatch.index + startMatch[0].length;

  // Stop at whichever terminator appears first. Using a single combined
  // regex with alternation lets us defer "which heading came first" to
  // the regex engine instead of running N separate searches.
  const terminatorPattern = new RegExp(
    `\\n(?:${SECTION_TERMINATORS.map((s) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("|")})\\b`,
  );
  const after = text.slice(blockStart);
  const endMatch = after.match(terminatorPattern);
  return endMatch ? after.slice(0, endMatch.index) : after;
}

// Parse a single "<start> [–|-] <end>" range into Date objects via
// `parseResumeDateToken`. Returns null when either side fails to parse
// so the caller can skip the role rather than emit a meaningless 0- or
// NaN-month duration.
function parseDateRange(rangeText) {
  const parts = rangeText.split(DATE_RANGE_SEPARATOR);
  if (parts.length !== 2) return null;
  const start = parseResumeDateToken(parts[0]);
  const end = parseResumeDateToken(parts[1]);
  if (!start || !end) return null;
  return { start, end, openEnded: /^(current|present)$/i.test(parts[1].trim()) };
}

// Extract structured roles from a PDF buffer. Pure function aside from
// the pdf-parse call — no fs, no network, so it's trivially testable
// with a Buffer fixture. Returns `{ roles, rawText }`; `rawText` is
// included so callers can log a snippet on parse failures.
export async function parseExperienceFromPdf(pdfBuffer) {
  // Dynamic import so `pdfjs-dist` (a transitive dep of `pdf-parse`)
  // isn't evaluated at module load. Its top-level code references
  // browser-only globals (DOMMatrix, ImageData, Path2D), which crash
  // Next.js's build-time "Collecting page data" pass — that pass
  // imports route modules in plain Node, before the runtime hint
  // (`export const runtime = "nodejs"`) gets a chance to matter.
  // Deferring the import keeps the route bundleable.
  const { PDFParse } = await import("pdf-parse");
  // PDFParse expects a Uint8Array; Node's Buffer is one but the type
  // check inside pdf-parse is stricter than necessary, so the
  // conversion is defensive.
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  // pdf-parse v2's `PDFParse` holds onto the worker-side pdfjs document
  // until `destroy()` is called. In a long-lived serverless worker
  // (Vercel keeps Node instances warm across invocations) leaving these
  // around accumulates memory across cache misses. The try/finally
  // guarantees cleanup even if `getText` throws — important because the
  // outer `Promise.allSettled` in the route will swallow a thrown
  // failure but a leaked parser would still consume the worker's heap.
  let result;
  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }
  const text = result?.text ?? "";

  const block = extractExperienceBlock(text);
  if (!block) return { roles: [], rawText: text };

  const roles = [];
  // Reset lastIndex because the regex is module-scoped (global flag
  // makes it stateful across calls). Without this, a second invocation
  // would resume mid-text and skip the first role.
  ROLE_LINE_REGEX.lastIndex = 0;
  let match;
  while ((match = ROLE_LINE_REGEX.exec(block)) !== null) {
    const [, rawTitle, rawCompany, rawDateRange] = match;
    const title = rawTitle.trim();
    const company = rawCompany.trim();

    // Section filter is implicit (we only look at the main Experience
    // block); keyword filter is the second gate per the spec.
    if (!isSoftwareRole(title)) continue;

    const range = parseDateRange(rawDateRange);
    if (!range) continue;

    // Months are clamped non-negative: an inverted range on the CV
    // (typo, future-dated role) shouldn't yield a negative aggregate.
    // For open-ended roles, end is "now" — already correct via
    // parseResumeDateToken's Current/Present handling.
    const months = Math.max(0, monthsBetween(range.start, range.end));

    roles.push({
      company,
      role: title,
      start: range.start.toISOString().slice(0, 10),
      end: range.openEnded ? null : range.end.toISOString().slice(0, 10),
      months,
      display: `${formatDuration(months)} with ${company} as a ${title}`,
    });
  }

  return { roles, rawText: text };
}
