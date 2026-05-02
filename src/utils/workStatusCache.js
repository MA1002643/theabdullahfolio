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
let entry = null;

export function read() {
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) return null;
  return entry.payload;
}

export function readStale() {
  return entry?.payload ?? null;
}

export function write(payload) {
  entry = { payload, timestamp: Date.now() };
}

export function invalidate() {
  entry = null;
}

export const __TTL_MS = TTL_MS;
