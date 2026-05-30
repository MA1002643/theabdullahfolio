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
  // `@napi-rs/canvas` MUST be externalized too. In Node, pdfjs-dist
  // self-polyfills the DOM globals it needs (DOMMatrix, ImageData,
  // Path2D) by loading `@napi-rs/canvas` via
  // `createRequire(import.meta.url)("@napi-rs/canvas")`. Next's
  // dependency tracer (@vercel/nft) can't statically resolve that
  // runtime-created `require`, so without listing it here the package
  // and its native `.node` binary are never copied into the deployed
  // function. The require then throws, pdfjs only `warn()`s ("Cannot
  // polyfill DOMMatrix"), and the next `new DOMMatrix` during text
  // extraction throws "DOMMatrix is not defined" — which surfaces as an
  // empty Employment side (0%) on /about in production while working
  // fine locally (where the platform binary is already hoisted).
  // Listing it forces Next to externalize + bundle it with its binary.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
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
        // @napi-rs/canvas + its platform binary aren't statically
        // discoverable by @vercel/nft: pdfjs-dist resolves them at
        // runtime via `createRequire(import.meta.url)("@napi-rs/canvas")`,
        // and serverComponentsExternalPackages alone wasn't enough to
        // pull the *Linux* platform binary into the function bundle —
        // a real preview deployment was returning
        // `pdfStatus: { message: "DOMMatrix is not defined" }` and an
        // empty employment side. Explicitly globbing the JS shim AND
        // the linux-x64-gnu binary subpackage forces the tracer to
        // copy them. linux-x64-gnu matches Vercel's Amazon Linux 2
        // build target; switch the suffix if a project moves to
        // arm64 or a musl runtime.
        "./node_modules/@napi-rs/canvas/**/*",
        "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
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
