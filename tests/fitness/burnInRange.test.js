import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { read } from '../support/source.js';

// The flake burn-in (ci.yml) re-runs the browser specs a push changed, five
// times each. On 2026-11-03 "Update branch" on Dependabot's #189 merged main
// into a PR that changed only package.json; the push's BEFORE...HEAD range then
// held every spec main had gained, eight of them, and the job hit its
// 30-minute timeout. This runs the workflow's own shell step against a scratch
// repository, so the test cannot drift from what CI actually executes.

function burnInScript() {
  const lines = read('.github/workflows/ci.yml').split('\n');
  const step = lines.findIndex((l) => l.includes('- name: Find changed browser specs'));
  const run = lines.findIndex((l, i) => i > step && /^\s+run: \|\s*$/.test(l));
  const indent = lines[run].search(/\S/);
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.search(/\S/) <= indent) break;
    body.push(line.slice(indent + 2));
  }
  return body.join('\n');
}

let repo;
const git = (...args) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();

function commit(file, message) {
  mkdirSync(join(repo, dirname(file)), { recursive: true });
  writeFileSync(join(repo, file), `${message}\n`);
  git('add', file);
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

function burnIn({ before, head }) {
  const output = join(repo, '.out');
  const summary = join(repo, '.summary');
  writeFileSync(output, '');
  execFileSync('bash', ['-e', '-c', burnInScript()], {
    cwd: repo,
    env: {
      ...process.env,
      EVENT: 'pull_request',
      ACTION: 'synchronize',
      BASE_REF: 'main',
      DEFAULT_BRANCH: 'main',
      BEFORE: before,
      HEAD_SHA: head,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    },
  });
  const line = readFileSync(output, 'utf8').match(/^specs=(.*)$/m);
  return (line?.[1] ?? '').trim().split(/\s+/).filter(Boolean);
}

describe('flake burn-in range', () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'burn-in-'));
    git('init', '-q', '-b', 'main');
    commit('tests/e2e/old.spec.js', 'base');
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('burns in nothing when a push only merges main into the branch', () => {
    git('checkout', '-q', '-b', 'deps');
    const before = commit('package.json', 'bump deps');
    git('checkout', '-q', 'main');
    commit('tests/e2e/from-main.spec.js', 'feature on main');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', 'deps');
    git('merge', '-q', '--no-edit', 'main');
    expect(burnIn({ before, head: git('rev-parse', 'HEAD') })).toEqual([]);
  });

  it('still burns in a spec the push itself changed', () => {
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', '-b', 'feature');
    const before = commit('src/a.js', 'work');
    const head = commit('tests/e2e/new.spec.js', 'add a spec');
    expect(burnIn({ before, head })).toEqual(['tests/e2e/new.spec.js']);
  });
});
