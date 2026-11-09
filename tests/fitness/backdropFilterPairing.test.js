import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// `backdrop-filter` and `filter` never share one element's classes (issue #198).
//
// The qualifications carousel's Prev/Next buttons wore `.custom-bg-abt`
// (`backdrop-filter: blur(12px)`) and `.text-fire-amber` (a `filter:
// drop-shadow()` halo) on the SAME element. Linux WebKit, which is GNOME Web,
// every WebKitGTK/WPE browser and Playwright's Linux WebKit, crashed its web
// process on every load of /qualifications. Removing either property, or moving
// the amber onto an inner <span>, stopped it: 3 of 3 loads crashed before, 0 of
// 3 after. Apple's WebKit hands backdrop layers to CoreAnimation, a different
// path, so macOS and iOS never showed it, and nor did Chromium or Firefox.
//
// The pair is NECESSARY, not sufficient: the same two properties on a bare page
// did not crash, so the page's fixed, blurred backdrop layers play a part too.
// That is why this guards the pairing everywhere, not only on that page: which
// pages are "safe" is not something anyone can see from the code.
//
// What it checks: every `className` in src/, as written: string literals, the
// literal parts of template strings, and the strings inside a template's
// `${…}` interpolations, every conditional branch included. The
// classes that set each property are READ from globals.css, so a new class
// that sets `filter` is covered without editing this file, and Tailwind's own
// filter utilities are matched by name.
//
// What it does not check: an inline `style={{ filter }}` (MetricPopover's
// panel pairs `.custom-bg-abt` with an inline drop-shadow and has not crashed
// anywhere it was tested), or classes added at runtime. Those are reviewed by
// hand.

const CSS = 'src/app/globals.css';

const TW_BACKDROP = /^backdrop-(blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia)\b/;
const TW_FILTER = /^(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia)(-|$)/;

function classesSetting() {
  const backdrop = new Set();
  const filter = new Set();
  postcss.parse(read(CSS), { from: CSS }).walkDecls((decl) => {
    if (decl.value.trim() === 'none') return;
    const target = /^(-webkit-)?backdrop-filter$/.test(decl.prop) ? backdrop : decl.prop === 'filter' ? filter : null;
    if (!target || decl.parent?.type !== 'rule') return;
    for (const selector of decl.parent.selectors) {
      // Only a selector that IS one class (optionally with a state) puts the
      // property on every element that wears the class.
      const match = selector.trim().match(/^\.([\w-]+)(:[\w-]+)*$/);
      if (match) target.add(match[1]);
    }
  });
  return { backdrop, filter };
}

// A tiny scanner over a JS expression, from `start`, until the `}` that closes
// it (or the end of the text). Every string literal it meets is pushed onto
// `out`: quoted strings, a template's literal text, AND the strings inside a
// template's `${…}` interpolations, recursively. The last is the case a regex
// cannot do: `custom-bg-abt ${on ? 'text-fire-amber' : ''}` puts the crashing
// pair on one element whenever `on` is true. Returns the index after the `}`.
function scanExpression(text, start, out) {
  let i = start;
  let depth = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out.push(text.slice(i + 1, j));
      i = j + 1;
    } else if (c === '`') {
      i = scanTemplate(text, i + 1, out);
    } else if (c === '{') {
      depth += 1;
      i += 1;
    } else if (c === '}') {
      if (depth === 0) return i + 1;
      depth -= 1;
      i += 1;
    } else {
      i += 1;
    }
  }
  return i;
}

// From just after an opening backtick: the literal text is pushed in pieces (an
// interpolation splits it, so a class can never be glued across one), and each
// `${…}` is scanned as an expression. Returns the index after the closing tick.
function scanTemplate(text, start, out) {
  let i = start;
  let piece = '';
  while (i < text.length && text[i] !== '`') {
    if (text[i] === '\\') {
      piece += text.slice(i, i + 2);
      i += 2;
    } else if (text[i] === '$' && text[i + 1] === '{') {
      out.push(piece);
      piece = '';
      i = scanExpression(text, i + 2, out);
    } else {
      piece += text[i];
      i += 1;
    }
  }
  out.push(piece);
  return i + 1;
}

/** Every string literal a className value can contribute, as written. */
function classNameLiterals(source, at) {
  const out = [];
  const c = source[at];
  if (c === '"' || c === "'") {
    const end = source.indexOf(c, at + 1);
    out.push(source.slice(at + 1, end === -1 ? undefined : end));
  } else if (c === '{') {
    scanExpression(source, at + 1, out);
  }
  return out;
}

// The class tokens each className attribute can apply: every literal in its
// value, all branches of every conditional together.
function classNameTokens(source) {
  const found = [];
  for (const m of source.matchAll(/className=/g)) {
    const at = m.index + m[0].length;
    const line = source.slice(0, m.index).split('\n').length;
    const tokens = classNameLiterals(source, at)
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/^!/, '').split(':').pop());
    found.push({ line, tokens });
  }
  return found;
}

describe('backdrop-filter and filter stay on separate elements', () => {
  const { backdrop, filter } = classesSetting();

  it('reads the classes that set each property from globals.css', () => {
    // The two that crashed. If either stops setting its property, this guard
    // has lost its anchor and needs a fresh look rather than a quiet pass.
    expect(backdrop.has('custom-bg-abt')).toBe(true);
    expect(filter.has('text-fire-amber')).toBe(true);
  });

  it('reads the class literals inside template interpolations', () => {
    // The regression (#198 review): matching the template as one string and
    // blanking its `${…}` dropped the conditional branch, so this crashing
    // pair passed the guard.
    const tokens = (src) => classNameTokens(src).map((f) => f.tokens);
    expect(tokens("<b className={`custom-bg-abt ${enabled ? 'text-fire-amber' : ''}`} />")).toEqual([
      ['custom-bg-abt', 'text-fire-amber'],
    ]);
    // Nested templates and a call inside the interpolation, and no class glued
    // across an interpolation boundary.
    expect(tokens('<b className={clsx(`a${x ? `b ${y ? "c" : \'d\'}` : cn({ e: 1 }, "f")}g`)} />')).toEqual([
      ['a', 'b', 'c', 'd', 'f', 'g'],
    ]);
    expect(tokens('<b className="x y" /><i className=\'z\' />')).toEqual([['x', 'y'], ['z']]);
  });

  it('no className combines a backdrop-filter class with a filter class', () => {
    const isBackdrop = (t) => backdrop.has(t) || TW_BACKDROP.test(t);
    const isFilter = (t) => filter.has(t) || TW_FILTER.test(t);
    const offenders = [];
    for (const file of walk('src', /\.(m?js|jsx)$/)) {
      for (const { line, tokens } of classNameTokens(stripComments(read(file)))) {
        const b = tokens.filter(isBackdrop);
        const f = tokens.filter(isFilter);
        if (b.length && f.length) offenders.push(`${file}:${line} ${b.join(' ')} + ${f.join(' ')}`);
      }
    }
    expect(offenders, 'move the filtered content onto an inner element (see Carousel.jsx Prev/Next)').toEqual([]);
  });
});
