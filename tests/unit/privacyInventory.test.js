import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { countWord } from '@/lib/numberWords';
import {
  ANALYTICS_SURFACES,
  CATEGORIES,
  COOKIES,
  COOKIE_COUNT,
  NOT_VISITOR_DATA,
  POLICY_UPDATED,
  PROCESSORS,
  RIGHTS,
  SERVER_DATA,
  STORAGE_GROUPS,
  STORAGE_KEYS,
} from '@/lib/privacy/inventory';

// ── The test that keeps the privacy policy honest (issue #141) ───────────────
// A privacy policy is the one document on a site that is legally required to be
// true and structurally guaranteed to go stale. It describes behaviour spread
// across dozens of files, it is written once, and nothing in an ordinary
// codebase notices when the behaviour moves out from under it. The failure is
// silent AND published: a policy missing a storage key added last month is not
// an out-of-date document, it is a false statement to every visitor who reads it.
//
// This repository already decided how it treats that class of defect. The
// sitemap is generated from a registry and `sitemapDrift.test.js` walks the
// filesystem to fail CI when a page exists with no entry (P1/P2 in docs/seo.md).
// This is the same mechanism pointed at the same problem, with higher stakes: a
// stale sitemap costs crawl budget, a stale policy costs the truth.
//
// So it walks `src/` for storage call sites, resolves each key expression to the
// literal it stores under, and fails on any key the inventory does not disclose.
// Adding a `localStorage` key to this site now REQUIRES disclosing it.
//
// ── It earned its keep before it existed ────────────────────────────────────
// Writing this walker found three key families the hand audit had missed —
// `github-stats:lastGood:<username>`, `experience-summary:last-payload:<username>`
// and the retired `projects-category` that the handoff module still deletes. All
// three would have shipped undisclosed on a page claiming to be complete, which
// is precisely the outcome the walker exists to make impossible.

const SRC = path.join(process.cwd(), 'src');

// ── Dynamic key expressions, each with a written reason ─────────────────────
// Some call sites pass something the walker cannot evaluate: a function call, a
// template literal, a parameter. Those are not skipped — going quiet is exactly
// how a privacy list rots — so every one must be declared HERE, naming the key
// pattern it actually produces, and that pattern must itself be disclosed in the
// inventory. The contract is `sitemapDrift.test.js`'s `EXCLUDED` map: an
// unexplained entry is indistinguishable from an oversight.
//
// Keyed by the exact expression text as it appears in the source, so a call site
// that changes shape fails here rather than silently matching an old entry.
const DYNAMIC_KEYS = {
  // src/lib/contact.js — `readJSON` / `writeJSON` / `remove` take the key as a
  // parameter, and they are the ONLY storage calls behind four separate
  // features. That indirection is why this entry has to name all four: the
  // literals never appear at a `localStorage.*` call site anywhere in the tree,
  // so without this declaration the four keys below would be invisible to the
  // "is it disclosed" walk AND would look stale to the reverse check — a key
  // that is genuinely stored, listed on /privacy, and reported by this suite as
  // something the site no longer does. Both directions wrong at once.
  key: {
    produces: [
      // The contact form, via useFormDraft / useOfflineQueue.
      'contact:draft:v1',
      'contact:queue:v1',
      // The guestbook composer, via useFieldDraft → draftKeyFor(user), plus the
      // retired browser-wide slot MessageInput deletes on mount.
      'guestbook:draft:v2:',
      'guestbook:draft:v1',
    ],
    why:
      'The key parameter of the shared read/write/remove helpers in ' +
      'src/lib/contact.js, which are the only storage calls for the contact ' +
      'draft, the offline queue and both guestbook composer slots. The literals ' +
      'live at the call sites that pass them in (DRAFT_KEY, QUEUE_KEY, ' +
      'draftKeyFor(user), LEGACY_DRAFT_KEY) and so are named here instead.',
  },
  // src/components/about/index.jsx
  statsKey: {
    produces: ['github-stats:lastGood:'],
    why: 'githubStatsStorageKey(username) — `github-stats:lastGood:${username}`.',
  },
  newKey: {
    produces: ['github-stats:lastGood:'],
    why:
      'The same githubStatsStorageKey(username) builder, on the cold-load ' +
      'hydrate path rather than the write path.',
  },
  'legacyKeys[0]': {
    produces: ['github-stats:lastGood:'],
    why:
      'A pre-migration entry, `github-stats:lastGood:${username}:${repo}` — a ' +
      'longer key under the same disclosed prefix. Read once to promote it, ' +
      'then removed.',
  },
  k: {
    produces: ['github-stats:lastGood:'],
    why: 'The loop variable that removes those legacy entries.',
  },
  // src/hooks/useExperienceSummary.js
  'storageKey(username': {
    produces: ['experience-summary:last-payload:'],
    why: 'storageKey(username) — `experience-summary:last-payload:${username}`.',
  },
};

/** Every `.js` / `.jsx` file under `src/`. */
function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      sourceFiles(absolute, found);
    } else if (/\.jsx?$/.test(entry)) {
      found.push(absolute);
    }
  }
  return found;
}

const FILES = sourceFiles();

/**
 * `NAME` → string literal, for every `const NAME = '…'` in a file.
 *
 * Also follows ONE alias hop (`const CACHE_KEY = SKILLS_CACHE_KEY`), which is
 * not a hypothetical shape: SkillsCard.jsx renames both imported skills-cache
 * constants that way, and a resolver blind to it would report two real keys as
 * unresolvable and demand a `DYNAMIC_KEYS` entry apiece for nothing.
 *
 * Deliberately regex over the source rather than a parse. The alternative is a
 * parser dependency to read a handful of `const` lines, and an unresolved
 * identifier CANNOT pass quietly here — it lands in the unresolved set and fails
 * the suite until somebody declares it. The walker under-reporting is loud,
 * which is the property that makes the shortcut safe. (Same reasoning as
 * `importsFrom` in sitemapDrift.test.js.)
 */
function literalsIn(source) {
  const direct = new Map();
  for (const [, name, value] of source.matchAll(
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"\n]*)['"]\s*;/g,
  )) {
    direct.set(name, value);
  }
  const aliases = new Map();
  for (const [, name, target] of source.matchAll(
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g,
  )) {
    aliases.set(name, target);
  }
  return { direct, aliases };
}

// Every literal-valued constant in the tree, so an identifier imported from
// another module still resolves. Name collisions are real (`KEY` is declared in
// both prefs.js and projectFilterHandoff.js with different values), so the
// per-file map is always consulted FIRST and this is only the fallback.
const GLOBAL_LITERALS = new Map();
for (const file of FILES) {
  for (const [name, value] of literalsIn(readFileSync(file, 'utf8')).direct) {
    // First declaration wins and a second is recorded as ambiguous, so a
    // collision can never resolve to the wrong one silently.
    if (GLOBAL_LITERALS.has(name) && GLOBAL_LITERALS.get(name) !== value) {
      GLOBAL_LITERALS.set(name, null);
    } else if (!GLOBAL_LITERALS.has(name)) {
      GLOBAL_LITERALS.set(name, value);
    }
  }
}

/**
 * Every storage touch in the tree.
 *
 * @returns {{file: string, line: number, kind: string, expression: string}[]}
 */
function storageCallSites() {
  const sites = [];
  for (const file of FILES) {
    const source = readFileSync(file, 'utf8');
    const relative = path.relative(process.cwd(), file);
    const pattern =
      /(?:window\s*\.\s*)?(localStorage|sessionStorage)\s*\.\s*(?:get|set|remove)Item\s*\(\s*([^,)]+)/g;
    for (const match of source.matchAll(pattern)) {
      sites.push({
        file: relative,
        line: source.slice(0, match.index).split('\n').length,
        kind: match[1],
        expression: match[2].trim(),
      });
    }
  }
  return sites;
}

const SITES = storageCallSites();

/** Resolve a call-site expression to a stored key, or null if it cannot. */
function resolveKey(expression, fileSource) {
  const quoted = expression.match(/^['"]([^'"]*)['"]$/);
  if (quoted) return quoted[1];

  const { direct, aliases } = literalsIn(fileSource);
  if (direct.has(expression)) return direct.get(expression);
  if (aliases.has(expression)) {
    const target = aliases.get(expression);
    if (direct.has(target)) return direct.get(target);
    if (GLOBAL_LITERALS.get(target)) return GLOBAL_LITERALS.get(target);
  }
  if (GLOBAL_LITERALS.get(expression)) return GLOBAL_LITERALS.get(expression);
  return null;
}

/** The inventory entry covering a key, by exact match or declared prefix. */
function disclosureFor(key) {
  return STORAGE_KEYS.find((entry) =>
    entry.prefix ? key.startsWith(entry.key) : key === entry.key,
  );
}

describe('the walker itself works', () => {
  // Guard on the guard, in the house style. Every assertion below is of the form
  // "everything found is disclosed", which passes vacuously if nothing is found
  // — and a changed storage idiom or a moved directory would turn this whole
  // suite green while proving nothing at all.
  it('finds a plausible number of source files and call sites', () => {
    expect(FILES.length).toBeGreaterThan(150);
    expect(SITES.length).toBeGreaterThanOrEqual(40);
  });

  it('sees both storage kinds', () => {
    const kinds = new Set(SITES.map((site) => site.kind));
    expect(kinds).toContain('localStorage');
    expect(kinds).toContain('sessionStorage');
  });

  it('resolves the three call shapes this codebase actually uses', () => {
    const resolved = new Map();
    for (const site of SITES) {
      const key = resolveKey(site.expression, readFileSync(site.file, 'utf8'));
      if (key) resolved.set(site.expression, key);
    }
    // A bare literal.
    expect(resolved.get("'loaderSeen'")).toBe('loaderSeen');
    // A same-file constant — and one whose NAME collides with a different
    // constant elsewhere, which is what the per-file-first lookup is for.
    expect(resolved.get('KEY')).toBeDefined();
    // An alias of an imported constant (SkillsCard.jsx).
    expect(resolved.get('CACHE_KEY')).toBe('skillsCache:v4');
  });

  it('resolves a colliding constant name per file, not globally', () => {
    // `const KEY` is 'guestbook:prefs' in prefs.js and
    // 'projects-category-handoff' in projectFilterHandoff.js. A global-only
    // resolver would answer one of them for both files and quietly vouch for a
    // key the file never touches.
    const prefs = readFileSync('src/lib/guestbook/prefs.js', 'utf8');
    const handoff = readFileSync('src/lib/projectFilterHandoff.js', 'utf8');
    expect(resolveKey('KEY', prefs)).toBe('guestbook:prefs');
    expect(resolveKey('KEY', handoff)).toBe('projects-category-handoff');
  });
});

describe('every storage key this site writes is disclosed', () => {
  it('discloses every key the walker can resolve', () => {
    const undisclosed = [];
    for (const site of SITES) {
      const key = resolveKey(site.expression, readFileSync(site.file, 'utf8'));
      if (key === null) continue; // handled by the dynamic case below
      if (!disclosureFor(key)) {
        undisclosed.push(`${key}  (${site.file}:${site.line})`);
      }
    }

    expect(
      undisclosed,
      `These browser-storage keys are written by the site and are NOT listed in ` +
        `STORAGE_KEYS (src/lib/privacy/inventory.js), so /privacy publishes an ` +
        `incomplete list — which is a false statement, not an omission:\n  ` +
        `${undisclosed.join('\n  ')}\n\n` +
        `Add each one with its kind, group and a plain-English purpose. The ` +
        `purpose is published verbatim, so write it for a reader.`,
    ).toEqual([]);
  });

  it('declares every expression it cannot resolve, with a reason', () => {
    // The direction that keeps the check above honest. An unresolvable
    // expression must not be silently ignored — that is the hole through which
    // a key escapes disclosure — so each one is declared in DYNAMIC_KEYS,
    // naming what it produces.
    const undeclared = [];
    for (const site of SITES) {
      const key = resolveKey(site.expression, readFileSync(site.file, 'utf8'));
      if (key !== null) continue;
      if (!(site.expression in DYNAMIC_KEYS)) {
        undeclared.push(`${site.expression}  (${site.file}:${site.line})`);
      }
    }

    expect(
      undeclared,
      `These storage calls pass a key this walker cannot evaluate, and are not ` +
        `declared in DYNAMIC_KEYS in this test file:\n  ` +
        `${undeclared.join('\n  ')}\n\n` +
        `Add an entry naming the key pattern it produces and why — or, better, ` +
        `make the call site pass a resolvable constant.`,
    ).toEqual([]);
  });

  it('discloses the pattern behind every dynamic expression', () => {
    const missing = [];
    for (const [expression, entry] of Object.entries(DYNAMIC_KEYS)) {
      for (const produced of entry.produces) {
        if (!disclosureFor(produced)) {
          missing.push(`${expression} produces "${produced}", which is undisclosed`);
        }
      }
      // A reason long enough to be one, matching sitemapDrift's EXCLUDED rule.
      expect(
        entry.why.length,
        `The reason given for the dynamic key "${expression}" is too short to be one.`,
      ).toBeGreaterThan(40);
    }
    expect(missing).toEqual([]);
  });

  it('keeps every DYNAMIC_KEYS entry a real call site', () => {
    // A stale entry outlives the code it described and weakens the check: the
    // next person reads it as precedent for not resolving something.
    const expressions = new Set(SITES.map((site) => site.expression));
    for (const expression of Object.keys(DYNAMIC_KEYS)) {
      expect(
        expressions,
        `DYNAMIC_KEYS declares "${expression}" but no storage call passes it — remove it.`,
      ).toContain(expression);
    }
  });

  it('declares the right storage kind for every key', () => {
    // `localStorage` survives a tab close and `sessionStorage` does not, and
    // /privacy tells the reader which it is per key ("until you clear it" vs
    // "this tab only"). Getting that backwards is a small, specific lie about
    // how long something is kept, and nothing else in the stack could report it.
    const wrong = [];
    for (const site of SITES) {
      const key = resolveKey(site.expression, readFileSync(site.file, 'utf8'));
      if (key === null) continue;
      const entry = disclosureFor(key);
      if (entry && entry.kind !== site.kind) {
        wrong.push(
          `"${key}" is declared ${entry.kind} but used via ${site.kind} at ` +
            `${site.file}:${site.line}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it('lists nothing it no longer stores', () => {
    // The reverse direction. A disclosed key that no longer exists is not
    // dangerous, but it is clutter in a document whose only value is precision —
    // and it hides the real list inside a longer one.
    const stored = new Set();
    for (const site of SITES) {
      const key = resolveKey(site.expression, readFileSync(site.file, 'utf8'));
      if (key !== null) stored.add(key);
    }
    for (const entry of Object.values(DYNAMIC_KEYS)) {
      for (const produced of entry.produces) stored.add(produced);
    }

    const stale = STORAGE_KEYS.filter((entry) => {
      if (entry.prefix) {
        return ![...stored].some((key) => key.startsWith(entry.key));
      }
      return !stored.has(entry.key);
    }).map((entry) => entry.key);

    expect(
      stale,
      `STORAGE_KEYS discloses these keys, but nothing in src/ reads or writes ` +
        `them any more — remove them, or the published list overstates what the ` +
        `site does:\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('the inventory is fit to publish', () => {
  // Every string below is rendered verbatim on /privacy. These assertions are
  // about the document rather than the code: a row with an empty purpose, a
  // group nothing belongs to, or a placeholder left in from drafting would all
  // ship silently and read as carelessness on the one page that cannot afford it.

  it('gives every storage key a real, readable purpose', () => {
    for (const entry of STORAGE_KEYS) {
      expect(entry.key, 'A storage key with no name').toBeTruthy();
      expect(['localStorage', 'sessionStorage']).toContain(entry.kind);
      expect(
        STORAGE_GROUPS[entry.group],
        `"${entry.key}" is in group "${entry.group}", which STORAGE_GROUPS does ` +
          `not define — so the row renders under no heading at all.`,
      ).toBeTruthy();
      // Long enough to be an explanation rather than a restatement of the key.
      expect(
        entry.purpose.length,
        `The purpose given for "${entry.key}" is too short to tell a reader anything.`,
      ).toBeGreaterThan(30);
    }
  });

  it('declares no key twice', () => {
    // Two rows for one key is not an error anything catches, and it is how a
    // hand-edited list usually first goes wrong.
    const keys = STORAGE_KEYS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('defines no group with nothing in it', () => {
    // An empty heading on the page. The renderer filters them out, so this is
    // about the DATA being tidy rather than about a visible defect — and it is
    // what makes the renderer's filter provably unnecessary rather than
    // load-bearing.
    for (const [id, label] of Object.entries(STORAGE_GROUPS)) {
      expect(
        STORAGE_KEYS.some((entry) => entry.group === id),
        `STORAGE_GROUPS defines "${label}" but no key belongs to it.`,
      ).toBe(true);
    }
  });

  it('offers exactly one gated category, and defaults it off', () => {
    // The design claim the whole notice rests on: a real binary rather than a
    // twelve-toggle vendor list. If a second gated category ever appears, the
    // notice's copy and the preference centre's framing both need rethinking —
    // so this fails and forces that conversation rather than letting the UI
    // quietly become the thing it was built to avoid.
    const gated = CATEGORIES.filter((category) => category.gated);
    expect(gated).toHaveLength(1);
    expect(gated[0].defaultOn).toBe(false);
    // And exactly one ungated category, explained rather than toggled.
    expect(CATEGORIES.filter((category) => !category.gated)).toHaveLength(1);
  });

  it('describes every category in enough words to be honest', () => {
    for (const category of CATEGORIES) {
      expect(category.name).toBeTruthy();
      expect(category.summary.length).toBeGreaterThan(20);
      expect(category.detail.length).toBeGreaterThan(80);
    }
  });

  it('names a processor and a source for every analytics surface', () => {
    // Three, treated as one decision. The preference centre lists them by name
    // because "we use analytics" answers nothing; this keeps that list complete.
    expect(ANALYTICS_SURFACES.length).toBeGreaterThanOrEqual(3);
    for (const surface of ANALYTICS_SURFACES) {
      expect(surface.name).toBeTruthy();
      expect(surface.processor).toBeTruthy();
      expect(surface.collects.length).toBeGreaterThan(40);
      // The file named beside each claim is what makes the page checkable, so a
      // path that no longer exists is a broken citation.
      expect(
        () => statSync(path.join(process.cwd(), surface.source)),
        `${surface.name} cites ${surface.source}, which does not exist.`,
      ).not.toThrow();
    }
  });

  it('keeps every cited source file real', () => {
    // Same check across the other three tables. /privacy's standfirst invites
    // the reader to check any claim against the code; a citation pointing at a
    // moved file turns that invitation into an embarrassment.
    const cited = [
      ...PROCESSORS.map((row) => row.source),
      ...SERVER_DATA.map((row) => row.source),
      ...NOT_VISITOR_DATA.map((row) => row.source),
    ].filter(Boolean);

    // Vacuity guard: most rows carry one, so an empty list means the field was
    // renamed and this case stopped checking anything.
    expect(cited.length).toBeGreaterThanOrEqual(8);

    const missing = cited.filter((source) => {
      try {
        statSync(path.join(process.cwd(), source));
        return false;
      } catch {
        return true;
      }
    });
    expect(
      missing,
      `The privacy page cites these files and they do not exist:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('states a retention period for everything held server-side', () => {
    // "We retain data as long as necessary" is the least informative sentence in
    // the genre. Each row must say something a reader can act on.
    for (const row of SERVER_DATA) {
      expect(row.what).toBeTruthy();
      expect(row.contains.length).toBeGreaterThan(20);
      expect(
        row.retention.length,
        `"${row.what}" does not really state how long it is kept.`,
      ).toBeGreaterThan(20);
      expect(row.visibility).toBeTruthy();
    }
  });

  it('gives every cookie a purpose and a lifetime', () => {
    // There ARE cookies now — four, from the guestbook sign-in. #141 was written
    // when the honest answer was "none" and its notice copy said "No cookies",
    // which would have shipped as a falsehood once Auth.js landed. This table is
    // the correction, so it must stay populated: an empty COOKIES array would
    // quietly restore the original false claim.
    expect(COOKIES.length).toBeGreaterThanOrEqual(3);
    for (const cookie of COOKIES) {
      expect(cookie.name).toBeTruthy();
      expect(cookie.setWhen).toBeTruthy();
      expect(cookie.purpose.length).toBeGreaterThan(30);
      expect(cookie.lifetime).toBeTruthy();
    }
  });

  it('answers every right with something it will actually do', () => {
    expect(RIGHTS.length).toBeGreaterThanOrEqual(4);
    for (const row of RIGHTS) {
      expect(row.right).toBeTruthy();
      expect(row.answer.length).toBeGreaterThan(50);
    }
  });

  it('counts cookies rather than cookie cards', () => {
    // `COOKIE_COUNT` is not `COOKIES.length` and must not become it. The PKCE
    // pair shares one row because it shares one purpose, so four rows describe
    // five cookies — and /privacy states the number of COOKIES, which is the
    // number a reader could verify in their own devtools.
    const named = COOKIES.flatMap((cookie) =>
      cookie.name.split(',').map((name) => name.trim()),
    );
    expect(COOKIE_COUNT).toBe(named.length);
    // No cookie named twice across the rows, which would inflate the count.
    expect(new Set(named).size).toBe(named.length);
    // Vacuity guard: if no row ever names more than one cookie again, this
    // assertion is the thing that says so out loud rather than passing while
    // `COOKIE_COUNT` and `COOKIES.length` have quietly become the same number
    // and the distinction above has stopped being tested.
    expect(
      COOKIE_COUNT,
      'No cookie row names more than one cookie any more — either a row was ' +
        'split (fine: simplify COOKIE_COUNT to COOKIES.length and delete this) ' +
        'or a cookie was dropped from a grouped row by accident.',
    ).toBeGreaterThan(COOKIES.length);
  });

  it('carries a parseable update date that is not in the future', () => {
    // Hand-maintained on purpose — it records a judgement ("what you agreed to
    // changed"), which a build-time date cannot express. That makes a typo
    // possible, and a policy dated next year reads as broken.
    const stamp = Date.parse(POLICY_UPDATED);
    expect(Number.isNaN(stamp)).toBe(false);
    // A day of tolerance for clock skew between here and whatever machine runs
    // CI, matching sitemapDrift's reasoning about committer dates.
    expect(stamp).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
  });
});

// ── The counts in the page's own prose ──────────────────────────────────────
// Everything above guards the DATA. This guards the sentences wrapped around it,
// which is where the drift actually happened: the page renders every fact from
// the inventory, and then three hand-written ledes stated how many of something
// each section lists. Two were right. §06 said "all three are data about me"
// while `NOT_VISITOR_DATA` held four, because the CV row (asked for by name in
// docs/seo.md §4) landed after the sentence was written and nothing counted.
//
// A wrong number one layer above a generated list is the worst version of this
// defect, because the machine-checked table underneath it lends the sentence
// credibility it has not got. Same mechanism as projectCountDrift.test.js: assert
// the interpolation is present in the source, and that no count is typed out.

const POLICY_PAGE = 'src/components/privacy/PrivacyPolicy.jsx';

/** Number words a lede could plausibly have hard-coded. */
const COUNT_WORDS =
  'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|' +
  'thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';

const POLICY_SOURCE = readFileSync(path.join(process.cwd(), POLICY_PAGE), 'utf8');

/**
 * Every `lede` a `<Section>` is given, read from source rather than rendered.
 *
 * Both attribute forms, because a lede with no count in it stays a plain string
 * and only the three that state one became template literals — a check that saw
 * only one form would silently stop covering the others.
 */
function ledes() {
  return [...POLICY_SOURCE.matchAll(/lede=(?:"([^"]*)"|\{`([\s\S]*?)`\})/g)].map(
    ([, quoted, templated]) => quoted ?? templated,
  );
}

describe('the counts in the page prose are derived, not typed', () => {
  it('finds the ledes it is meant to be checking', () => {
    // Every assertion below is "no lede does X", which passes perfectly if the
    // matcher has stopped finding any.
    expect(
      ledes().length,
      `Found no section ledes in ${POLICY_PAGE}. If they were renamed or ` +
        'restructured, point this matcher at their new shape rather than ' +
        'deleting the suite.',
    ).toBeGreaterThanOrEqual(6);
  });

  it('interpolates every stated count from the list it describes', () => {
    for (const expression of [
      'countWord(ANALYTICS_SURFACES.length)',
      'countWord(COOKIE_COUNT)',
      'countWord(NOT_VISITOR_DATA.length)',
    ]) {
      expect(
        POLICY_SOURCE,
        `${POLICY_PAGE} no longer derives a count it publishes — it must ` +
          `interpolate ${expression} rather than state the number, or the ` +
          'sentence goes stale the next time a row is added.',
      ).toContain(expression);
    }
  });

  it('types no count into a lede by hand', () => {
    const typed = [];
    for (const lede of ledes()) {
      const text = lede.trim();
      const preview = `${text.replace(/\s+/g, ' ').slice(0, 64)}…`;
      // A lede OPENING with a number is counting the rows beneath it (§01, §02).
      const opens = text.match(new RegExp(`^(${COUNT_WORDS}|\\d+)\\b`, 'i'));
      if (opens) typed.push(`opens with "${opens[1]}" — ${preview}`);
      // "all three", "all four" — the shape that was actually wrong (§06).
      const inline = text.match(new RegExp(`\\ball\\s+(${COUNT_WORDS}|\\d+)\\b`, 'i'));
      if (inline) typed.push(`says "all ${inline[1]}" — ${preview}`);
    }

    expect(
      typed,
      `These ledes in ${POLICY_PAGE} state a count as a literal, so nothing ` +
        'will notice when the list they describe changes size:\n  ' +
        `${typed.join('\n  ')}\n\n` +
        'Interpolate countWord() over the array instead.',
    ).toEqual([]);
  });

  it('spells each of those counts as a word rather than digits', () => {
    // `countWord` degrades to digits past twenty, which is right for a project
    // count in a meta description and wrong mid-sentence here ("21, all from the
    // guestbook sign-in"). None of these lists is remotely near it, so this is a
    // tripwire for the day one is — and the fix then is to reword, not to raise
    // the table.
    for (const count of [
      ANALYTICS_SURFACES.length,
      COOKIE_COUNT,
      NOT_VISITOR_DATA.length,
    ]) {
      expect(countWord(count), `countWord(${count}) is not a word`).toMatch(
        /^[A-Z][a-z]+$/,
      );
    }
  });
});
