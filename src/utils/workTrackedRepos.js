// Single source of truth for which repos feed the portfolio-wide
// maintenance header (issue #94). Adding a repo here (and installing the
// GitHub webhook on it) is the ONLY change required to extend coverage —
// the work-status route builds its GraphQL query from this list and the
// webhook handler gates cache busts against it.
//
// `displayName` is what the popover UI shows. `owner`/`name` are the
// GraphQL lookup keys; `nameWithOwner` (owner/name) is the join key
// against GitHub payloads. Exact casing verified via
// `gh repo view <owner>/<name> --json nameWithOwner` per issue #94 §3.4
// — note AfaaqX's capital X. `ma.codes` from the original issue text
// does not exist under this account yet; add it here once created.
export const TRACKED_REPOS = Object.freeze([
  Object.freeze({
    owner: 'MA1002643',
    name: 'theabdullahfolio',
    displayName: 'theabdullahfolio',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'AfaaqX',
    displayName: 'AfaaqX',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'muhammadabdullah-portfolio',
    displayName: 'muhammadabdullah-portfolio',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'ai-powered-recipe-search-platform',
    displayName: 'ai-powered-recipe-search-platform',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'article-server-full-stack-blogging-platform',
    displayName: 'article-server-full-stack-blogging-platform',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'fullstack-singer-platform',
    displayName: 'fullstack-singer-platform',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'jokes-platform',
    displayName: 'jokes-platform',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'vevox-real-time-chat-web-application',
    displayName: 'vevox-real-time-chat-web-application',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'aura-motion',
    displayName: 'aura-motion',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'vigil',
    displayName: 'vigil',
  }),
  Object.freeze({
    owner: 'MA1002643',
    name: 'tailorhawk',
    displayName: 'tailorhawk',
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
