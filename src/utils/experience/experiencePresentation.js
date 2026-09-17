// How the /about years card presents an experience summary — the DECISION,
// separated from the card that renders it.
//
// ── Why this is its own module ──────────────────────────────────────────────
// `/api/experience-summary` answers in three states, not two, and the card
// treated it as two. A payload arrives with `partial: true` when GitHub failed
// or its pagination stopped short: the employment half is real and the route
// deliberately publishes NO `total`, because a sum missing the personal side is
// not a smaller number — it is a wrong one wearing the headline's clothes (see
// the note beside `total` in the route).
//
// The card read `experienceData?.total?.months ?? 0` and gated everything else
// on `!!experienceData`, so a withheld total became a measured ZERO: a count-up
// animating to 0, the words "0 months of experience", an accessible name saying
// "0+ months of experience", and the breakdown trigger presented as a finished
// load. Every one of those is a claim the payload was written specifically not
// to make — and it replaced the honest "not in yet" rendering the card already
// had for a null payload.
//
// It lives here rather than in the card because these are pure functions over a
// payload, and the card is a 1,800-line client component that pulls in
// three.js, framer-motion and a dozen hooks. A test that had to mount that to
// ask "what does a partial payload look like?" would not get written.

/**
 * Which of the three presentation states a payload is in.
 *
 * `partial === true` specifically, not a truthiness check: a payload hydrated
 * from `localStorage` (the card's instant-paint source) can predate the flag
 * entirely, and only COMPLETE payloads are ever written there — so an absent
 * flag means complete, and treating it as degraded would make a healthy visit
 * render "unavailable" out of storage. Same rule the hook applies when deciding
 * what to keep.
 *
 * @param {object|null|undefined} payload An `/api/experience-summary` payload.
 * @returns {'loading'|'degraded'|'ready'} `loading` before anything arrives,
 *   `degraded` for a partial answer, `ready` for a complete one.
 */
export function experienceSummaryState(payload) {
  if (payload == null) return 'loading';
  return payload.partial === true ? 'degraded' : 'ready';
}

/**
 * Which halves of the summary can be spoken about, and whether a grand total
 * can honestly be stated at all.
 *
 * The `!loaded ||` in both flags is load-bearing: a payload that has not
 * arrived is NOT a source failure, and rendering "Unavailable" for a merely
 * pending request would be its own false claim. So nothing is unavailable until
 * a payload exists and its half came back null — which is distinct from a
 * present-but-empty `{ months: 0 }`, a genuine zero.
 *
 * `totalComputable` is the one the headline and the donut turn on. It is false
 * whenever a side is missing, because a sum over half the data is not a smaller
 * total, it is a different quantity — and both consumers derive their own total
 * from these two halves rather than reading `payload.total`, so each would
 * otherwise recompute exactly the figure the route withholds.
 *
 * @param {object|null|undefined} payload An `/api/experience-summary` payload.
 * @returns {{loaded: boolean, personalAvailable: boolean,
 *   employmentAvailable: boolean, totalComputable: boolean}}
 */
export function experienceSourceAvailability(payload) {
  const loaded = payload != null;
  const personalAvailable = !loaded || payload.personalProjects != null;
  const employmentAvailable = !loaded || payload.employment != null;
  return {
    loaded,
    personalAvailable,
    employmentAvailable,
    totalComputable: personalAvailable && employmentAvailable,
  };
}

/**
 * Spoken equivalent of the ExperienceSplitBar legend.
 *
 * The card is a `role="button"` with an explicit `aria-label`, which makes it a
 * leaf for name computation — its descendant text (the visual, aria-hidden
 * legend included) is never announced. So the Personal/Employment split, and
 * crucially the "data unavailable" state, have to be folded into the button's
 * own label or screen-reader users hear only the grand total.
 *
 * Mirrors the bar's denominator logic exactly: an unavailable source is
 * excluded (not counted as zero) and spoken as "data unavailable", while a
 * present-but-empty side speaks a genuine "0 percent". Returns "" when there is
 * nothing to split (no bar shown).
 *
 * @param {object|null|undefined} payload An `/api/experience-summary` payload.
 * @returns {string} The sentence, or "" when there is no split to speak.
 */
export function buildSplitBreakdownLabel(payload) {
  // No payload yet (summary still loading) is not a failure — match the visual
  // split bar's `!!experienceData` gate and say nothing, rather than announcing
  // both sources as "data unavailable" before any request has resolved. Without
  // this guard a null payload would fall through (both `*Available` false, so
  // the both-loaded bail below never fires) and speak a spurious double "data
  // unavailable".
  if (!payload) return '';
  const { personalAvailable, employmentAvailable } =
    experienceSourceAvailability(payload);
  const personalMonths = payload?.personalProjects?.months ?? 0;
  const employmentMonths = payload?.employment?.months ?? 0;
  const effectivePersonal = personalAvailable ? personalMonths : 0;
  const effectiveEmployment = employmentAvailable ? employmentMonths : 0;
  const total = effectivePersonal + effectiveEmployment;
  // Nothing to announce only when both sources loaded and measured zero — same
  // gate as ExperienceSplitBar. With a side unavailable we still speak the
  // split so AT users hear the "data unavailable" distinction even when the
  // measured side is itself zero.
  if (personalAvailable && employmentAvailable && total === 0) return '';
  const personalText = personalAvailable
    ? `${total > 0 ? Math.round((effectivePersonal / total) * 100) : 0} percent`
    : 'data unavailable';
  const employmentText = employmentAvailable
    ? `${total > 0 ? Math.round((effectiveEmployment / total) * 100) : 0} percent`
    : 'data unavailable';
  return `Experience split: personal projects ${personalText}, employment ${employmentText}.`;
}

/**
 * The years card's accessible name, for whichever state it is in.
 *
 * One function for all three so a state can never be given the wrong KIND of
 * name — which is the defect this replaces: the `ready` name was being spoken
 * over a degraded payload, announcing a total of zero that the payload had
 * withheld on purpose.
 *
 * The degraded name states the unavailability FIRST, before the split sentence
 * that follows it, because a screen-reader user hearing "personal projects data
 * unavailable" halfway through a sentence that opened with a number has already
 * been told the wrong thing.
 *
 * @param {object} options
 * @param {'loading'|'degraded'|'ready'} options.state From
 *   `experienceSummaryState`.
 * @param {number} [options.counterValue] The headline figure (`ready` only).
 * @param {string} [options.counterUnit] `'years'` or `'months'` (`ready` only).
 * @param {string} [options.splitLabel] From `buildSplitBreakdownLabel`.
 * @returns {string} The `aria-label` for the card.
 */
export function buildExperienceCardLabel({
  state,
  counterValue,
  counterUnit,
  splitLabel = '',
}) {
  const split = splitLabel ? ` ${splitLabel}` : '';
  if (state === 'loading') return 'Loading experience summary';
  if (state === 'degraded') {
    // No figure, and no "loading" either: the request finished, and what it
    // returned was an answer with the total withheld. "Loading" would promise a
    // number that is not coming until GitHub recovers.
    //
    // The trigger is still offered, because the breakdown holds real content in
    // this state — every employment role, with the personal side marked
    // unavailable — and the invitation says what is behind it rather than
    // implying a complete summary.
    return (
      'Total years of experience unavailable — the GitHub half of the summary ' +
      `could not be loaded.${split} Activate to open the breakdown of what is ` +
      'available.'
    );
  }
  return `${counterValue}+ ${counterUnit} of experience.${split} Activate to open category breakdown.`;
}
