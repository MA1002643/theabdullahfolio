import { describe, expect, it } from 'vitest';

import { journeyData } from '@/app/data';
import { employmentFromJourney } from '@/utils/experience/journeyEmployment';

// ── Why the headline is a union and not a sum ───────────────────────────────
// /about's employment figure used to come from the CV PDF, whose two roles were
// consecutive — so adding their durations happened to be right. journeyData's
// are not: the retail and security posts run concurrently with the placement
// and with each other (Lidl GB spans SEP 2021 – APR 2025, straddling Unisys
// entirely). Summing would claim more months of employment than have elapsed
// since the first job began, a figure that grows faster than time itself.
//
// These cases pin the union, the per-role durations the breakdown modal draws
// its bars from, and — deliberately — the fact that those bars can add up to
// more than the headline, which is a property of concurrent employment rather
// than an arithmetic slip.

/** A career entry in the shape journeyData uses. */
const career = (org, start, end) => ({
  type: 'career',
  org,
  title: `Engineer · ${org}`,
  start,
  end,
});

// Fixed clock so open-ended entries are not time-dependent.
const NOW = new Date(Date.UTC(2026, 8, 15)); // 2026-09

describe('employmentFromJourney — the union', () => {
  it('adds disjoint roles', () => {
    // JAN–APR 2020 (3) + JUL–OCT 2020 (3).
    const { months } = employmentFromJourney(
      [career('A', '2020-01', '2020-04'), career('B', '2020-07', '2020-10')],
      NOW,
    );
    expect(months).toBe(6);
  });

  it('counts overlapping roles once', () => {
    // B sits entirely inside A. The answer is A's span, not A + B.
    const { months, roles } = employmentFromJourney(
      [career('A', '2020-01', '2021-01'), career('B', '2020-03', '2020-09')],
      NOW,
    );
    expect(months).toBe(12);
    // ...while the per-role durations still report their own lengths.
    expect(roles.map((r) => r.months)).toEqual([12, 6]);
  });

  it('merges a partial overlap into one span', () => {
    const { months } = employmentFromJourney(
      [career('A', '2020-01', '2020-07'), career('B', '2020-05', '2020-11')],
      NOW,
    );
    expect(months).toBe(10); // JAN → NOV, not 6 + 6
  });

  it('treats touching ranges as continuous employment', () => {
    // One ends JUL, the next starts JUL. With exclusive ends these are
    // contiguous, so there is no gap to subtract and no month to double-count.
    const { months } = employmentFromJourney(
      [career('A', '2020-01', '2020-07'), career('B', '2020-07', '2021-01')],
      NOW,
    );
    expect(months).toBe(12);
  });

  it('closes an open-ended role on the clock it is given', () => {
    const { months, roles } = employmentFromJourney(
      [career('A', '2026-06', null)],
      NOW,
    );
    expect(months).toBe(3); // JUN → SEP 2026
    expect(roles[0].end).toBe(null);
  });

  it('ignores everything that is not employment', () => {
    // Education and the volunteering posts (filed as `milestone`) share the
    // array. Counting them would inflate the figure with time the CV never
    // claimed as employment.
    const { months, roles } = employmentFromJourney(
      [
        career('A', '2020-01', '2020-07'),
        { type: 'education', org: 'Uni', start: '2018-09', end: '2021-06' },
        { type: 'milestone', org: 'Charity', start: '2019-01', end: '2020-01' },
      ],
      NOW,
    );
    expect(months).toBe(6);
    expect(roles).toHaveLength(1);
  });

  it('skips malformed entries instead of poisoning the total', () => {
    // A bad date must not subtract, NaN, or throw — it contributes nothing and
    // the surrounding roles still count.
    const { months, roles } = employmentFromJourney(
      [
        career('A', '2020-01', '2020-07'),
        career('Bad', 'not-a-date', '2020-09'),
        career('Backwards', '2021-06', '2021-01'),
        career('Month13', '2020-13', '2021-01'),
      ],
      NOW,
    );
    expect(Number.isFinite(months)).toBe(true);
    expect(months).toBe(6);
    expect(roles.map((r) => r.company)).toEqual(['A', 'Backwards']);
    // The reversed range is clamped to zero rather than negative.
    expect(roles[1].months).toBe(0);
  });

  it('returns an empty summary for junk input', () => {
    for (const input of [null, undefined, [], 'nope', 42]) {
      expect(employmentFromJourney(input, NOW)).toEqual({
        months: 0,
        display: '0+ months',
        roles: [],
      });
    }
  });
});

describe('employmentFromJourney — the role rows the modal renders', () => {
  it('splits `org · role` the way the journey atlas does', () => {
    const [role] = employmentFromJourney(
      [
        {
          type: 'career',
          org: 'Unisys',
          title: 'Software Engineer · Unisys',
          start: '2023-04',
          end: '2024-07',
        },
      ],
      NOW,
    ).roles;

    expect(role).toMatchObject({
      company: 'Unisys',
      role: 'Software Engineer',
      start: '2023-04-01',
      end: '2024-07-01',
      months: 15,
    });
    expect(role.display).toContain('Unisys');
  });

  it('falls back to the org when a title carries no separator', () => {
    const [role] = employmentFromJourney(
      [
        {
          type: 'career',
          org: 'Solo',
          title: '',
          start: '2020-01',
          end: '2020-03',
        },
      ],
      NOW,
    ).roles;
    expect(role.role).toBe('Solo');
  });
});

describe('employmentFromJourney — against the real record', () => {
  it('reports less than the sum of its roles, because they overlap', () => {
    // The property that makes the union necessary, asserted on the actual
    // data rather than a fixture: if this ever becomes an equality, the roles
    // have stopped overlapping and the modal's bars will sum to the headline
    // again.
    const { months, roles } = employmentFromJourney(journeyData, NOW);
    const summed = roles.reduce((total, role) => total + role.months, 0);

    expect(roles.length).toBeGreaterThan(1);
    expect(months).toBeGreaterThan(0);
    expect(summed).toBeGreaterThan(months);
  });

  it('never claims more employment than has elapsed since the first role', () => {
    // The sanity bound a naive sum would breach. Employment cannot exceed the
    // wall-clock time between the earliest start and now.
    const { months, roles } = employmentFromJourney(journeyData, NOW);
    const starts = roles.map((role) => {
      const [y, m] = role.start.split('-').map(Number);
      return y * 12 + (m - 1);
    });
    const elapsed =
      NOW.getUTCFullYear() * 12 + NOW.getUTCMonth() - Math.min(...starts);

    expect(months).toBeLessThanOrEqual(elapsed);
  });

  it('includes Unisys at the corrected span', () => {
    // The range this whole thread was about, now agreeing with the CV.
    const { roles } = employmentFromJourney(journeyData, NOW);
    const unisys = roles.find((role) => role.company === 'Unisys');

    expect(unisys).toBeDefined();
    expect(unisys.start).toBe('2023-04-01');
    expect(unisys.end).toBe('2024-07-01');
  });
});
