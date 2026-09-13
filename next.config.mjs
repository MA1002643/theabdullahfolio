// ANALYZE=true npm run build → per-chunk treemaps in .next*/analyze/ (issue
// #40 Phase 6 budget evidence). Inert in every normal build and on Vercel.
//
// Loaded on demand, never statically: `@next/bundle-analyzer` is a
// devDependency, and `next start` evaluates this file too, so a production
// install without devDependencies (`npm ci --omit=dev`, a Docker runtime
// stage) would crash at startup on a missing module — before ANALYZE was ever
// consulted. Top-level await is fine here: Next loads the config with a
// dynamic import(), which awaits module evaluation.
const withBundleAnalyzer =
  process.env.ANALYZE === 'true'
    ? (await import('@next/bundle-analyzer')).default({
        enabled: true,
        openAnalyzer: false,
      })
    : (config) => config;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This repo lives under ~/Desktop, which iCloud Drive syncs. iCloud's
  // file provider churns build artifacts mid-write (random ENOENT, silent
  // dev-server exits — see scripts/dev.mjs for the full failure story).
  // Any folder whose name ends in `.nosync` is excluded from iCloud sync,
  // so keep ALL local build output there. On Vercel there is no iCloud;
  // keep the default `.next` so production builds are untouched.
  distDir: process.env.VERCEL ? ".next" : ".next.nosync",
  // ── No `experimental` block any more, and the reason is worth keeping ─────
  // This held two settings that existed solely so /api/experience-summary
  // could parse the CV PDF at runtime. That route now derives employment from
  // `journeyData` (see src/utils/experience/journeyEmployment.js), nothing in
  // the Next graph imports `pdf-parse`, and both settings became dead weight —
  // the file-tracing entry was still bundling the PDF and two pdfjs worker
  // builds into a function that never opens them.
  //
  // Restore BOTH together if a runtime PDF parse ever returns, because each
  // one cost a production-only failure to find:
  //
  //   experimental.serverComponentsExternalPackages: ["pdf-parse"]
  //     `pdf-parse` pulls in `pdfjs-dist`, an ESM bundle that touches
  //     browser-style globals Next's RSC webpack pass mangles. Without the
  //     external marking the route threw `Object.defineProperty called on
  //     non-object` at import time.
  //
  //   experimental.outputFileTracingIncludes["/api/experience-summary"]
  //     `public/` assets reach the static layer but are NOT copied into a
  //     function's filesystem, so `fs.readFile` found the PDF locally and not
  //     on Vercel. The list also needed
  //     `node_modules/pdfjs-dist/legacy/build/pdf.worker[.min].mjs`: pdfjs sets
  //     up a main-thread "fake worker" by dynamic import, which @vercel/nft
  //     cannot trace, so `getText()` failed in production with "Setting up
  //     fake worker failed". In Next 14.x this option lives under
  //     `experimental`; it is top-level from Next 15.
  //
  // `@napi-rs/canvas` was deliberately never bundled — its platform `.node`
  // binary loads through an untraceable runtime `createRequire`, which crashed
  // the route with "DOMMatrix is not defined". The parser instead installs a
  // pure-JS DOMMatrix before pdfjs loads
  // (src/utils/experience/domMatrixPolyfill.js); that file and the parser are
  // still present and still exercised by the test suite.
  images: {
    // Deliberately NO deviceSizes/imageSizes override. images.* is GLOBAL — a
    // deviceSizes cap would clamp EVERY next/image with a `sizes` prop across
    // the whole site, including the full-bleed 100vw backgrounds on /, /about
    // and /projects, softening them on large / high-DPR displays. The
    // /qualifications carousel — the one place that was requesting oversized
    // (1920) variants — instead limits itself at the source: its `sizes` string
    // (see certSizes.js) now declares the card's TRUE height-bound width, so
    // the browser targets ~1080/1200 there without penalising anything else.
    // Next's default deviceSizes ([...1200, 1920, 2048, 3840]) therefore stay
    // available for the backgrounds that genuinely need them.
    //
    // Certificate (and other) files are content-immutable, so give the
    // optimiser output a 1-year TTL. This stops the browser from sending an
    // If-Modified-Since revalidation on every navigation — the revalidation
    // round-trip is exactly what was mid-flight when the observed carousel
    // request got (canceled) in issue #84.
    minimumCacheTTL: 31536000,
    // Negotiate AVIF first (~20% smaller than WebP on mobile), fall back to
    // WebP. Purely a wire-format choice; the source assets stay .webp.
    formats: ['image/avif', 'image/webp'],
  },
  // ── www → apex, 308 ───────────────────────────────────────────────────────
  // Issue #32, F2. `www.ma.codes` and `ma.codes` both answered 200 with
  // byte-identical content, the same etag and no Location header, and with no
  // canonical anywhere on the site (F3) Google had to GUESS which host was
  // authoritative — splitting any inbound link equity across two origins.
  //
  // Done HERE rather than in the Vercel dashboard on purpose, and the choice is
  // worth recording. A dashboard redirect is invisible to this repository: it
  // cannot be reviewed in a diff, cannot be tested, and is silently lost if the
  // project is ever recreated or forked. In config it is all three, and the e2e
  // suite can assert it. (If a dashboard-level redirect is ALSO configured, the
  // two agree — the platform one fires first and this becomes dead weight
  // rather than a conflict.)
  //
  // `permanent: true` emits 308, not 301. Both are permanent; 308 additionally
  // guarantees the method and body survive the redirect, where 301 historically
  // let clients rewrite POST to GET. Nothing on this site POSTs to the www host
  // today, but the stronger guarantee costs nothing.
  //
  // Matched on the HOST, so it cannot fire on the apex and loop: `has` requires
  // the request's Host header to be exactly `www.ma.codes`, and the destination
  // is the apex, which no longer matches.
  async redirects() {
    return [
      {
        // `/:path*` captures the whole path INCLUDING the empty root, so
        // `www.ma.codes` → `ma.codes` and `www.ma.codes/projects/3` →
        // `ma.codes/projects/3` are both covered by one rule.
        source: '/:path*',
        has: [{ type: 'host', value: 'www.ma.codes' }],
        destination: 'https://ma.codes/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // ── The CV PDF's crawl directives (issue #32, W1b) ─────────────────
        // The CV is indexable BY DECISION (F6, owner call 2026-09-11), not by
        // accident. Indexing is already the default, so this header changes
        // NOTHING technically — and that is precisely why it is here. The
        // intent was previously unwritten anywhere, which meant the only
        // difference between "deliberately published" and "nobody noticed it
        // was crawlable" was a conversation. Now it is a line of config that
        // the next person to audit this file will read.
        //
        // `max-snippet:-1` lifts the snippet-length cap so a result can quote
        // enough of the document to be useful, and `max-image-preview:large`
        // matches the site-wide policy in the root layout's `robots` key.
        //
        // Listed BEFORE the catch-all below: Next applies every matching
        // header rule, so both apply to this path and the order is only about
        // readability. `Content-Disposition: inline` is deliberately NOT set
        // here — Vercel already serves it inline, which is the right setting
        // for a document meant to be read in-browser straight from a search
        // result rather than downloaded.
        source: '/Muhammad_Abdullah_CV.pdf',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'index, follow, max-snippet:-1, max-image-preview:large',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // https://va.vercel-scripts.com — required by @vercel/analytics
            // and @vercel/speed-insights to load their telemetry scripts.
            //
            // https://www.googletagmanager.com — required by GA4 (issue #32,
            // F4/W4). THIS IS THE ONE THAT WOULD HAVE FAILED SILENTLY: dropping
            // <GoogleAnalytics /> in without it produces a page that looks
            // completely healthy, sends zero hits, and reports no user-visible
            // error — the measurement baseline this work exists to create,
            // quietly destroyed for however long it took anyone to check. The
            // rest of the stack's needs are already met: `connect-src 'self'
            // https:` covers the collect endpoint and `img-src ... https:` the
            // pixel fallback, so `script-src` was the only blocker, and a total
            // one.
            //
            // GA4 IS NOT MOUNTED YET — it is blocked on the consent gating in
            // #141 and must not fire before consent exists. This entry is the
            // half of W4 that can land safely now, pinned by
            // tests/unit/cspAnalytics.test.js so neither a tightening that
            // breaks GA4 nor a loosening beyond what is needed can pass review
            // unnoticed.
            //
            // Do not broaden this allow-list further without review.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https:",
              "frame-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              // Real WebKit (iOS Safari / Simulator) honours this even for
              // http://localhost, upgrading every asset request to https and
              // rendering the dev site unstyled — so ship it in production
              // only. Chrome exempts localhost, which is why dev testing in
              // Chrome never trips over it.
              ...(process.env.NODE_ENV === 'production'
                ? ['upgrade-insecure-requests']
                : [])
            ].join('; ')
          }
        ]
      }
    ];
  }
};

export default withBundleAnalyzer(nextConfig);
