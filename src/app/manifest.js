// /manifest.webmanifest (issue #32, W1). 404'd in production before this.
//
// Deliberately MINIMAL. This is not a PWA and is not becoming one: there is no
// service worker, no offline strategy and no install prompt worth showing for a
// portfolio. The manifest exists for the things it gives a plain website —
// a proper name and icon when someone adds the site to a phone home screen or
// pins it, and one more machine-readable statement of the site's identity for
// the crawlers that read it.
//
// `display: 'browser'` is the honest declaration for that: `standalone` would
// strip the browser chrome from an installed copy, which for a site whose
// navigation is an orbital ring with no back button is a worse experience, not
// a better one.

import { IDENTITY, ORIGIN } from '@/lib/seo/site';

export const dynamic = 'force-static';

export default function manifest() {
  return {
    name: IDENTITY.name,
    // Home-screen labels truncate around 12 characters on iOS and Android, so
    // the short name is the first name alone rather than a squeezed full name
    // ending in an ellipsis.
    short_name: 'Muhammad',
    description: `${IDENTITY.name} — ${IDENTITY.role}. Portfolio, projects and credentials.`,
    // Absolute so the manifest is valid regardless of the URL it is fetched
    // from — a relative start_url resolves against the MANIFEST's location,
    // which is a common source of installed copies opening the wrong page.
    start_url: `${ORIGIN}/`,
    scope: `${ORIGIN}/`,
    display: 'browser',
    // Both match the `themeColor` already pinned in the root layout's viewport
    // export, so the installed chrome, the mobile browser chrome and the share
    // cards all bake the same dark base. Three consumers, one value — if this
    // ever changes, it changes in src/app/layout.js too.
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    // Matches `<html lang="en">` and the `en_GB` OG locale.
    lang: 'en-GB',
    dir: 'ltr',
    orientation: 'any',
    // The EXISTING file-convention icons (src/app/icon.png, apple-icon.png) —
    // no new assets. Next serves both at their bare paths as well as the
    // build-hashed URLs it puts in the <link> tags, and the bare path is what a
    // manifest needs: a stable URL that does not change every build.
    //
    // `purpose: 'maskable'` is NOT claimed on either. A maskable icon must keep
    // its content inside a safe circle covering ~80% of the canvas, and these
    // are the site seal drawn edge to edge — declaring them maskable would let
    // Android crop the seal's border off. Without the claim the platform pads
    // them instead, which is the correct rendering for art that is not
    // designed for the mask.
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
