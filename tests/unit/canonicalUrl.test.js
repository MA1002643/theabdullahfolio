import { describe, expect, it } from 'vitest';

import { absoluteUrl, alternatesFor } from '@/lib/seo/canonical';
import { ORIGIN } from '@/lib/seo/site';

// ── Why this helper needed a suite of its own ───────────────────────────────
// `absoluteUrl` was already referenced by two test files, but only as its OWN
// ORACLE — `expect(canonical).toBe(absoluteUrl(route.path))` compares the
// route's output against the same function that produced it, so both sides of
// the assertion move together and a bug inside the helper is invisible. Every
// rule it documents was therefore unpinned.
//
// The regression that exposed it: `//about` was returned untouched by an
// early-out that grouped protocol-relative input with absolute URLs. It is not
// absolute — it names no scheme and no origin, and a browser reads the first
// segment as a HOST, so a canonical of `//about` resolves to `https://about/`.
// The line that collapses leading slashes sat directly below, unreachable for
// the one input its comment named.
//
// So these assert the PROPERTY rather than the spelling: whatever goes in, what
// comes out must resolve to this site's origin.

describe('absoluteUrl — leading slashes cannot become a host', () => {
  it.each([
    ['//about', `${ORIGIN}/about`],
    ['///about', `${ORIGIN}/about`],
    ['////projects/1', `${ORIGIN}/projects/1`],
    // The degenerate forms: nothing but slashes is still the root.
    ['//', ORIGIN],
    ['///', ORIGIN],
  ])('%s → %s', (input, expected) => {
    expect(absoluteUrl(input)).toBe(expected);
  });

  it('never emits a protocol-relative reference, whatever the input', () => {
    // The property the spelling-level cases above are evidence for. A value
    // starting `//` is the only shape that can silently change host.
    const inputs = [
      '//about',
      '///about',
      '//',
      '//evil.example/about',
      '/about',
      'about',
      '/',
      '',
    ];
    for (const input of inputs) {
      expect(absoluteUrl(input).startsWith('//')).toBe(false);
    }
  });

  it('resolves to this origin when a browser reads it', () => {
    // The end of the chain, stated the way the bug actually bit: a canonical is
    // resolved against the page it appears on. `//evil.example/about` returned
    // verbatim would have pointed every consumer at another host.
    const page = `${ORIGIN}/some/page`;
    for (const input of ['//about', '///about', '//evil.example/about', '/x']) {
      expect(new URL(absoluteUrl(input), page).origin).toBe(ORIGIN);
    }
  });
});

describe('absoluteUrl — the documented rules', () => {
  it.each([
    // Site-relative, the ordinary case.
    ['/about', `${ORIGIN}/about`],
    ['/projects/1', `${ORIGIN}/projects/1`],
    // A missing leading slash is supplied.
    ['about', `${ORIGIN}/about`],
    // The site serves no trailing slashes, so canonicals carry none.
    ['/projects/1/', `${ORIGIN}/projects/1`],
    ['/projects/1///', `${ORIGIN}/projects/1`],
    // ...except the root, which is the bare origin rather than `ORIGIN + '/'`.
    ['/', ORIGIN],
  ])('%s → %s', (input, expected) => {
    expect(absoluteUrl(input)).toBe(expected);
  });

  it.each([
    ['', ORIGIN],
    [undefined, ORIGIN],
    [null, ORIGIN],
    [42, ORIGIN],
  ])('falls back to the origin for %s', (input, expected) => {
    expect(absoluteUrl(input)).toBe(expected);
  });

  it('leaves a scheme-bearing URL exactly as given', () => {
    // Idempotence is what stops a caller holding a full URL from producing
    // `https://ma.codes/https://ma.codes/x`.
    for (const url of [
      `${ORIGIN}/about`,
      'https://example.test/a?b=c#d',
      'http://example.test/',
      'mailto:someone@example.test',
      'tel:+441234567890',
    ]) {
      expect(absoluteUrl(url)).toBe(url);
    }
  });

  it('does not mistake a colon inside a path for a scheme', () => {
    // The scheme test is anchored at position 0, so a path segment containing a
    // colon is still normalised rather than handed back untouched.
    expect(absoluteUrl('/projects/a:b')).toBe(`${ORIGIN}/projects/a:b`);
    expect(absoluteUrl('//projects/a:b')).toBe(`${ORIGIN}/projects/a:b`);
  });

  it('is idempotent on its own output', () => {
    // Whatever the input shape, running the result back through must not
    // change it — the property that makes the helper safe to apply twice.
    for (const input of ['//about', '/about/', 'about', '/', '', '///x/']) {
      const once = absoluteUrl(input);
      expect(absoluteUrl(once)).toBe(once);
    }
  });
});

describe('alternatesFor', () => {
  it('wraps the same normalisation', () => {
    // It delegates, so it must not have its own idea of what a canonical is.
    expect(alternatesFor('//about')).toEqual({ canonical: `${ORIGIN}/about` });
    expect(alternatesFor('/')).toEqual({ canonical: ORIGIN });
  });
});
