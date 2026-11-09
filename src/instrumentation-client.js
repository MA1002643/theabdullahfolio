// Runs once in the browser, after the HTML has loaded and BEFORE React hydrates
// (Next.js's `instrumentation-client` convention). Keep it tiny: it is part of
// every page's first load.
import { installNumberingAlignment } from '@/i18n/numberingAlignment';

// An engine whose ICU picks different default digits from the server's would
// otherwise hydrate every number differently from the HTML (React #418, issue
// #198). A no-op wherever the engine already agrees, which is nearly everywhere.
try {
  installNumberingAlignment(window);
} catch {
  // Never let a formatting nicety stop the page from hydrating.
}
