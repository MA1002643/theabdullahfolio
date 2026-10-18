import { afterAll, afterEach, beforeAll } from 'vitest';

import { MSW_LISTEN_OPTIONS, server } from './msw/server.js';

// Setup for the `api` Vitest project (issue #92, L4): route handlers invoked
// directly, every outbound request answered by MSW or failed loudly.
beforeAll(() => server.listen(MSW_LISTEN_OPTIONS));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
