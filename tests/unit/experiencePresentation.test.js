import { describe, expect, it } from 'vitest';

import {
  buildExperienceCardLabel,
  buildSplitBreakdownLabel,
  experienceSourceAvailability,
  experienceSummaryState,
} from '@/utils/experience/experiencePresentation';

// ── A withheld total is not a measured zero ─────────────────────────────────
// `/api/experience-summary` answers `partial: true` with `total: null` when
// GitHub fails or its pagination stops short. The route withholds the sum on
// purpose — employment alone is not a smaller number, it is a wrong one wearing
// the headline's clothes — and the hook stopped storing, diffing and displacing
// on those payloads.
//
// The /about years card then undid all of it in one expression. It read
// `experienceData?.total?.months ?? 0` and gated everything else on
// `!!experienceData`, so a degraded payload rendered a count-up to 0, the words
// "0 months of experience", an accessible name announcing "0+ months of
// experience", and a breakdown trigger presented as a finished load — every one
// of them a claim the payload was written not to make, and all of them
// REPLACING the honest "not in yet" state the card already had for a null
// payload. A GitHub outage did not degrade the card; it made the card lie.
//
// These cases pin the three states and the label each one gets. They are unit
// tests over pure functions rather than a render of the card, which is a
// 1,800-line client component pulling in three.js and framer-motion — a test
// that had to mount it to ask "what does a degraded payload look like?" is a
// test nobody writes.

/** The degraded payload, in the shape route.js builds it. */
const DEGRADED = {
  generatedAt: '2026-09-17T12:00:00.000Z',
  partial: true,
  personalProjects: null,
  employment: { months: 90, display: '7+ years', roles: [] },
  total: null,
};

/** A complete payload. */
const COMPLETE = {
  generatedAt: '2026-09-17T12:00:00.000Z',
  partial: false,
  personalProjects: {
    firstRepoDate: '2020-01-01',
    months: 60,
    display: '5+ years',
    complete: true,
    repos: [],
  },
  employment: { months: 90, display: '7+ years', roles: [] },
  total: { months: 150, display: '12+ years' },
};

/**
 * A payload hydrated from localStorage by a client that stored it before
 * `partial` existed: complete by construction (only complete payloads are ever
 * written there) and carrying no flag to read.
 */
const LEGACY_STORED = {
  personalProjects: COMPLETE.personalProjects,
  employment: COMPLETE.employment,
  total: COMPLETE.total,
};

describe('experienceSummaryState', () => {
  it('separates "nothing yet" from "finished, and degraded"', () => {
    // The distinction the card did not have. Both used to be "falsy total".
    expect(experienceSummaryState(null)).toBe('loading');
    expect(experienceSummaryState(undefined)).toBe('loading');
    expect(experienceSummaryState(DEGRADED)).toBe('degraded');
    expect(experienceSummaryState(COMPLETE)).toBe('ready');
  });

  it('reads a missing `partial` flag as complete', () => {
    // An instant-paint entry written before the flag existed. Treating an
    // absent flag as degraded would make a perfectly healthy visit paint
    // "unavailable" out of storage — the same failure the hook avoids when it
    // decides which held payload to keep.
    expect(experienceSummaryState(LEGACY_STORED)).toBe('ready');
  });

  it('turns on `partial === true` and nothing else', () => {
    // Not truthiness: a payload that carried `partial: 'false'` or `partial: 0`
    // from a bad serialiser round-trip must not silently flip the card's state.
    expect(experienceSummaryState({ ...COMPLETE, partial: 0 })).toBe('ready');
    expect(experienceSummaryState({ ...COMPLETE, partial: null })).toBe('ready');
  });
});

describe('experienceSourceAvailability', () => {
  it('marks the failed half unavailable and the total uncomputable', () => {
    expect(experienceSourceAvailability(DEGRADED)).toEqual({
      loaded: true,
      personalAvailable: false,
      employmentAvailable: true,
      // The flag the donut's centre and the card's headline both turn on: a sum
      // over half the data is a different quantity, not a smaller one.
      totalComputable: false,
    });
  });

  it('treats a pending request as no failure at all', () => {
    // "Unavailable" for a request that has not answered yet would be its own
    // false claim, which is why both flags default to available before a
    // payload exists.
    expect(experienceSourceAvailability(null)).toEqual({
      loaded: false,
      personalAvailable: true,
      employmentAvailable: true,
      totalComputable: true,
    });
  });

  it('keeps a present-but-empty side available', () => {
    // `{ months: 0 }` is a genuine "owns nothing yet", and it must read as a
    // real zero rather than as a failure — the distinction the whole `null`
    // convention in the route exists to carry.
    const empty = {
      ...COMPLETE,
      personalProjects: { ...COMPLETE.personalProjects, months: 0, repos: [] },
    };
    expect(experienceSourceAvailability(empty).personalAvailable).toBe(true);
    expect(experienceSourceAvailability(empty).totalComputable).toBe(true);
  });
});

describe('buildExperienceCardLabel', () => {
  it('states no figure at all for a degraded payload', () => {
    const label = buildExperienceCardLabel({
      state: experienceSummaryState(DEGRADED),
      // Passed exactly as the card computes them, which on a degraded payload
      // is the withheld total read as zero. The label must ignore them.
      counterValue: 0,
      counterUnit: 'months',
      splitLabel: buildSplitBreakdownLabel(DEGRADED),
    });

    // The regression in one line: this used to be
    // "0+ months of experience. … Activate to open category breakdown."
    expect(label).not.toMatch(/\b0\+/);
    expect(label).not.toMatch(/\b0\s+(months|years)\b/);
    expect(label).toMatch(/^Total years of experience unavailable/);
    // The employment half is still spoken — the payload does carry it, and the
    // trigger is still offered, so the name says what is behind it.
    expect(label).toContain('personal projects data unavailable');
    expect(label).toContain('Activate to open the breakdown of what is available');
  });

  it('does not say "loading" once the request has answered', () => {
    // A degraded answer is not a pending one. "Loading" would promise a number
    // that is not coming until GitHub recovers.
    const label = buildExperienceCardLabel({
      state: 'degraded',
      counterValue: 0,
      counterUnit: 'months',
    });
    expect(label.toLowerCase()).not.toContain('loading');
  });

  it('announces the figure for a complete payload', () => {
    // The control. Without it the assertions above would pass on a label that
    // never states a total in any state.
    const label = buildExperienceCardLabel({
      state: experienceSummaryState(COMPLETE),
      counterValue: 12,
      counterUnit: 'years',
      splitLabel: buildSplitBreakdownLabel(COMPLETE),
    });

    expect(label).toBe(
      '12+ years of experience. Experience split: personal projects 40 percent, ' +
        'employment 60 percent. Activate to open category breakdown.',
    );
  });

  it('says only that it is loading before anything arrives', () => {
    expect(
      buildExperienceCardLabel({ state: experienceSummaryState(null) }),
    ).toBe('Loading experience summary');
  });
});

describe('buildSplitBreakdownLabel', () => {
  it('speaks the failed half rather than counting it as zero', () => {
    // The card is a `role="button"` with an explicit label, so it is a leaf for
    // name computation: the visual legend's "Unavailable" is never announced,
    // and this sentence is the only place an AT user hears it.
    expect(buildSplitBreakdownLabel(DEGRADED)).toBe(
      'Experience split: personal projects data unavailable, employment 100 percent.',
    );
  });

  it('says nothing before a payload arrives', () => {
    // Without this guard both halves read as unavailable and a pending request
    // announces a double failure.
    expect(buildSplitBreakdownLabel(null)).toBe('');
  });

  it('says nothing when both halves loaded and measured zero', () => {
    // Matches ExperienceSplitBar's own bail: no bar is rendered, so there is no
    // legend to speak.
    expect(
      buildSplitBreakdownLabel({
        partial: false,
        personalProjects: { months: 0, repos: [], complete: true },
        employment: { months: 0, roles: [] },
        total: { months: 0, display: '0 months' },
      }),
    ).toBe('');
  });

  it('still speaks a split when the measured half is itself zero', () => {
    // GitHub down AND no employment months: the "data unavailable" distinction
    // is the whole content of the sentence, and it is still worth saying.
    expect(
      buildSplitBreakdownLabel({
        partial: true,
        personalProjects: null,
        employment: { months: 0, roles: [] },
        total: null,
      }),
    ).toBe(
      'Experience split: personal projects data unavailable, employment 0 percent.',
    );
  });
});
