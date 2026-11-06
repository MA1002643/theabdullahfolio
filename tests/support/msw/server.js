import { setupServer } from 'msw/node';

import { defaultHandlers } from './handlers.js';

// The one MSW server every Vitest layer that talks HTTP shares (issue #92, L3/L4).
//
// `onUnhandledFrame: 'error'` is the point of it. A request no handler claims
// is a test reaching the real internet — GitHub, Abstract, Spotify — which is
// slow, rate-limited, flaky, and on a route holding a credential, a way to spend
// that credential from CI. Rather than let it through with a warning nobody reads,
// the request fails and names its URL, so a suite that forgot to stub a call is
// caught by the suite, not by a quota email.
//
// msw 3 renamed the option from `onUnhandledRequest` and ignores the old name
// without a word, falling back to 'warn'. `tests/api/mswHermetic.test.js`
// checks the behaviour, so a rename like that fails a test, not just a comment.
//
// Suites register what they need with `server.use(...)` inside a test; the setup
// file resets those overrides after every test so no case can leak a handler
// into the next.
export const server = setupServer(...defaultHandlers);

export const MSW_LISTEN_OPTIONS = { onUnhandledFrame: 'error' };
