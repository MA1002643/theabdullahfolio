import { useCallback, useEffect, useState } from 'react';
import { whenIdle } from '@/lib/whenIdle';

// When to mount a component whose chunk is deferred (issue #55).
//
// Takes a `deferredChunk` and returns `[ready, request]`:
//
//   ready    false until the chunk has been fetched; mount the component then.
//   request  starts the fetch. Bind it to the intent events of whatever opens
//            the component (pointer over, focus, touch) and call it on open.
//
// The fetch also starts by itself in idle time, so by the time a visitor
// reaches for a dialog it is almost always already here. Mounting only once
// the chunk is in hand, rather than on first render, is what keeps
// `next/dynamic` from fetching it during hydration: a lazy component starts
// its import the moment it is rendered.
//
// A failed fetch still reports ready. The component then renders through
// optionalChunk, which tries once more and renders nothing if that fails too:
// the page is whole without it.

export function useDeferredMount(chunk) {
  const [ready, setReady] = useState(false);

  const request = useCallback(() => {
    const done = () => setReady(true);
    chunk.load().then(done, done);
  }, [chunk]);

  useEffect(() => whenIdle(request), [request]);

  return [ready, request];
}
