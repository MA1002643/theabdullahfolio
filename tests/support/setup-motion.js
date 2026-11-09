import { vi } from 'vitest';

import { withFullMotion } from './motionDouble.js';

// Shared by the `unit` and `component` projects: `m` renders as the full
// `motion` outside the root layout's <LazyMotion>. Why, in ./motionDouble.js.
vi.mock('framer-motion', async (importOriginal) => withFullMotion(await importOriginal()));
