// Build-time facts for /uses (issue #37). SERVER-ONLY: imported from the
// route's server `page.js` and nowhere else, so `node:fs` never enters a
// client bundle. Synchronous reads from the repository root at BUILD time —
// the route is static, so this costs nothing at request time and every number
// on the page is counted from the files that ship, never typed by hand.
//
// Provenance rules (the page's whole point):
//   · every read is wrapped — a missing or unreadable file yields `null`, and
//     the plate that would have shown it hides that row. Never a fake zero.
//   · nothing here reads environment variables, dotenv files, or anything
//     gitignored (CLAUDE.md §1) — and a unit test pins that by grepping this
//     source. The only input is `root`, which the page passes as the working
//     directory and the unit suite points at a fixture directory.
//   · the returned object is plain JSON — it crosses the server → client
//     boundary as props.
import fs from 'node:fs';
import path from 'node:path';

// The bill of materials: the WHOLE manifest, read at build and sorted into
// groups by rule — never by a hand-kept list of package names (owner ask
// 2026-09-07: "make the group membership automated too so it automatically
// updates, adds, deletes on build"). The plate used to enumerate 21 chosen
// packages, so a dependency added tomorrow never appeared; now every
// dependency and devDependency in package.json is listed, and the only
// hand-written thing is the classification below — patterns, not names.
//
// How a package finds its group: the first rule with a matching pattern
// wins, and its position in that rule's `match` array orders it within the
// group (so `next` leads Core), ties broken alphabetically. A package no
// rule claims still appears — under `Runtime` if the manifest lists it as a
// dependency, `Tooling` if it is a devDependency — so adding an unfamiliar
// package can never silently drop it from the bill. Those two headings are
// therefore also the signal that a rule is worth adding.
export const BOM_FALLBACK = { dependency: 'Runtime', development: 'Tooling' };

export const BOM_RULES = [
  {
    label: 'Core',
    match: [/^next$/, /^react$/, /^react-dom$/, /^tailwindcss$/],
  },
  {
    label: '3D & motion',
    match: [/^three$/, /^@react-three\//, /^framer-motion$/, /^motion$/, /^gsap$/, /^lenis$/],
  },
  {
    label: 'Data & services',
    match: [
      /^ai$/,
      /^@ai-sdk\//,
      /^@upstash\//,
      /^@vercel\/(kv|blob|postgres)$/,
      /^next-auth$/,
      /^nodemailer$/,
      /^pdf-parse$/,
      /^tz-lookup$/,
      /^tldts$/,
      /^redis$/,
    ],
  },
  {
    label: 'Interface',
    match: [
      /^lucide-react$/,
      /icons?$/,
      /^sonner$/,
      /^react-hot-toast$/,
      /^react-hook-form$/,
      /^clsx$/,
      /^tailwind-merge$/,
      /^class-variance-authority$/,
      /^emoji-dictionary$/,
    ],
  },
  {
    label: 'Platform',
    match: [/^@vercel\//],
  },
  {
    label: 'Media',
    // `pdf-lib` sits with the other asset-processing tools rather than in
    // Tooling (issue #32, W1b): like `sharp` and `ffmpeg-static` it is an
    // offline media utility, used by scripts/seo-pdf-metadata.mjs to set the CV
    // PDF's /Title and /Author so Google names the search result properly
    // instead of falling back to the filename. Nothing under src/ imports it.
    //
    // `pdf-parse` is deliberately NOT listed here despite being the obvious
    // neighbour: it is already claimed by "Data & services" above, and rules
    // are first-match, so a second pattern for it would never fire. A dead
    // pattern in a rules table is worse than no pattern — it tells the next
    // reader this rule owns something it does not.
    //
    // `pdf-parse` — named again rather than carried as "it", because a pronoun
    // here reads as the package the rule claims — became a devDependency on
    // 2026-09-17, its only importer being `pdfExperienceParser` and its only
    // importers the CV fixtures. `pdf-lib` is a devDependency too but for an
    // unrelated reason, and the distinction is worth keeping straight: its
    // importer is a maintenance COMMAND rather than a test, and it is the only
    // thing that writes the tracked CV metadata.
    //
    // Neither move changes what the plate prints: classification is by
    // NAME, the `total` counts dependencies and devDependencies together, and
    // the two fallback labels apply only to packages no rule claims. Left in
    // "Data & services" on purpose — regrouping it would be a display change,
    // not a correction, and the rule that claims it is still first-match.
    match: [/^sharp$/, /^ffmpeg-static$/, /^@napi-rs\/canvas$/, /^pdf-lib$/],
  },
  {
    label: 'Quality',
    match: [
      /^vitest$/,
      /^@playwright\//,
      /^@testing-library\//,
      /^eslint/,
      /^prettier/,
      /^jsdom$/,
      /^happy-dom$/,
    ],
  },
  {
    label: 'Build',
    match: [/^postcss$/, /^autoprefixer$/, /^@next\//, /^typescript$/],
  },
];

// Which group a package belongs to, and its rank inside that group. Pure —
// the unit suite pins every rule against the real manifest.
export function classifyPackage(name, isDev = false) {
  for (const rule of BOM_RULES) {
    const rank = rule.match.findIndex((re) => re.test(name));
    if (rank >= 0) return { label: rule.label, rank };
  }
  return { label: isDev ? BOM_FALLBACK.development : BOM_FALLBACK.dependency, rank: 0 };
}

// Run `fn`; any throw (ENOENT, a parse error) becomes `null`. `undefined`
// results are folded to `null` too so the payload never carries a hole that
// JSON would silently drop.
const safe = (fn) => {
  try {
    const value = fn();
    return value === undefined ? null : value;
  } catch {
    return null;
  }
};

const readText = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const listFiles = (root, rel, test) =>
  fs
    .readdirSync(path.join(root, rel))
    .filter((f) => test.test(f))
    .sort();

// ── Test cases, counted the way the runner counts them ──────────────────
//
// The first cut matched `it(` / `test(` at the start of a line, so a
// multi-line `it.each([ … ])` table — three of this page's own suites carry
// one — counted zero and the plate read 402 where Vitest ran 431 (owner
// audit, 2026-09-06). This scanner reads the file the way the runner will:
//   · a plain `it` / `test` call site is one case, whatever its modifiers
//     (`only skip todo concurrent sequential fails fail fixme slow`);
//   · an `.each` / `.for` table is one case per row — the top-level
//     elements of an array literal, or the lines of a template table below
//     its header;
//   · a `describe.each` block is its rows × the cases inside it;
//   · `describe` / `test.describe` themselves are not cases.
// String, template and comment contents are blanked first (length and
// newlines kept) so a case name that contains `it(`, or a commented-out
// case, never counts. The one thing a static read cannot see is a case
// generated by a loop or a table held in a variable: each counts once.
const CASE_RE =
  /^[ \t]*(test\.describe|describe|it|test)((?:\.(?:only|skip|todo|concurrent|sequential|fails|fail|fixme|slow))*)(\.(?:each|for))?\s*(\(|`)/gm;

const OPEN = '[({';
const CLOSE = '])}';

// Source with every string, template literal and comment body replaced by
// spaces — same length, same newlines — so the scanners can trust brackets
// and line starts. (A regex literal is read as code; a quote inside one
// blanks to the end of its line, a backtick to the next backtick.)
function blank(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i);
      const end = e < 0 ? n : e;
      out += ' '.repeat(end - i);
      i = end;
    } else if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c && (c === '`' || src[j] !== '\n')) {
        if (src[j] === '\\') j += 1;
        j += 1;
      }
      const closed = j < n && src[j] === c;
      out += c + src.slice(i + 1, j).replace(/[^\n]/g, ' ') + (closed ? c : '');
      i = closed ? j + 1 : j;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

// From the `(` or backtick that opens an `.each` table: how many rows it
// holds and the index just past its closing delimiter. A table held in a
// variable (`it.each(cases)`) cannot be read — it counts as one row.
function tableRows(blanked, raw, open) {
  if (blanked[open] === '`') {
    const close = blanked.indexOf('`', open + 1);
    const body = raw.slice(open + 1, close < 0 ? raw.length : close);
    const lines = body.split('\n').filter((l) => l.trim());
    return { rows: Math.max(0, lines.length - 1), end: close < 0 ? blanked.length : close + 1 };
  }
  let i = open + 1;
  while (i < blanked.length && /\s/.test(blanked[i])) i += 1;
  if (blanked[i] !== '[') return { rows: 1, end: i };
  let depth = 0;
  let rows = 0;
  let pending = false;
  for (let j = i; j < blanked.length; j += 1) {
    const ch = blanked[j];
    if (OPEN.includes(ch)) {
      if (depth === 1) pending = true;
      depth += 1;
    } else if (CLOSE.includes(ch)) {
      depth -= 1;
      if (depth === 0) return { rows: rows + (pending ? 1 : 0), end: j + 1 };
    } else if (depth === 1) {
      if (ch === ',') {
        if (pending) rows += 1;
        pending = false;
      } else if (!/\s/.test(ch)) pending = true;
    }
  }
  return { rows, end: blanked.length };
}

// The argument list of the call that follows an `.each(...)` table — the
// `('name', fn)` part — as [open, close] indices, or null.
function callArgs(blanked, from) {
  let i = from;
  while (i < blanked.length && /\s/.test(blanked[i])) i += 1;
  if (blanked[i] === ')') i += 1;
  while (i < blanked.length && /\s/.test(blanked[i])) i += 1;
  if (blanked[i] !== '(') return null;
  let depth = 0;
  for (let j = i; j < blanked.length; j += 1) {
    if (OPEN.includes(blanked[j])) depth += 1;
    else if (CLOSE.includes(blanked[j])) {
      depth -= 1;
      if (depth === 0) return [i, j];
    }
  }
  return null;
}

function countIn(blanked, raw) {
  let n = 0;
  const re = new RegExp(CASE_RE.source, 'gm');
  let m;
  while ((m = re.exec(blanked))) {
    const isDescribe = m[1] === 'describe' || m[1] === 'test.describe';
    if (!m[3]) {
      if (!isDescribe) n += 1;
      continue;
    }
    const open = m.index + m[0].length - 1;
    const { rows, end } = tableRows(blanked, raw, open);
    if (!isDescribe) {
      n += rows;
      re.lastIndex = end;
      continue;
    }
    const args = callArgs(blanked, end);
    if (!args) {
      re.lastIndex = end;
      continue;
    }
    n += rows * countIn(blanked.slice(args[0] + 1, args[1]), raw.slice(args[0] + 1, args[1]));
    re.lastIndex = args[1] + 1;
  }
  return n;
}

export const countCases = (text) => countIn(blank(text), text);

function countSuite(root, dir, filePattern) {
  const files = listFiles(root, dir, filePattern);
  const cases = files.reduce(
    (sum, f) => sum + countCases(readText(root, path.join(dir, f))),
    0,
  );
  return { suites: files.length, cases };
}

// ── Route handlers ─────────────────────────────────────────────────────
//
// Every `route.js` under src/app/api, dynamic segments included.
function routeFiles(root, rel) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /^route\.(js|ts|mjs)$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(root, rel));
  return out.sort();
}

const countRoutes = (root, rel) => routeFiles(root, rel).length;

// How many of those files export each HTTP method, in HTTP order, verbs
// present only — every export form Next accepts: `export async function
// GET`, `export const GET =`, `export const { GET, POST } = handlers`
// (next-auth), `export { GET, POST as DELETE }`. Replaces a typed claim on
// the Instruments plate ("cached, fail-open") that was true of the GET
// routes and not of the POST ingest, the webhook or the auth callback.
export const HTTP_VERBS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const VERB = HTTP_VERBS.join('|');

export function exportedMethods(text) {
  const src = blank(text);
  const verbs = new Set();
  for (const m of src.matchAll(new RegExp(`export\\s+(?:async\\s+)?function\\s+(${VERB})\\b`, 'g'))) {
    verbs.add(m[1]);
  }
  for (const m of src.matchAll(new RegExp(`export\\s+(?:const|let|var)\\s+(${VERB})\\s*=`, 'g'))) {
    verbs.add(m[1]);
  }
  for (const m of src.matchAll(/export\s+(?:(?:const|let|var)\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      // `{ GET }`, `{ handlers: GET }`, `{ GET as DELETE }` — the exported name
      // is the last word.
      const name = part.trim().split(/\s*:\s*|\s+as\s+/).pop();
      if (HTTP_VERBS.includes(name)) verbs.add(name);
    }
  }
  return HTTP_VERBS.filter((v) => verbs.has(v));
}

function countMethods(root, rel) {
  const counts = {};
  for (const file of routeFiles(root, rel)) {
    for (const v of exportedMethods(fs.readFileSync(file, 'utf8'))) counts[v] = (counts[v] || 0) + 1;
  }
  const ordered = {};
  for (const v of HTTP_VERBS) if (counts[v]) ordered[v] = counts[v];
  return ordered;
}

// The `name:` of each GitHub Actions workflow, verbatim (top-level key only —
// a job or step called `name:` is indented). CI leads because it is the gate
// every pull request passes; the rest follow alphabetically so the caption is
// stable run to run.
function workflowNames(root) {
  const dir = '.github/workflows';
  const names = listFiles(root, dir, /\.ya?ml$/)
    .map((f) => {
      const m = readText(root, path.join(dir, f)).match(/^name:[ \t]*(.+?)[ \t]*$/m);
      return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
    })
    .filter(Boolean);
  return names.sort((a, b) => {
    if (a === 'CI') return -1;
    if (b === 'CI') return 1;
    return a.localeCompare(b);
  });
}

// The Node major Vercel deploys with. The platform never reads .nvmrc (a
// local-dev pin); it takes package.json `engines.node` and deploys the NEWEST
// supported major that satisfies it — its docs' own table: `>=20.0.0` →
// latest 24.x, `^22.0.0` → latest 22.x. This reads the common range grammar
// (`^`, `~`, `>=`, `>`, `<=`, `<`, `=`, bare `22`, `22.x`, `*`, space-joined
// ANDs, `||` ORs) into version intervals and returns the highest supported
// major whose own interval overlaps one of them — or null when none does or
// a clause is unparsable, so the plate shows no version rather than a
// guessed one.
export const VERCEL_NODE_MAJORS = [24, 22, 20];

const parseVersion = (s) => {
  const m = s.match(/^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/);
  if (!m) return null;
  const num = (v) => (v != null && /^\d+$/.test(v) ? Number(v) : null);
  return { major: Number(m[1]), minor: num(m[2]), patch: num(m[3]) };
};

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// A comparator as an interval: `lo`/`hi` are [major, minor, patch] or null
// for unbounded; `loInc`/`hiInc` say whether the bound itself is included.
const ANY = { lo: null, loInc: true, hi: null, hiInc: false };

function clauseInterval(clause) {
  if (clause === '*' || clause === 'x' || clause === '') return ANY;
  const m = clause.match(/^(\^|~|>=|<=|>|<|=)?\s*v?([\d.x*]+)$/);
  if (!m) return null;
  const op = m[1] || '';
  const p = parseVersion(m[2]);
  if (!p) return null;
  const lo = [p.major, p.minor ?? 0, p.patch ?? 0];
  // The first version ABOVE a partial ("22" → 23.0.0, "22.1" → 22.2.0).
  const above =
    p.minor == null ? [p.major + 1, 0, 0] : p.patch == null ? [p.major, p.minor + 1, 0] : null;
  switch (op) {
    case '':
    case '=':
      return above
        ? { lo, loInc: true, hi: above, hiInc: false }
        : { lo, loInc: true, hi: lo, hiInc: true };
    case '^': {
      const hi =
        p.major > 0
          ? [p.major + 1, 0, 0]
          : p.minor != null && p.minor > 0
            ? [0, p.minor + 1, 0]
            : [0, 0, (p.patch ?? 0) + 1];
      return { lo, loInc: true, hi, hiInc: false };
    }
    case '~':
      return {
        lo,
        loInc: true,
        hi: p.minor == null ? [p.major + 1, 0, 0] : [p.major, p.minor + 1, 0],
        hiInc: false,
      };
    case '>=':
      return { lo, loInc: true, hi: null, hiInc: false };
    case '>':
      return above ? { lo: above, loInc: true, hi: null, hiInc: false } : { lo, loInc: false, hi: null, hiInc: false };
    case '<':
      return { lo: null, loInc: true, hi: lo, hiInc: false };
    case '<=':
      return above ? { lo: null, loInc: true, hi: above, hiInc: false } : { lo: null, loInc: true, hi: lo, hiInc: true };
    default:
      return null;
  }
}

function intersect(a, b) {
  let lo = a.lo;
  let loInc = a.loInc;
  if (b.lo && (!lo || cmp(b.lo, lo) > 0)) {
    lo = b.lo;
    loInc = b.loInc;
  } else if (b.lo && lo && cmp(b.lo, lo) === 0) loInc = loInc && b.loInc;
  let hi = a.hi;
  let hiInc = a.hiInc;
  if (b.hi && (!hi || cmp(b.hi, hi) < 0)) {
    hi = b.hi;
    hiInc = b.hiInc;
  } else if (b.hi && hi && cmp(b.hi, hi) === 0) hiInc = hiInc && b.hiInc;
  return { lo, loInc, hi, hiInc };
}

const nonEmpty = (iv) => {
  if (!iv.lo || !iv.hi) return true;
  const c = cmp(iv.lo, iv.hi);
  return c < 0 || (c === 0 && iv.loInc && iv.hiInc);
};

export function resolveVercelNodeMajor(range, supported = VERCEL_NODE_MAJORS) {
  if (typeof range !== 'string' || !range.trim()) return null;
  const alternatives = [];
  for (const alt of range.split('||')) {
    const clauses = alt.trim().split(/\s+/).filter(Boolean);
    if (clauses.length === 0) continue;
    let iv = ANY;
    for (const clause of clauses) {
      const c = clauseInterval(clause);
      if (!c) return null;
      iv = intersect(iv, c);
    }
    alternatives.push(iv);
  }
  if (alternatives.length === 0) return null;
  for (const major of [...supported].sort((a, b) => b - a)) {
    const line = { lo: [major, 0, 0], loInc: true, hi: [major + 1, 0, 0], hiInc: false };
    if (alternatives.some((iv) => nonEmpty(intersect(iv, line)))) return major;
  }
  return null;
}

// "5 Sep 2026" — fixed en-GB, UTC, so the server-rendered string is the one
// the client hydrates against (a client-side toLocaleDateString would depend
// on the visitor's locale and timezone).
export function formatBuiltAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function readBuildFacts(root = process.cwd(), now = new Date()) {
  const pkg = safe(() => JSON.parse(readText(root, 'package.json')));
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : null;

  // The version this build actually installs — package-lock.json's
  // `packages["node_modules/<name>"].version` (lockfile v2/v3). A manifest
  // range such as `^3.3.0` can resolve a minor or two higher (Tailwind
  // 3.4.17 at the owner audit, 2026-09-06), so the bill shows the resolved
  // version and keeps the range beside it. No lockfile, or a package it
  // lacks → null, and the plate falls back to the range.
  const lock = safe(() => JSON.parse(readText(root, 'package-lock.json')));
  const installedOf = (name) => {
    const v = lock?.packages?.[`node_modules/${name}`]?.version;
    return typeof v === 'string' ? v : null;
  };

  // The bill lists the manifest, not a chosen subset: iterate what
  // package.json declares, classify each entry by rule, and keep only the
  // groups that caught something. Add a dependency and it appears on the
  // next build; remove one and its row goes with it.
  const devNames = new Set(Object.keys(pkg?.devDependencies || {}));
  const bom = deps
    ? (() => {
        const buckets = new Map();
        for (const name of Object.keys(deps)) {
          const { label, rank } = classifyPackage(name, devNames.has(name));
          if (!buckets.has(label)) buckets.set(label, []);
          buckets.get(label).push({
            name,
            version: deps[name],
            installed: installedOf(name),
            rank,
          });
        }
        const order = [...BOM_RULES.map((r) => r.label), BOM_FALLBACK.dependency, BOM_FALLBACK.development];
        return {
          // Every dependency and devDependency the manifest declares. Equal
          // to the listed rows now that nothing is filtered out — the plate
          // shows the two only while they differ.
          total: Object.keys(deps).length,
          groups: order
            .filter((label) => buckets.has(label))
            .map((label) => ({
              label,
              items: buckets
                .get(label)
                .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
                // `rank` is ordering scaffolding, not a fact the page shows.
                .map(({ rank, ...item }) => item),
            })),
        };
      })()
    : null;

  const crons = safe(() => {
    const cfg = JSON.parse(readText(root, 'vercel.json'));
    return Array.isArray(cfg.crons)
      ? cfg.crons
          .filter((c) => c && typeof c.path === 'string')
          .map((c) => ({ path: c.path, schedule: c.schedule || null }))
      : null;
  });

  const builtAt = now.toISOString();

  return {
    builtAt,
    builtAtLabel: formatBuiltAt(builtAt),
    node: {
      engines: pkg?.engines?.node ?? null,
      nvmrc: safe(() => readText(root, '.nvmrc').trim() || null),
      vercelMajor: safe(() => resolveVercelNodeMajor(pkg?.engines?.node)),
    },
    bom,
    pipeline: {
      workflows: safe(() => workflowNames(root)),
      crons,
    },
    instruments: {
      unit: safe(() => countSuite(root, 'tests/unit', /\.test\.js$/)),
      e2e: safe(() => countSuite(root, 'tests/e2e', /\.spec\.js$/)),
      apiRoutes: safe(() => countRoutes(root, 'src/app/api')),
      apiMethods: safe(() => countMethods(root, 'src/app/api')),
    },
  };
}
