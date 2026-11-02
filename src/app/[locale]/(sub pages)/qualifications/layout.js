import { journeyData } from '@/app/data';
import JsonLd from '@/components/seo/JsonLd';
import { setRequestLocale } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { routeCopy, routeMetadata } from '@/lib/og/meta';
import { qualificationsPage } from '@/lib/seo/schema';
import { credentialsFromJourney, routeFor } from '@/lib/seo/site';

const ROUTE = routeFor('/qualifications');

// qualifications/page.js is a Client Component and cannot export metadata
// itself, so this pass-through layout owns the route's title/OG fields
// (issue #88 v2). The share image lives beside it as opengraph-image.js.
//
// Title and description come from the route registry (issue #32, W7).
export function generateMetadata({ params }) {
  return routeMetadata(ROUTE.path, params);
}

export default async function QualificationsLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = await routeCopy(ROUTE.path, locale);
  return (
    <IntlScope locale={locale} route={ROUTE.path}>
      {/* EducationalOccupationalCredential records, attached to `#person` via
          `hasCredential` (issue #32, W2). The attachment is the point: a bare
          list of credentials with no holder is unattributable, and what a
          recruiter's assistant needs to answer is "does this person hold a
          software engineering degree", not "does a degree exist".

          Derived from `journeyData`, NOT from the carousel this layout wraps.
          The carousel's `CARDS` array is the more obvious source and cannot be
          used: it lives inside a `'use client'` module (exported only for a test), and
          carries only a title, a category and an image path — no awarding body
          and no date, which is the half of a credential that makes it
          checkable. See `credentialsFromJourney` for the full reasoning,
          including why study still IN PROGRESS is left out entirely —
          `hasCredential` means "awarded to", so the in-flight BSc belongs here
          only once it is conferred, at which point it appears by itself. */}
      <JsonLd
        id="ld-qualifications"
        data={qualificationsPage(credentialsFromJourney(journeyData), { locale, name: copy.title })}
      />
      {children}
    </IntlScope>
  );
}
