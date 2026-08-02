// Single source of truth for which repos feed the portfolio-wide
// maintenance header (issue #94). Adding a repo here (and installing the
// GitHub webhook on it) is the ONLY change required to extend coverage —
// the work-status route builds its GraphQL query from this list and the
// webhook handler gates cache busts against it.
//
// `displayName` is what the popover UI shows (the section headers under
// PRS / ISSUES / PUSHES) AND the key of the signal's `byRepo` totals —
// items and totals both derive from this one field, so renaming it here
// renames both sides of the join at once. Where a repo has a Projects v2
// board, the displayName mirrors the board's title (minus phase suffixes
// like "— Delivery"); boardless repos get a clean product name instead
// of their raw slug. `owner`/`name` are the
// GraphQL lookup keys; `nameWithOwner` (owner/name) is the join key
// against GitHub payloads. Exact casing verified via
// `gh repo view <owner>/<name> --json nameWithOwner` per issue #94 §3.4
// — note AfaaqX's capital X. CAUTION on repo renames: GitHub redirects
// LOOKUPS from an old name, but payloads carry the NEW nameWithOwner, so
// a renamed repo silently falls out of every join here until this list
// is updated (six hits in two days: ai-powered-recipe-search-platform
// → culina, article-server-full-stack-blogging-platform → colophon,
// fullstack-singer-platform → dhun, vevox-real-time-chat-web-application
// → plenary, still-do-decide → auxo, hgv → clearway — repos get renamed
// as they productise, so expect more and re-verify this list whenever a
// project is renamed anywhere). `ma.codes` from the original issue text
// does not exist under this account yet; add it here once created.
//
// `projectNumber` (optional) is the user-level Projects v2 board that
// tracks the repo — github.com/users/MA1002643/projects/<number>. The
// work-status route reads the In Progress / Done columns of every board
// listed here in one aliased query (issue #94 Phase 3); repos without a
// board simply fall back to the repo-wide PR/issue signal.
export const TRACKED_REPOS = Object.freeze([
  Object.freeze({
    owner: 'MA1002643',
    name: 'theabdullahfolio',
    displayName: 'ma.codes',
    projectNumber: 3,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'AfaaqX',
    displayName: 'AfaaqX',
    projectNumber: 2,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'muhammadabdullah-portfolio',
    displayName: 'muhammadabdullah-portfolio',
    projectNumber: 7,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'culina',
    displayName: 'Culina',
    projectNumber: 8,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'colophon',
    displayName: 'Colophon',
    projectNumber: 9,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'dhun',
    displayName: 'Dhun',
    projectNumber: 10,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'jokes-platform',
    displayName: 'Jokes Platform',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'plenary',
    displayName: 'Plenary',
    projectNumber: 11,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'aura-motion',
    displayName: 'Aura Motion',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'vigil',
    displayName: 'vigil',
    projectNumber: 4,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'tailorhawk',
    displayName: 'Tailorhawk',
    projectNumber: 5,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'auxo',
    displayName: 'Auxo',
    projectNumber: 12,
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'clearway',
    displayName: 'Clearway',
    projectNumber: 13,
  }),
]);

export const nameWithOwnerOf = (repo) => `${repo.owner}/${repo.name}`;

// MULTI_REPO_HEADER rollout flag (issue #94 §11 Phase 1): opt-out rather
// than opt-in — the multi-repo header is the shipped behaviour, but
// setting MULTI_REPO_HEADER=false pins the route (and the webhook gate)
// back to the primary repo only, restoring the pre-#94 single-repo
// signal without a code revert.
export function getTrackedRepos() {
  if (process.env.MULTI_REPO_HEADER === 'false') {
    return Object.freeze(TRACKED_REPOS.slice(0, 1));
  }
  return TRACKED_REPOS;
}

// GitHub is case-insensitive on repo lookup but case-preserving in
// payloads, so membership checks must not be exact-match.
const normalize = (nameWithOwner) =>
  typeof nameWithOwner === 'string' ? nameWithOwner.toLowerCase() : null;

export function isTrackedRepo(nameWithOwner) {
  const needle = normalize(nameWithOwner);
  if (!needle) return false;
  return getTrackedRepos().some(
    (repo) => nameWithOwnerOf(repo).toLowerCase() === needle,
  );
}

export function displayNameFor(nameWithOwner) {
  const needle = normalize(nameWithOwner);
  if (!needle) return null;
  const match = getTrackedRepos().find(
    (repo) => nameWithOwnerOf(repo).toLowerCase() === needle,
  );
  return match?.displayName ?? null;
}
