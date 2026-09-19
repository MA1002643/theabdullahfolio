import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// ── Every error an API route logs crosses the redaction boundary ────────────
// `describeError` was added for one route, then a second, then a third, each
// time because a review found the next raw `console.error(…, err)`. That is the
// shape of a rule nothing enforces: the fix is correct, it is applied where
// someone looked, and the sites nobody looked at keep the behaviour.
//
// What makes the omissions matter rather than merely untidy is that library
// errors quote the configuration they were handed, and one of these routes puts
// a credential in a URL: /api/send-mail calls Abstract with
// `?api_key=${process.env.ABSTRACT_API_KEY}`, so a fetch rejection naming the
// request is a key in a drain. Others carry the resolved host and port behind
// `baseUrl`, or an Upstash endpoint.
//
// So the boundary is asserted over the SURFACE, not per site: anything derived
// from a caught error and handed to `console` goes through `describeError` (the
// whole error, redacted, cause chain kept) or `redactSecrets` (for the sites
// that deliberately compose one compact line). A new route inherits the rule by
// failing this test rather than by its author remembering it.

const API_ROOT = path.join(process.cwd(), 'src/app/api');

/** Every `.js` file under `src/app/api`, recursively. */
function sourceFiles(dir = API_ROOT, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (full.endsWith('.js')) found.push(full);
  }
  return found;
}

/**
 * The argument text of every `console.<level>(…)` call in a source file.
 *
 * Balanced-paren rather than a lazy regex, because these calls routinely wrap
 * another call — `describeError(err)`, a template with `${err?.message}` — and
 * `\(([^)]*)\)` stops at the first inner `)`, which would truncate exactly the
 * part that has to be inspected.
 */
function consoleCallArguments(source) {
  const calls = [];
  const callSite = /\bconsole\s*\.\s*(?:error|warn|log|info|debug)\s*\(/g;
  for (const match of source.matchAll(callSite)) {
    let depth = 1;
    let quote = null;
    let index = match.index + match[0].length;
    const start = index;
    for (; index < source.length && depth > 0; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === '\\') index += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') quote = char;
      else if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
    }
    calls.push(source.slice(start, index - 1));
  }
  return calls;
}

// Reads that are safe to log on their own: a name, a status, an error code.
// None of them can carry a host, a URL or a credential — and they are the
// reason this is a property test rather than a ban on the word `err`.
const SAFE_PROPERTY =
  /\b[A-Za-z_$][\w$]*\s*\??\.\s*(?:name|code|status|statusCode|responseCode)\b/g;

// An identifier that holds a caught error. Deliberately broad — `err`, `error`,
// `sendErr`, `abstractErr`, `storeErr`, `fetchError` — because the cost of a
// false positive is one `describeError` call and the cost of a miss is a
// credential in a drain.
const ERROR_IDENTIFIER = /\b[A-Za-z_$][\w$]*(?:[Ee]rr(?:or)?)\b|\berr\b/;

describe('the API surface logs no error it has not redacted', () => {
  const files = sourceFiles();

  it('finds the routes it is meant to be checking', () => {
    // Guard on the guard: a walk that returned nothing would make every
    // assertion below pass while inspecting no code at all.
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(
      files.some((file) => file.endsWith(path.join('send-mail', 'route.js'))),
    ).toBe(true);
  });

  it('routes every logged error through describeError or redactSecrets', () => {
    const unguarded = [];

    for (const file of files) {
      // The redaction module itself talks ABOUT `console.error(err)` in its
      // comments, which is the one place the words are not a call site.
      if (file.endsWith(path.join('_utils', 'redact.js'))) continue;

      const source = readFileSync(file, 'utf8');
      for (const args of consoleCallArguments(source)) {
        // Anything already inside the boundary is accounted for — a call whose
        // arguments pass through either helper is by construction redacted.
        if (args.includes('describeError(') || args.includes('redactSecrets('))
          continue;
        // Safe reads removed first, so `err?.name` does not read as `err`.
        const remainder = args.replace(SAFE_PROPERTY, '');
        if (ERROR_IDENTIFIER.test(remainder)) {
          unguarded.push(
            `${path.relative(process.cwd(), file)}: console(${args
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 90)}…)`,
          );
        }
      }
    }

    expect(
      unguarded,
      `These log something derived from a caught error without crossing the ` +
        `redaction boundary, so a library that quotes the configuration it was ` +
        `handed writes it to a sink that persists and drains:\n  ` +
        `${unguarded.join('\n  ')}\n\n` +
        `Wrap the value in describeError() — or redactSecrets() if the line is ` +
        `a composed one-liner — from src/app/api/_utils/redact.js.`,
    ).toEqual([]);
  });
});
