import { notFound } from 'next/navigation';

// Unknown paths inside a locale (`/this-does-not-exist`, rewritten by the proxy
// to `/en/this-does-not-exist`) land here and are turned into the localised
// 404 rendered by `[locale]/not-found.js` — inside the locale layout, so the
// visitor keeps their language, fonts and direction on a dead link.
export default function CatchAll() {
  notFound();
}
