#!/usr/bin/env node
/**
 * Production dependency audit with an EXPIRING allowlist (issue #92, L9).
 *
 *   node scripts/audit-gate.mjs          (npm run test:audit, security.yml)
 *
 * A plain `npm audit --audit-level=high` gate would have failed on its first
 * run: main carries 45 advisories, including two critical Next.js ones, and
 * every fix is a major upgrade (Next 14 → 15, nodemailer 7 → 10, sharp
 * 0.34 → 0.35). A gate that cannot pass gets disabled, and then catches
 * nothing new either. This gate instead:
 *
 *   • FAILS on any high or critical advisory not in .github/audit-allowlist.json,
 *     so a newly published one, or a new dependency bringing one in, is caught
 *     the day it appears;
 *   • FAILS on every allowlisted entry past its `expires` date, so accepting a
 *     risk is always temporary and always has to be re-argued in review;
 *   • FAILS on an allowlist entry that no longer matches anything (the upgrade
 *     landed: delete it), so the file cannot silently accumulate dead waivers;
 *   • reports moderate and low advisories without failing.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const today = new Date().toISOString().slice(0, 10);
const allowlist = JSON.parse(readFileSync('.github/audit-allowlist.json', 'utf8')).entries;

let raw;
try {
  raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  raw = err.stdout; // npm audit exits non-zero whenever it finds anything
}
const report = JSON.parse(raw);

const advisories = new Map(); // GHSA id → { severity, title, package }
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string') continue; // inherited from another package; counted there
    const id = via.url.split('/').pop();
    advisories.set(id, { severity: via.severity, title: via.title, package: pkg });
  }
}

const allowed = new Map();
for (const entry of allowlist) for (const id of entry.advisories) allowed.set(id, entry);

const failures = [];
const accepted = [];
const minor = [];
for (const [id, a] of advisories) {
  const entry = allowed.get(id);
  const serious = a.severity === 'high' || a.severity === 'critical';
  if (entry && entry.expires < today) failures.push(`${a.severity} ${id} (${a.package}): allowlist entry EXPIRED ${entry.expires}`);
  else if (entry) accepted.push(`${a.severity} ${id} (${a.package}), accepted until ${entry.expires}`);
  else if (serious) failures.push(`${a.severity} ${id} (${a.package}): NEW, not allowlisted — ${a.title}`);
  else minor.push(`${a.severity} ${id} (${a.package}) — ${a.title}`);
}
for (const [id, entry] of allowed) {
  if (!advisories.has(id)) failures.push(`${id} (${entry.package}) is allowlisted but no longer reported: remove it`);
}

const counts = ['critical', 'high', 'moderate', 'low']
  .map((s) => `${[...advisories.values()].filter((a) => a.severity === s).length} ${s}`)
  .join(', ');
const summary = [
  '### Production dependency audit',
  '',
  `${advisories.size} advisories (${counts}); **${accepted.length}** accepted by the expiring allowlist, **${failures.length}** failing.`,
  '',
  ...(failures.length ? ['❌ **Failing:**', '', ...failures.map((f) => `- ${f}`), ''] : ['✅ No new high/critical advisory, and no expired waiver.', '']),
  ...(accepted.length ? ['<details><summary>Accepted (temporary)</summary>', '', ...accepted.map((f) => `- ${f}`), '', '</details>', ''] : []),
  ...(minor.length ? ['<details><summary>Moderate / low (reported, not failing)</summary>', '', ...minor.map((f) => `- ${f}`), '', '</details>', ''] : []),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
process.exit(failures.length ? 1 : 0);
