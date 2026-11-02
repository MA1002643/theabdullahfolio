import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALE_CODES } from '@/i18n/locales';

// Catalogue text hygiene (issue #82). A translated string once carried the
// six characters ` ` instead of the no-break space they name: written
// into the JSON double-escaped, so it PARSED as a backslash and five letters,
// and French visitors read "priorité :" on the live header (65 strings
// across fr, plus the percent format in de and es). Nothing caught it,
// because the locale tests of the day asserted the English fallback. A real
// sentence never contains an escape sequence, so any parsed value that does
// is that bug.

const MESSAGES = 'messages';
const ESCAPE = /\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/;

const strings = (node, path = []) =>
  typeof node === 'string'
    ? [[path.join('.'), node]]
    : Object.entries(node ?? {}).flatMap(([key, value]) => strings(value, [...path, key]));

// The registry, not a directory listing: `messages/en-XA/` (the pseudo-locale)
// is gitignored and exists only where `npm run i18n:pseudo` has run, so
// listing the folder made this file collect one more case on a machine that
// had built the pseudo-locale than on CI's test job, and the count /uses
// publishes failed `test:count --check`. The pseudo strings are a mechanical
// transform of English, which is checked here already.
describe('catalogue text', () => {
  for (const locale of LOCALE_CODES) {
    it(`${locale}: no string carries a literal escape sequence`, () => {
      const offenders = readdirSync(join(MESSAGES, locale))
        .filter((file) => file.endsWith('.json'))
        .flatMap((file) =>
          strings(JSON.parse(readFileSync(join(MESSAGES, locale, file), 'utf8')))
            .filter(([, text]) => ESCAPE.test(text))
            .map(([key]) => `${file.replace(/\.json$/, '')}:${key}`),
        );
      expect(offenders).toEqual([]);
    });
  }
});
