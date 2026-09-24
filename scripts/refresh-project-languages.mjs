// Regenerates src/data/project-languages.json — the build-safe source for the
// `programmingLanguage` property on each project's SoftwareSourceCode node
// (issue #32, W2).
//
// ── Why a committed file and not a fetch ────────────────────────────────────
// The original decision recorded in docs/seo.md §12 was to OMIT
// `programmingLanguage` rather than fetch it, because the only source was
// /api/github-skills and reading it at build time would make `next build`
// depend on a secret and a network call — failing, or silently emptying, when
// the token is absent or rate-limited. That reasoning is sound and is not being
// reversed. What changes is the source, not the rule:
//
//   • `next build` still performs NO network call and reads NO secret. It opens
//     a committed JSON file, exactly as it opens src/app/data.js.
//   • The refresh is an explicit, reviewable act. Running this script produces
//     a diff a human reads in a PR, so a language list that changes because a
//     repository was rewritten is VISIBLE — where a build-time fetch would
//     silently bake a new claim into the HTML with nothing to review.
//   • A stale file degrades honestly. Languages change on the order of months;
//     a build-time fetch that 403s degrades to *nothing at all*, which is worse
//     than a value that is three weeks old.
//
// This is the "build-safe source" the omission note said the builder would
// accept the moment one existed.
//
// ── Usage ───────────────────────────────────────────────────────────────────
//     node scripts/refresh-project-languages.mjs
//
// Reads a token from GITHUB_TOKEN, or falls back to the GitHub CLI's
// (`gh auth token`) so a contributor with `gh` already logged in needs no
// setup. Public-repo language data needs no scopes beyond a default read.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'src/data/project-languages.json');

/**
 * A token, from the environment or the GitHub CLI.
 *
 * Unauthenticated requests are allowed 60/hour per IP, which is enough for
 * eleven repositories but fails noisily on a second run in the same hour. The
 * token is only ever used as a request header — never printed, never written to
 * the output file.
 */
function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** The project records, parsed out of data.js without importing the module. */
async function readProjects() {
  const mod = await import(resolve(ROOT, 'src/app/data.js'));
  return mod.projectsData;
}

/**
 * GitHub's language breakdown for one repository: `{ TypeScript: 48210, ... }`,
 * keyed by language with byte counts as values.
 */
async function fetchLanguages(repo, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/languages`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

const token = resolveToken();
if (!token) {
  console.warn(
    'No GITHUB_TOKEN and no `gh` login — continuing unauthenticated (60 req/hour).',
  );
}

const projects = await readProjects();

// Private repositories are skipped for the same reason `projectPage()` omits
// their `codeRepository`: the language breakdown of a repository nobody outside
// this account can open is not a claim a public schema should carry, and the
// API would 404 for any reader trying to verify it.
const publicProjects = projects.filter((project) => !project.private);

const languages = {};
const failures = [];
// Repositories GitHub ANSWERED for, whatever it answered. A successful `{}` —
// a docs-only or empty repository — is a real result that has to be able to
// clear a stale entry, and it is indistinguishable from a failure by the
// absence of a `languages` key alone. See the merge below.
const answered = new Set();

for (const project of publicProjects) {
  try {
    const breakdown = await fetchLanguages(project.repo, token);
    answered.add(project.repo);
    // Ordered by bytes, descending — GitHub returns an object whose key order
    // is not guaranteed, and the first entry is the one a reader treats as the
    // primary language. Byte counts themselves are dropped: schema.org's
    // `programmingLanguage` takes names, and storing the counts would make this
    // file churn on every commit for no change in what is published.
    const ordered = Object.entries(breakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);
    if (ordered.length > 0) languages[project.repo] = ordered;
    console.log(`${project.repo.padEnd(38)} ${ordered.join(', ') || '(none)'}`);
  } catch (err) {
    failures.push({ repo: project.repo, reason: err.message });
    console.warn(`${project.repo.padEnd(38)} FAILED — ${err.message}`);
  }
}

// A partial refresh must not silently drop repositories that were present
// before. Merge over the existing file so a single 404 or rate-limit leaves the
// other entries intact rather than deleting claims that are still true.
let previous = {};
try {
  previous = JSON.parse(readFileSync(OUT, 'utf8')).languages ?? {};
} catch {
  /* first run — no file yet */
}

if (failures.length > 0) {
  console.warn(
    `\n${failures.length} repo(s) failed; keeping their previous entries.`,
  );
}

const merged = { ...previous, ...languages };

// A repository that ANSWERED with no languages loses its entry. Retaining the
// previous list is correct for a failure — a 404 or a rate-limit says nothing
// about the repository, so the last known answer is still the best one — but it
// is wrong for a success, where GitHub has positively reported that there is no
// detectable code. Merging on the presence of a `languages` key alone cannot
// tell those two apart, and collapsing them means a project that becomes
// docs-only, or is emptied and rewritten, keeps publishing a
// `programmingLanguage` claim its own repository contradicts — and no number of
// refreshes ever clears it, because every run reproduces the same empty result.
for (const repo of answered) {
  if (!languages[repo]) delete merged[repo];
}

// Entries for repositories no longer in projectsData are pruned: leaving them
// would let the file accumulate claims about projects the site no longer shows.
for (const repo of Object.keys(merged)) {
  if (!publicProjects.some((project) => project.repo === repo)) {
    delete merged[repo];
  }
}

// Keys sorted so the committed file has a stable order and a refresh produces a
// diff showing only what actually changed.
const sorted = Object.fromEntries(
  Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      $comment:
        'GENERATED by scripts/refresh-project-languages.mjs — do not edit by hand. Rerun the script and commit the diff.',
      languages: sorted,
    },
    null,
    2,
  )}\n`,
);

console.log(`\nWrote ${OUT} (${Object.keys(sorted).length} repositories).`);
