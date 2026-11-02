import { ALL_ROUTES, MISSING_ROUTE } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';
import { leaks } from '../support/pseudo.js';

// The pseudo-localisation gate (issue #82 follow-up). Every route is rendered
// in `en-XA`, the fake locale where each catalogue string reads `[Ȧƀǿǿŭŭŧ ḿḗḗ]`,
// and the visible text, the accessible names and the document title are read
// back. Any plain ASCII word outside a bracket was never translatable — a
// hard-coded label, a string built in code, an English fallback — and fails
// the route with the word and the text it sat in.
//
// It needs a build made with NEXT_PUBLIC_I18N_PSEUDO=1 after `npm run
// i18n:pseudo` (CI's build job does both). Against an ordinary build /en-XA is
// a 404, and the first assertion says so rather than reporting a page of leaks.
//
// What is NOT English-that-leaked, and is skipped:
//   • `translate="no"` subtrees — the HTML attribute for "not to be
//     translated": names, code, a visitor's own guestbook words;
//   • `lang="en"` islands — content declared English by decision (the notes,
//     the privacy body: `EnglishOnly`), already announced to the reader;
//   • `code`, `pre`, `kbd`, `samp` — literal by definition — and `time`,
//     whose content is Intl output: CLDR has no data for a pseudo-locale, so
//     it formats as English here and correctly everywhere else (i18nFormat);
//   • anything not rendered (`checkVisibility()` false). Screen-reader-only
//     text is rendered (clipped, not hidden), so it IS checked.

const PSEUDO = '/en-XA';
const pseudoPath = (path) => (path === '/' ? PSEUDO : `${PSEUDO}${path}`);
const ATTRIBUTES = ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'alt', 'placeholder'];

// The <title> suffix every page carries (src/app/[locale]/layout.js). It keeps
// the Latin name in every locale by decision (docs/seo.md §18), so it is not
// prose the catalogues forgot.
const TITLE_SUFFIX = ' · Muhammad Abdullah';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function collect(page) {
  return page.evaluate((attributes) => {
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'CODE', 'PRE', 'KBD', 'SAMP', 'TIME']);
    // Where a leak sat, for the report: the element and its first class.
    const where = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;
    const skipped = (el) => {
      for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
        if (SKIP_TAGS.has(node.tagName)) return true;
        if (node.getAttribute('translate') === 'no') return true;
        if (node.getAttribute('lang') === 'en') return true;
      }
      return false;
    };
    const text = [];
    const places = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      const el = node.parentElement;
      if (!el || skipped(el)) continue;
      // SVG text has no checkVisibility on older engines; an unrendered SVG
      // has no box, which getClientRects reports.
      const visible = el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0;
      if (!visible) continue;
      text.push(node.nodeValue);
      places.push(where(el));
    }
    const attrs = [];
    for (const el of document.body.querySelectorAll(attributes.map((a) => `[${a}]`).join(','))) {
      if (skipped(el)) continue;
      for (const a of attributes) {
        const value = el.getAttribute(a);
        if (value && value.trim()) attrs.push(`${where(el)}[${a}]=${value}`);
      }
    }
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
    // A heading the page marks as a name (a project) may name the page too.
    const literalH1 = [...document.querySelectorAll('h1[translate="no"]')].map((h) => h.textContent.trim());
    return { text, places, attrs, title: document.title, canonical, literalH1, lang: document.documentElement.lang };
  }, ATTRIBUTES);
}

// The document title, unless the page DECLARES itself English: a page that is
// English by decision (the notes, the privacy policy — `translated: false` in
// src/lib/og/meta.js) canonicalises to its unprefixed English URL, so that
// declaration is read off the page rather than kept as a list here.
function titleLeaks(title, canonical, literalH1) {
  if (canonical && !new URL(canonical, 'https://x.invalid').pathname.startsWith(PSEUDO)) return [];
  const own = title.endsWith(TITLE_SUFFIX) ? title.slice(0, -TITLE_SUFFIX.length) : title;
  if (literalH1.some((h) => h.localeCompare(own, undefined, { sensitivity: 'accent' }) === 0)) return [];
  return leaks([own]).map((l) => ({ ...l, text: `<title> ${title}` }));
}

function report(found) {
  return found.map(({ word, text }) => `"${word}"  in  ${text}`);
}

test.describe('pseudo-locale: no untranslated English', () => {
  for (const path of ALL_ROUTES) {
    test(`${pseudoPath(path)} has no plain English`, async ({ page }) => {
      const response = await page.goto(pseudoPath(path));
      expect(
        response.status(),
        `${pseudoPath(path)} did not render — build with NEXT_PUBLIC_I18N_PSEUDO=1 after \`npm run i18n:pseudo\``,
      ).toBe(200);
      await settle(page);
      await page.waitForTimeout(1500); // past every entrance, even under reduced motion
      const { text, places, attrs, title, canonical, literalH1, lang } = await collect(page);
      expect(lang).toBe('en-XA');
      // Text nodes share bracket depth (a message spans its rich-text tags);
      // each attribute and the title are one message on their own.
      const found = [
        ...leaks(text).map((l) => ({ ...l, text: `${places[l.index]}: ${l.text}` })),
        ...attrs.flatMap((a) => leaks([a.slice(a.indexOf('=') + 1)]).map((l) => ({ ...l, text: `${a.slice(0, a.indexOf('='))}: ${l.text}` }))),
        ...titleLeaks(title, canonical, literalH1),
      ];
      expect(report(found), `plain English on ${pseudoPath(path)}`).toEqual([]);
    });
  }

  test.describe('the 404 page', () => {
    test.use({ allowedErrors: [[/status of 404/]] });
    test(`${pseudoPath(MISSING_ROUTE)} has no plain English`, async ({ page }) => {
      await page.goto(pseudoPath(MISSING_ROUTE));
      await settle(page);
      const { text, attrs } = await collect(page);
      const found = [...leaks(text), ...attrs.flatMap((a) => leaks([a.slice(a.indexOf('=') + 1)]))];
      expect(report(found)).toEqual([]);
    });
  });
});
