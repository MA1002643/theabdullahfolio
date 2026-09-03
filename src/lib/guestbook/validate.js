// Server-side validation for guestbook submissions. Everything here treats the
// request body as hostile: the wall renders on a recruiter-facing site, so a
// message must clear length, control-character, URL-spam and profanity checks
// before it is stored. Pure functions — no I/O — so the whole module is
// unit-testable without a server.

export const MESSAGE_MIN = 2;
export const MESSAGE_MAX = 150;

// The compose field is a single-line input, so any control character (including
// newlines) in the payload means the client was bypassed.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// Guestbook messages have no legitimate need for links; every URL shape —
// scheme, www., or a bare domain.tld — is treated as spam outright. The TLD
// list is deliberately the short "spam classics" set: matching every TLD would
// flag ordinary prose ("node.js", "ma.codes" is fine to mention though —
// accepted casualty, the error message says why).
const URL_PATTERN =
  /(?:https?:\/\/|www\.)|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|dev|app|xyz|co|uk|me|info|biz|ru|cn|ly|gg)\b/i;

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
  if (URL_PATTERN.test(value)) {
    return { ok: false, error: 'Links are not allowed in guestbook messages' };
  }
  if (PROFANITY_RE.test(normaliseForProfanity(value))) {
    return { ok: false, error: 'Please keep it friendly' };
  }
  return { ok: true, value };
}
