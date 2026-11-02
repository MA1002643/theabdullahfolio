// Shared catalogue logic for the i18n scripts (issue #82): the translator
// (scripts/i18n-translate.mjs), the audit (scripts/i18n-audit.mjs) and their
// unit tests all read catalogues through these functions, so "what is a key",
// "what counts as changed" and "what makes a translation structurally valid"
// are each decided once.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';

export const MESSAGES_DIR = 'messages';
export const LOCK_FILE = join(MESSAGES_DIR, '.i18n-lock.json');
export const NOTES_DIR = join(MESSAGES_DIR, '_notes');

const isObject = (v) => v !== null && typeof v === 'object';

/** `{a: {b: 'x'}}` → `{'a.b': 'x'}`. Arrays flatten by index. */
export function flatten(tree, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(tree ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

/**
 * Rebuild a nested catalogue in the SHAPE AND ORDER of the English template,
 * taking each leaf from `flat` (falling back to nothing — missing keys are
 * simply absent, and the runtime falls back to English).
 */
export function shapeLike(template, flat, prefix = '') {
  const out = Array.isArray(template) ? [] : {};
  for (const [key, value] of Object.entries(template)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      const child = shapeLike(value, flat, path);
      if (Object.keys(child).length) out[key] = child;
    } else if (flat[path] !== undefined) {
      out[key] = flat[path];
    }
  }
  return out;
}

/** Short content hash of an English source string. */
export const sourceHash = (value) =>
  createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

export const readJson = (file, fallback = {}) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

export const writeJson = (file, value) =>
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** Namespace names, from `messages/en/*.json`. */
export function namespaces(root = '.') {
  return readdirSync(join(root, MESSAGES_DIR, 'en'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function loadNamespace(root, locale, ns) {
  const file = join(root, MESSAGES_DIR, locale, `${ns}.json`);
  return existsSync(file) ? readJson(file) : null;
}

// ── ICU structure ───────────────────────────────────────────────────────────
// A translation may reword anything, but it may not change the message's
// INTERFACE: the arguments the code passes in, the rich-text tags the code
// renders, and the select branches the code relies on. Plural branches are
// deliberately NOT compared — Arabic needs zero/one/two/few/many/other and
// Japanese needs only `other`, so a correct translation has different
// branches; it must only keep `other`, which every language requires.

/**
 * The interface of an ICU message: `{ args, tags, selects, plurals }`, or
 * `{ error }` when it does not parse.
 */
export function icuSignature(message) {
  let ast;
  try {
    ast = parse(String(message));
  } catch (error) {
    return { error: error?.message ?? String(error) };
  }
  const args = new Set();
  const tags = [];
  const selects = {};
  const plurals = {};
  // Plural branches whose rich-text tags differ from their own `other`.
  const unevenPlurals = [];
  const walk = (nodes, into) => {
    for (const node of nodes) {
      switch (node.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          args.add(node.value);
          break;
        case TYPE.select:
          args.add(node.value);
          selects[node.value] = Object.keys(node.options).sort();
          Object.values(node.options).forEach((o) => walk(o.value, into));
          break;
        case TYPE.plural: {
          // Languages have different numbers of plural forms (Japanese has
          // only `other`, Polish four), so a tag repeated once per branch
          // occurs a different number of TIMES in a correct translation.
          // A plural contributes its `other` branch's tags to the message's
          // count, and every other branch must carry exactly those tags.
          args.add(node.value);
          plurals[node.value] = Object.keys(node.options).sort();
          const branches = Object.entries(node.options).map(([key, o]) => {
            const own = [];
            walk(o.value, own);
            return [key, own.sort()];
          });
          const other = (branches.find(([key]) => key === 'other') ?? branches[0])?.[1] ?? [];
          for (const [key, own] of branches) {
            if (own.join() !== other.join()) unevenPlurals.push(`${node.value}.${key}`);
          }
          into.push(...other);
          break;
        }
        case TYPE.tag:
          into.push(node.value);
          walk(node.children, into);
          break;
        default:
      }
    }
  };
  walk(ast, tags);
  return { args: [...args].sort(), tags: tags.sort(), selects, plurals, unevenPlurals };
}

/**
 * Problems with `translation` as a translation of `source`, as strings (empty
 * array = structurally sound).
 */
export function icuProblems(source, translation) {
  if (typeof translation !== 'string') return ['not a string'];
  if (typeof source !== 'string') return [];
  const a = icuSignature(source);
  const b = icuSignature(translation);
  if (a.error) return [];
  if (b.error) return [`ICU does not parse: ${b.error}`];
  const problems = [];
  const missing = a.args.filter((x) => !b.args.includes(x));
  const extra = b.args.filter((x) => !a.args.includes(x));
  if (missing.length) problems.push(`missing argument(s): ${missing.join(', ')}`);
  if (extra.length) problems.push(`unknown argument(s): ${extra.join(', ')}`);
  if (a.tags.join() !== b.tags.join()) {
    problems.push(`rich-text tags differ: [${a.tags}] vs [${b.tags}]`);
  }
  // A branch may legitimately drop a tag only where English's own branches
  // already disagree (e.g. `one {a mark} other {<n>#</n> marks}`).
  const unevenInSource = new Set(a.unevenPlurals.map((path) => path.split('.')[0]));
  for (const path of b.unevenPlurals) {
    if (!unevenInSource.has(path.split('.')[0])) {
      problems.push(`plural branch ${path} has different rich-text tags from "other"`);
    }
  }
  for (const [name, options] of Object.entries(a.selects)) {
    if ((b.selects[name] ?? []).join() !== options.join()) {
      problems.push(`select {${name}} branches differ`);
    }
  }
  for (const name of Object.keys(a.plurals)) {
    if (!b.plurals[name]?.includes('other')) {
      problems.push(`plural {${name}} has no "other" branch`);
    }
  }
  return problems;
}

// ── Pseudo-localisation ─────────────────────────────────────────────────────
// The fake locale CI renders every page in (`en-XA`, scripts/i18n-pseudo.mjs).
// Every catalogue string becomes `[Ȧƀǿǿŭŭŧ ḿḗḗ]`: each ASCII letter swapped for
// an accented look-alike (so ANY plain ASCII letter left on a pseudo page came
// from somewhere other than a catalogue), each vowel doubled (~30% longer,
// roughly German's expansion over English, so a layout that only fits English
// shows it), and the whole message bracketed (so a string clipped by its box,
// or two strings concatenated in code, is visible as a missing or doubled
// bracket). Only LITERAL text is touched: arguments, plural and select
// keywords, `#` and rich-text tag names are the code's interface and stay
// byte-for-byte, which is what keeps the result valid ICU with the same
// `icuSignature` as its English.

const PSEUDO_LOWER = 'ȧƀƈḓḗƒɠħīĵķŀḿƞǿƥɋřşŧŭṽẇẋẏẑ';
const PSEUDO_UPPER = 'ȦƁƇḒḖƑƓĦĪĴĶĿḾȠǾƤɊŘŞŦŬṼẆẊẎẐ';
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U']);

/** Every character the pseudo-locale writes, for a detector to recognise. */
export const PSEUDO_CHARS = `${PSEUDO_LOWER}${PSEUDO_UPPER}[]`;

/** Accent and stretch plain text (no ICU awareness — see `pseudoMessage`). */
export function pseudoText(text) {
  let out = '';
  for (const ch of String(text)) {
    const code = ch.charCodeAt(0);
    let mapped = ch;
    if (code >= 97 && code <= 122) mapped = PSEUDO_LOWER[code - 97];
    else if (code >= 65 && code <= 90) mapped = PSEUDO_UPPER[code - 65];
    out += VOWELS.has(ch) ? mapped + mapped : mapped;
  }
  return out;
}

/**
 * An ICU message in the pseudo-locale. A string that does not parse as ICU is
 * accented as plain text — the audit already fails English that does not
 * parse, so this only ever meets raw (`t.raw`) values.
 */
export function pseudoMessage(message) {
  if (typeof message !== 'string' || message === '') return message;
  let ast;
  try {
    ast = parse(message);
  } catch {
    return `[${pseudoText(message)}]`;
  }
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === TYPE.literal) node.value = pseudoText(node.value);
      else if (node.type === TYPE.tag) walk(node.children);
      else if (node.type === TYPE.select || node.type === TYPE.plural) {
        for (const option of Object.values(node.options)) walk(option.value);
      }
    }
  };
  walk(ast);
  return `[${printAST(ast)}]`;
}

/** A whole catalogue tree in the pseudo-locale (arrays and nesting kept). */
export function pseudoCatalogue(tree) {
  if (typeof tree === 'string') return pseudoMessage(tree);
  if (Array.isArray(tree)) return tree.map(pseudoCatalogue);
  if (isObject(tree)) {
    return Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, pseudoCatalogue(v)]));
  }
  return tree;
}
