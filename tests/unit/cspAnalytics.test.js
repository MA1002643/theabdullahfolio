import { describe, expect, it } from 'vitest';

// ── The F4 guard (issue #32, W4 + W5) ───────────────────────────────────────
// F4 is the issue's most dangerous finding precisely because it produces no
// symptom. The CSP allowed `script-src … https://va.vercel-scripts.com` and
// nothing else, so dropping in <GoogleAnalytics /> would have yielded a page
// that looked completely healthy, sent ZERO hits, and logged no user-visible
// error. The measurement baseline this whole issue exists to create would have
// been quietly destroyed for however long it took someone to think to check.
//
// This test pins the allow-list from BOTH directions, which is the part worth
// being deliberate about:
//
//   • Every host the analytics stack needs must be present. Catches "someone
//     tightened the CSP and killed GA4".
//   • No host beyond the declared set may be present. Catches "someone
//     loosened the CSP past what is needed" — a CSP that silently accretes
//     hosts is a CSP nobody can reason about, and this file already carries
//     'unsafe-inline' and 'unsafe-eval', so the host list is most of what is
//     left protecting the origin.
//
// It parses the REAL config rather than a copy. A test asserting against a
// duplicated policy string would pass while production shipped something else.

// The config is ESM with a top-level await and a conditional dynamic import of
// `@next/bundle-analyzer`. Importing it is fine — the analyzer branch is inert
// unless ANALYZE=true — and it is the only way to test what actually ships.
const loadCsp = async () => {
  const { default: config } = await import('../../next.config.mjs');
  const headerGroups = await config.headers();

  // The site-wide group, found by its source pattern rather than by index, so
  // adding another group (the CV's X-Robots-Tag, for instance) cannot shift
  // this test onto the wrong one.
  const group = headerGroups.find((entry) => entry.source === '/(.*)');
  expect(group, 'no site-wide header group in next.config.mjs').toBeTruthy();

  const header = group.headers.find(
    (entry) => entry.key === 'Content-Security-Policy',
  );
  expect(header, 'no Content-Security-Policy header').toBeTruthy();

  // Directive name → array of source expressions.
  const directives = {};
  for (const part of header.value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives[name] = sources;
  }
  return directives;
};

// Hosts the currently-mounted telemetry needs. @vercel/analytics and
// @vercel/speed-insights both load their script from here.
const REQUIRED_SCRIPT_HOSTS = ['https://va.vercel-scripts.com'];

// Hosts GA4 needs. Present in the policy but with NO consumer yet: the tag is
// blocked on #141's consent gating and must not fire before consent exists.
// Listed separately so the distinction is legible — if #141 is ever abandoned,
// this is the line that says the entry can be removed.
const GA4_SCRIPT_HOSTS = ['https://www.googletagmanager.com'];

describe('CSP ↔ analytics contract', () => {
  it('allows every host the mounted telemetry needs', async () => {
    const { 'script-src': scriptSrc } = await loadCsp();

    for (const host of REQUIRED_SCRIPT_HOSTS) {
      expect(
        scriptSrc,
        `${host} is missing from script-src — @vercel/analytics and ` +
          `@vercel/speed-insights load from there and will silently send nothing.`,
      ).toContain(host);
    }
  });

  it('allows googletagmanager.com, so GA4 cannot be silently blocked', async () => {
    const { 'script-src': scriptSrc } = await loadCsp();

    for (const host of GA4_SCRIPT_HOSTS) {
      expect(
        scriptSrc,
        `${host} is missing from script-src. This is issue #32's F4: GA4 will ` +
          `load nothing, report no error, and send zero hits. If GA4 has been ` +
          `deliberately abandoned, remove this assertion AND the host together.`,
      ).toContain(host);
    }
  });

  it('permits no script host beyond the declared set', async () => {
    const { 'script-src': scriptSrc } = await loadCsp();

    const declared = new Set([...REQUIRED_SCRIPT_HOSTS, ...GA4_SCRIPT_HOSTS]);
    const undeclared = scriptSrc.filter(
      // Keyword sources ('self', 'unsafe-inline', 'unsafe-eval') are quoted and
      // are not hosts; they are asserted separately below.
      (source) => !source.startsWith("'") && !declared.has(source),
    );

    expect(
      undeclared,
      `script-src carries host(s) this test does not know about: ` +
        `${undeclared.join(', ')}. Add them here with a note saying what needs ` +
        `them, or remove them from next.config.mjs.`,
    ).toEqual([]);
  });

  it('keeps the rest of the analytics stack covered without widening it', async () => {
    const directives = await loadCsp();

    // GA4 posts hits to google-analytics.com and falls back to an image pixel.
    // Both are already covered by the permissive `https:` these directives
    // carry, which is why F4 identified script-src as the ONLY blocker. Pinned
    // so a future tightening of these directives — a reasonable thing to want —
    // is forced to notice that GA4 depends on them too.
    expect(directives['connect-src']).toContain('https:');
    expect(directives['img-src']).toContain('https:');
  });

  it('still denies the directives that matter for a portfolio', async () => {
    const directives = await loadCsp();

    // Adding an analytics host must not have relaxed anything structural.
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'self'"]);
    expect(directives['form-action']).toEqual(["'self'"]);
    expect(directives['default-src']).toEqual(["'self'"]);
  });
});

describe('CV PDF crawl directives', () => {
  it('serves an explicit X-Robots-Tag on the CV (W1b)', async () => {
    const { default: config } = await import('../../next.config.mjs');
    const headerGroups = await config.headers();

    const group = headerGroups.find(
      (entry) => entry.source === '/Muhammad_Abdullah_CV.pdf',
    );
    expect(
      group,
      'no header group for the CV PDF — W1b requires its indexing intent to be ' +
        'written down where the next person to audit this file will read it.',
    ).toBeTruthy();

    const tag = group.headers.find((entry) => entry.key === 'X-Robots-Tag');
    expect(tag).toBeTruthy();
    // Indexing is the default, so this header changes nothing technically. Its
    // value is that the DECISION (F6, owner call 2026-09-11) is now explicit
    // rather than being the absence of a contrary instruction.
    expect(tag.value).toContain('index');
    expect(tag.value).toContain('follow');
    expect(tag.value).toContain('max-image-preview:large');
    expect(tag.value).not.toContain('noindex');
  });
});

describe('www → apex redirect (F2)', () => {
  it('308s the www host to the apex, for any path', async () => {
    const { default: config } = await import('../../next.config.mjs');
    const redirects = await config.redirects();

    const rule = redirects.find((entry) =>
      entry.has?.some(
        (condition) =>
          condition.type === 'host' && condition.value === 'www.ma.codes',
      ),
    );
    expect(
      rule,
      'no www→apex redirect. Both hosts answered 200 with identical content and ' +
        'no Location header, so Google had to guess which was authoritative.',
    ).toBeTruthy();

    // `permanent` emits 308 rather than 301 — both are permanent, but 308 also
    // guarantees the method survives the redirect.
    expect(rule.permanent).toBe(true);
    // The whole path has to be carried across, including the root.
    expect(rule.source).toBe('/:path*');
    expect(rule.destination).toBe('https://ma.codes/:path*');
  });

  it('cannot loop, because the destination host no longer matches', async () => {
    const { default: config } = await import('../../next.config.mjs');
    const redirects = await config.redirects();

    for (const rule of redirects) {
      const hosts = (rule.has ?? [])
        .filter((condition) => condition.type === 'host')
        .map((condition) => condition.value);
      for (const host of hosts) {
        expect(
          rule.destination.includes(`://${host}/`),
          `redirect from host ${host} points back at ${host} — infinite loop`,
        ).toBe(false);
      }
    }
  });
});
