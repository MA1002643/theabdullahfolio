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
import { parse } from 'tldts';
import { MESSAGE_MAX, MESSAGE_MIN } from './limits';

export { MESSAGE_MAX, MESSAGE_MIN };

// The compose field is a single-line input, so any control character (including
// newlines) in the payload means the client was bypassed.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// NO LINKS. Guestbook messages have no legitimate need for a URL, so every
// shape is refused: a scheme, a www. prefix, a raw IP address, or a BARE
// domain — any dotted token whose suffix is a real public suffix, checked
// against the maintained Public Suffix List rather than a hand-kept list. The
// first cut matched fifteen "spam classic" TLDs, which left every other TLD
// (`spam.ai`, `spam.tech`, `spam.zip`, `spam.co.uk`, an IDN like `спам.рф`)
// as a straightforward bypass of the policy on a public wall. Ordinary prose
// survives because it is not a registrable domain: "node.js" and "next.js"
// (no such TLD), "e.g.", "Ph.D.", "U.S.", "9.30", "1.2.3", "Mr.Smith".
//
// Two deliberate exemptions, each pinned by tests (see validate.test.js):
//   • dev file names whose extension is ALSO a ccTLD — README.md, main.py,
//     run.sh, lib.rs — but only as a bare two-label name: `www.spam.md`,
//     `https://spam.py` and `docs.spam.sh` still fall to the other checks;
//   • the site's own domain — "love ma.codes!" is what a guestbook is for.
const EXPLICIT_URL = /https?:\/\/|www\./i;
// A dotted run of hostname-ish labels (Unicode letters and digits, hyphens).
// Surrounding punctuation is not part of a label, so "(spam.ai)," and
// "spam.ai/free" both yield the token "spam.ai".
const HOST_TOKEN = /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const FILE_EXTENSION_TLDS = new Set(['md', 'py', 'sh', 'rs', 'pl', 'cc', 'so']);
const OWN_HOSTS = new Set(['ma.codes']);

function isBareDomainOrIp(token) {
  const lower = token.toLowerCase();
  if (OWN_HOSTS.has(lower)) return false;
  const info = parse(lower);
  if (info.isIp) return true;
  // A registrable domain under a suffix ICANN actually delegates. Anything
  // else — an unknown "TLD", a bare suffix, a number — is prose.
  if (!info.domain || !info.isIcann) return false;
  return !(FILE_EXTENSION_TLDS.has(info.publicSuffix) && !info.subdomain);
}

// Exported for the unit suite; validateMessage is the only production caller.
export function containsUrl(text) {
  if (EXPLICIT_URL.test(text)) return true;
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
