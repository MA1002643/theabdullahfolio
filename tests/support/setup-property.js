import fc from 'fast-check';

import { runs } from './fastCheckRuns.js';

// The default for every property that does not name its own count: fast-check's
// own 100 on an ordinary run, raised to FC_RUNS during a soak. See
// ./fastCheckRuns.js for why the soak has to reach every suite.
fc.configureGlobal({ numRuns: runs(100) });
