// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExperienceBreakdownModal } from '@/components/about/ExperienceBreakdownModal';

// ── The false total, one click in ──────────────────────────────────────────
// The years card's headline was the visible half of this defect; the breakdown
// modal is the other half, and fixing only the card would have moved the wrong
// number rather than removed it.
//
// `ExperienceDonut` derives its own grand total from the two halves
// (`personalMonths + employmentMonths`) instead of reading the payload's
// `total`, which the route sets to `null` on a degraded answer. A failed half
// arrives as 0, so the arithmetic silently recomputed exactly the figure the
// route withheld — the employment-only sum, printed under the word "total" —
// and drew it as a single full-circle arc, which reads as "100% employment".
//
// This suite renders the real modal against the real degraded payload shape.
// The per-category blocks were already honest ("Unavailable"), so those are
// asserted too: they are what makes the hero's missing number safe to omit
// rather than a hole in the page.

/** The degraded payload, in the shape route.js builds it. */
const DEGRADED = {
  generatedAt: '2026-09-17T12:00:00.000Z',
  partial: true,
  personalProjects: null,
  // 90 months = 7 years, which is the number a recomputed "total" would print.
  employment: {
    months: 90,
    display: '7+ years',
    roles: [
      {
        company: 'Lidl GB',
        role: 'Customer Assistant',
        start: '2021-09',
        end: '2025-04',
        months: 43,
      },
    ],
  },
  total: null,
};

/**
 * Degraded, and the surviving half is a genuine zero.
 *
 * `employment` is never null — it is a pure derivation over a static import, so
 * only the GitHub side can fail — which means the two halves sum to 0 exactly
 * when the resume parses to no roles while GitHub is down. `{ months: 0 }` is
 * the route's deliberate "successful but empty", distinct from the `null` that
 * means failed, so this is a payload it can build rather than an invented shape.
 */
const DEGRADED_EMPTY = {
  generatedAt: '2026-09-17T12:00:00.000Z',
  partial: true,
  personalProjects: null,
  employment: { months: 0, display: 'Less than a year', roles: [] },
  total: null,
};

/** A complete payload, to prove the donut still states a total normally. */
const COMPLETE = {
  generatedAt: '2026-09-17T12:00:00.000Z',
  partial: false,
  personalProjects: {
    firstRepoDate: '2020-01-01',
    months: 60,
    display: '5+ years',
    complete: true,
    repos: [{ name: 'culina', createdAt: '2020-01-01T00:00:00Z', url: null }],
  },
  employment: DEGRADED.employment,
  total: { months: 150, display: '12+ years' },
};

beforeAll(() => {
  // The modal's reveal cascade and per-row heartbeats observe their sections
  // inside the dialog's own scroll container. jsdom has no
  // IntersectionObserver, and without it the render throws before any
  // assertion runs. A stub that never fires is the right fidelity here: these
  // cases are about what the hero STATES, not about when it animates.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  // The role/repo rows measure their own text to decide whether to show a
  // tooltip for a clipped label. Same reasoning as the observer above: stubbed
  // rather than simulated, because nothing here asserts on clipping.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // Framer reads this for its reduced-motion hook.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
});

afterEach(() => {
  cleanup();
});

// `createElement` rather than JSX: the oxc transform in vitest.config.js is
// scoped to `src/**/*.js` and `.jsx`, so JSX inside a `tests/**/*.test.js` file
// is parsed as plain JavaScript and fails at the first tag. Same convention as
// tests/unit/guestbookMotionToggle.test.js.
const open = (data) =>
  render(
    createElement(ExperienceBreakdownModal, {
      open: true,
      data,
      onClose: () => {},
    }),
  );

describe('ExperienceBreakdownModal — a degraded payload', () => {
  it('states no grand total when a source failed', () => {
    open(DEGRADED);

    // The regression: the hero printed "7+" under "total yrs" — the employment
    // half alone, wearing the grand total's label.
    expect(screen.getByText(/total unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/total (yrs|mo)/i)).toBeNull();
  });

  it('keeps the honest half, and marks the missing one', () => {
    open(DEGRADED);

    // Both are what make omitting the total safe rather than a blank page: the
    // employment side is real data and still rendered, and the personal side
    // says why it is absent instead of showing a zero.
    expect(screen.getByText('Unavailable')).toBeTruthy();
    // Regex, not an exact string: the row renders the company as a suffix
    // (`· Lidl GB`) beside the job title.
    expect(screen.getByText(/Lidl GB/)).toBeTruthy();
    expect(screen.getByText(/Customer Assistant/)).toBeTruthy();
  });

  it('never renders the withheld sum anywhere in the dialog', () => {
    const { container } = open(DEGRADED);

    // Belt and braces on the numeral itself. `90` months → "7+ years" is the
    // figure the route refused to publish, so it must not appear as a total
    // anywhere — including in a `sr-only` string, which is where an accessible
    // name would smuggle it back in.
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/7\+\s*(total|yrs)/i);
    expect(text).not.toMatch(/total\s*7/i);
  });
});

describe('ExperienceBreakdownModal — degraded with a zero-month remainder', () => {
  it('still states that the total is unavailable', () => {
    // The donut returned early on `total === 0` BEFORE it reached the
    // unavailable branch, so this payload lost the em-dash and the "total
    // unavailable" caption entirely. The category rows still rendered, which is
    // what made it quiet: the modal showed "Unavailable" beside a hole where
    // the total belongs, and a missing donut reads as "nothing to show" rather
    // than "this cannot be computed" — the one implication a degraded payload
    // must not make.
    open(DEGRADED_EMPTY);

    expect(screen.getByText(/total unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/total (yrs|mo)/i)).toBeNull();
  });

  it('does not invent a zero total instead', () => {
    // The other way to get this wrong: dropping the early return altogether
    // would draw the ring and print "0" under "total mo", which is a stated
    // figure and therefore a claim — the same class of false total the rest of
    // this suite exists to prevent, just with a smaller number on it.
    const { container } = open(DEGRADED_EMPTY);
    const text = container.textContent ?? '';

    expect(text).toMatch(/total unavailable/i);
    expect(text).not.toMatch(/0\s*total/i);
    expect(text).not.toMatch(/total\s*0/i);
  });
});

describe('ExperienceBreakdownModal — a truncated personal half', () => {
  /**
   * Partial the QUIET way: the repos are present, the list is short.
   *
   * Pagination stopped early (budget exhausted, a page aborted, the ceiling
   * hit), so the route returns what it collected with `complete: false`, marks
   * the payload partial and withholds `total` — the same treatment a failure
   * gets. The half is a present object, which is exactly why a `!= null`
   * availability check waved it through.
   */
  const TRUNCATED = {
    ...COMPLETE,
    partial: true,
    personalProjects: { ...COMPLETE.personalProjects, complete: false },
    total: null,
  };

  it('states no grand total for a short repo list either', () => {
    open(TRUNCATED);

    // 60 + 90 months = 150 → "12+" under "total yrs", derived from a personal
    // half that is a floor. Pagination runs newest-first, so a truncated list
    // is missing precisely the OLDEST repos — the ones the span is anchored on
    // — and the undercount is systematic rather than a rounding error.
    expect(screen.getByText(/total unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/total (yrs|mo)/i)).toBeNull();
  });

  it('keeps the repos it did collect, rather than blanking the section', () => {
    // The other half of the trade the route documents for this flag: "the repos
    // are still shown, and the figures derived from them are held back until
    // the list is known to be whole." Withholding the total must not turn into
    // withholding the content — that would make a slow page look like an outage.
    open(TRUNCATED);

    expect(screen.getByText(/culina/i)).toBeTruthy();
  });
});

describe('ExperienceBreakdownModal — a complete payload', () => {
  it('still states the grand total', () => {
    // The control. Without it, the cases above would pass on a donut that
    // never states a total in any state — which would be a different bug with
    // the same green tests.
    open(COMPLETE);

    expect(screen.getByText(/total (yrs|mo)/i)).toBeTruthy();
    expect(screen.queryByText(/total unavailable/i)).toBeNull();
  });
});
