import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// ── Why this file exists ────────────────────────────────────────────────────
// scripts/audit-gate.mjs (issue #92, L9) once treated an audit that did not run
// as an audit that found nothing. When `npm audit` fails (registry outage, auth
// error, lockfile problem) it prints `{ "error": { ... } }` with no
// `vulnerabilities` field. The gate kept that stdout, defaulted the missing map
// to {}, and with the allowlist empty reported zero advisories and exited 0.
//
// The script is run for real here, with a fake `npm` first on PATH that prints
// whatever each case needs, so the assertions are about the gate's exit code
// and message, not about this machine's registry or dependency tree. It runs
// from a scratch directory holding an EMPTY allowlist, so a waiver added to the
// real one later cannot change what these cases mean.

const dir = mkdtempSync(join(tmpdir(), 'audit-gate-'));
const npm = join(dir, 'npm');
writeFileSync(
  npm,
  '#!/usr/bin/env node\nprocess.stdout.write(process.env.FAKE_AUDIT_OUT ?? "");\nprocess.exit(Number(process.env.FAKE_AUDIT_CODE ?? 0));\n',
);
chmodSync(npm, 0o755);
mkdirSync(join(dir, '.github'));
writeFileSync(join(dir, '.github', 'audit-allowlist.json'), JSON.stringify({ entries: [] }));
const GATE = resolve('scripts/audit-gate.mjs');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function runGate(stdout, code = 1) {
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_AUDIT_OUT: stdout, FAKE_AUDIT_CODE: String(code) };
  delete env.GITHUB_STEP_SUMMARY; // never append to a real CI run summary
  const result = spawnSync(process.execPath, [GATE], { cwd: dir, env, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

// Each case spawns real node processes; under a loaded full run that can pass
// the 5s default without anything being wrong.
const SPAWNS = { timeout: 30_000 };

describe('audit gate refuses a report it cannot trust', SPAWNS, () => {
  it('fails on an error-only response from npm audit', () => {
    const { status, output } = runGate(JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'registry unreachable' } }));
    expect(status).toBe(1);
    expect(output).toMatch(/did not run.*ENOAUDIT registry unreachable/);
  });

  it('fails on empty or non-JSON output', () => {
    expect(runGate('').status).toBe(1);
    expect(runGate('npm ERR! something broke').status).toBe(1);
  });

  it('fails when the vulnerabilities map is missing or malformed', () => {
    expect(runGate(JSON.stringify({ auditReportVersion: 2 })).status).toBe(1);
    expect(runGate(JSON.stringify({ vulnerabilities: [] })).status).toBe(1);
    expect(runGate(JSON.stringify({ vulnerabilities: { next: { via: 'nope' } } })).status).toBe(1);
    expect(runGate(JSON.stringify({ vulnerabilities: { next: { via: [{ severity: 'high' }] } } })).status).toBe(1);
  });
});

describe('audit gate still judges a valid report', SPAWNS, () => {
  it('passes a clean report', () => {
    const { status, output } = runGate(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }), 0);
    expect(status).toBe(0);
    expect(output).toMatch(/0 advisories/);
  });

  it('fails a new high advisory that is not allowlisted', () => {
    const report = {
      vulnerabilities: {
        demo: {
          via: [{ severity: 'high', title: 'Demo flaw', url: 'https://github.com/advisories/GHSA-test-test-test' }],
        },
      },
    };
    const { status, output } = runGate(JSON.stringify(report));
    expect(status).toBe(1);
    expect(output).toMatch(/GHSA-test-test-test \(demo\): NEW, not allowlisted/);
  });
});
