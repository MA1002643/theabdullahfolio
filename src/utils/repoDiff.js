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
  // Pick the identifier kind once per call so we always compare like-for-like.
  // A per-side `??` would let legacy `prev.name` ("next.js") get compared
  // against new `next.nameWithOwner` ("vercel/next.js") and announce a phantom
  // switch on the first poll after a deploy that added the richer identifier.
  // Use `nameWithOwner` only when both sides have it; otherwise both sides
  // fall back to `name`. Trade-off: a true owner change against a legacy
  // `prev` is undetectable here and gets suppressed — better than churn.
  const useFullName = prev.nameWithOwner != null && next.nameWithOwner != null;
  const prevId = useFullName ? prev.nameWithOwner : prev.name;
  const nextId = useFullName ? next.nameWithOwner : next.name;
  // Require both ids to be usable strings. `!= null` rejects both null and
  // undefined in one check — a stray `null` would otherwise render
  // `Most active repository changed to "null"`, strictly worse than no
  // banner. Falling through to the field-level diffs below also suppresses
  // any meaningless deltas for the same payload.
  if (prevId != null && nextId != null && prevId !== nextId) {
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

  // Activity score is a derived metric (weighted recent commits/issues/PRs/
  // reviews + a commit-history tie-breaker), so it can move in a poll where
  // none of the four displayed counts did. Announce it — on the ROUNDED value,
  // since that's what the arc shows — so a sub-integer drift that doesn't change
  // the visible number stays silent. It can move either way (the contribution
  // window slides), so report both directions like stars/forks.
  const prevScore = Math.round(Number(prev.activityScore ?? 0));
  const nextScore = Math.round(Number(next.activityScore ?? 0));
  if (prevScore !== nextScore) {
    const delta = nextScore - prevScore;
    messages.push(
      `Activity score ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)} (now ${nextScore})`
    );
  }

  // Primary language can shift for the SAME repo when its language composition
  // changes (an identity change already returned above, so this compares
  // like-for-like). Announce it so the banner names what moved — but never a
  // downgrade *to* "Unknown" (the placeholder used when the API can't resolve a
  // language), which would read as a spurious change rather than a lost signal.
  const prevLang = prev.language;
  const nextLang = next.language;
  if (
    prevLang != null &&
    nextLang != null &&
    nextLang !== "Unknown" &&
    prevLang !== nextLang
  ) {
    messages.push(`Primary language changed to "${nextLang}"`);
  }

  return messages.length > 0 ? messages.join(" · ") : null;
}

/**
 * Structured counterpart to `computeRepoDiff` — which fields of the most-active
 * repo changed in a way worth heartbeating on the card. Returns the field keys
 * to pulse, drawn from
 * `['name', 'stars', 'forks', 'commitCount', 'mergedPRs', 'activityScore', 'language']`.
 *
 * Rules mirror `computeRepoDiff`'s intent but only flag POSITIVE movement (the
 * heartbeat draws the eye to growth, matching the languages/popover behaviour —
 * "percentage increasing"):
 *   - Repo IDENTITY changed → flag ONLY `name` (the metrics belong to a
 *     different repo, so pulsing them would compare apples to oranges — same
 *     reason `computeRepoDiff` announces only the switch).
 *   - Otherwise, flag each metric that INCREASED (stars/forks/commits/PRs); a
 *     decrease is never flagged. When any metric rose, `name` is flagged too so
 *     the repo name pulses alongside the changed value — the standalone card's
 *     analog of the popover's "name + percentage" pair.
 *   - A same-repo activity-score change (in EITHER direction, compared on the
 *     rounded value the arc shows) flags `activityScore`; like `language` it
 *     beats on its own and does NOT pull `name` in.
 *   - A same-repo primary-language shift flags `language` (the language text
 *     beats on its own — it does NOT pull `name` in, since it isn't a metric
 *     rise). Same "not a downgrade to Unknown" guard as `computeRepoDiff`.
 *
 * Returns `[]` on first load (`prev`/`next` null) or when nothing rose, so the
 * card never pulses on a fresh visit.
 *
 * @param {object|null} prev
 * @param {object|null} next
 * @returns {Array<'name'|'stars'|'forks'|'commitCount'|'mergedPRs'|'activityScore'|'language'>}
 */
export function computeRepoChangedFields(prev, next) {
  if (!prev || !next) return [];

  // Identity comparison — like-for-like, same logic as computeRepoDiff.
  const useFullName = prev.nameWithOwner != null && next.nameWithOwner != null;
  const prevId = useFullName ? prev.nameWithOwner : prev.name;
  const nextId = useFullName ? next.nameWithOwner : next.name;
  if (prevId != null && nextId != null && prevId !== nextId) {
    return ["name"]; // a different repo — pulse only the name
  }

  const fields = [];
  if (Number(next.stars ?? 0) > Number(prev.stars ?? 0)) fields.push("stars");
  if (Number(next.forks ?? 0) > Number(prev.forks ?? 0)) fields.push("forks");
  if (Number(next.commitCount ?? 0) > Number(prev.commitCount ?? 0))
    fields.push("commitCount");
  if (Number(next.mergedPRs ?? 0) > Number(prev.mergedPRs ?? 0))
    fields.push("mergedPRs");

  // A metric rose → pulse the repo name alongside it (name + value, together).
  if (fields.length > 0) fields.unshift("name");

  // Activity-score change (same repo, EITHER direction) pulses ONLY the score
  // number — added AFTER the name-unshift so a score-only change never drags the
  // repo name in. Compared on the rounded value the arc displays, so a
  // sub-integer drift that leaves the visible number unchanged never pulses.
  if (
    Math.round(Number(next.activityScore ?? 0)) !==
    Math.round(Number(prev.activityScore ?? 0))
  ) {
    fields.push("activityScore");
  }

  // Primary-language shift (same repo) pulses ONLY the language text — added
  // AFTER the name-unshift above so a language-only change never drags the repo
  // name into the beat. Same "not a downgrade to Unknown" guard as
  // `computeRepoDiff`, so the banner message and the pulse stay in lock-step.
  if (
    prev.language != null &&
    next.language != null &&
    next.language !== "Unknown" &&
    prev.language !== next.language
  ) {
    fields.push("language");
  }
  return fields;
}
