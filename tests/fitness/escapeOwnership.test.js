import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// Every Escape owner claims the key (issue #92).
//
// The privacy notice declines analytics on an Escape that nothing else used,
// and "used" means `claimEscape(event)` (src/lib/escapeKey.js). A new popover
// that closes on Escape without claiming it would make one press close the
// popover AND decline consent, which is the bug this rule was written for (the
// 404 page's go-home shortcut, the about-page popovers, the orbit tip). This
// keeps the next Escape handler from quietly reintroducing it.

const SOURCES = walk('src', /\.(m?js|jsx)$/);
const HANDLES_ESCAPE = /\.key\s*(?:===|!==)\s*['"]Escape['"]/;

describe('Escape ownership', () => {
  it('every source that handles Escape claims it through src/lib/escapeKey.js', () => {
    const offenders = SOURCES.filter((file) => {
      if (file === 'src/lib/escapeKey.js') return false;
      const code = stripComments(read(file));
      return HANDLES_ESCAPE.test(code) && !/\bclaimEscape\(/.test(code);
    });
    expect(
      offenders,
      'Call claimEscape(event) from "@/lib/escapeKey" wherever Escape is acted on, ' +
        'or the privacy notice will also read that press as a decline.',
    ).toEqual([]);
  });

  it('the notice decides only after dispatch, never on the spot', () => {
    const code = stripComments(read('src/components/privacy/PrivacyNotice.jsx'));
    expect(code).toMatch(/afterUnclaimedEscape\(event,/);
  });
});
