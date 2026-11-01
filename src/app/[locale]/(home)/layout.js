import { setRequestLocale } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';

// The homepage's message scope (issue #82). `page.js` beside this is a Client
// Component, which can neither read the segment params for static rendering
// nor load its own catalogue, so this route group exists for exactly one
// reason: a server layout around `/` and nothing else. `(home)` is a group,
// not a segment, so the URL is unchanged.
export default async function HomeLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <IntlScope locale={locale} route="/">
      {children}
    </IntlScope>
  );
}
