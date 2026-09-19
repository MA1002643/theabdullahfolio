// /robots.txt (issue #32, W1 + F7). Generated from the registry in
// src/lib/seo/site.js — the disallow list and the AI-crawler policy both live
// there, so this file is a serialiser and holds no policy of its own.
//
// Before this existed the site had NO robots.txt at all (verified: 404 in
// production). That is not a neutral state. It means every crawler, including
// every AI crawler, was operating under an implicit allow with no sitemap
// pointer and no stated policy — so discovery depended entirely on a crawler
// guessing its way in from the homepage, which (F1) linked to nothing.

import { ORIGIN, AI_CRAWLERS, DISALLOWED_PATHS } from '@/lib/seo/site';

// A static route: nothing here reads the request, so Next renders it once at
// build and serves it from the edge cache.
export const dynamic = 'force-static';

export default function robots() {
  // The rules every crawler gets. Allow the site, keep them out of the JSON
  // and card-render surfaces (neither is content, and a 401 from a cron route
  // is noise in a coverage report).
  const baseRules = {
    allow: '/',
    disallow: DISALLOWED_PATHS,
  };

  return {
    rules: [
      { userAgent: '*', ...baseRules },

      // Explicit AI-crawler stanzas (F7). These are IDENTICAL to the wildcard
      // rules — naming the agents changes nothing technically, and that is the
      // point. The value is that the posture is now written down: this site
      // wants to be read and cited by assistants, so the allow is deliberate
      // rather than inherited by the absence of a file. It is also the hook to
      // tighten: flipping one of these to `disallow: '/'` is a one-line,
      // reviewable change, where noticing that a policy was never stated is
      // not.
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, ...baseRules })),
    ],

    // Absolute, per the sitemap protocol — a relative Sitemap directive is
    // invalid and silently ignored by every consumer.
    sitemap: `${ORIGIN}/sitemap.xml`,

    // Names the canonical host for the crawlers that honour it (Yandex most
    // notably). Belt-and-braces alongside the www→apex 308 in next.config.mjs
    // and the per-route canonicals — three signals, one answer (F2/F3).
    //
    // A HOSTNAME, not a URL. Next serialises this field verbatim
    // (`Host: ${host}`), and the directive's grammar is a host — an absolute
    // URL here is a parse error to the consumers that read it at all, so the
    // one signal this line exists to send would be dropped on the floor. The
    // Sitemap directive above is the opposite case and stays absolute.
    host: new URL(ORIGIN).hostname,
  };
}
