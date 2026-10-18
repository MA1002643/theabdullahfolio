#!/usr/bin/env node
/**
 * Client-bundle secret scan (issue #92, L9). Run after `next build`:
 *
 *   node scripts/scan-client-bundle.mjs        (npm run test:bundle)
 *
 * CLAUDE.md §1 forbids a credential in any file that reaches a browser, and
 * names the way it usually happens: a server secret given the NEXT_PUBLIC_
 * prefix is inlined into the client bundle at build time, although no file
 * holding it was ever committed. Nothing in review can see that, because the
 * leak exists only in the BUILD OUTPUT. So this reads the build output.
 *
 * Everything a browser can receive is scanned: every static chunk
 * (`static/**`) and every prerendered page (`server/app/**` .html / .rsc /
 * .body, which is served as-is). Three checks:
 *
 *   1. VALUES. The value of every credential in SECRET_ENV_VARS
 *      (src/app/api/_utils/redact.js) present in this build's environment,
 *      including .env.local, which `next build` itself reads. A match is the
 *      leak itself. In CI the build step has a real GITHUB_TOKEN, so this is
 *      exercised on every run.
 *   2. NAMES, in client JavaScript only. A server-only variable's NAME inside a
 *      client chunk means code that reads it was bundled for the browser: the
 *      step before a leak, since the obvious "fix" for its value being
 *      undefined there is the NEXT_PUBLIC_ prefix. (Names are fine in HTML:
 *      /notes/discoverability documents them in prose.)
 *   3. SHAPES. Token formats that are never legitimate in a public file:
 *      GitHub PATs, OpenAI and Anthropic keys, AWS key ids, Slack tokens,
 *      PEM private keys, whatever variable they came from.
 *
 * A finding names the variable (or the pattern) and the file, NEVER the value:
 * a CI log is one more place a secret can leak from.
 *
 * PUBLIC BY DESIGN. A value that already appears verbatim in a COMMITTED file is
 * not a bundle leak: the repository published it first. The case that taught
 * this (2026-09-28): the contact address is displayed in the footer and the
 * JSON-LD (footer-data.js, site.js), and is also, legitimately, the SMTP login
 * and the delivery inbox, so SMTP_USER and RECEIVER_EMAIL "matched" on every
 * page. Such values are reported as public-by-design, not failed. A secret
 * that really was committed is Gitleaks' finding (security.yml), not this one.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';

import { SECRET_ENV_VARS } from '../src/app/api/_utils/redact.js';

const root = process.cwd();
nextEnv.loadEnvConfig(root);

const distDir = [process.env.NEXT_DIST_DIR, '.next.nosync', '.next']
  .filter(Boolean)
  .find((d) => existsSync(path.join(root, d, 'BUILD_ID')));
if (!distDir) {
  console.error('[scan-client-bundle] no build output found; run `npm run build` first.');
  process.exit(2);
}

function walk(dir, keep) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full, keep) : keep(full) ? [full] : [];
  });
}

const staticFiles = walk(path.join(root, distDir, 'static'), (f) => /\.(js|css|json)$/.test(f));
const pageFiles = walk(path.join(root, distDir, 'server', 'app'), (f) => /\.(html|rsc|body)$/.test(f));
const clientJs = staticFiles.filter((f) => f.endsWith('.js'));

const SHAPES = [
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{32,}\b/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['PEM private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

// Values shorter than this are too likely to occur by chance in minified code
// ("587" as an SMTP port, a short username) to be meaningful as a leak signal;
// redact.js draws the same line for the same reason.
const MIN_VALUE_LENGTH = 8;
const configured = SECRET_ENV_VARS.map((name) => [name, (process.env[name] ?? '').trim()]).filter(
  ([, v]) => v.length >= MIN_VALUE_LENGTH,
);

/** Is this exact value already in a tracked file? (`git grep -F`, value via argv, never logged.) */
const committed = (value) => {
  try {
    execFileSync('git', ['grep', '-q', '-F', '-e', value, '--', '.'], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false; // exit 1 = no match (or not a git checkout: then scan everything)
  }
};
const publicByDesign = configured.filter(([, v]) => committed(v)).map(([name]) => name);
const values = configured.filter(([name]) => !publicByDesign.includes(name));

const findings = [];
const rel = (f) => path.relative(root, f);

for (const file of [...staticFiles, ...pageFiles]) {
  const text = readFileSync(file, 'utf8');
  for (const [name, value] of values) {
    if (text.includes(value)) findings.push(`VALUE of ${name} in ${rel(file)}`);
  }
  for (const [label, re] of SHAPES) {
    if (re.test(text)) findings.push(`${label}-shaped string in ${rel(file)}`);
  }
}
for (const file of clientJs) {
  const text = readFileSync(file, 'utf8');
  for (const name of SECRET_ENV_VARS) {
    if (new RegExp(`\\b${name}\\b`).test(text)) findings.push(`server-only NAME ${name} in client chunk ${rel(file)}`);
  }
}

const summary = [
  '### Client-bundle secret scan',
  '',
  `Scanned **${staticFiles.length}** static files and **${pageFiles.length}** prerendered pages in \`${distDir}\`,`,
  `for the values of **${values.length}** configured credentials, **${SECRET_ENV_VARS.length}** server-only names and **${SHAPES.length}** token shapes.`,
  '',
  ...(publicByDesign.length
    ? [`Public by design (value already in committed source, so not scanned as a leak): ${publicByDesign.map((n) => `\`${n}\``).join(', ')}.`, '']
    : []),
  findings.length ? `❌ **${findings.length} finding(s):**\n\n${findings.map((f) => `- ${f}`).join('\n')}` : '✅ Nothing a browser can download contains a credential.',
  '',
].join('\n');

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
process.exit(findings.length ? 1 : 0);
