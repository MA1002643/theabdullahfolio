/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pdf-parse` (used by /api/experience-summary) depends on `pdfjs-dist`,
  // an ESM bundle that touches browser-style globals (Object.defineProperty
  // on `globalThis`, etc.) that Next's RSC webpack pass mangles. Marking
  // it external tells Next to leave it alone and `require()` it at
  // runtime from node_modules, which is exactly what server functions
  // already do for native modules. Without this the route throws
  // `Object.defineProperty called on non-object` at import time.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
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
