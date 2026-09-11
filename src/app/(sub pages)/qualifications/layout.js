import { journeyData } from '@/app/data';
import JsonLd from '@/components/seo/JsonLd';
import { sectionMetadata } from '@/lib/og/meta';
import { qualificationsPage } from '@/lib/seo/schema';
import { credentialsFromJourney, routeFor } from '@/lib/seo/site';

const ROUTE = routeFor('/qualifications');

// qualifications/page.js is a Client Component and cannot export metadata
// itself, so this pass-through layout owns the route's title/OG fields
// (issue #88 v2). The share image lives beside it as opengraph-image.js.
//
// Title and description come from the route registry (issue #32, W7).
export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

export default function QualificationsLayout({ children }) {
  return (
    <>
      {/* EducationalOccupationalCredential records, attached to `#person` via
          `hasCredential` (issue #32, W2). The attachment is the point: a bare
          list of credentials with no holder is unattributable, and what a
          recruiter's assistant needs to answer is "does this person hold a
          software engineering degree", not "does a degree exist".

          Derived from `journeyData`, NOT from the carousel this layout wraps.
          The carousel's `CARDS` array is the more obvious source and cannot be
          used: it lives inside a `'use client'` module, is not exported, and
          carries only a title, a category and an image path — no awarding body
          and no date, which is the half of a credential that makes it
          checkable. See `credentialsFromJourney` for the full reasoning,
          including why the START of study dates each record rather than a
          completion that, for the BSc, has not happened yet. */}
      <JsonLd
        id="ld-qualifications"
        data={qualificationsPage(credentialsFromJourney(journeyData))}
      />
      {children}
    </>
  );
}
