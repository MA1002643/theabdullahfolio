// Server-side validation for guestbook submissions. Everything here treats the
// request body as hostile: the wall renders on a recruiter-facing site, so a
// message must clear length, control-character, URL-spam and profanity checks
// before it is stored. Pure functions — no I/O — so the whole module is
// unit-testable without a server.
//
// SERVER ONLY. The no-links check below consults the Public Suffix List
// (tldts), which is far too much to ship to a browser for a character count:
// client code imports MESSAGE_MIN / MESSAGE_MAX from limits.js instead, and
// the re-export here exists for the server-side callers that always read
// them from this module.
import { isIP } from 'node:net';
import { parse } from 'tldts';
import { MESSAGE_MAX, MESSAGE_MIN } from './limits';

export { MESSAGE_MAX, MESSAGE_MIN };

// The compose field is a single-line input, so any control character (including
// newlines) in the payload means the client was bypassed.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// NO LINKS. Guestbook messages have no legitimate need for a URL, so every
// shape is refused: a scheme, a www. prefix, a raw IP address (v4 OR v6), or
// a BARE domain — any dotted token whose suffix is a real public suffix,
// checked against the maintained Public Suffix List rather than a hand-kept
// list. The first cut matched fifteen "spam classic" TLDs, which left every
// other TLD (`spam.ai`, `spam.tech`, `spam.zip`, `spam.co.uk`, an IDN like
// `спам.рф`) as a straightforward bypass of the policy on a public wall.
// Ordinary prose survives because it is not a registrable domain: "node.js"
// and "next.js" (no such TLD), "e.g.", "Ph.D.", "U.S.", "9.30", "1.2.3",
// "Mr.Smith".
//
// IP literals are decided by an IP PARSER (Node's isIP), not by shape: the
// dotted-token scan only ever saw IPv4, so `2001:db8::1` and `[2001:db8::1]`
// walked straight past the "raw IP" claim (code review). IPv6 gets its own
// scan below, and every candidate — dotted or coloned — is put to the parser
// before any hostname logic runs. tldts's own `isIp` is not consulted: it
// calls "12:30:45" an address.
//
// Two deliberate exemptions, each pinned by tests (see validate.test.js):
//   • an EXPLICIT allowlist of dev file names whose extension is also a ccTLD
//     — README.md, main.py, run.sh, lib.rs and a few more (FILE_NAMES) — as
//     exact bare names only. This used to exempt EVERY two-label name under
//     those suffixes, and "visit spam.sh" or "buy evil.cc" is syntactically a
//     file name too (code review); a name not on the list is a domain;
//   • the site's own domain — "love ma.codes!" is what a guestbook is for.
const EXPLICIT_URL = /https?:\/\/|www\./i;
// A dotted run of hostname-ish labels (Unicode letters and digits, hyphens).
// Surrounding punctuation is not part of a label, so "(spam.ai)," and
// "spam.ai/free" both yield the token "spam.ai".
const HOST_TOKEN = /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// An IPv6 literal has no dots for HOST_TOKEN to catch, so: a run of hex-ish
// characters, colons, dots (an IPv4-mapped tail), '%' (a zone id) and the
// brackets a URL puts around it — with at least TWO colons, which the pattern
// itself guarantees. One colon is a time ("9:30"), a ratio or a label
// ("note:"); IPv6 never has fewer than two. Node's isIP then decides, so
// "12:30:45" (three groups, no '::') and "std::vector" (not hex) are prose.
const IPV6_RUN = /\[?[0-9a-z.%:]*:[0-9a-z.%:]*:[0-9a-z.%:]*\]?/gi;
const FILE_NAMES = new Set([
  'readme.md',
  'changelog.md',
  'contributing.md',
  'license.md',
  'security.md',
  'main.py',
  'app.py',
  'setup.py',
  'manage.py',
  'run.sh',
  'build.sh',
  'deploy.sh',
  'install.sh',
  'setup.sh',
  'start.sh',
  'test.sh',
  'main.rs',
  'lib.rs',
  'mod.rs',
  'main.cc',
  'main.pl',
]);
const OWN_HOSTS = new Set(['ma.codes']);

// The parser's verdict on one candidate. The hex-digit requirement keeps a
// bare "::" — the unspecified address, and also just two colons in prose —
// from counting as a link.
const isIpLiteral = (candidate) => /[0-9a-f]/i.test(candidate) && isIP(candidate) !== 0;

// What a coloned run may be naming: the run with a sentence's full stop
// trimmed and the brackets dropped, and — for `[addr]:port` — the bracketed
// address on its own.
function ipv6Candidates(run) {
  const trimmed = run.replace(/\.+$/, '');
  const open = trimmed.indexOf('[');
  const close = trimmed.indexOf(']');
  const candidates = [trimmed.replace(/[[\]]/g, '')];
  if (open !== -1 && close > open) candidates.push(trimmed.slice(open + 1, close));
  return candidates;
}

function isBareDomainOrIp(token) {
  const lower = token.toLowerCase();
  // A raw IPv4 literal — the parser's call, before any hostname logic.
  if (isIpLiteral(lower)) return true;
  if (OWN_HOSTS.has(lower) || FILE_NAMES.has(lower)) return false;
  // A registrable domain under a suffix ICANN actually delegates. Anything
  // else — an unknown "TLD", a bare suffix, a number — is prose.
  const info = parse(lower);
  return Boolean(info.domain && info.isIcann);
}

// Exported for the unit suite; validateMessage is the only production caller.
export function containsUrl(text) {
  if (EXPLICIT_URL.test(text)) return true;
  for (const run of text.match(IPV6_RUN) ?? []) {
    if (ipv6Candidates(run).some(isIpLiteral)) return true;
  }
  for (const token of text.match(HOST_TOKEN) ?? []) {
    if (isBareDomainOrIp(token)) return true;
  }
  return false;
}

// Small profanity list, matched as whole words on a leet-normalised copy so
// "sh1t" is caught but Scunthorpe-style substrings are not. Kept to strong
// obscenities/slurs — this is a spam gate, not a censor; borderline words are
// the admin-delete path's job (GUESTBOOK_ADMIN).
const PROFANITY = [
  'fuck', 'shit', 'cunt', 'bitch', 'asshole', 'dick', 'wanker', 'bastard',
  'nigger', 'nigga', 'faggot', 'retard', 'slut', 'whore', 'twat', 'prick',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const PROFANITY_RE = new RegExp(`\\b(?:${PROFANITY.join('|')})\\b`, 'i');

function normaliseForProfanity(text) {
  return text
    .toLowerCase()
    .replace(/[01345 7@$!]/g, (c) => LEET[c] ?? c)
    // Collapse a run of 3+ repeated letters to ONE ("fuuuuck" → "fuck") so a
    // stretched spelling still hits the word list. Runs of exactly two stay —
    // real words need their doubles ("assessment") and the list's own words
    // carry no triples.
    .replace(/(.)\1{2,}/g, '$1');
}

// Returns { ok: true, value } with the trimmed message, or { ok: false, error }
// with a message safe to show the user.
export function validateMessage(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Message is required' };
  }
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < MESSAGE_MIN || value.length > MESSAGE_MAX) {
    return {
      ok: false,
      error: `Message must be ${MESSAGE_MIN}–${MESSAGE_MAX} characters`,
    };
  }
  if (CONTROL_CHARS.test(raw)) {
    return { ok: false, error: 'Message contains invalid characters' };
  }
  if (containsUrl(value)) {
    return { ok: false, error: 'Links are not allowed in guestbook messages' };
  }
  if (PROFANITY_RE.test(normaliseForProfanity(value))) {
    return { ok: false, error: 'Please keep it friendly' };
  }
  return { ok: true, value };
}
