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
// Ready means the import SUCCEEDED, never merely that it settled. Mounted
// after a failure, `next/dynamic` would render through optionalChunk's empty
// fallback and cache it, and the component would stay blank for the rest of
// the visit even once a later fetch got the real module. A failure leaves
// `ready` false instead; deferredChunk forgets it, so the next request (the
// next hover, focus, touch or open) downloads again.

export function useDeferredMount(chunk) {
  const [ready, setReady] = useState(false);

  const request = useCallback(() => {
    chunk.load().then(
      () => setReady(true),
      () => {},
    );
  }, [chunk]);

  useEffect(() => whenIdle(request), [request]);

  return [ready, request];
}
