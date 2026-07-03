// Tiny shared cache module for the work-status endpoint. Lives outside the
// route file so the webhook handler can invalidate it without importing
// from another route handler (which Next.js discourages).
//
// In-memory only: each serverless instance has its own copy. That's fine
// for a portfolio site — the webhook + 30s s-maxage CDN cache + cron
// fallback are enough to keep regions roughly consistent.

// 30-second server cache. Tight enough that GitHub Project board column
// moves (which don't fire repo webhooks and so can't bust the cache
// directly) become visible within 30s. Worst-case rate: ~120 cache
// misses/hour × 2 tokens = ~240 GraphQL queries/hour, well under each
// token's 5,000 point/hour limit (~5% utilisation).
const TTL_MS = 30 * 1000;

// Payload schema version (issue #94 §4.4). The cache is in-memory today so
// a deploy already clears it, but the version gate makes the invariant
// explicit: if this module ever grows a persistent backend (Upstash is
// already a dependency), an older-schema payload — v1 lacks
// `meta.byRepo` / `meta.breakdown`, v2 lacks `meta.activityTrace` — can
// never be served to a client build that expects the newer shape.
const SCHEMA_VERSION = 'v3-activity-trace';
let entry = null;

export function read() {
  if (!entry || entry.version !== SCHEMA_VERSION) return null;
  if (Date.now() - entry.timestamp > TTL_MS) return null;
  return entry.payload;
}

export function readStale() {
  if (!entry || entry.version !== SCHEMA_VERSION) return null;
  return entry.payload;
}

export function write(payload) {
  entry = { payload, timestamp: Date.now(), version: SCHEMA_VERSION };
}

export function invalidate() {
  entry = null;
}

export const __TTL_MS = TTL_MS;
