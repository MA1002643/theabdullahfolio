import { describe, expect, it } from 'vitest';

import { SECRET_ENV_VARS } from '@/app/api/_utils/redact';

import { envExampleNames, envReads, isClientModule, read, walk } from '../support/source.js';

// Environment hygiene as executable rules (issue #92, L1). CLAUDE.md §1 states
// these as prose. Prose is checked by whoever remembers to read it, so each
// rule below is the part of that prose a machine can check on every commit.
//
// This complements, not repeats, tests/unit/redactSecrets.test.js. That suite
// proves every variable is CLASSIFIED (credential or not, for log redaction).
// This one proves the classification is RESPECTED: credentials never reach the
// client, never get a literal fallback, never wear the public prefix, and every
// variable the code reads is documented for the next person to deploy it.

const SOURCES = [...walk('src'), 'next.config.mjs'];
const SECRETS = new Set(SECRET_ENV_VARS);

// Set by the platform or the toolchain, never by an operator, so there is
// nothing to document in `.env.example`. Adding a name here needs the same
// justification these have: something other than a person sets it.
const PLATFORM_VARS = new Set([
  'NODE_ENV', // Node / Next
  'NEXT_PHASE', // Next, during build
  'PORT', // the host
  'VERCEL', // Vercel, "1" on the platform
  'VERCEL_URL', // Vercel, the deployment host
  'VERCEL_OIDC_TOKEN', // Vercel, minted per deployment for the AI Gateway
  'ANALYZE', // a build flag for @next/bundle-analyzer, typed on the command line
]);

const allReads = SOURCES.flatMap((file) =>
  envReads(read(file)).map((r) => ({ ...r, file })),
);
const readNames = new Set(allReads.map((r) => r.name));
const at = (r) => `${r.file}:${r.line}  ${r.name}`;

describe('env hygiene — the rules CLAUDE.md §1 states in prose', () => {
  it('sees the code it is judging (the sweep is not blind)', () => {
    // A walker that silently matched nothing would pass every rule below.
    expect(allReads.length).toBeGreaterThan(50);
    expect(readNames).toContain('GITHUB_TOKEN');
    expect(readNames).toContain('CRON_SECRET');
  });

  it('documents every variable the code reads in .env.example', () => {
    const documented = envExampleNames();
    const missing = [...readNames]
      .filter((name) => !documented.has(name) && !PLATFORM_VARS.has(name))
      .sort();
    expect(
      missing,
      `Read under src/ but declared nowhere in .env.example — the next person to ` +
        `deploy this cannot know they exist. Add NAME= with a comment (commented ` +
        `out is fine for optional tunables):\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('never gives a credential the NEXT_PUBLIC_ prefix', () => {
    // Next inlines every NEXT_PUBLIC_* into the client bundle at build time.
    const credentialShaped = /(TOKEN|SECRET|PASS|PASSWORD|PRIVATE|API_KEY|CREDENTIAL)/;
    const offenders = [...readNames, ...envExampleNames()].filter(
      (name) =>
        name.startsWith('NEXT_PUBLIC_') &&
        (credentialShaped.test(name) || SECRETS.has(name.replace(/^NEXT_PUBLIC_/, ''))),
    );
    expect(offenders).toEqual([]);
  });

  it('never reads a credential from a "use client" module', () => {
    // Without the prefix Next inlines `undefined`, so this is not a leak today.
    // It is the step before one: the "fix" for the undefined is to add the
    // prefix, and then the value ships to every visitor.
    const offenders = SOURCES.filter((file) => isClientModule(read(file))).flatMap((file) =>
      envReads(read(file))
        .filter((r) => SECRETS.has(r.name))
        .map((r) => at({ ...r, file })),
    );
    expect(offenders).toEqual([]);
  });

  it('never gives a credential a literal fallback value', () => {
    // `process.env.X || "sk-live-…"` commits the value it falls back to.
    const offenders = [];
    for (const file of SOURCES) {
      const lines = read(file).split('\n');
      lines.forEach((text, i) => {
        for (const m of text.matchAll(
          /process\.env\.([A-Z][A-Z0-9_]*)\s*(?:\|\||\?\?)\s*(['"`])([^'"`]*)\2/g,
        )) {
          if (SECRETS.has(m[1]) && m[3] !== '') offenders.push(`${file}:${i + 1}  ${m[1]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the platform allowlist honest (every entry is still read)', () => {
    // A stale allowlist entry is a hole a real undocumented variable could hide in.
    const unused = [...PLATFORM_VARS].filter((name) => !readNames.has(name));
    expect(unused).toEqual([]);
  });
});
