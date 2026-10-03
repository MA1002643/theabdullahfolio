// A lazily loaded component that is allowed to fail (issue #92).
//
// `next/dynamic(() => import(...))` re-throws a failed chunk load during render,
// and with no error boundary in the way that exception unmounts the whole
// route: the visitor is left with Next's bare "Application error: a
// client-side exception has occurred". The chaos suite
// (tests/e2e/resilience.spec.js) proved it on 2026-09-28: blocking the
// deferred three.js chunk after first paint, which is exactly what a flaky
// phone connection or a CDN blip does, blanked /contact and /about entirely,
// contact form included, for the sake of a decorative background.
//
// Wrap an import in `optionalChunk` when the page is still whole without it.
// A failed load then resolves to a component that renders nothing, the static
// fallback already painted behind it stays, and a warning (not an error) is
// logged so the failure is still visible to anyone looking.

const Nothing = () => null;

/**
 * @param {() => Promise<{ default: unknown }>} load the `import()` call.
 * @param {string} label named in the warning when the chunk cannot load.
 * @returns {() => Promise<{ default: unknown }>} a loader for next/dynamic.
 */
export function optionalChunk(load, label) {
  return () =>
    load().catch((error) => {
      // The error's NAME only (ChunkLoadError, TypeError), never the object:
      // tests/unit/apiErrorLogBoundary.test.js holds every logged error to the
      // redaction boundary, and a name carries no URL or configuration.
      console.warn(`[optionalChunk] ${label} could not load; rendering without it.`, error?.name ?? 'Error');
      return { default: Nothing };
    });
}
