import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// How every next/image says when it loads (issue #55).
//
// `priority` is deprecated in Next 16. It was also used everywhere: all
// fifteen full-bleed backgrounds carried it, and each one sent a high-priority
// <link rel=preload> for an image that a production probe of every route, at
// desktop and phone sizes, never once recorded as the LCP. The LCP on those
// pages is text, and the preloads only competed with the fonts it needs.
//
// The policy now has three intents:
//   preload                                 the measured LCP image, and
//                                           nothing else (this allowlist)
//   loading="eager" + fetchPriority="low"   above the fold, never the LCP
//                                           (backgrounds, the home laptop)
//   (default lazy)                          everything else
//
// Why `eager` is never enough on its own: React 19's server renderer emits a
// <link rel=preload> for up to ten non-lazy <img> elements per page, and skips
// only `loading="lazy"` and `fetchPriority="low"` ones. Removing `priority`
// alone therefore changed nothing in the HTML; the perf spec caught it.
//
// Adding a `preload` means measuring first: which route, which viewport, and
// what the LCP entry was. Write that down here, or the preload is a guess.
// tests/perf/image-loading.spec.js checks the same policy in a real browser.

const PRELOAD_ALLOWED = {
  'src/app/[locale]/(home)/page.js': 'the home backdrop is the LCP on a phone (the <h1> is on desktop)',
  'src/components/qualifications/Carousel.jsx': 'the centre certificate is the LCP of /qualifications on a phone',
};

const SOURCES = walk('src', /\.(m?js|jsx)$/);

// The attribute text of every <Image …> element in a file. Anchored on the JSX
// tag name, so a plain <img> or a `new Image()` never matches. The tag ends at
// the first `>` outside braces and quotes, so an arrow function in an
// attribute (`onLoad={() => …}`) does not cut it short.
function imageTags(code) {
  const tags = [];
  for (const match of code.matchAll(/<Image\b/g)) {
    let depth = 0;
    let quote = null;
    let i = match.index + match[0].length;
    for (; i < code.length; i += 1) {
      const ch = code[i];
      if (quote) {
        if (ch === quote && code[i - 1] !== '\\') quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(code.slice(match.index + match[0].length, i));
  }
  return tags;
}

describe('image loading policy', () => {
  it('uses no deprecated `priority` on next/image', () => {
    const offenders = SOURCES.filter((file) => {
      const code = stripComments(read(file));
      if (!/from\s+['"]next\/image['"]/.test(code)) return false;
      return imageTags(code).some((attrs) => /(^|\s)priority(\s|=|$)/.test(attrs));
    });
    expect(
      offenders,
      'Replace `priority`: `preload` for the measured LCP image only, `loading="eager"` for ' +
        'anything above the fold that is not the LCP.',
    ).toEqual([]);
  });

  it('preloads only the images that measured as an LCP', () => {
    const preloading = SOURCES.filter((file) => {
      const code = stripComments(read(file));
      if (!/from\s+['"]next\/image['"]/.test(code)) return false;
      return imageTags(code).some((attrs) => /(^|\s)preload(\s|=|$)/.test(attrs));
    });
    expect(
      preloading.sort(),
      'A new <Image preload> needs a measured reason in PRELOAD_ALLOWED (route, viewport, LCP entry).',
    ).toEqual(Object.keys(PRELOAD_ALLOWED).sort());
  });

  it('an eager image that is not the LCP is fetched at low priority (so React does not preload it)', () => {
    const offenders = SOURCES.filter((file) => {
      const code = stripComments(read(file));
      if (!/from\s+['"]next\/image['"]/.test(code)) return false;
      return imageTags(code).some(
        (attrs) =>
          /(^|\s)loading="eager"/.test(attrs) &&
          !/(^|\s)preload(\s|=|$)/.test(attrs) &&
          !/(^|\s)fetchPriority="low"/.test(attrs),
      );
    });
    expect(
      offenders,
      'Add fetchPriority="low" beside loading="eager": without it React 19 preloads the image in the head.',
    ).toEqual([]);
  });

  it('keeps every allowlisted preload in place (a stale allowlist entry is a lie)', () => {
    for (const file of Object.keys(PRELOAD_ALLOWED)) {
      const tags = imageTags(stripComments(read(file)));
      expect(tags.some((attrs) => /(^|\s)preload(\s|=|$)/.test(attrs)), file).toBe(true);
    }
  });
});
