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
 * The first cut copied the credential TABLE in CLAUDE.md, which is a summary
 * written for a reader and not a manifest — it predates the Search Console work
 * and the guestbook's sign-in, and CLAUDE.md's actual rule is the sentence above
 * that table: every value in `.env.local` is a secret. Deriving the list from
 * the summary meant the two routes this module was written FOR each had a
 * credential it did not cover: `/api/seo-report` reads
 * `GSC_SERVICE_ACCOUNT_KEY`, a base64 blob holding a PRIVATE KEY, and
 * `/api/send-mail` puts `RECEIVER_EMAIL` in the envelope of the very send whose
 * rejection it logs. A bounce quotes the recipient; a signing failure can quote
 * the key it was handed. Both would have gone to the drain unchanged.
 *
 * `RECEIVER_EMAIL` is a secret by this repository's own construction rather than
 * by entropy — `footer-data.js` says so in those words, and it exists as a
 * separate variable from `NEXT_PUBLIC_CONTACT_EMAIL` precisely so the delivery
 * inbox is not the published one. That the two point at the same address today
 * is a choice, not a guarantee, and redacting a value that happens to also be
 * public costs nothing: the placeholder still names the server-only variable.
 *
 * `tests/unit/redactSecrets.test.js` now holds this list against `.env.example`,
 * so a variable added there has to be classified as secret or as public-by-
 * design before CI goes green. That is the part that keeps this from going stale
 * again — a list maintained by memory is the defect above, not a fix for it.
 *
 * Names, not values, obviously: this file is committed.
 */
export const SECRET_ENV_VARS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'GITHUB_TOKEN',
  'CRON_SECRET',
  'SMTP_USER',
  'SMTP_PASS',
  // The delivery inbox: server-only by design, and the `to:` of the send whose
  // failure /api/send-mail logs.
  'RECEIVER_EMAIL',
  'ABSTRACT_API_KEY',
  'LOCATION_INGEST_TOKEN',
  'LOCATION_INGEST_QUERY_TOKEN',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REFRESH_TOKEN',
  // Base64 JSON carrying the service account's RSA private key — the highest-
  // value secret in the route this module's first caller lives in.
  'GSC_SERVICE_ACCOUNT_KEY',
  // Auth.js, mounted for the guestbook sign-in. Found by the same audit rather
  // than named in the finding, and the same class: an OAuth client secret or the
  // session signing key reaching a drain is the failure this file exists for.
  // The client IDs travel in redirect URLs and are not really secret, but
  // `SPOTIFY_CLIENT_ID` is on this list for the same reason — an ID beside its
  // secret is half a credential, and the cost of redacting one is a placeholder.
  'AUTH_SECRET',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
];

// At or above this length a value is replaced wherever it appears. Below it,
// only where it stands as a whole token.
//
// The first cut SKIPPED anything shorter, on the reasoning that a one- or
// two-character value would match inside ordinary words and turn the log into
// confetti. The confetti is real; the conclusion was an exemption, and this
// module does not get to decide that a weak credential is not a credential. An
// operator who sets a seven-character `CRON_SECRET`, or an SMTP account with a
// short password, is exactly the deployment least able to afford the value in a
// drain — and "too short to redact safely" would have been news to them.
//
// So the short case is matched with boundaries instead of dropped: `x` is
// replaced where it is a word on its own, never inside `next` or `xyz`. That
// can still be noisy in the pathological case, and noisy is now the direction
// this errs in, because the alternative is a credential printed verbatim. Long
// values keep the unconditional match, which is the stronger guarantee: a
// high-entropy token embedded in a longer string is still redacted, where a
// boundary rule would let it through.
const UNCONDITIONAL_MATCH_LENGTH = 8;

/**
 * The host forms of a URL-shaped value: hostname first, then host-with-port.
 *
 * `URL.host` alone was the bug. It carries the port when one is configured
 * (`eu2-x.upstash.io:6379`), and a DNS failure names the HOSTNAME by itself —
 * `getaddrinfo ENOTFOUND eu2-x.upstash.io`, no port, because the resolver never
 * saw one. So for any deployment whose endpoint carries an explicit port, the
 * needle could not match the error shape it exists to catch, and the endpoint
 * went to the log exactly as before.
 *
 * Both are returned: the hostname covers DNS, and `host` covers the forms that
 * do carry the port (a connection refusal, a proxy line) as one unit rather
 * than leaving `:6379` stranded beside a placeholder.
 */
function hostsOf(value) {
  try {
    const url = new URL(value);
    if (!url.hostname) return [];
    return url.host && url.host !== url.hostname
      ? [url.hostname, url.host]
      : [url.hostname];
  } catch {
    return [];
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
    // Empty is the one length that is skipped outright, and it has to be: a
    // zero-length needle matches between every character, which would replace
    // the whole line with placeholders rather than protect anything in it.
    if (value.length === 0) continue;
    found.push({ needle: value, name });
    for (const host of hostsOf(value)) found.push({ needle: host, name });
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
    const escaped = escapeRe(needle);
    // A short value is matched only where it stands alone — `(?<![\w-])` and
    // `(?![\w-])` rather than `\b`, because `\b` is defined against word
    // characters and a credential can end in punctuation, where it would then
    // refuse to match at all.
    const pattern =
      needle.length >= UNCONDITIONAL_MATCH_LENGTH
        ? escaped
        : `(?<![\\w-])${escaped}(?![\\w-])`;
    out = out.replace(new RegExp(pattern, 'gi'), `[${name}]`);
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
