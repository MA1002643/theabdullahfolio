import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Why this file exists ────────────────────────────────────────────────────
// P4's claim is that `<lastmod>` is never fabricated, and sitemapDrift used to
// check it by AGE: a date within 60s of now had to be `new Date()` rather than
// a commit date. That reads as reasonable and is wrong — a commit IS less than
// sixty seconds old if you commit and then run the suite, which is an ordinary
// thing to do and a pre-push hook's normal timing. The test failed on correct
// behaviour, and a suite that cries wolf gets its failures ignored.
//
// The honest way to test "it reports what git said" is to control what git
// says. `execFileSync` is mocked here, so every assertion below is about the
// function's actual contract — the returned value, the argv it builds, and
// what it does when git cannot answer — with no dependence on wall-clock time
// or on this repository's commit history.

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFileSync }));

// The module memoises per instance and LATCHES the first git failure, both
// deliberately (see its header). That state is exactly what several cases
// below are about, so each scenario gets a fresh instance.
async function freshModule() {
  vi.resetModules();
  return import('@/lib/seo/lastModified');
}

beforeEach(() => {
  execFileSync.mockReset();
});

describe('lastModifiedFor', () => {
  it('returns exactly the date git reported, to the second', async () => {
    // The anti-fabrication property, stated directly: whatever git prints is
    // what comes back. A build-time `new Date()` cannot satisfy this.
    execFileSync.mockReturnValue('2024-03-07T09:15:22+00:00\n');
    const { lastModifiedFor } = await freshModule();

    const date = lastModifiedFor(['src/app/page.js']);

    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe('2024-03-07T09:15:22.000Z');
  });

  it('preserves a non-UTC commit offset rather than shifting the instant', async () => {
    // `%cI` carries the committer's offset. Parsing must respect it: reading
    // the local clock time as if it were UTC would move the date by hours.
    execFileSync.mockReturnValue('2024-03-07T09:15:22+05:00');
    const { lastModifiedFor } = await freshModule();

    expect(lastModifiedFor(['src/app/page.js']).toISOString()).toBe(
      '2024-03-07T04:15:22.000Z',
    );
  });

  it('asks git for the committer date, with no shell and a terminated revlist', async () => {
    execFileSync.mockReturnValue('2024-03-07T09:15:22Z');
    const { lastModifiedFor } = await freshModule();

    lastModifiedFor(['src/app/page.js', 'src/components/home']);

    const [command, args, options] = execFileSync.mock.calls[0];
    expect(command).toBe('git');
    // `%cI` not `%aI`: the author date of a rebased commit predates the version
    // that actually shipped.
    expect(args.slice(0, 4)).toEqual(['log', '-1', '--format=%cI', '--']);
    // Paths after `--`, as an argv vector — nothing can be read as a revision,
    // and there is no shell to interpret anything.
    expect(args.slice(4)).toEqual(['src/app/page.js', 'src/components/home']);
    expect(options.timeout).toBe(2000);
    // stderr ignored: a git hook or pager would otherwise pollute the build log
    // once per route.
    expect(options.stdio).toEqual(['ignore', 'pipe', 'ignore']);
  });

  it('omits the field when no commit has ever touched the paths', async () => {
    // Empty output is git succeeding and having nothing to say — a brand-new
    // route. Undefined, not a guess, and not `null` (which Next would render).
    execFileSync.mockReturnValue('\n');
    const { lastModifiedFor } = await freshModule();

    expect(lastModifiedFor(['src/app/brand-new/page.js'])).toBeUndefined();
  });

  it('omits the field when git prints something unparseable', async () => {
    // Better an absent field than `Invalid Date` in a machine-readable file.
    execFileSync.mockReturnValue('not a date at all');
    const { lastModifiedFor } = await freshModule();

    expect(lastModifiedFor(['src/app/page.js'])).toBeUndefined();
  });

  it('omits the field, latches, and stops spawning when git is unavailable', async () => {
    // The Vercel case: a source tarball with no `.git`. Twelve routes must not
    // cost twelve failed spawns to be told the same thing.
    execFileSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });
    const { lastModifiedFor, gitAvailable } = await freshModule();

    expect(lastModifiedFor(['src/app/page.js'])).toBeUndefined();
    expect(gitAvailable()).toBe(false);

    expect(lastModifiedFor(['src/app/about/page.js'])).toBeUndefined();
    expect(lastModifiedFor(['src/app/uses/page.js'])).toBeUndefined();
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });

  it('memoises per source list, so a build pays one spawn per route', async () => {
    execFileSync.mockReturnValue('2024-03-07T09:15:22Z');
    const { lastModifiedFor } = await freshModule();

    const first = lastModifiedFor(['src/app/page.js']);
    const second = lastModifiedFor(['src/app/page.js']);

    expect(second).toBe(first);
    expect(execFileSync).toHaveBeenCalledTimes(1);

    // A different list is a different question.
    lastModifiedFor(['src/app/data.js']);
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('never spawns for a route that declares no sources', async () => {
    const { lastModifiedFor } = await freshModule();

    expect(lastModifiedFor([])).toBeUndefined();
    expect(lastModifiedFor(undefined)).toBeUndefined();
    expect(lastModifiedFor('src/app/page.js')).toBeUndefined();
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
