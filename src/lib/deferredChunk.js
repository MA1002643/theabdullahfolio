import { optionalChunk } from './optionalChunk';

// A chunk that is fetched AHEAD of need instead of on first render (issue #55).
//
// The modules this is for (a dialog, the page-transition runtime) are never on
// screen when a page first paints, so they have no business in its first-load
// JS. But they do have to be ready the moment the visitor reaches for them:
// a dialog that opens a beat late reads as broken. So the chunk is split out of
// the route and then warmed early, in idle time or on intent (pointer over,
// focus, touch on the control that opens it), the way <Link> prefetches a
// route.
//
//   const modal = deferredChunk(() => import('./Modal'), 'Modal');
//   const Modal = dynamic(modal.loader, { ssr: false });
//   …
//   <button onPointerOver={modal.preload} onFocus={modal.preload}>
//
// `preload` is idempotent and safe to call from any handler: the first call
// starts the download, later calls share it. A failed download is forgotten
// rather than cached, so the next call (or the render itself) tries again. A
// connection that drops one request should not disable a dialog for the rest
// of the visit.
//
// `loader` goes through `optionalChunk`, so if the chunk still cannot load
// when it is rendered, the component renders nothing and the page stays whole.
// Every module this wraps is one the page is complete without.
//
// Keep the `import()` inside the call, next to its consumer: a static import of
// the same module anywhere else pulls it straight back into the first load,
// which tests/fitness/deferredChunks.test.js exists to catch.

/**
 * @template M
 * @param {() => Promise<M>} load the `import()` call.
 * @param {string} label named in the warning if the chunk cannot load.
 * @param {(module: M) => unknown} [pick] which export is the component, when it
 *   is not the default one.
 */
export function deferredChunk(load, label, pick = (module) => module.default) {
  let pending = null;

  const preload = () => {
    if (!pending) {
      pending = load().catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  return {
    /** Starts (or joins) the download. Never rejects. */
    preload: () => {
      preload().catch(() => {});
    },
    /** The same download, for a caller that needs the module itself. */
    load: preload,
    /** A `next/dynamic` loader that degrades to rendering nothing. */
    loader: optionalChunk(() => preload().then((module) => ({ default: pick(module) })), label),
  };
}
