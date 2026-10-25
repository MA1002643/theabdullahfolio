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
  // No `X-Powered-By: Next.js` (issue #92, found by tests/security/headers.spec.js).
  // Advertising the framework hands a scanner the exact exploit list to try
  // and tells a visitor nothing.
  poweredByHeader: false,
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
  // Removing them here was only half the weight, and the half a reader of this
  // file would assume was all of it: `pdf-parse` stayed in `dependencies`, so
  // every production install still fetched it and `pdfjs-dist` whether or not
  // anything traced them into a bundle. Its only remaining importer is
  // src/utils/experience/pdfExperienceParser.js, which only the two CV fixtures
  // import, so it now sits in `devDependencies` — and `npm ci --omit=dev`
  // leaves the whole pdfjs subtree out (25 packages marked `dev` in the lock).
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
    // Next 16 allows only quality 75 unless told otherwise, and coerces any
    // other `quality` prop to the nearest allowed value. The homepage hero
    // asks for 100 (src/app/page.js), so 100 is listed to keep it lossless.
    qualities: [75, 100],
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
        // ── The CV PDF canonicalises to /cv (owner call 2026-09-26) ────────
        // This header used to be `X-Robots-Tag: index, follow, …` — the CV was
        // indexable by decision (F6, 2026-09-11). Search Console then reported
        // the PDF as "Duplicate without user-selected canonical": /cv renders
        // the same record in HTML, Google clustered the two, and the PDF was
        // the only member of the cluster that said nothing about which copy
        // was the original. F6 was superseded rather than patched with a
        // self-canonical, which Google would likely have overruled anyway.
        //
        // A PDF cannot carry `<link rel="canonical">`, so the declaration goes
        // in the HTTP `Link` header — the form Google documents for non-HTML
        // files. /cv is the page with the share card, the JSON-LD and the
        // footer, and the PDF stays one click away from it. The PDF is also out
        // of the sitemap (src/app/sitemap.js): listing a URL whose canonical
        // points elsewhere is a contradiction Search Console reports.
        //
        // NOT noindex: noindex plus a canonical are conflicting signals, and
        // the canonical alone is what consolidates the PDF's links onto /cv.
        //
        // Absolute URL, derived the same way as `ORIGIN` in src/lib/seo/site.js
        // (this file cannot import through the `@/` alias).
        source: '/Muhammad_Abdullah_CV.pdf',
        headers: [
          {
            key: 'Link',
            value: `<${(process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://ma.codes').replace(/\/+$/, '')}/cv>; rel="canonical"`,
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          // ── Baseline hardening (issue #92) ──────────────────────────────
          // Found missing by tests/security/headers.spec.js, which asserts
          // what the production server SENDS: until then the CSP below was
          // the only security header on the site.
          //
          // nosniff: a response is only ever run as the type it declares, so
          // a mis-typed or user-influenced file is never executed as script
          // because a browser guessed.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Cross-origin requests carry the origin only, never the full URL
          // (a guestbook deep link, a query string). Same-origin keeps the
          // path, which the site's own analytics need.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Powerful features the site never uses, switched off for every
          // frame, so an injected script cannot prompt for them either. The
          // live-location line is SERVER-side (OwnTracks ingest), never the
          // browser's geolocation API, so `geolocation=()` costs nothing.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
          },
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
