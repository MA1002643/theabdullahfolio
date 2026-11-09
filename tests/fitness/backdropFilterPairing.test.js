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
// What it checks: every `className` in src/, as written (string literals and
// the literal parts of template strings, conditional branches included). The
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

// The class tokens a className attribute can apply: quoted strings anywhere in
// the attribute's expression, and a template literal's text.
function classNameTokens(source) {
  const found = [];
  const attr = /className=(?:"([^"]*)"|'([^']*)'|\{((?:[^{}]|\{[^{}]*\})*)\})/g;
  for (const m of source.matchAll(attr)) {
    const text = m[1] ?? m[2] ?? [...m[3].matchAll(/(["'`])((?:(?!\1).)*)\1/gs)].map((s) => s[2].replace(/\$\{[^}]*\}/g, ' ')).join(' ');
    const line = source.slice(0, m.index).split('\n').length;
    const tokens = text
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
