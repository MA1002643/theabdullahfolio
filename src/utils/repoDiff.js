/**
 * Compute a human-readable change message for the most-active repo sub-object.
 *
 * Returns `null` on the first load (when `prev` is null) so the "data updated"
 * banner does not appear on a fresh page visit.
 *
 * @param {object|null} prev - previous repo snapshot, or null on first load
 * @param {object}      next - latest repo data
 * @returns {string|null}    - message to display, or null if nothing changed
 */
export function computeRepoDiff(prev, next) {
  if (!prev || !next) return null;

  // When the most-active repo itself changes, prev/next counts belong to
  // two different repositories — comparing them produces nonsense ("-2713
  // new commits pushed" when switching from a long-history repo to a fresh
  // one). Announce only the switch.
  if (prev.name !== next.name) {
    return `Most active repository changed to "${next.name}"`;
  }

  const messages = [];

  // Stars and forks can legitimately move either direction (unstar, repo
  // ownership transfer, fork deletion), so report increases and decreases.
  if (prev.stars !== next.stars) {
    const delta = next.stars - prev.stars;
    messages.push(
      `Stars ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (now ${next.stars})`
    );
  }
  if (prev.forks !== next.forks) {
    const delta = next.forks - prev.forks;
    messages.push(
      `Forks ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (now ${next.forks})`
    );
  }

  // Commits and merged PRs are monotonic for a stable repo — a decrease
  // means history was rewritten or a PR was un-merged (effectively the
  // result of a force-push). Either way, surfacing a negative count as
  // "-5 new commits pushed" is misleading; suppress decreases entirely.
  if (next.commitCount > prev.commitCount) {
    const delta = next.commitCount - prev.commitCount;
    messages.push(`${delta} new commit${delta !== 1 ? "s" : ""} pushed`);
  }
  if (next.mergedPRs > prev.mergedPRs) {
    const delta = next.mergedPRs - prev.mergedPRs;
    messages.push(`${delta} PR${delta !== 1 ? "s" : ""} merged`);
  }

  return messages.length > 0 ? messages.join(" · ") : null;
}
