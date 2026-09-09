import { describe, expect, it, vi } from 'vitest';

// The 404's metadata shipped wrong twice over (issue #43): it restated the
// site name in `title`, which the root layout's `%s · Muhammad Abdullah`
// template then stamped a SECOND time — the page rendered as
// "404 — Page Not Found | theabdullahfolio · Muhammad Abdullah", with a
// retired repo name standing in for the site's display name and a pipe
// where every other route uses a middot. Nothing caught it because the
// composed title only exists once Next has applied the template; the
// source string on its own looks plausible.
//
// These cases pin the two properties that keep it right: the title stays
// BARE (the template owns the suffix), and the file declares no openGraph
// or twitter block — Next merges metadata shallowly, so declaring either
// would replace the root layout's whole object and take the share images
// down with it.

// NotFoundClient is a client component pulling in the whole 404 scene; the
// metadata export is a plain object beside it and needs none of that.
vi.mock('@/components/not-found/NotFoundClient', () => ({
  default: () => null,
}));

// Mirrors src/app/layout.js — kept literal so a change to the real
// template has to be made here too, deliberately.
const TEMPLATE = '%s · Muhammad Abdullah';
const compose = (title) => TEMPLATE.replace('%s', title);

describe('404 metadata', () => {
  it('composes to a single, correctly separated title', async () => {
    const { metadata } = await import('@/app/not-found');

    expect(compose(metadata.title)).toBe('404 — Page Not Found · Muhammad Abdullah');
  });

  it('leaves the site name to the template rather than restating it', async () => {
    const { metadata } = await import('@/app/not-found');

    expect(metadata.title).not.toMatch(/Muhammad Abdullah/);
    // The repository is named theabdullahfolio; the SITE is not. It must
    // never surface in page chrome.
    expect(metadata.title).not.toMatch(/theabdullahfolio/i);
    // A middot arrives only from the template, so a separator in the raw
    // string means the suffix is being hand-rolled again.
    expect(metadata.title).not.toMatch(/[|·]/);
  });

  it('still describes the page', async () => {
    const { metadata } = await import('@/app/not-found');

    expect(metadata.description).toBeTruthy();
  });

  it("declares no openGraph, twitter or robots key — the root card is inherited whole, and noindex stays Next's to set", async () => {
    const { metadata } = await import('@/app/not-found');

    // Shallow merge: any object here REPLACES the root layout's, dropping
    // the images array (both the 1200x630 card and the square WhatsApp
    // companion) and siteName/type/locale with it.
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.twitter).toBeUndefined();
    // Next marks not-found `noindex` on its own; a robots key here would
    // only be a second, drifting source of truth.
    expect(metadata.robots).toBeUndefined();
  });
});
