import Image from 'next/image';
import bg from '../../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import UsesBench from '@/components/uses';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { routeCopy, routeMetadata } from '@/lib/og/meta';
import JsonLd from '@/components/seo/JsonLd';
import { sectionPage } from '@/lib/seo/schema';
import { routeFor } from '@/lib/seo/site';

// Route registry entry — the single source for this route's title,
// description, sitemap entry and JSON-LD (issue #32, W1/W7).
const ROUTE = routeFor('/uses');
import { readBuildFacts } from '@/lib/uses/buildFacts';
import { CURATED_TOOL_COPY } from '@/lib/uses/curatedToolCopy';

// Server component on purpose (the /journey pattern): metadata exports live
// here, the build-time facts are read here with synchronous `fs` (so
// node:fs never reaches a client bundle and the route stays static), and all
// interactivity sits behind the 'use client' boundary in @/components/uses.
export function generateMetadata({ params }) {
  return routeMetadata(ROUTE.path, params);
}

export default async function UsesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = await routeCopy(ROUTE.path, locale);
  // Read once at build. Static route: no dynamic APIs are touched here.
  const facts = readBuildFacts();
  const t = await getTranslations({ locale, namespace: 'Uses' });

  return (
    // Fragment, not <main>: the (sub pages) layout already provides the one
    // <main> landmark (issue #86 — nested <main> is invalid HTML).
    <IntlScope locale={locale} route={ROUTE.path} namespaces={CURATED_TOOL_COPY}>
      {/* WebPage + BreadcrumbList (issue #32, W2). Declares this route as part
          of the site and about `#person`, and gives it the Home → here trail
          the project pages get. Built from the same registry entry the title
          and the sitemap read, so the three cannot disagree. */}
      <JsonLd
        id="ld-uses"
        data={sectionPage({
          path: ROUTE.path,
          name: copy.title,
          description: copy.description,
          locale,
        })}
      />
      {/* Backdrop trio shared with /about, /contact, /journey and /my-past:
          the still at half opacity, a black dimmer, then the cursor-reactive
          aurora composited over the top. `alt=""` marks it decorative. */}
      <Image
        src={bg}
        alt=""
        loading="eager"
        fetchPriority="low"
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
      <AuroraDustMount />

      <PageTitle title={t('page.title')} subtitle={t('page.subtitle')} replayOnView />

      <UsesBench facts={facts} />
    </IntlScope>
  );
}
