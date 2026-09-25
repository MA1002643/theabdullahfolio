// Counts that appear inside sentences, spelled the way the site's prose spells
// them. Its own module, deliberately: both a server surface (the /projects
// description in src/lib/seo/site.js) and a client one (the homepage's
// `sr-only` summary) state a count, and the client surface must not reach for
// this through `site.js` — that would drag the whole route registry into the
// browser bundle to borrow one lookup table.
//
// Nothing here imports anything. That is what keeps it free to use from either
// side of the server/client line.

const NUMBER_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
  'Twenty',
];

/**
 * `11` → `'Eleven'`, for a count stated inside a sentence.
 *
 * Falls back to the digits above twenty rather than throwing: past that the
 * digits read better in a search snippet anyway, and a build that fails
 * because the portfolio grew would be worse than a sentence that says "21".
 *
 * @param {number} count
 * @returns {string} The count as a capitalised word, or its digits.
 */
export const countWord = (count) => NUMBER_WORDS[count] ?? String(count);
