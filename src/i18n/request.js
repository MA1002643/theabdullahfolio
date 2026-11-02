import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { loadMessages } from './messages';
import { routing } from './routing';

// next-intl's per-request configuration, wired in by the plugin in
// next.config.mjs. `requestLocale` comes from `setRequestLocale()` in the
// `[locale]` layouts/pages during static rendering, so nothing here reads
// headers and every locale × page stays prerenderable.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  return {
    locale,
    messages: await loadMessages(locale),
    // A fixed zone, not the visitor's: server and client must format a date
    // identically or hydration mismatches. The site's dates are UK dates
    // (roles, awards, commits shown as relative times), so London is the
    // honest zone to state them in.
    timeZone: 'Europe/London',
  };
});
