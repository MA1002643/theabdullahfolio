import { describe, expect, it, vi } from 'vitest';

// `deriveFindings` is the whole product of /api/seo-report. Everything around
// it — the JWT signing, the snapshot storage, the daily baseline — exists to
// feed this function, and the report a human eventually reads IS its output.
//
// It is also the part whose failures are silent. A wrong comparison or a
// misordered sort does not throw, does not fail the cron, and does not make the
// response look wrong: it returns HTTP 200 with a well-formed body containing
// findings that are subtly untrue. The most dangerous single character in the
// route is the `>` on the position delta, because GSC positions are
// "lower is better" and flipping the sign would report every IMPROVEMENT as a
// regression — a report that is not merely unhelpful but actively misleading.
//
// The function is pure and exported, so the boundaries can be pinned directly
// rather than inferred through the route.

// The route module opens a redis client at import. Stubbed so these cases are
// about arithmetic and nothing else.
vi.mock('@/lib/guestbook/redisDriver', () => ({
  redis: null,
  redisAvailable: false,
}));

const { deriveFindings } = await import('@/app/api/seo-report/route');

/** A Search Analytics query row, with only the fields under test specified. */
const query = (
  name,
  { impressions = 0, position = 10, clicks = 0, ctr = 0 } = {},
) => ({
  query: name,
  clicks,
  impressions,
  ctr,
  position,
});

/** A Search Analytics page row. */
const page = (
  path,
  { impressions = 0, ctr = 0, position = 10, clicks = 0 } = {},
) => ({
  page: path,
  clicks,
  impressions,
  ctr,
  position,
});

const snapshot = ({ queries = [], pages = [] } = {}) => ({ queries, pages });

describe('deriveFindings — new queries', () => {
  it('treats every query as new when there is no previous snapshot', () => {
    // The first-ever run, and the missed-day case: `previous` is null rather
    // than an empty snapshot.
    const { newQueries } = deriveFindings(
      snapshot({ queries: [query('alpha'), query('beta')] }),
      null,
    );
    expect(newQueries.map((row) => row.query)).toEqual(['alpha', 'beta']);
  });

  it('excludes a query that appeared in the previous snapshot', () => {
    const { newQueries } = deriveFindings(
      snapshot({ queries: [query('kept'), query('fresh')] }),
      snapshot({ queries: [query('kept')] }),
    );
    expect(newQueries.map((row) => row.query)).toEqual(['fresh']);
  });

  it('orders new queries by impressions, descending', () => {
    const { newQueries } = deriveFindings(
      snapshot({
        queries: [
          query('quiet', { impressions: 3 }),
          query('loudest', { impressions: 900 }),
          query('middling', { impressions: 40 }),
        ],
      }),
      null,
    );
    expect(newQueries.map((row) => row.query)).toEqual([
      'loudest',
      'middling',
      'quiet',
    ]);
  });

  it('keeps the top 20 by impressions, not the first 20 encountered', () => {
    // The distinction the cap exists for. Input is ordered LOWEST-first, so a
    // `.slice(0, 20)` applied before the sort would return exactly the twenty
    // least important queries — the opposite of the intent, and invisible in a
    // report that still looks full.
    const queries = Array.from({ length: 25 }, (_, i) =>
      query(`q${String(i).padStart(2, '0')}`, { impressions: i }),
    );

    const { newQueries } = deriveFindings(snapshot({ queries }), null);

    expect(newQueries).toHaveLength(20);
    expect(newQueries[0].query).toBe('q24');
    expect(newQueries[19].query).toBe('q05');
    // The five quietest are the ones dropped.
    const names = newQueries.map((row) => row.query);
    for (const dropped of ['q00', 'q01', 'q02', 'q03', 'q04']) {
      expect(names).not.toContain(dropped);
    }
  });

  it('leaves the caller’s snapshot array untouched', () => {
    // `sort` mutates in place, so a missing `filter`/`map` copy would quietly
    // reorder the array that is about to be WRITTEN to Upstash as the day's
    // baseline — corrupting tomorrow's comparison rather than today's report.
    const queries = [
      query('first', { impressions: 1 }),
      query('second', { impressions: 99 }),
    ];
    const current = snapshot({ queries });

    deriveFindings(current, null);

    expect(current.queries.map((row) => row.query)).toEqual([
      'first',
      'second',
    ]);
  });
});

describe('deriveFindings — ranking regressions', () => {
  it('never reports an improvement as a regression', () => {
    // The sign guard, and the single most consequential assertion in this file.
    // GSC positions are "lower is better": moving from 15 to 5 is the best
    // possible news, and a flipped comparison would file it as a drop of 10.
    const { droppedPositions } = deriveFindings(
      snapshot({ queries: [query('climbing', { position: 5 })] }),
      snapshot({ queries: [query('climbing', { position: 15 })] }),
    );
    expect(droppedPositions).toEqual([]);
  });

  it('ignores a drop of exactly 3, reports one just past it', () => {
    // `delta > 3`, strictly. Both rows go through together so the boundary is
    // pinned from both sides at once.
    const { droppedPositions } = deriveFindings(
      snapshot({
        queries: [
          query('exactly-three', { position: 13 }),
          query('just-over', { position: 13.5 }),
        ],
      }),
      snapshot({
        queries: [
          query('exactly-three', { position: 10 }),
          query('just-over', { position: 10 }),
        ],
      }),
    );
    expect(droppedPositions.map((row) => row.query)).toEqual(['just-over']);
    expect(droppedPositions[0].delta).toBe(3.5);
  });

  it('ignores a query with no previous position at all', () => {
    // A brand-new query has not "dropped" — it is a new query, and belongs in
    // the other bucket.
    const { droppedPositions, newQueries } = deriveFindings(
      snapshot({ queries: [query('brand-new', { position: 90 })] }),
      snapshot({ queries: [query('unrelated')] }),
    );
    expect(droppedPositions).toEqual([]);
    expect(newQueries.map((row) => row.query)).toEqual(['brand-new']);
  });

  it('orders regressions worst-first', () => {
    const { droppedPositions } = deriveFindings(
      snapshot({
        queries: [
          query('slipped', { position: 14 }),
          query('collapsed', { position: 60 }),
          query('sagged', { position: 25 }),
        ],
      }),
      snapshot({
        queries: [
          query('slipped', { position: 10 }),
          query('collapsed', { position: 10 }),
          query('sagged', { position: 10 }),
        ],
      }),
    );
    expect(droppedPositions.map((row) => row.query)).toEqual([
      'collapsed',
      'sagged',
      'slipped',
    ]);
    expect(droppedPositions.map((row) => row.delta)).toEqual([50, 15, 4]);
  });

  it('reports from/to/delta rounded to one decimal', () => {
    // GSC positions are averages and arrive with a long tail of decimals; a raw
    // 12.700000000000001 in a report reads as a bug in the report.
    const { droppedPositions } = deriveFindings(
      snapshot({ queries: [query('noisy', { position: 12.74 })] }),
      snapshot({ queries: [query('noisy', { position: 8.26 })] }),
    );
    expect(droppedPositions).toEqual([
      { query: 'noisy', from: 8.3, to: 12.7, delta: 4.5 },
    ]);
  });
});

describe('deriveFindings — low-CTR pages', () => {
  it('does not filter on rank, and says so by carrying `position`', () => {
    // The list is candidates to investigate, NOT "pages that rank well but are
    // not clicked". A page at average position 40 qualifies exactly like one at
    // position 3, because below the first page a result collects few clicks
    // however good its snippet is — so a poor position is on its own a
    // sufficient explanation for the low CTR.
    //
    // Both halves are pinned deliberately. The deep page must be INCLUDED
    // (adding a position threshold here would silently drop pages from the
    // report, and the runbook's triage would stop matching the data), and every
    // row must carry `position`, because ruling rank out is the first step the
    // runbook asks for and it can only be done from this field.
    const { lowCtrPages } = deriveFindings(
      snapshot({
        pages: [
          page('/ranks-well', { impressions: 900, ctr: 0.004, position: 3.1 }),
          page('/buried', { impressions: 500, ctr: 0.004, position: 41.8 }),
        ],
      }),
      null,
    );

    expect(lowCtrPages.map((row) => row.page)).toEqual([
      '/ranks-well',
      '/buried',
    ]);
    for (const row of lowCtrPages) {
      expect(
        typeof row.position,
        'position must survive into every row — the runbook triages on it',
      ).toBe('number');
    }
    expect(lowCtrPages[1].position).toBe(41.8);
  });

  it('includes a page at exactly 50 impressions and excludes one at 49', () => {
    // `impressions >= 50`, inclusive. Below the floor a percentage is noise: at
    // 49 impressions a single click moves CTR by two points.
    const { lowCtrPages } = deriveFindings(
      snapshot({
        pages: [
          page('/at-the-floor', { impressions: 50, ctr: 0.005 }),
          page('/below-the-floor', { impressions: 49, ctr: 0.005 }),
        ],
      }),
      null,
    );
    expect(lowCtrPages.map((row) => row.page)).toEqual(['/at-the-floor']);
  });

  it('excludes a page at exactly 1% CTR and includes one just under', () => {
    // `ctr < 0.01`, strictly — 1.00% is the line, not a hit.
    const { lowCtrPages } = deriveFindings(
      snapshot({
        pages: [
          page('/exactly-one-percent', { impressions: 100, ctr: 0.01 }),
          page('/just-under', { impressions: 100, ctr: 0.0099 }),
        ],
      }),
      null,
    );
    expect(lowCtrPages.map((row) => row.page)).toEqual(['/just-under']);
  });

  it('reports CTR as a percentage to two decimals, not a raw ratio', () => {
    // 0.00234 is what GSC sends; 0.23(%) is what a person can act on.
    //
    // Deliberately not a `.x5` position: `toFixed` rounds on the binary value,
    // so `(6.55).toFixed(1)` is "6.5", not "6.6". Asserting a tie here would
    // pin a float artefact rather than the rounding this line is for.
    const { lowCtrPages } = deriveFindings(
      snapshot({
        pages: [
          page('/snippet-problem', {
            impressions: 800,
            ctr: 0.00234,
            position: 6.57,
          }),
        ],
      }),
      null,
    );
    expect(lowCtrPages).toEqual([
      { page: '/snippet-problem', impressions: 800, ctr: 0.23, position: 6.6 },
    ]);
  });

  it('orders low-CTR pages by impressions, descending', () => {
    // Biggest wasted audience first — the list is a work queue, and its order
    // is the recommendation.
    const { lowCtrPages } = deriveFindings(
      snapshot({
        pages: [
          page('/small', { impressions: 60, ctr: 0.001 }),
          page('/huge', { impressions: 5000, ctr: 0.001 }),
          page('/medium', { impressions: 400, ctr: 0.001 }),
        ],
      }),
      null,
    );
    expect(lowCtrPages.map((row) => row.page)).toEqual([
      '/huge',
      '/medium',
      '/small',
    ]);
  });

  it('judges pages on their own rows, not on the query list', () => {
    // The two buckets read different arrays; crossing them would be an easy
    // refactor slip and would produce a plausible-looking wrong answer.
    const { lowCtrPages, newQueries } = deriveFindings(
      snapshot({
        queries: [query('a-query', { impressions: 5000, ctr: 0 })],
        pages: [page('/a-page', { impressions: 5000, ctr: 0.001 })],
      }),
      null,
    );
    expect(lowCtrPages.map((row) => row.page)).toEqual(['/a-page']);
    expect(newQueries.map((row) => row.query)).toEqual(['a-query']);
  });
});
