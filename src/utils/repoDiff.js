/**
 * Compute a human-readable change message for the most-active repo sub-object.
 *
 * Returns `null` when there's nothing meaningful to announce — including:
 *   - first load (`prev` is null) so the banner doesn't appear on a fresh visit;
 *   - the API reports no qualifying activity for this poll (`next` is null);
 *   - both sides exist but no tracked field changed.
 *
 * Both arguments are nullable because the API path
 * (`/api/github-stats` → `data.stats.repo`) is null whenever the scoring
 * algorithm finds no qualifying repository, and the previous state can be
 * either null (fresh load) or a populated snapshot (subsequent polls).
 *
 * @param {object|null} prev - previous repo snapshot, or null on first load
 * @param {object|null} next - latest repo data, or null when the API reports
 *                             no qualifying activity for this poll
 * @returns {string|null}    - message to display, or null when there's
 *                             nothing to announce
 */
export function computeRepoDiff(prev, next) {
  if (!prev || !next) return null;

  // When the most-active repo itself changes, prev/next counts belong to
  // two different repositories — comparing them produces nonsense ("-2713
  // new commits pushed" when switching from a long-history repo to a fresh
  // one). Announce only the switch.
  //
  // Compare on `nameWithOwner` ("owner/name") when both sides have it, so
  // two repos that share a leaf name under different owners (e.g.
  // `acme/next.js` vs `vercel/next.js`) are correctly detected as a
  // switch. Fall back to `name` when either side is missing the field —
  // that covers legacy localStorage payloads serialized before the
  // identifier was added to the API contract, where we still want a
  // best-effort comparison rather than a forced false positive.
  const prevId = prev.nameWithOwner ?? prev.name;
  const nextId = next.nameWithOwner ?? next.name;
  // Only announce a switch when we actually have a usable identifier for
  // the new repo. Without the `nextId !== undefined` guard a malformed
  // payload missing both `nameWithOwner` and `name` would render
  // `Most active repository changed to "undefined"` — strictly worse than
  // showing no banner. Falling through to the field-level diffs below also
  // suppresses any meaningless deltas for the same payload, since those
  // checks compare numeric fields that are similarly absent.
  if (nextId !== undefined && prevId !== nextId) {
    // Display the same identifier we compared on. Otherwise the message
    // can be ambiguous — "Most active repository changed to next.js" reads
    // identically whether the new repo is acme/next.js or vercel/next.js,
    // which is the precise ambiguity nameWithOwner exists to resolve.
    return `Most active repository changed to "${nextId}"`;
  }

  // Normalize every numeric field through `Number(... ?? 0)` so the deltas
  // are always finite. Without this, an older cached `prev` payload that
  // pre-dates a field (`forks`, `commitCount`, `mergedPRs`) would produce
  // `number - undefined = NaN` and render "Stars increased by NaN" the
  // first time the user lands on a build that introduces the new field.
  // `?? 0` (not `|| 0`) preserves a legitimate 0 value; `Number(...)`
  // coerces any future string-typed payload from the API into a number.
  const prevStars = Number(prev.stars ?? 0);
  const nextStars = Number(next.stars ?? 0);
  const prevForks = Number(prev.forks ?? 0);
  const nextForks = Number(next.forks ?? 0);
  const prevCommits = Number(prev.commitCount ?? 0);
  const nextCommits = Number(next.commitCount ?? 0);
  const prevMergedPRs = Number(prev.mergedPRs ?? 0);
  const nextMergedPRs = Number(next.mergedPRs ?? 0);

  const messages = [];

  // Stars and forks can legitimately move either direction (unstar, repo
  // ownership transfer, fork deletion), so report increases and decreases.
  if (prevStars !== nextStars) {
    const delta = nextStars - prevStars;
    messages.push(
      `Stars ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (now ${nextStars})`
    );
  }
  if (prevForks !== nextForks) {
    const delta = nextForks - prevForks;
    messages.push(
      `Forks ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (now ${nextForks})`
    );
  }

  // Commits and merged PRs are monotonic for a stable repo — a decrease
  // means history was rewritten or a PR was un-merged (effectively the
  // result of a force-push). Either way, surfacing a negative count as
  // "-5 new commits pushed" is misleading; suppress decreases entirely.
  if (nextCommits > prevCommits) {
    const delta = nextCommits - prevCommits;
    messages.push(`${delta} new commit${delta !== 1 ? "s" : ""} pushed`);
  }
  if (nextMergedPRs > prevMergedPRs) {
    const delta = nextMergedPRs - prevMergedPRs;
    messages.push(`${delta} PR${delta !== 1 ? "s" : ""} merged`);
  }

  return messages.length > 0 ? messages.join(" · ") : null;
}
