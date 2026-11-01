import { describe, expect, it } from 'vitest';

import { read, stripComments } from '../support/source.js';

// Nothing interactive outside the intro loader's `inert` boundary (issue #92).
//
// While the opaque intro loader covers the page, LoaderWrapper marks everything
// it wraps `inert`, so nothing beneath can take keyboard focus (WCAG 2.4.11).
// That only protects what is INSIDE it. FloatingSoundToggle and NowPlaying
// were rendered beside it in the root layout, so on a touch device the sound
// button could be focused under the loader (#92 review). A browser test cannot
// catch a regression here on its own: on the hermetic test server neither
// control renders (no Spotify credentials, no track playing), so this reads
// the layout instead.

// The document shell moved into the locale segment in issue #82; the root
// `src/app/layout.js` is a pass-through with no providers.
const LAYOUT = 'src/app/[locale]/layout.js';

// Every root-layout component that renders something a visitor can focus.
// Purely visual overlays (GlobalToaster, whose action toasts only follow a
// visitor's own action after the reveal; CustomCursor) are not listed.
const INTERACTIVE_OVERLAYS = ['PrivacyGate', 'FloatingSoundToggle', 'NowPlaying'];

describe('intro loader inert boundary', () => {
  const code = stripComments(read(LAYOUT));
  const open = code.indexOf('<LoaderWrapper>');
  const close = code.indexOf('</LoaderWrapper>');

  it('finds the boundary in the root layout', () => {
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
  });

  it.each(INTERACTIVE_OVERLAYS)('renders %s inside LoaderWrapper', (name) => {
    const at = code.indexOf(`<${name}`);
    expect(at, `${name} is not rendered in ${LAYOUT}`).toBeGreaterThan(-1);
    expect(
      at > open && at < close,
      `${name} renders outside <LoaderWrapper>, so it can take focus beneath the opaque intro loader`,
    ).toBe(true);
  });
});
