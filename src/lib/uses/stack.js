// Pure helpers for the /uses Stack plate (issue #37). No React, no DOM — the
// fail-open decision and the repo-count copy are unit-tested in the node
// environment, the same doctrine as guestbook/validate.js.
import { CATEGORY_ORDER } from '@/utils/skillsIconUrl';

const hasItems = (categories) =>
  Boolean(categories) &&
  typeof categories === 'object' &&
  Object.values(categories).some((items) => Array.isArray(items) && items.length > 0);

// Group a categories object in CATEGORY_ORDER, dropping empty categories.
export function groupStack(categories) {
  if (!categories || typeof categories !== 'object') return [];
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: Array.isArray(categories[category]) ? categories[category] : [],
  })).filter((g) => g.items.length > 0);
}

/**
 * Decide what the plate renders. A payload is LIVE only when it carries a
 * non-empty categories object AND was not the route's `_fallback` shape —
 * the About page's "never claim live on stale data" rule. Anything else
 * (null, `{ error }`, an empty crawl, a network failure) fails OPEN to the
 * curated set with the live claim dropped.
 *
 * @returns {{ groups: Array, live: boolean, fetchedAt: string|null }}
 */
export function resolveStack(payload, fallback) {
  const live =
    Boolean(payload) &&
    typeof payload === 'object' &&
    !payload.error &&
    !payload._fallback &&
    hasItems(payload.categories);
  if (live) {
    return {
      groups: groupStack(payload.categories),
      live: true,
      fetchedAt: typeof payload.fetchedAt === 'string' ? payload.fetchedAt : null,
    };
  }
  return { groups: groupStack(fallback), live: false, fetchedAt: null };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * "used in 7 public repos · +2 private" — the count is the whole point of
 * the tile. Zero segments are omitted; a skill with no counts (the curated
 * fallback) returns null so the tile shows no claim at all.
 */
export function repoCountCopy(item) {
  const pub = Array.isArray(item?.repos) ? item.repos.length : 0;
  const priv =
    Number.isFinite(item?.privateRepoCount) && item.privateRepoCount > 0
      ? item.privateRepoCount
      : 0;
  if (pub === 0 && priv === 0) return null;
  if (pub === 0) return `used in ${plural(priv, 'private repo')}`;
  const base = `used in ${plural(pub, 'public repo')}`;
  return priv > 0 ? `${base} · +${priv} private` : base;
}

// The compact form for the tile face: "7 · +2", "7", "+2", or null.
export function repoCountShort(item) {
  const pub = Array.isArray(item?.repos) ? item.repos.length : 0;
  const priv =
    Number.isFinite(item?.privateRepoCount) && item.privateRepoCount > 0
      ? item.privateRepoCount
      : 0;
  if (pub === 0 && priv === 0) return null;
  if (pub === 0) return `+${priv}`;
  return priv > 0 ? `${pub} · +${priv}` : `${pub}`;
}

// Total distinct tiles across every group — the figure in the plate's
// provenance line.
export const countTiles = (groups) => groups.reduce((n, g) => n + g.items.length, 0);

// ── The ledger (owner correction, 2026-09-05) ─────────────────────────────
// The tiles became ranked instrument cards: each carries a usage METER (a
// row of segments, public repos in ember and private in amber) sized
// against the most-used tool on the plate, and a figure in the digit
// grammar. The helpers below are the whole of that arithmetic, pure and
// unit-tested; the components only paint what they return.

// A tool's usage: every repository it was found in, public or private.
export const usageTotal = (item) => {
  const pub = Array.isArray(item?.repos) ? item.repos.length : 0;
  const priv =
    Number.isFinite(item?.privateRepoCount) && item.privateRepoCount > 0
      ? item.privateRepoCount
      : 0;
  return pub + priv;
};

// Most-used first; ties by name. A wholly uncounted list (the curated
// fallback, every total 0) keeps its hand-set order — the sort is stable
// and the comparator returns 0 for two zeros.
export function rankByUsage(items) {
  return [...items].sort((a, b) => {
    const diff = usageTotal(b) - usageTotal(a);
    if (diff !== 0) return diff;
    if (usageTotal(a) === 0) return 0;
    return String(a.displayName).localeCompare(String(b.displayName));
  });
}

// The scale every meter is drawn against: the busiest tool on the plate.
export const maxUsage = (groups) =>
  groups.reduce((m, g) => g.items.reduce((mm, it) => Math.max(mm, usageTotal(it)), m), 0);

export const METER_SEGMENTS = 16;

/**
 * How many of the meter's segments light, and how the lit run splits
 * between public (drawn first, in ember) and private (amber). Any non-zero
 * usage lights at least one segment, and any non-zero portion of it gets
 * at least one — a tool used once in private must not read as unused.
 * Never exceeds the segment count.
 */
export function meterSegments(item, max, segments = METER_SEGMENTS) {
  const total = usageTotal(item);
  if (total === 0 || !max || max <= 0) return { lit: 0, public: 0, private: 0 };
  const pub = Array.isArray(item.repos) ? item.repos.length : 0;
  const priv = total - pub;
  const lit = Math.min(segments, Math.max(1, Math.round((total / max) * segments)));
  let publicSegs = pub > 0 ? Math.max(1, Math.round((lit * pub) / total)) : 0;
  let privateSegs = priv > 0 ? Math.max(1, lit - publicSegs) : 0;
  if (publicSegs + privateSegs > segments) publicSegs = segments - privateSegs;
  return { lit: publicSegs + privateSegs, public: publicSegs, private: privateSegs };
}

/**
 * The figure beside the meter, as parts the card renders with the numbers
 * in ember: "3 repos · 1 public · 2 private" when mixed, "4 public repos"
 * or "1 private repo" when one-sided, null when there are no counts.
 */
export function repoFigureParts(item) {
  const pub = Array.isArray(item?.repos) ? item.repos.length : 0;
  const total = usageTotal(item);
  const priv = total - pub;
  if (total === 0) return null;
  if (priv === 0) return [{ n: pub, unit: pub === 1 ? 'public repo' : 'public repos' }];
  if (pub === 0) return [{ n: priv, unit: priv === 1 ? 'private repo' : 'private repos' }];
  return [
    { n: total, unit: 'repos' },
    { n: pub, unit: 'public' },
    { n: priv, unit: 'private' },
  ];
}
