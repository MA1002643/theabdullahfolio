import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Read-only access to the source tree for the fitness suite (issue #92, L1).
// Fitness tests assert properties of the CODE itself — which files read which
// env vars, what a route exports — so they need the files, not the modules.

export const ROOT = process.cwd();

/** Every file under `dir` (repo-relative) whose name matches `pattern`. */
export function walk(dir, pattern = /\.(m?js|jsx)$/) {
  const out = [];
  const visit = (abs) => {
    for (const entry of readdirSync(abs)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = path.join(abs, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (pattern.test(entry)) out.push(path.relative(ROOT, full));
    }
  };
  visit(path.join(ROOT, dir));
  return out.sort();
}

export const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');

/**
 * Source with comments blanked out, literals and line structure kept. A
 * fitness rule about what the code DOES must not be tripped by a comment
 * describing what it doesn't.
 */
export const stripComments = (source) => codeOnly(source, { blankStrings: false });

/**
 * Source reduced to its executable skeleton: comments, and optionally the
 * contents of string and template literals, blanked to spaces with every
 * newline kept, so line numbers still point at the original file.
 *
 * One pass with a small state machine, because the cheap two-regex version
 * cannot be right in either order: stripping `//` comments first cuts a
 * template string that contains `//`, and blanking templates first mispairs on
 * a backtick inside a comment. Both occur in this repository's own tests.
 * Template `${…}` holes are scanned as code, nested to any depth.
 *
 * @param {string} source
 * @param {{ blankStrings?: boolean }} [options] keep literal contents when false.
 */
export function codeOnly(source, { blankStrings = true } = {}) {
  let out = '';
  let i = 0;
  const blank = (ch) => (ch === '\n' ? '\n' : ' ');
  // Stack of contexts: 'code' | 'template'. Braces are counted per code frame
  // so the `}` that closes a `${` hole returns to the template it came from.
  const stack = [{ mode: 'code', depth: 0 }];
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    const top = stack[stack.length - 1];
    if (top.mode === 'template') {
      if (ch === '\\') {
        out += blankStrings ? blank(ch) + blank(next ?? '') : ch + (next ?? '');
        i += 2;
      } else if (ch === '`') {
        stack.pop();
        out += ch;
        i += 1;
      } else if (ch === '$' && next === '{') {
        stack.push({ mode: 'code', depth: 0 });
        out += '${';
        i += 2;
      } else {
        out += blankStrings ? blank(ch) : ch;
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (ch === "'" || ch === '"') {
      out += ch;
      i += 1;
      while (i < source.length && source[i] !== ch && source[i] !== '\n') {
        const step = source[i] === '\\' ? 2 : 1;
        const chunk = source.slice(i, i + step);
        out += blankStrings ? chunk.replace(/[^\n]/g, ' ') : chunk;
        i += step;
      }
      if (i < source.length) {
        out += source[i];
        i += 1;
      }
    } else if (ch === '`') {
      stack.push({ mode: 'template' });
      out += ch;
      i += 1;
    } else {
      if (ch === '{') top.depth += 1;
      if (ch === '}') {
        if (top.depth === 0 && stack.length > 1) {
          stack.pop();
          out += ch;
          i += 1;
          continue;
        }
        top.depth -= 1;
      }
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** True when the module opts into the client bundle. */
export const isClientModule = (source) =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(source);

/** `{ name, line }` for every `process.env.NAME` / `process.env['NAME']` read. */
export function envReads(source) {
  const code = stripComments(source);
  const reads = [];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\]/g,
  ];
  for (const re of patterns) {
    for (const match of code.matchAll(re)) {
      reads.push({ name: match[1], line: code.slice(0, match.index).split('\n').length });
    }
  }
  return reads;
}

/** Every variable NAME `.env.example` declares, commented-out entries included. */
export function envExampleNames() {
  return new Set(
    [...read('.env.example').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
  );
}
