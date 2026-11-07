import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROUTED_LOCALE_CODES } from '@/i18n/locales';

import { read, stripComments, walk } from '../support/source.js';

// Closed param sets under `[locale]` (issue #82) have to name the locale.
//
// `dynamicParams = false` turns `generateStaticParams` from "prerender at least
// these" into "these and nothing else". That is only safe if the list is
// complete, and a metadata image handler (`opengraph-image.js`,
// `twitter-image.js`) does not inherit the `[locale]` layout's list the way a
// page does. The two dynamic cards returned `{ id }` and `{ slug }` alone, so
// the build prerendered no card at all and every project and note page
// advertised an og:image that answered 404, in every language, while the
// build printed the route as `●` and stayed green.
//
// And the `[locale]` segment itself must be closed. Open, a one-segment path
// with a dot in it (`/favicon.ico`, `/ads.txt`) skips the proxy, arrives as the
// "locale" `favicon.ico`, and Next answered 500 rather than 404.

const APP = 'src/app/[locale]';

const handlers = walk(APP, /^(opengraph|twitter)-image\.js$/).filter((file) =>
  /dynamicParams\s*=\s*false/.test(stripComments(read(file))),
);

/** `[id]`, `[slug]`, `[locale]` … in the file's path, `[...rest]` excluded. */
const segmentParams = (file) =>
  [...path.dirname(file).matchAll(/\[(?!\.\.\.)([^\]]+)\]/g)].map((m) => m[1]);

describe('closed param sets under [locale] name every segment', () => {
  it('finds the card handlers it is judging (the walk is not blind)', () => {
    expect(handlers.some((f) => f.includes('[id]'))).toBe(true);
    expect(handlers.some((f) => f.includes('[slug]'))).toBe(true);
  });

  it.each(handlers)('%s', async (file) => {
    const mod = await import(path.resolve(file));
    const params = await mod.generateStaticParams();
    const needed = segmentParams(file);

    expect(params.length).toBeGreaterThan(0);
    for (const entry of params) {
      expect(Object.keys(entry).sort()).toEqual([...needed].sort());
    }
    // Every routed locale, not merely some locale.
    expect([...new Set(params.map((p) => p.locale))].sort()).toEqual([...ROUTED_LOCALE_CODES].sort());
  });

  it('the [locale] segment itself is closed, so /favicon.ico is a 404, not a 500', () => {
    expect(stripComments(read(`${APP}/layout.js`))).toMatch(/export\s+const\s+dynamicParams\s*=\s*false/);
  });
});
