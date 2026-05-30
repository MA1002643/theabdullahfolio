/** @type {import('next').NextConfig} */
const nextConfig = {
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
              "upgrade-insecure-requests"
            ].join('; ')
          }
        ]
      }
    ];
  }
};

export default nextConfig;
