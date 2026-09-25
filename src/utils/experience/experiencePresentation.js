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
 * ── A present `personalProjects` is not the same as a usable one ─────────────
 * The route has TWO ways to answer partially, and a `null` half is only the
 * loud one. When repo pagination stops early — wall-clock budget exhausted, a
 * page aborted, the page ceiling hit — it returns the repos it did collect with
 * `complete: false`, and marks the payload partial on exactly that basis
 * (`personalProjects == null || personalProjects.complete !== true`), setting
 * `total: null` for the same reason as an outright failure.
 *
 * A `!= null` check called that half available, so `totalComputable` stayed
 * true and both consumers recomputed the withheld figure from it. And the
 * undercount is not a rounding error: pagination runs newest-first, so a
 * truncated list is missing exactly the OLDEST repos — the ones `firstRepoDate`
 * is read off. `months` is a floor, always short, never a random sample.
 *
 * A floor is honest as a lower bound and useless as a magnitude, which is what
 * makes this worse in the split than in the count: `personal / (personal +
 * employment)` over a floored numerator is not a bound in either direction, it
 * is simply a wrong percentage, spoken to screen-reader users as fact. So a
 * truncated half is treated as unavailable — the route's own note for the flag
 * says the repos are still shown and "the figures derived from them are held
 * back until the list is known to be whole".
 *
 * ── `!== false`, not `!== true` ─────────────────────────────────────────────
 * Deliberately NOT the route's test, and the asymmetry is the point. The route
 * builds payloads where `complete` is always set, so absent-means-partial costs
 * it nothing. This function also reads payloads hydrated from `localStorage`,
 * which can predate the field entirely — and only COMPLETE payloads are ever
 * written there, so an absent flag means complete. Reading absence as truncated
 * would make a healthy visit paint "unavailable" out of storage, which is the
 * same trap `experienceSummaryState` documents for `partial`.
 *
 * @param {object|null|undefined} payload An `/api/experience-summary` payload.
 * @returns {{loaded: boolean, personalAvailable: boolean,
 *   employmentAvailable: boolean, totalComputable: boolean}}
 */
export function experienceSourceAvailability(payload) {
  const loaded = payload != null;
  const personal = loaded ? payload.personalProjects : null;
  const personalAvailable =
    !loaded || (personal != null && personal.complete !== false);
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
    // ── One sentence, two ways to be degraded ─────────────────────────────────
    // `partial: true` covers BOTH of the route's partial answers, and this
    // sentence used to describe only the loud one: "could not be loaded" is
    // false when repo pagination stopped early, where GitHub answered and the
    // list is merely short. An AT user was told a request had failed when it
    // had partly succeeded — the same class of false claim as the withheld
    // total this branch exists to avoid, in the text that replaces it.
    //
    // "missing or incomplete" is true of both: missing when the half came back
    // null, incomplete when it came back truncated. Named rather than carried
    // as a reason, deliberately — the rest of the UI does not draw the
    // distinction either. `experienceSourceAvailability` folds truncation into
    // "unavailable" on purpose (a floor is not a magnitude), so the split bar
    // and the modal's category block already say the same thing in both states.
    // A label finer-grained than everything it labels would be the odd one out,
    // and enumerating reasons is what goes stale the next time a third way to
    // be partial appears — which is exactly how this sentence went wrong.
    return (
      'Total years of experience unavailable — the GitHub half of the summary ' +
      `is missing or incomplete.${split} Activate to open the breakdown of ` +
      'what is available.'
    );
  }
  return `${counterValue}+ ${counterUnit} of experience.${split} Activate to open category breakdown.`;
}
