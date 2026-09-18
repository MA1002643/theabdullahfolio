// Removing this deployment's own credentials from text on its way to a log.
//
// The response side of this problem is solved per route — a fixed string, or an
// opt-in mark on the messages a route authored itself. The LOG side was left
// open on the reasoning that the log is where a 01:00 cron failure is read from
// and the upstream's own words are worth having there. The first half is true
// and the second does not follow: a log is a sink with its own audience. It
// persists, it can be forwarded to a drain, and it is read by anyone with
// project access — so the rule the response obeys ("name the variable, never the
// value", CLAUDE.md) is the rule the log needs too.
//
// What makes this necessary rather than theoretical is that library errors quote
// the configuration they were given. `@upstash/redis` names the REST endpoint it
// could not reach; undici reports a DNS failure as `getaddrinfo ENOTFOUND
// <host>` — and that host is half of `KV_REST_API_URL`, which this repo's own
// credential table lists as a secret. Nobody wrote a line of code to log it.

/**
 * The variables whose VALUES may never appear in a log line.
 *
 * Mirrors the credential table in CLAUDE.md, plus the `UPSTASH_`-prefixed pair
 * that `redisDriver` accepts as an alternative to the `KV_` names — the driver
 * reads either, so redacting only one pair would leave a direct-Upstash
 * deployment unprotected while looking covered.
 *
 * Names, not values, obviously: this file is committed.
 */
const SECRET_ENV_VARS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'GITHUB_TOKEN',
  'CRON_SECRET',
  'SMTP_USER',
  'SMTP_PASS',
  'ABSTRACT_API_KEY',
  'LOCATION_INGEST_TOKEN',
  'LOCATION_INGEST_QUERY_TOKEN',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REFRESH_TOKEN',
];

// Below this length a value is not redacted at all, and the reason is not
// prudence about noise — it is correctness. A one- or two-character variable
// (a stray `KV_REST_API_URL=x` in a preview) would match inside ordinary words
// and turn the log into confetti, and an EMPTY one would match everywhere.
// Eight is comfortably under every real credential's length and comfortably
// over anything that could collide.
const MIN_REDACTABLE_LENGTH = 8;

/** The host of a URL-shaped value, or null. */
function hostOf(value) {
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

/** Escape a literal for use inside a RegExp. */
const escapeRe = (literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every (needle, variable name) pair to scrub, longest needle first.
 *
 * Read from `process.env` on every call rather than captured at import. Module
 * scope is evaluated once per runtime and long before a request, so a captured
 * snapshot would quietly redact nothing in any environment configured after the
 * fact — and a test that sets a variable in `beforeEach` would prove the
 * opposite of what it asserts.
 *
 * The HOST of a URL value is a needle of its own, because that is the form a
 * network error actually names: undici says `getaddrinfo ENOTFOUND
 * <id>.upstash.io`, never the full REST URL with its path. Redacting only the
 * whole URL would miss every DNS and socket failure, which is most of them.
 *
 * Longest first so a full URL is replaced before the host inside it, leaving one
 * placeholder rather than a placeholder wrapped around another.
 */
function needles() {
  const found = [];
  for (const name of SECRET_ENV_VARS) {
    const value = (process.env[name] ?? '').trim();
    if (value.length < MIN_REDACTABLE_LENGTH) continue;
    found.push({ needle: value, name });
    const host = hostOf(value);
    if (host && host.length >= MIN_REDACTABLE_LENGTH)
      found.push({ needle: host, name });
  }
  return found.sort((a, b) => b.needle.length - a.needle.length);
}

/**
 * Replace every configured credential in `text` with the NAME of its variable.
 *
 * The name rather than a row of asterisks: `[KV_REST_API_URL]` tells an operator
 * which piece of configuration the failure was about, which is the half of the
 * diagnosis that was ever worth having. A masked string tells them nothing and
 * still costs them the value.
 *
 * Case-insensitive, because the value and the form it comes back in need not
 * match: DNS lowercases, and a host typed with capitals in the dashboard is
 * reported in lowercase by the resolver.
 *
 * @param {unknown} text Anything; coerced to a string.
 * @returns {string} The text with configured credential values removed.
 */
export function redactSecrets(text) {
  let out = String(text);
  for (const { needle, name } of needles()) {
    out = out.replace(new RegExp(escapeRe(needle), 'gi'), `[${name}]`);
  }
  return out;
}

/** Render one link of an error chain without walking further. */
function renderLink(value) {
  if (value instanceof Error) {
    // The stack already opens with `Name: message`, so this is the message plus
    // where it came from, not one at the cost of the other.
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (value !== null && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      // Cyclic, or a getter that throws.
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/**
 * An error rendered for a log line, with this deployment's credentials removed.
 *
 * The CAUSE CHAIN is walked, and that is not a nicety. undici reports a failed
 * request as `TypeError: fetch failed` and puts the entire diagnosis — the
 * refused address, the DNS verdict, the TLS error — in `cause`. Logging only the
 * top-level error would delete exactly the information this replaces a raw
 * `console.error(err)` to preserve, which would make a privacy fix a diagnostic
 * regression and get it reverted the first time a cron failed.
 *
 * @param {unknown} error The thrown value.
 * @param {number} [maxDepth] How many `cause` links to follow.
 * @returns {string} A redacted, multi-line description.
 */
export function describeError(error, maxDepth = 3) {
  const parts = [];
  const seen = new Set();
  let current = error;

  for (let depth = 0; current != null && depth <= maxDepth; depth += 1) {
    if (typeof current === 'object') {
      // A `cause` that points back up the chain would otherwise loop until the
      // depth cap, printing the same two frames repeatedly.
      if (seen.has(current)) break;
      seen.add(current);
    }
    parts.push(
      depth === 0 ? renderLink(current) : `caused by: ${renderLink(current)}`,
    );
    current = typeof current === 'object' ? current.cause : undefined;
  }

  return redactSecrets(parts.join('\n'));
}
