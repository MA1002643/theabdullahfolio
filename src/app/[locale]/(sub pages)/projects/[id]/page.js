import { getTranslations, setRequestLocale } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import IntlScope from "@/i18n/IntlScope"
import { notFound } from "next/navigation"
import { projectsData } from "@/app/data"
import { sectionMetadata } from "@/lib/og/meta"
import JsonLd from "@/components/seo/JsonLd"
import { projectPage } from "@/lib/seo/schema"
import { languagesFor } from "@/lib/seo/projectLanguages"
import { localizedProjectMetaDescription } from "@/lib/seo/projectMeta"
import { getDataT } from "@/i18n/getDataT"
import { localizeProject } from "@/i18n/data"
import CaseStudy from "@/components/case-study/CaseStudy"
import Backdrop from "@/components/case-study/Backdrop"
import { siblingsOf } from "@/lib/caseStudy/chapters"
import { assertProjectSlugs, projectBySlug, projectPath, projectSlug } from "@/lib/projects/paths"

// Server Component on purpose. Since issue #31 the page is a long-read case
// study (src/components/case-study/): every word is server HTML, and only the
// motion, the chapter index and the palette commands are client islands.
// Keep heavy client imports out of this route; anything large a chapter needs
// is deferred (CLAUDE.md §5).

// The URL segment is the project's SLUG, not its numeric id: /projects/
// theabdullahfolio, not /projects/1 (src/lib/projects/paths.js). The folder
// keeps its `[id]` name because route patterns elsewhere (the registry, the
// message budget, the tests) are keyed on `/projects/[id]`; read the param as
// "the project's identifier in the URL". The old numeric URLs answer a
// permanent redirect from next.config.mjs.
//
// Every project page is knowable at build time — prerender them all so the
// navigation serves static HTML instead of rendering on demand. A slug that
// collides or needs escaping fails the build here.
export function generateStaticParams() {
    assertProjectSlugs(projectsData)
    return projectsData.map((p) => ({ id: projectSlug(p) }))
}

// Reject params outside generateStaticParams at the ROUTING layer. This is
// what keeps /projects/abc answering HTTP 404 now that loading.js exists:
// with a segment-level Suspense fallback, streaming commits the 200 status
// as soon as the shell flushes, so a notFound() thrown later inside the
// suspended segment can no longer change the status code. dynamicParams=false
// short-circuits before any streaming starts. The in-component validation
// below stays as defense-in-depth (and documents the canonical-URL rules).
export const dynamicParams = false

// Per-project share metadata (issue #88 v2): the title flows through the
// root layout's `%s · Muhammad Abdullah` template, and the OG/Twitter
// fields pair with the build-time poster in opengraph-image.js beside
// this file. Same shallow-merge rule as the section pages: openGraph is
// restated wholesale via the shared helper so siteName/type/locale
// survive the page-level override.
export async function generateMetadata({ params }) {
    const { id: slug, locale } = await params
    const project = projectBySlug(projectsData, slug)
    if (!project) return {}
    return sectionMetadata({
        locale,
        title: project.name,
        // COMPOSED, not `project.description` (issue #32, W7). That field is a
        // four-word card subtitle — ~36 characters — which as a SERP
        // description is short enough that Google discards it and substitutes
        // scraped page text instead. It also cannot simply be lengthened: it is
        // the /projects card subtitle AND the ProjectIntro headline subtitle
        // below, both sized around four words. So the meta description is built
        // from the record's own facts instead. See src/lib/seo/projectMeta.js.
        // Non-English locales (issue #82) compose the same facts through a
        // ProjectDetail template; English is the unchanged sentence.
        description: localizedProjectMetaDescription(project, {
            locale,
            t: await getTranslations({ locale, namespace: "ProjectDetail" }),
            dataT: await getDataT(locale),
        }),
        path: projectPath(project),
    })
}

export default async function ProjectDetailPage({ params }) {
    // `params` is a Promise from Next 15.
    const { id: slug, locale } = await params
    setRequestLocale(locale)
    // An EXACT slug match: every project has one canonical URL, so a
    // differently-cased or padded form (/projects/AfaaqX, /projects/culina-)
    // is not a second address for the same page. dynamicParams=false already
    // rejects those at routing; this stays as defense in depth.
    const project = projectBySlug(projectsData, slug)

    // Unknown project (e.g. /projects/nope, /projects/9999). `notFound()`
    // throws NEXT_NOT_FOUND which bubbles up to the root
    // app/not-found.js boundary, so the user lands on the void
    // /glitch 404 with the correct HTTP 404 status, and the
    // analytics `404_hit` event fires automatically. Replaces the
    // previous inline "Project not found." div which returned
    // HTTP 200 and was indexable by search engines.
    if (!project) {
        notFound()
    }

    // ── Sibling projects, for the crawl graph and for screen readers ────────
    // Issue #32, F8: these eleven pages were reachable ONLY from the /projects
    // listing. No sitemap, no cross-links, no breadcrumbs — so one crawl hiccup
    // on the listing page left the entire project corpus undiscovered.
    //
    // The sitemap now declares all eleven, which fixes discovery. These links
    // fix the other half: a crawl path BETWEEN siblings, and internal link
    // equity flowing along it rather than dead-ending.
    //
    // Wrapped so the last project links to the first and vice versa. Modulo, not
    // a clamp: a clamp would make projects 1 and 11 each have only one
    // neighbour, and those two are precisely the pages a listing-page failure
    // would strand.
    // (The project's outbound links, with the private-repository rule, are
    // built in CaseStudy.jsx since issue #31.)

    // Translated copy (issue #82). The project NAME is a proper name and is
    // never translated; the four-word description is, through the generated
    // Data catalogue (English returns the data.js literal untouched).
    const t = await getTranslations({ locale, namespace: "ProjectDetail" })
    const dataT = await getDataT(locale)
    const description = localizeProject(project, dataT).description

    const { previous, next } = siblingsOf(projectsData, project)

    return (
        <IntlScope locale={locale} route="/projects/[id]">
            {/* ── SoftwareSourceCode + BreadcrumbList (issue #32, W2) ───────
                `SoftwareSourceCode` rather than `SoftwareApplication`: these are
                repositories, and `codeRepository` — the property carrying the
                most weight here — belongs to that type. A private project
                contributes no `codeRepository` at all rather than a URL that
                answers 404 to every reader.

                `programmingLanguage` now comes from the committed map in
                src/data/project-languages.json — the build-safe source the
                original omission note said the builder would accept. It is
                still NOT /api/github-skills: `next build` makes no network call
                and reads no secret here, it opens a JSON file. The refresh is
                an explicit script run whose diff is reviewed in a PR, so a
                changed language list is visible rather than silently baked in.
                Private projects and unrefreshed ones resolve to undefined and
                the property is pruned, exactly as before (P4). */}
            <JsonLd
                id="ld-project"
                data={projectPage(project, {
                    programmingLanguage: languagesFor(project),
                    locale,
                    description,
                    crumbs: {
                        home: t("breadcrumbs.home"),
                        projects: t("breadcrumbs.projects"),
                    },
                })}
            />

            {/* Crawlable sibling navigation. `sr-only`, for the same reason and
                with the same justification as the homepage summary: this route
                renders a fixed full-screen 3D scene whose only text is the
                project name and subtitle, so a screen-reader user currently
                reaches it and has no way to move to another project — the
                floating ProjectsBtn is the single exit. This nav is a real
                accessibility affordance that crawlers also read, which is the
                opposite of cloaking (nothing here is hidden FROM users; it is
                surfaced to users a visual control does not serve).

                Plain `next/link`, not TransitionLink: these are out-of-view
                links a keyboard or crawler follows directly, and the Sigil
                Passage transition is choreography for a visible click.

                `sr-only` ALONE WAS A BUG, caught in review. These three links
                are focusable, so a sighted keyboard user could tab onto them
                while they were clipped to a 1px box — no visible focus, no idea
                which link or where it led, on a route whose scene offers almost
                no other tab stops to orient against. That is a WCAG 2.4.7
                failure: the screen-reader case was served and the keyboard-only
                case was not.
                `.project-sibling-nav` reveals the panel on `:focus-within` and
                gives each link a visible focus ring — see the rule in
                globals.css for why it must be `fixed` rather than `static`. */}
            <nav
                aria-label={t("siblingNav.label")}
                className="project-sibling-nav sr-only custom-bg"
            >
                {/* `prefetch={false}` on all three: this panel is `sr-only`
                    until `:focus-within`, so it is in the viewport on every
                    visit and reachable by no pointer. Next's default viewport
                    prefetch therefore warmed the listing plus both sibling
                    routes for EVERY visitor, to serve links only keyboard and
                    AT users can reach — three extra RSC round-trips on a page
                    that is already loading a 3D scene.
                    It stays crawlable (the `href`s are server-rendered, which
                    is the whole point of this nav) and stays fast for the
                    people who use it: `prefetch={false}` only stands down the
                    viewport prefetch, so hover and touch still warm the route
                    on intent. Same call as HomeBtn/ProjectsBtn/ReturnPortal. */}
                <Link href="/projects" prefetch={false}>
                    {t("siblingNav.all")}
                </Link>
                <Link href={projectPath(previous)} prefetch={false}>
                    {t("siblingNav.previous", { name: previous.name })}
                </Link>
                <Link href={projectPath(next)} prefetch={false}>
                    {t("siblingNav.next", { name: next.name })}
                </Link>
            </nav>

            {/* The page's own ground (owner review 2026-11-15; reworked into
                a drafted sheet 2026-11-21): a fixed slate stack lit by a
                blurred copy of this project's hero image, a two-order
                drafting grid, margin rails bracketing the reading column,
                two ember pools and film grain (Backdrop.jsx). Decorative
                throughout, and never the LCP. The loading.js fallback renders
                the same stack without the bloom, so the swap is seamless. */}
            <Backdrop media={project.caseStudy?.hero ?? null} />

            {/* The case study (issue #31). It replaced the 3D laptop scene:
                the page now explains the work instead of staging it, its text
                is server HTML, and three.js has left the route. */}
            <CaseStudy project={project} locale={locale} />
        </IntlScope>
    )
}
