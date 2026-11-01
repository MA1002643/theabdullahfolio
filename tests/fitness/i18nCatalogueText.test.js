import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

const locales = readdirSync(MESSAGES).filter(
  (dir) => !dir.startsWith('_') && statSync(join(MESSAGES, dir)).isDirectory(),
);

describe('catalogue text', () => {
  for (const locale of locales) {
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
