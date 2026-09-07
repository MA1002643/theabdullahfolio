import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BOM_FALLBACK,
  BOM_RULES,
  classifyPackage,
  countCases,
  exportedMethods,
  formatBuiltAt,
  readBuildFacts,
  resolveVercelNodeMajor,
} from '@/lib/uses/buildFacts';

// The /uses build-facts reader (issue #37) against a fixture repository: the
// versions it lists, the workflow names it quotes and the counts it shows
// must all come from the files — and a missing file must yield null, never
// a fake zero. Every test builds its own temp root so nothing here reads
// the real repository.

const roots = [];
const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'uses-facts-'));
  roots.push(root);
  return root;
};
const write = (root, rel, text) => {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
};

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

const FIXED_NOW = new Date('2026-09-05T13:07:00.000Z');

function seedFullRepo(root) {
  write(
    root,
    'package.json',
    JSON.stringify({
      engines: { node: '^22.13.0 || ^24.0.0' },
      dependencies: { next: '^14.2.30', react: '^18', three: '^0.162.0', ai: '^7.0.4' },
      devDependencies: { vitest: '^4.1.11', prettier: '^3.6.2' },
    }),
  );
  write(root, '.nvmrc', '22.14.0\n');
  // Lockfile v3: the versions this build actually installs. `ai` is left
  // out on purpose so its row falls back to the manifest range.
  write(
    root,
    'package-lock.json',
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture' },
        'node_modules/next': { version: '14.2.35' },
        'node_modules/react': { version: '18.3.1' },
        'node_modules/three': { version: '0.162.0' },
        'node_modules/vitest': { version: '4.1.13' },
        'node_modules/prettier': { version: '3.6.2' },
      },
    }),
  );
  write(root, '.github/workflows/ci.yml', 'name: CI\non:\n  push:\njobs:\n  a:\n    name: not this\n');
  write(root, '.github/workflows/stale.yml', "name: 'Stale'\n");
  write(root, '.github/workflows/sync.yaml', 'name: "Sync README"\n');
  write(root, '.github/workflows/notes.txt', 'name: ignored\n');
  write(
    root,
    'tests/unit/a.test.js',
    "it('one', () => {});\n  test('two', () => {});\nit.only('three', () => {});\ntest.each([1])('four %i', () => {});\n// it('commented out') still counts as a line start? no — leading // is not whitespace\n",
  );
  write(root, 'tests/unit/b.test.js', "describe('x', () => {\n  it('five', () => {});\n});\n");
  write(root, 'tests/unit/helper.js', "it('not a suite file', () => {});\n");
  write(root, 'tests/e2e/smoke.spec.js', "test('boots', async () => {});\ntest('renders', async () => {});\n");
  write(root, 'src/app/api/one/route.js', 'export function GET() {}');
  write(
    root,
    'src/app/api/nested/[id]/route.js',
    'export async function GET() {}\nexport const DELETE = () => {};',
  );
  write(root, 'src/app/api/auth/route.js', 'const handlers = {};\nexport const { GET, POST } = handlers;');
  write(root, 'src/app/api/nested/helper.js', '// not a route');
  write(
    root,
    'vercel.json',
    JSON.stringify({ crons: [{ path: '/api/daily-warmup', schedule: '0 1 * * *' }] }),
  );
}

describe('readBuildFacts — a full fixture repository', () => {
  it('reads the manifest range AND the lockfile-resolved version per package, grouped, dropping packages the manifest lacks', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const facts = readBuildFacts(root, FIXED_NOW);

    const labels = facts.bom.groups.map((g) => g.label);
    expect(labels).toEqual(['Core', '3D & motion', 'Data & services', 'Quality']);
    const byLabel = Object.fromEntries(facts.bom.groups.map((g) => [g.label, g.items]));
    // Ordered by the matching pattern's position in its rule, not
    // alphabetically: `next` leads Core, `vitest` leads Quality.
    expect(byLabel.Core).toEqual([
      { name: 'next', version: '^14.2.30', installed: '14.2.35' },
      { name: 'react', version: '^18', installed: '18.3.1' },
    ]);
    expect(byLabel['3D & motion']).toEqual([
      { name: 'three', version: '^0.162.0', installed: '0.162.0' },
    ]);
    // No lockfile entry → null; the plate shows the range instead.
    expect(byLabel['Data & services']).toEqual([
      { name: 'ai', version: '^7.0.4', installed: null },
    ]);
    expect(byLabel.Quality).toEqual([
      { name: 'vitest', version: '^4.1.11', installed: '4.1.13' },
      { name: 'prettier', version: '^3.6.2', installed: '3.6.2' },
    ]);
    // Every group the reader emits is one its rules declare.
    expect(BOM_RULES.map((r) => r.label)).toEqual(expect.arrayContaining(labels));
    // 4 deps + 2 devDeps — and every one of them is listed.
    expect(facts.bom.total).toBe(6);
    expect(facts.bom.groups.flatMap((g) => g.items)).toHaveLength(6);
  });

  it('lists the WHOLE manifest: a package added to package.json appears without a code change', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const before = readBuildFacts(root, FIXED_NOW);
    const names = (f) => f.bom.groups.flatMap((g) => g.items.map((i) => i.name));
    expect(names(before)).not.toContain('@react-three/postprocessing');

    // Add one package that a rule already recognises, and drop another.
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    pkg.dependencies['@react-three/postprocessing'] = '^2.0.0';
    delete pkg.dependencies.three;
    write(root, 'package.json', JSON.stringify(pkg));

    const after = readBuildFacts(root, FIXED_NOW);
    const byLabel = Object.fromEntries(after.bom.groups.map((g) => [g.label, g.items]));
    expect(byLabel['3D & motion']).toEqual([
      { name: '@react-three/postprocessing', version: '^2.0.0', installed: null },
    ]);
    expect(names(after)).not.toContain('three');
    expect(after.bom.total).toBe(6);
  });

  it('a package no rule claims is still listed — Runtime for a dependency, Tooling for a devDependency', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    pkg.dependencies['some-new-runtime-thing'] = '^1.0.0';
    pkg.devDependencies['some-new-codegen'] = '^2.0.0';
    write(root, 'package.json', JSON.stringify(pkg));

    const facts = readBuildFacts(root, FIXED_NOW);
    const byLabel = Object.fromEntries(facts.bom.groups.map((g) => [g.label, g.items]));
    expect(byLabel[BOM_FALLBACK.dependency]).toEqual([
      { name: 'some-new-runtime-thing', version: '^1.0.0', installed: null },
    ]);
    expect(byLabel[BOM_FALLBACK.development]).toEqual([
      { name: 'some-new-codegen', version: '^2.0.0', installed: null },
    ]);
    // The catch-alls sort last, after every rule group.
    expect(facts.bom.groups.map((g) => g.label).slice(-2)).toEqual([
      BOM_FALLBACK.dependency,
      BOM_FALLBACK.development,
    ]);
    expect(facts.bom.groups.flatMap((g) => g.items)).toHaveLength(facts.bom.total);
  });

  it('classifies by pattern, first rule wins, and never invents a group', () => {
    // A scoped name is matched by its scope, so a sibling package added
    // later lands in the same group with no rule change.
    expect(classifyPackage('@react-three/postprocessing').label).toBe('3D & motion');
    expect(classifyPackage('@upstash/qstash').label).toBe('Data & services');
    expect(classifyPackage('eslint-plugin-anything').label).toBe('Quality');
    // `@vercel/kv` is data, every other @vercel/* is platform — the Data
    // rule is declared first, so ordering decides it.
    expect(classifyPackage('@vercel/kv').label).toBe('Data & services');
    expect(classifyPackage('@vercel/analytics').label).toBe('Platform');
    // The dev flag only matters when nothing matched.
    expect(classifyPackage('vitest', true).label).toBe('Quality');
    expect(classifyPackage('mystery-lib', false).label).toBe(BOM_FALLBACK.dependency);
    expect(classifyPackage('mystery-lib', true).label).toBe(BOM_FALLBACK.development);
  });

  it('every package in the REAL manifest is claimed by a rule (no silent catch-all drift)', () => {
    const facts = readBuildFacts(resolve(process.cwd()), FIXED_NOW);
    const labels = facts.bom.groups.map((g) => g.label);
    // A fallback heading appearing here is the signal to add a rule — the
    // package is still listed either way, so this fails loud, not silent.
    expect(labels).not.toContain(BOM_FALLBACK.dependency);
    expect(labels).not.toContain(BOM_FALLBACK.development);
    expect(facts.bom.groups.flatMap((g) => g.items)).toHaveLength(facts.bom.total);
  });

  it('reads the Node pins', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.node).toEqual({ engines: '^22.13.0 || ^24.0.0', nvmrc: '22.14.0', vercelMajor: 24 });
  });

  it('quotes each workflow `name:` verbatim (top-level only, quotes stripped), CI first', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.pipeline.workflows).toEqual(['CI', 'Stale', 'Sync README']);
    expect(facts.pipeline.crons).toEqual([{ path: '/api/daily-warmup', schedule: '0 1 * * *' }]);
  });

  it('counts suites and cases from the files, never from a typed number', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const facts = readBuildFacts(root, FIXED_NOW);
    // Two *.test.js files (helper.js is not a suite); it / test / it.only /
    // test.each all count; the commented line does not.
    expect(facts.instruments.unit).toEqual({ suites: 2, cases: 5 });
    expect(facts.instruments.e2e).toEqual({ suites: 1, cases: 2 });
    // Recursive: the dynamic segment's route.js counts, helper.js does not.
    expect(facts.instruments.apiRoutes).toBe(3);
    // Handlers per verb, HTTP order, verbs present only — across the
    // function, `const`, and destructured (next-auth) export forms.
    expect(facts.instruments.apiMethods).toEqual({ GET: 3, POST: 1, DELETE: 1 });
  });

  it('stamps builtAt as ISO with a fixed en-GB UTC label', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.builtAt).toBe('2026-09-05T13:07:00.000Z');
    expect(facts.builtAtLabel).toBe('5 Sep 2026');
    expect(formatBuiltAt('not a date')).toBeNull();
  });

  it('is plain JSON — survives a serialisation round trip unchanged', () => {
    const root = makeRoot();
    seedFullRepo(root);
    const facts = readBuildFacts(root, FIXED_NOW);
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
  });
});

describe('readBuildFacts — missing inputs fail to null, never to a fake value', () => {
  it('an empty root yields nulls for every fact and still stamps the build', () => {
    const root = makeRoot();
    const facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.bom).toBeNull();
    expect(facts.node).toEqual({ engines: null, nvmrc: null, vercelMajor: null });
    expect(facts.pipeline).toEqual({ workflows: null, crons: null });
    expect(facts.instruments).toEqual({
      unit: null,
      e2e: null,
      apiRoutes: null,
      apiMethods: null,
    });
    expect(facts.builtAtLabel).toBe('5 Sep 2026');
  });

  it('a package.json without engines leaves engines null and keeps the bill; no lockfile → installed null', () => {
    const root = makeRoot();
    write(root, 'package.json', JSON.stringify({ dependencies: { next: '^14.2.30' } }));
    const facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.node.engines).toBeNull();
    expect(facts.bom.groups).toEqual([
      { label: 'Core', items: [{ name: 'next', version: '^14.2.30', installed: null }] },
    ]);
    expect(facts.bom.total).toBe(1);
  });

  it('a malformed or v1-shaped lockfile leaves installed null and keeps the bill', () => {
    const root = makeRoot();
    write(root, 'package.json', JSON.stringify({ dependencies: { next: '^14.2.30', react: '^18' } }));
    write(root, 'package-lock.json', '{ not json');
    let facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.bom.groups[0].items.map((i) => i.installed)).toEqual([null, null]);
    // Lockfile v1 has `dependencies`, not `packages` — nothing to read.
    write(
      root,
      'package-lock.json',
      JSON.stringify({ lockfileVersion: 1, dependencies: { next: { version: '14.2.35' } } }),
    );
    facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.bom.groups[0].items.map((i) => i.installed)).toEqual([null, null]);
  });

  it('a malformed vercel.json or manifest yields null for that fact only', () => {
    const root = makeRoot();
    write(root, 'vercel.json', '{ not json');
    write(root, 'package.json', '{ also not json');
    write(root, '.nvmrc', '22.14.0');
    const facts = readBuildFacts(root, FIXED_NOW);
    expect(facts.pipeline.crons).toBeNull();
    expect(facts.bom).toBeNull();
    expect(facts.node.nvmrc).toBe('22.14.0');
  });
});

describe('resolveVercelNodeMajor — the major Vercel deploys from engines.node', () => {
  // Vercel's documented resolution: the newest supported major that satisfies
  // the range (`>=20.0.0` → 24.x, `^22.0.0` → 22.x). Never the .nvmrc pin.
  it.each([
    ['^22.13.0 || ^24.0.0', 24],
    ['24.x', 24],
    ['^24.0.0', 24],
    ['>=20.0.0', 24],
    ['>=18', 24],
    ['>22', 24],
    ['*', 24],
    ['22.x', 22],
    ['^22.0.0', 22],
    ['~22.14.0', 22],
    ['22', 22],
    ['>=20 <23', 22],
    ['<24', 22],
    ['<=22', 22],
    ['20.x', 20],
    ['^20.0.0', 20],
    ['=20.1.0', 20],
    ['>=22.13.0 <22.15.0', 22],
  ])('%s → %s', (range, major) => {
    expect(resolveVercelNodeMajor(range)).toBe(major);
  });

  it('yields null — never a guess — when nothing supported satisfies the range or it cannot be read', () => {
    expect(resolveVercelNodeMajor('16.x')).toBeNull();
    expect(resolveVercelNodeMajor('>=25')).toBeNull();
    expect(resolveVercelNodeMajor('>22 <22.5')).toBeNull();
    expect(resolveVercelNodeMajor('22.0.0 - 24.0.0')).toBeNull();
    expect(resolveVercelNodeMajor('nonsense')).toBeNull();
    expect(resolveVercelNodeMajor('')).toBeNull();
    expect(resolveVercelNodeMajor(undefined)).toBeNull();
    expect(resolveVercelNodeMajor(null)).toBeNull();
  });

  it('honours a custom supported list', () => {
    expect(resolveVercelNodeMajor('>=18', [18, 20])).toBe(20);
    expect(resolveVercelNodeMajor('^22.0.0', [18, 20])).toBeNull();
  });
});

// The case counter must agree with the runner (owner audit 2026-09-06: the
// plate read 402 where Vitest ran 431 because multi-line each-tables counted
// zero). Each fixture is a source string, never a file the runner would pick
// up.
describe('countCases — counts the way the runner does', () => {
  it('expands a multi-line each-table by its rows — trailing comma, nested brackets and bracket-shaped strings included', () => {
    const src = `
describe('x', () => {
  it.each([
    ['a', [1, 2], { k: ']' }],
    ['b', [3], { k: '(' }],
    ['c', [], {}],
  ])('%s', () => {});
  test.each([[1], [2]])('inline %i', () => {});
});
`;
    expect(countCases(src)).toBe(5);
  });

  it('expands a template table by its lines below the header', () => {
    const src = "it.each`\n  a    | b\n  ${1} | ${2}\n  ${3} | ${4}\n`('$a + $b', () => {});\n";
    expect(countCases(src)).toBe(2);
  });

  it('multiplies a describe.each block by its rows, and counts what follows it once', () => {
    const src = `
describe.each([['x'], ['y'], ['z']])('%s', () => {
  it('one', () => {});
  it('two', () => {});
});
it('outside', () => {});
`;
    expect(countCases(src)).toBe(7);
  });

  it('never counts a commented-out case or a case name that contains it(', () => {
    const src = `
// it('commented', () => {});
/* it('block', () => {});
   test('block 2', () => {}); */
it("renders it('x') verbatim", () => {});
it('name with // slashes', () => {});
`;
    expect(countCases(src)).toBe(2);
  });

  it('accepts the Vitest and Playwright modifiers; describe blocks and hooks are not cases', () => {
    const src = `
test.describe('suite', () => {
  test.describe.configure({ mode: 'serial' });
  test('a', async () => {});
  test.skip('b', async () => {});
  test.fixme('c', async () => {});
  test.beforeEach(async () => {});
});
describe.skip('d', () => {
  it.fails('e', () => {});
  it.concurrent.each([[1], [2]])('f %i', () => {});
});
`;
    expect(countCases(src)).toBe(6);
  });

  it('a table held in a variable counts once — the limit of a static read', () => {
    expect(countCases("const cases = [[1], [2], [3]];\nit.each(cases)('%i', () => {});\n")).toBe(1);
  });
});

describe('exportedMethods — every export form Next accepts, in HTTP order', () => {
  it('reads the function, const, destructured and re-export forms', () => {
    expect(exportedMethods('export async function POST() {}\nexport function GET() {}')).toEqual([
      'GET',
      'POST',
    ]);
    expect(exportedMethods('export const DELETE = (req) => {};')).toEqual(['DELETE']);
    expect(exportedMethods('const handlers = {};\nexport const { GET, POST } = handlers;')).toEqual([
      'GET',
      'POST',
    ]);
    expect(exportedMethods('function a() {}\nexport { a as GET, a as DELETE };')).toEqual([
      'GET',
      'DELETE',
    ]);
  });

  it('ignores non-verb exports and verbs that only appear in comments or strings', () => {
    expect(
      exportedMethods(
        "export const dynamic = 'force-dynamic';\n// export function POST() {}\nconst s = 'export function DELETE';\nexport function GET() {}",
      ),
    ).toEqual(['GET']);
  });
});

describe('readBuildFacts — the module reads the filesystem and nothing else', () => {
  it('never references process.env, window or document (CLAUDE.md §1)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/uses/buildFacts.js'),
      'utf8',
    );
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/\bwindow\b/);
    expect(source).not.toMatch(/\bdocument\b/);
    expect(source).not.toMatch(/\.env/);
  });
});
