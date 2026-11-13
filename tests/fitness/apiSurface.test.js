import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// The API surface as an architectural contract (issue #92, L1).
//
// Every rule here is about the SHAPE of src/app/api, not the behaviour of any
// one route, so it is checked by reading the files rather than calling them.
// That makes it cheap enough to run on every commit and total: a route added
// tomorrow is judged by the same rules without anyone writing a test for it.

const ROUTES = walk('src/app/api', /^route\.js$/);
const HTTP_VERBS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
// Next.js route-segment config.
const SEGMENT_CONFIG = new Set([
  'runtime',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'preferredRegion',
  'maxDuration',
]);
// A named export that is neither a verb nor config must justify itself here.
const EXPORT_EXCEPTIONS = {
  'src/app/api/seo-report/route.js': {
    deriveFindings: 'pure helper, pinned directly by tests/unit/seoFindings.test.js',
  },
};

const urlOf = (file) =>
  file.replace(/^src\/app/, '').replace(/\/route\.js$/, '') || '/';

/** Every named export of a route module, across the three forms this repo uses. */
function exportsOf(source) {
  const code = stripComments(source);
  const names = new Set();
  for (const m of code.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/gm))
    names.add(m[1]);
  for (const m of code.matchAll(/^export\s+(?:const|let)\s+\{([^}]+)\}/gm))
    m[1].split(',').forEach((n) => names.add(n.trim().split(/\s*:\s*/).pop()));
  for (const m of code.matchAll(/^export\s+\{([^}]+)\}/gm))
    m[1].split(',').forEach((n) => names.add(n.trim().split(/\s+as\s+/).pop()));
  names.delete('');
  return [...names];
}

const surface = Object.fromEntries(
  ROUTES.map((file) => [urlOf(file), exportsOf(read(file)).filter((n) => HTTP_VERBS.has(n)).sort()]),
);

describe('API surface — the shape of src/app/api', () => {
  it('pins the full method surface, so a new endpoint is a reviewed diff', () => {
    // Adding, removing or widening an endpoint changes the attack surface.
    // This map makes that change visible in review instead of incidental.
    expect(surface).toEqual({
      // Issue #41: the palette's Ask. Public and unauthenticated by design,
      // so it is throttled per hashed IP AND by a global daily breaker before
      // the model is called (src/lib/ask/ratelimit.js); hostile requests in
      // tests/security/api-hardening.spec.js.
      '/api/ask': ['POST'],
      '/api/auth/[...nextauth]': ['GET', 'POST'],
      '/api/daily-warmup': ['GET'],
      '/api/experience-summary': ['GET'],
      '/api/github-skills': ['GET'],
      '/api/github-stats': ['GET'],
      '/api/github-webhook': ['POST'],
      '/api/guestbook': ['DELETE', 'GET', 'POST'],
      '/api/guestbook/presence': ['POST'],
      '/api/guestbook/reactions': ['POST'],
      '/api/location': ['GET', 'POST'],
      '/api/project-progress': ['GET'],
      '/api/project-repo': ['GET'],
      '/api/refine-message': ['POST'],
      '/api/repo-refresh': ['GET'],
      '/api/send-mail': ['POST'],
      '/api/seo-report': ['GET'],
      '/api/spotify': ['GET'],
      '/api/spotify/auth': ['GET'],
      '/api/work-status': ['GET'],
    });
  });

  it('exports only verbs, segment config, UPPER_CASE constants, or a justified exception', () => {
    const offenders = ROUTES.flatMap((file) =>
      exportsOf(read(file))
        .filter(
          (name) =>
            !HTTP_VERBS.has(name) &&
            !SEGMENT_CONFIG.has(name) &&
            !/^[A-Z][A-Z0-9_]*$/.test(name) &&
            !EXPORT_EXCEPTIONS[file]?.[name],
        )
        .map((name) => `${file}  export ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it('pins runtime = "nodejs" wherever a route imports a Node-only module', () => {
    // Moving a route to Edge would break these at runtime, not at build.
    const nodeOnly = /from\s+['"](node:[\w/]+|nodemailer|fs|path|crypto|child_process)['"]/;
    const offenders = ROUTES.filter((file) => {
      const code = stripComments(read(file));
      return nodeOnly.test(code) && !/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('reads every request body through a byte ceiling, or justifies why not', () => {
    // An unbounded `request.json()` buffers whatever arrives before a single
    // rule has run. send-mail did exactly that until 2026-09-28.
    const UNBOUNDED_OK = {
      'src/app/api/github-webhook/route.js':
        'HMAC verification needs the exact raw bytes, and GitHub payloads can be large; the platform caps bodies at 4.5 MB',
      'src/app/api/location/route.js':
        'reads only after the bearer check, so only the owner can send a body at all',
    };
    const offenders = ROUTES.filter((file) => {
      const code = stripComments(read(file));
      const readsBody = /\b(?:req|request)\.(?:json|text|arrayBuffer|formData)\(\)/.test(code);
      return readsBody && !UNBOUNDED_OK[file];
    });
    expect(offenders).toEqual([]);
  });

  it('never compares CRON_SECRET with == / ===, only in constant time', () => {
    // `===` on a secret returns at the first differing byte, which leaks the
    // length of the matching prefix to anyone who can time the response.
    // cronAuth.js's safeBearerEqual exists so no route rolls its own compare.
    const readers = ROUTES.filter((file) => /process\.env\.CRON_SECRET/.test(stripComments(read(file))));
    expect(readers.length).toBeGreaterThanOrEqual(5);
    const offenders = readers.filter((file) => {
      const code = stripComments(read(file));
      const plainCompare = /[!=]==?\s*`Bearer \$\{|`Bearer \$\{[^}]+\}`\s*[!=]==?/.test(code);
      return plainCompare || !/\bsafeBearerEqual\(/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
