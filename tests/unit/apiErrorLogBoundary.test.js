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

// ── Detection by PROPERTY, because spelling was never the invariant ─────────
// The first cut recognised an error only by the identifier holding it, and a
// value does not have to be called `err` to be one. Two shapes on this surface
// proved it: `githubResult.reason?.message` — an `allSettled` rejection, which
// is an error that `Promise` spells `.reason` — and `json.errors[0]?.message`,
// GraphQL's own field, where the plural breaks the `\berror\b` boundary the
// pattern relied on. Both reached `console.warn` unredacted while this file
// asserted the surface was covered, which is worse than not having the guard.
//
// So the primary rule is now the PROPERTY read. `.message`, `.stack` and
// `.cause` are where a library puts the text it quotes back at you, `.reason`
// is where a settled rejection puts the error itself, and none of the four is
// something a log line can hold verbatim.
const UNSAFE_PROPERTY = /\.\s*(?:message|stack|cause|reason)\b/;

// The identifier rule stays, for the bare `console.error('…', err)` case where
// no property is read at all. Broadened to the plural — `errors` broke the old
// `\berror\b` boundary, which is how GraphQL's field slipped past — and to
// `rejection`, which is what a settled one gets called when it is lifted into a
// local.
//
// NOT `reason` or `failure` on their own, and the difference is worth stating
// because the first draft included both. As PROPERTIES they are error shapes
// and stay in the list above. As bare identifiers they are, on this surface,
// hand-authored verdicts: `/api/seo-report` composes a `reason` string naming
// the variables an operator must set, and `/api/spotify` reads
// `result.failure.endpoint`, a label this repo wrote. Flagging those teaches
// the next person to wrap a literal in `redactSecrets` to quiet a scanner,
// which is how a guard turns into a ritual.
// The prefix is optional, which is the whole of the plural fix: with it
// mandatory the suffix group could never consume an entire identifier, so
// `abstractErr` matched on the strength of `abstract` while bare `error` and
// bare `errors` did not match at all. The GraphQL fixture below went green on
// its `.message` read, never on the rule this comment describes.
const ERROR_IDENTIFIER =
  /\b(?:[A-Za-z_$][\w$]*)?(?:[Ee]rr(?:ors?)?)\b|\brejections?\b/;

// ── Detection by BINDING, because the language already says which value it is ─
// The rule above recognises the spellings this repository happens to use. It
// cannot recognise one it has never seen, and `catch (exception)` or `catch (e)`
// hands a caught error straight to a log while every pattern in this file stays
// quiet — the `.reason` miss again, one layer up, and a guard that is silent on
// the shapes nobody thought of is the guard we already know how to ship.
//
// Nothing about the spelling was ever the invariant. A `catch` clause and a
// `.catch(…)` callback bind the rejected value by definition, so the names they
// bind are read out of the file under inspection and treated as error
// identifiers within it, whatever the author called them. A new route is covered
// by writing a `catch`, which is not something its author can forget to do.
//
// File-wide rather than scope-aware, deliberately: a regex has no scopes, and
// the direction to err in is flagging a shadowed name over missing a real one.
// `ALLOWED` is where a genuine collision gets written down with its reason.
const CATCH_CLAUSE =
  /\bcatch\s*\(\s*([A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])\s*\)/g;
const CATCH_CALLBACK =
  /\.catch\(\s*(?:async\s+)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g;

/** The names a binding BINDS — `{ message: msg }` binds `msg`, not `message`. */
function boundNames(binding) {
  return binding
    .split(',')
    .map((part) => part.split(':').pop())
    .flatMap((part) => [...part.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]));
}

/**
 * One pattern matching every name `source` binds to a caught error, or `null`
 * when it catches nothing — a file with no `catch` gets no extra rule.
 */
function caughtIdentifier(source) {
  const names = new Set();
  for (const [, binding] of source.matchAll(CATCH_CLAUSE))
    for (const name of boundNames(binding)) names.add(name);
  for (const [, param] of source.matchAll(CATCH_CALLBACK)) names.add(param);
  if (names.size === 0) return null;
  // `$` is legal in an identifier and meaningful in a regex; the lookarounds
  // stand in for `\b`, which does not hold beside a leading `$`.
  const alternation = [...names]
    .map((name) => name.replace(/\$/g, '\\$'))
    .join('|');
  return new RegExp(`(?<![\\w$])(?:${alternation})(?![\\w$])`);
}

// Calls whose match is not an error at all, each with the reason. `.reason`
// earns its place in the property list because `allSettled` uses it, and this
// is the other thing that word is used for on this surface — a verdict string
// the route wrote itself. Exempted rather than unwrapped: wrapping it would
// dress a hand-authored literal up as untrusted input, which is a different
// lie from the one this file exists to stop.
const ALLOWED = [
  {
    file: 'src/app/api/seo-report/route.js',
    match: 'credential.reason',
    reason:
      "readCredentials() returns this route's own hand-written verdicts — the strings are in the file above it",
  },
];

/**
 * Reduce an argument list to the EXPRESSIONS in it — no comments, no prose.
 *
 * A scanner that reads raw source reads the words people write about errors as
 * if they were errors. Both false positives on its first run were exactly that:
 * a comment explaining that a settled rejection IS an error, and a log line
 * whose literal text contains the word "failure". Neither can carry anything,
 * because a string this repository typed is not what a library quoted back.
 *
 * Template literals keep their `${…}` interpolations — those are expressions,
 * and `${err?.message}` inside a template is precisely the shape worth
 * catching — while the fixed text around them goes.
 */
function expressionsOnly(args) {
  return args
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*?`/g, (literal) =>
      [...literal.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' '),
    )
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ');
}

/**
 * Remove the spans already inside the boundary, rather than skipping the call.
 *
 * `args.includes('describeError(')` was the earlier test, and it passes a call
 * the moment ONE argument is wrapped — so `console.error(describeError(err),
 * other.message)` read as covered. Cutting the wrapped spans out and inspecting
 * what is left asks the question per value instead of per call.
 */
function stripWrapped(args) {
  let out = args;
  for (const wrapper of ['describeError(', 'redactSecrets(']) {
    let at = out.indexOf(wrapper);
    while (at !== -1) {
      let depth = 1;
      let index = at + wrapper.length;
      for (; index < out.length && depth > 0; index += 1) {
        if (out[index] === '(') depth += 1;
        else if (out[index] === ')') depth -= 1;
      }
      out = out.slice(0, at) + out.slice(index);
      at = out.indexOf(wrapper);
    }
  }
  return out;
}

/**
 * The console calls in `source` that hand something error-derived to a log.
 *
 * Exported shape rather than inlined in the sweep so the regression cases below
 * can run it over fixtures — a scanner whose detection is only ever exercised
 * by the code it passes on is a scanner nobody has tested.
 */
export function unguardedCalls(source, relativeFile = '') {
  const found = [];
  const caught = caughtIdentifier(source);
  for (const args of consoleCallArguments(source)) {
    const remainder = expressionsOnly(stripWrapped(args)).replace(
      SAFE_PROPERTY,
      '',
    );
    if (
      !UNSAFE_PROPERTY.test(remainder) &&
      !ERROR_IDENTIFIER.test(remainder) &&
      !caught?.test(remainder)
    )
      continue;
    if (
      ALLOWED.some(
        (entry) => entry.file === relativeFile && args.includes(entry.match),
      )
    )
      continue;
    found.push(args.replace(/\s+/g, ' ').trim());
  }
  return found;
}

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

      const relative = path.relative(process.cwd(), file);
      for (const call of unguardedCalls(readFileSync(file, 'utf8'), relative)) {
        unguarded.push(`${relative}: console(${call.slice(0, 90)}…)`);
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

// ── The scanner's own detection, tested against what it used to miss ────────
// A guard is only worth the shapes it can see, and this one shipped blind to
// two that were live on the surface it claimed to cover. Asserting over
// fixtures rather than over the repository is the difference between "nothing
// is wrong today" and "this would notice".
describe('the scanner sees an error however it is spelled', () => {
  const CAUGHT = [
    ["a settled rejection", "console.warn('x:', result.reason?.message);"],
    ['the rejection itself', "console.warn('x:', settled.reason);"],
    ['a plural GraphQL field', "console.warn(`x ${json.errors[0]?.message}`);"],
    ['a mapped error list', "console.warn('x:', json.errors.map((e) => e.message).join('; '));"],
    ['a bare caught error', "console.error('x:', err);"],
    ['a differently named one', "console.error('x:', abstractErr);"],
    ['a bare singular', "console.error('x:', error);"],
    ['a bare plural', "console.warn('x:', json.errors);"],
    [
      'a catch binding this file cannot spell',
      "try { send(); } catch (exception) { console.error('x:', exception); }",
    ],
    [
      'a one-letter catch binding',
      "try { send(); } catch (e) { console.error('x:', e); }",
    ],
    [
      'a destructured catch binding',
      "try { send(); } catch ({ message: detail }) { console.error('x:', detail); }",
    ],
    [
      'a rejection callback parameter',
      "load().catch((oops) => console.warn('x:', oops));",
    ],
    ['a cause chain', "console.error('x:', err.cause);"],
    ['a stack', "console.error('x:', failure.stack);"],
    [
      'one wrapped argument beside one that is not',
      "console.error(describeError(err), other.message);",
    ],
  ];

  for (const [label, fixture] of CAUGHT) {
    it(`flags ${label}`, () => {
      expect(unguardedCalls(fixture)).toHaveLength(1);
    });
  }

  const ALLOWED_SHAPES = [
    ['a wrapped error', "console.error('x:', describeError(err));"],
    ['a wrapped composed line', "console.warn(redactSecrets(`x ${err?.message}`));"],
    ['a name only', "console.error('x:', err?.name);"],
    ['a status only', "console.warn('x:', res.status, err?.statusCode);"],
    ['a fixed string', "console.error('seo-report: CRON_SECRET is not set');"],
    [
      'a catch binding read for its name alone',
      "try { send(); } catch (e) { console.error('x:', e?.name); }",
    ],
    [
      'a file that binds a name it never logs',
      "try { send(); } catch (e) { report(e); }\nconsole.info('warmed');",
    ],
  ];

  for (const [label, fixture] of ALLOWED_SHAPES) {
    it(`passes ${label}`, () => {
      expect(unguardedCalls(fixture)).toEqual([]);
    });
  }
});
