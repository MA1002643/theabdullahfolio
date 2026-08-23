/** @type {import('next').NextConfig} */
const nextConfig = {
  // This repo lives under ~/Desktop, which iCloud Drive syncs. iCloud's
  // file provider churns build artifacts mid-write (random ENOENT, silent
  // dev-server exits — see scripts/dev.mjs for the full failure story).
  // Any folder whose name ends in `.nosync` is excluded from iCloud sync,
  // so keep ALL local build output there. On Vercel there is no iCloud;
  // keep the default `.next` so production builds are untouched.
  distDir: process.env.VERCEL ? ".next" : ".next.nosync",
  // `pdf-parse` (used by /api/experience-summary) depends on `pdfjs-dist`,
  // an ESM bundle that touches browser-style globals (Object.defineProperty
  // on `globalThis`, etc.) that Next's RSC webpack pass mangles. Marking
  // it external tells Next to leave it alone and `require()` it at
  // runtime from node_modules, which is exactly what server functions
  // already do for native modules. Without this the route throws
  // `Object.defineProperty called on non-object` at import time.
  //
  // We deliberately do NOT externalize or bundle `@napi-rs/canvas`. pdfjs
  // would otherwise need it to polyfill `DOMMatrix`, but that native
  // package's platform `.node` binary is loaded via a runtime
  // `createRequire(...)("@napi-rs/canvas")` that @vercel/nft can't trace,
  // so it was missing from the deployed function and the route crashed
  // with "DOMMatrix is not defined" — an empty Employment side (0%) on
  // /about in production. Instead, the parser installs a pure-JS DOMMatrix
  // on `globalThis` before pdfjs loads (see
  // src/utils/experience/domMatrixPolyfill.js). pdfjs keeps that, the
  // canvas require failing becomes a harmless warning, and text extraction
  // runs identically on every platform with no native binary to bundle.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
    // Output File Tracing — explicitly bundle the resume PDF with the
    // experience-summary serverless function. By default, Next only
    // ships files referenced from imports; `public/` assets get
    // deployed to the static layer but are NOT copied into the
    // function's filesystem. Locally `process.cwd()` is the repo root
    // so `fs.readFile` finds the PDF; on Vercel it points to the
    // function bundle, the PDF isn't there, `parseExperienceFromPdf`
    // rejects, and the modal renders an empty Employment side. Listing
    // the file here pulls it into the function bundle so the runtime
    // path resolves identically in prod. In Next 14.x this option
    // lives under `experimental`; it became top-level in Next 15+.
    outputFileTracingIncludes: {
      "/api/experience-summary": [
        "./public/Muhammad_Abdullah_CV.pdf",
        // pdfjs-dist sets up a main-thread "fake worker" by dynamically
        // importing its worker bundle at runtime — an import @vercel/nft
        // can't statically trace, so the file was absent from the deployed
        // function (/var/task) and getText() failed in production with
        // `Setting up fake worker failed: Cannot find module
        // .../pdf.worker.mjs`. pdf-parse v2 loads the *legacy* build (see
        // the error's import path), so trace that worker explicitly. This
        // is a separate gap from the DOMMatrix polyfill: the polyfill let
        // parsing advance to the point where the worker is needed, which
        // is what surfaced this. Both .mjs and .min.mjs are listed so the
        // trace is robust to whichever pdf-parse resolves at runtime.
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      ],
    },
  },
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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // https://va.vercel-scripts.com — required by @vercel/analytics
            // and @vercel/speed-insights to load their telemetry scripts.
            // Do not broaden this allow-list further without review.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com",
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

export default nextConfig;
