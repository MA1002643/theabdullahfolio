import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { loadMessages, pickMessages } from './messages';
import { GLOBAL_NAMESPACES, ROUTE_NAMESPACES } from './namespaces';

/**
 * Hands the client exactly the messages a subtree renders (issue #82, the
 * 8 kB-per-locale budget).
 *
 * next-intl's providers REPLACE rather than merge, so a nested provider must
 * restate the global namespaces its subtree still reads (the toaster, the
 * palette). Only the route's own namespaces are new bytes; the global set is
 * small and is what every page already carries.
 *
 * `locale` is passed explicitly wherever the caller has it (every `[locale]`
 * layout and page does): reading it from the request instead would be a
 * header read, which opts the page out of static rendering.
 *
 * @param {{locale?: string, route?: keyof typeof ROUTE_NAMESPACES, namespaces?: string[], children: React.ReactNode}} props
 */
export default async function IntlScope({ locale: given, route, namespaces = [], children }) {
  const locale = given ?? (await getLocale());
  const messages = await loadMessages(locale);
  const wanted = [
    ...GLOBAL_NAMESPACES,
    ...(route ? (ROUTE_NAMESPACES[route] ?? []) : []),
    ...namespaces,
  ];
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, [...new Set(wanted)])}
    >
      {children}
    </NextIntlClientProvider>
  );
}
