// Limits for the palette's Ask (issue #41), shared by the client and
// /api/ask so the two can never disagree about what a valid question is.

export const ASK_LIMITS = {
  // Characters, after normaliseQuestion. Two is the shortest query the palette
  // offers to ask ("cv?" is a fair question); 280 keeps a question a question.
  minLen: 2,
  maxLen: 280,
  // Numbered sources one answer may show (each is a cited fact).
  maxSources: 6,
  // Earlier turns sent with a follow-up, and how much of each answer: enough
  // for "and what about testing?" to resolve, bounded so history cannot be
  // used to smuggle a long prompt.
  historyTurns: 2,
  historyAnswerMax: 900,
};

// The fit check: a pasted job description. Short enough to bound cost, long
// enough for a real posting once the boilerplate is gone.
export const FIT_LIMITS = {
  minLen: 80,
  maxLen: 6000,
  maxRows: 8,
  // How many questions one fit check counts as against the daily breaker:
  // its input and output are each roughly three answers' worth.
  budgetWeight: 3,
};

/** Normalises a pasted job description: NFC, controls out, newlines kept. */
export function normaliseJob(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The earlier turns a follow-up may carry: at most ASK_LIMITS.historyTurns,
 * each a valid question and a bounded answer. Anything malformed is dropped.
 */
export function sanitiseHistory(value) {
  if (!Array.isArray(value)) return [];
  // Validate first, THEN keep the most recent: one malformed entry must not
  // cost the visitor a valid turn. The raw array is capped before any work so
  // a huge list costs nothing.
  return value
    .slice(-10)
    .map((turn) => ({
      q: normaliseQuestion(turn?.q),
      a: typeof turn?.a === 'string' ? normaliseQuestion(turn.a).slice(0, ASK_LIMITS.historyAnswerMax) : '',
    }))
    .filter((turn) => askable(turn.q) && turn.a)
    .slice(-ASK_LIMITS.historyTurns);
}

/**
 * The one normalisation both sides apply: Unicode NFC, control characters
 * and bidi controls turned into spaces (a question is one line, and a bidi
 * override has no business in a prompt), whitespace runs collapsed, trimmed.
 *
 * NOT every format character: ZWNJ and ZWJ (U+200C/D) are part of how Persian
 * words and emoji sequences are spelled, and stripping them changes the text.
 */
const STRIP = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

export function normaliseQuestion(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(STRIP, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether `question` (already normalised) is askable. */
export function askable(question) {
  return question.length >= ASK_LIMITS.minLen && question.length <= ASK_LIMITS.maxLen;
}
