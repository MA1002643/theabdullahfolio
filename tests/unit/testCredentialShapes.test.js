import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SECRET_ENV_VARS } from '@/app/api/_utils/redact';

// ── The sweep `tests/helpers/secrets.js` says should stay empty ─────────────
// That module's header states the rule and the reason: a hard-coded placeholder
// is still a credential literal written into the repository's history, history
// is permanent, and CLAUDE.md §1 draws no exception for "just a test key" —
// because the checked-in literal is the one that gets copied into the next
// suite, then a debug script, then something pointed at a real deployment. It
// then names the property that would make the rule enforceable: "a sweep for
// credential shapes over `tests/` stays empty as suites are added."
//
// Until now that sweep was a sentence. It had been run by hand at least three
// times — a bearer constant, five access-token literals, and a batch of
// token-shaped fixtures — each time as a review finding, which is what a rule
// with no test looks like from the outside. This is the sweep.
//
// It also covers this file's own prose rule: the helper says "nothing here
// quotes the literals it replaced", so a comment explaining a swap must not
// spell out the string it swapped, or the artefact survives the fix that
// removed it.

const TEST_ROOT = path.join(process.cwd(), 'tests');

/** Every `.js` / `.mjs` file under `tests/`, recursively. */
function testFiles(dir = TEST_ROOT, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, found);
    else if (/\.m?js$/.test(full)) found.push(full);
  }
  return found;
}

// Shapes that are recognisably credentials whatever they stand in for. Provider
// prefixes are the strongest signal there is — a scanner (GitHub's own included)
// matches on exactly these, so a fixture wearing one is a string that looks
// live to every tool that will ever read this repository.
const PROVIDER_SHAPES = [
  [/\bghp_[A-Za-z0-9]{3,}/, 'GitHub personal access token'],
  [/\bgho_[A-Za-z0-9]{3,}/, 'GitHub OAuth token'],
  [/\bghs_[A-Za-z0-9]{3,}/, 'GitHub server token'],
  [/\bgithub_pat_[A-Za-z0-9_]{3,}/, 'GitHub fine-grained PAT'],
  [/\bxox[abprs]-[A-Za-z0-9-]{3,}/, 'Slack token'],
  [/\bsk-[A-Za-z0-9]{8,}/, 'OpenAI-style secret key'],
  [/\bAIza[A-Za-z0-9_-]{8,}/, 'Google API key'],
  [/\bAXY_[A-Za-z0-9_]{3,}/, 'Upstash REST token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, 'JWT'],
  // BOTH markers with a body between them. The header ALONE is not key
  // material and is a legitimate fixture: `seoReportCredentials` uses it as the
  // value of a `private_key` field that only has to be PRESENT, for a case
  // about a missing `client_email` beside it. Matching the bare marker would
  // have made this sweep's first run a false positive, which is how a scanner
  // teaches people to ignore it.
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{40,}?-----END [A-Z ]*PRIVATE KEY-----/,
    'private key block',
  ],
];

// A literal assigned to a credential-shaped NAME. `freshSecret()` and template
// interpolation both fail this pattern by construction, which is the point: the
// only way to satisfy it is to write the value down.
const CREDENTIAL_ASSIGNMENT =
  /\b(access_token|refresh_token|id_token|api_key|apiKey|client_secret|clientSecret|password|passwd|secret|bearer)\s*[:=]\s*(['"])(?!\s*\2)[^'"\n]{3,}\2/gi;

// ── Secret-listed variables whose VALUE is an address, not a credential ─────
// `SECRET_ENV_VARS` answers "what must never appear in a log", and an endpoint
// qualifies — it is deployment configuration a library will happily quote. It
// is NOT the same question as "what must never be written down in a test", and
// `tests/helpers/secrets.js` is explicit about the difference: a non-secret
// placeholder belongs in the tree precisely so it is readable, and under a
// reserved TLD, unresolvable. Randomising an address costs that and protects
// nothing.
//
// So these three are exempt from the env rule below, by name and with the
// reason. Everything else on the redaction list is credential material, and
// writing one down is the finding this file exists to catch.
const ADDRESS_VALUED = {
  KV_REST_API_URL: 'an endpoint; a readable placeholder is the documented shape',
  UPSTASH_REDIS_REST_URL: 'the same endpoint under the direct-Upstash name',
  RECEIVER_EMAIL:
    'a mailbox; a generated local-part would make a bounce fixture unreadable without making it safer',
};

/** The redaction list, minus the addresses — what a test may not write down. */
const CREDENTIAL_ENV_VARS = SECRET_ENV_VARS.filter(
  (name) => !Object.hasOwn(ADDRESS_VALUED, name),
);

// `process.env.SOMETHING = '…'` / `vi.stubEnv('SOMETHING', '…')` where SOMETHING
// is one of those. Any quote style; a hit whose text interpolates is dropped in
// code below, since that is the generated case this rule wants people to reach
// for.
const SECRET_ENV_ASSIGNMENT = () =>
  new RegExp(
    `(?:process\\.env\\.(?:${CREDENTIAL_ENV_VARS.join('|')})\\s*=\\s*|` +
      `stubEnv\\(\\s*['"\`](?:${CREDENTIAL_ENV_VARS.join('|')})['"\`]\\s*,\\s*)` +
      `(['"\`])([^'"\`\\n]*)\\1`,
    'g',
  );

// Values that match a pattern above and are NOT credentials, each with the
// reason. An allowlist rather than a looser regex: "that one is fine" is a
// judgement, and judgements belong in the repository where the next reader can
// disagree with them.
const ALLOWED = [
  {
    // `secrets.js` needs to say what must never authenticate.
    file: 'tests/helpers/secrets.js',
    match: 'Bearer undefined',
    reason: 'names the shape that must be rejected, not a value',
  },
];

describe('no credential-shaped literal is committed under tests/', () => {
  const files = testFiles();

  it('finds the suites it is meant to be sweeping', () => {
    // Guard on the guard: an empty walk would make the sweep below pass while
    // reading nothing.
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(
      files.some((file) => file.endsWith(path.join('helpers', 'secrets.js'))),
    ).toBe(true);
  });

  it('carries no value wearing a provider credential shape', () => {
    const found = [];

    for (const file of files) {
      // This file lists the shapes, so it necessarily contains them.
      if (file === path.join(TEST_ROOT, 'unit', 'testCredentialShapes.test.js'))
        continue;

      const source = readFileSync(file, 'utf8');
      const relative = path.relative(process.cwd(), file);
      for (const [pattern, description] of PROVIDER_SHAPES) {
        const hit = source.match(pattern);
        if (!hit) continue;
        if (
          ALLOWED.some(
            (entry) => entry.file === relative && hit[0].includes(entry.match),
          )
        )
          continue;
        found.push(`${relative}: ${description} — ${hit[0].slice(0, 24)}…`);
      }
    }

    expect(
      found,
      `These read as live credentials to every scanner that will ever see this ` +
        `repository, whatever they are standing in for:\n  ` +
        `${found.join('\n  ')}\n\n` +
        `Mint the value with freshSecret() from tests/helpers/secrets.js.`,
    ).toEqual([]);
  });

  it('assigns no written-down value to a credential-shaped name', () => {
    const found = [];

    for (const file of files) {
      if (file === path.join(TEST_ROOT, 'unit', 'testCredentialShapes.test.js'))
        continue;

      const source = readFileSync(file, 'utf8');
      const relative = path.relative(process.cwd(), file);
      for (const hit of source.matchAll(CREDENTIAL_ASSIGNMENT)) {
        if (
          ALLOWED.some(
            (entry) => entry.file === relative && hit[0].includes(entry.match),
          )
        )
          continue;
        found.push(`${relative}: ${hit[0].replace(/\s+/g, ' ').slice(0, 60)}`);
      }
    }

    expect(
      found,
      `A credential-shaped name is assigned a literal here. Generated values ` +
        `and interpolations cannot match this, so the only way in is writing ` +
        `one down:\n  ${found.join('\n  ')}\n\n` +
        `Use freshSecret() — or freshShortSecret() where the case needs a ` +
        `value under the redaction threshold.`,
    ).toEqual([]);
  });

  it('writes no literal into a variable the redaction list calls a credential', () => {
    // The hole the two rules above leave, and it is the one that matters most:
    // they key off how a value LOOKS (a provider prefix) or what a local is
    // NAMED. A plain string assigned straight to `process.env.KV_REST_API_TOKEN`
    // is neither — it wears no prefix and the name is not in that alternation —
    // so it sailed through both while being, by this repository's own
    // definition, a committed credential.
    //
    // Keyed off `SECRET_ENV_VARS` rather than a list of its own, so there is one
    // answer to "which variables hold credentials" and the sweep inherits every
    // future addition. That list is already held against `.env.example` by
    // redactSecrets.test.js, which makes this transitive: a new credential
    // variable has to be classified there, and is then unwritable here.
    const found = [];

    for (const file of files) {
      if (file === path.join(TEST_ROOT, 'unit', 'testCredentialShapes.test.js'))
        continue;

      const source = readFileSync(file, 'utf8');
      const relative = path.relative(process.cwd(), file);
      for (const hit of source.matchAll(SECRET_ENV_ASSIGNMENT())) {
        // A template that interpolates is the generated case — `${KV_TOKEN}` —
        // and dropping it here is what leaves exactly one way to pass: not
        // writing the value down.
        if (hit[2].includes('${')) continue;
        // An EMPTY assignment is the absence of a credential, not one. Cases
        // that pin "unset behaves as unconfigured" write it deliberately, and
        // `redactSecrets` keys its own one hard skip off the same emptiness.
        if (hit[2].length === 0) continue;
        found.push(`${relative}: ${hit[0].replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }

    expect(
      found,
      `A credential env var is set to a written-down value here. It is a test ` +
        `credential in the repository's history whatever it stands in for:\n  ` +
        `${found.join('\n  ')}\n\n` +
        `Mint it at module scope with freshSecret() and assign the variable.`,
    ).toEqual([]);
  });

  it('exempts only addresses, and only ones still on the redaction list', () => {
    // Keeps `ADDRESS_VALUED` honest in both directions: an exemption for a
    // variable nobody redacts is dead weight that reads as coverage, and the
    // carve-out must stay a short list of addresses rather than becoming the
    // place a credential goes to be forgotten.
    for (const name of Object.keys(ADDRESS_VALUED)) {
      expect(
        SECRET_ENV_VARS,
        `${name} is exempted here but is no longer on the redaction list.`,
      ).toContain(name);
      expect(name).toMatch(/_URL$|EMAIL$/);
    }
  });
});
