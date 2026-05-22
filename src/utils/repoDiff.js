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

  const messages = [];

  if (prev.name !== next.name) {
    messages.push(`Most active repository changed to "${next.name}"`);
  }
  if (prev.stars !== next.stars) {
    const delta = next.stars - prev.stars;
    messages.push(
      `Stars ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (now ${next.stars})`
    );
  }
  if (prev.commitCount !== next.commitCount) {
    const delta = next.commitCount - prev.commitCount;
    messages.push(`${delta} new commit${delta !== 1 ? "s" : ""} pushed`);
  }
  if (prev.mergedPRs !== next.mergedPRs) {
    const delta = next.mergedPRs - prev.mergedPRs;
    messages.push(`${delta} PR${delta !== 1 ? "s" : ""} merged`);
  }
  if (prev.forks !== next.forks) {
    messages.push(`Forks changed to ${next.forks}`);
  }

  return messages.length > 0 ? messages.join(" · ") : null;
}
