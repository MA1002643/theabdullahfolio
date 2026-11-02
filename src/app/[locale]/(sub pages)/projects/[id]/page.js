import Image from "next/image"
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
import bg from "../../../../../../public/background/home-bg.webp"
import LanternSweep from "@/components/project-detail/lantern-sweep"
import ProjectIntro from "@/components/project-detail/project-intro"
import SceneLoader from "@/components/project-detail/scene-loader"

// Server Component on purpose (issue #83). This page used to be one big
// "use client" module that imported three / @react-three/* directly, which
// made the WebGL bundle part of the route's entry chunk: a click on
// /projects couldn't commit the navigation until all of it had downloaded,
// so the listing page just sat there frozen. Now the page is a server shell
// (background, lantern sweep, title) and the Canvas lives behind the dynamic
// ssr:false boundary in scene-loader.jsx, so the shell paints immediately
// and three.js streams in underneath. Keep any new heavy client imports on
// that side of the boundary.

// Every project page is knowable at build time — prerender them all so the
// navigation serves static HTML instead of rendering on demand.
export function generateStaticParams() {
    return projectsData.map((p) => ({ id: String(p.id) }))
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
    const { id, locale } = await params
    const project = projectsData.find((p) => String(p.id) === String(id))
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
        path: `/projects/${project.id}`,
    })
}

export default async function ProjectDetailPage({ params }) {
    // `params` is a Promise from Next 15.
    const { id, locale } = await params
    setRequestLocale(locale)
    // Strict integer-string check before lookup. Two reasons:
    //   1. parseInt was permissive — parseInt("1abc", 10) === 1,
    //      so /projects/1abc would silently resolve to project 1
    //      with HTTP 200. Number("1abc") returns NaN instead, and
    //      Number.isInteger(NaN) is false, so we notFound() it.
    //   2. The `String(parsedId) === id` round-trip also rejects
    //      non-canonical forms (/projects/01, /projects/1.0,
    //      /projects/1e0) that Number() would otherwise accept —
    //      every valid project has exactly ONE canonical URL,
    //      preventing duplicate-content URLs from being indexed.
    const parsedId = Number(id)
    const isStrictInteger =
        Number.isInteger(parsedId) && String(parsedId) === id
    const project = isStrictInteger
        ? projectsData.find((p) => p.id === parsedId)
        : undefined

    // Invalid / non-existent project id (e.g. /projects/9999,
    // /projects/abc, /projects/1abc, /projects/01). `notFound()`
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
    // The project's two outbound links (issue #92). `demoLink` falls back to
    // the repository for projects with no live site, so a "Live demo" that is
    // only the repo again is dropped rather than shown twice under two names.
    //
    // A `private: true` record keeps `repo` for internal tracking (the progress
    // popup, the language data), but that URL answers 404 to every visitor, so
    // it is never published as "Source on GitHub", in the intro or on the
    // laptop. The demo is compared against the repo URL, not against `source`,
    // so a private repo cannot come back in as a "Live demo" either.
    const repoUrl = project.repo ? `https://github.com/${project.repo}` : null
    const source = project.private ? null : repoUrl
    const links = {
        name: project.name,
        source,
        demo: project.demoLink && project.demoLink !== repoUrl ? project.demoLink : null,
    }

    // Translated copy (issue #82). The project NAME is a proper name and is
    // never translated; the four-word description is, through the generated
    // Data catalogue (English returns the data.js literal untouched).
    const t = await getTranslations({ locale, namespace: "ProjectDetail" })
    const dataT = await getDataT(locale)
    const description = localizeProject(project, dataT).description

    const index = projectsData.findIndex((p) => p.id === project.id)
    const previous =
        projectsData[(index - 1 + projectsData.length) % projectsData.length]
    const next = projectsData[(index + 1) % projectsData.length]

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
                <Link href={`/projects/${previous.id}`} prefetch={false}>
                    {t("siblingNav.previous", { name: previous.name })}
                </Link>
                <Link href={`/projects/${next.id}`} prefetch={false}>
                    {t("siblingNav.next", { name: next.name })}
                </Link>
            </nav>

            {/* Your Original Background Image - Full Screen */}
            {/* alt="" — decorative: screen readers skip it entirely instead of
                announcing "background, image" (matches the loading.js fallback) */}
            <Image
                src={bg}
                alt=""
                fill
                priority
                className="fixed top-0 left-0 w-full h-full object-cover object-center -z-10"
            />
            <div
                className="relative w-full h-screen overflow-hidden"
                style={{
                    height: "100vh",
                    width: "100vw",
                    position: "fixed",
                    top: 0,
                    left: 0,
                }}
            >

                {/* Lantern placed BETWEEN background and canvas — stacked by
                    DOM order (bg is -z-10, the canvas below has z-0, this stays
                    z-auto in between).

                    `AuroraParallaxBackground` used to sit here and was removed:
                    its three layers had no content but a background-image, and
                    all three files (/aurora-band-1.png, /aurora-band-2.png,
                    /fog.png) have never existed in this repository — no commit
                    in the history ever added them. So it rendered three empty
                    divs while costing three 404s per page view AND a
                    `mousemove` listener that called setState on every pointer
                    move across the viewport.

                    Caught by the Lighthouse budget's `errors-in-console` audit
                    (issue #32). If the aurora is ever wanted, it needs the three
                    assets committed first — the component was deleted, not
                    disabled, precisely so that restoring it cannot silently
                    reproduce the invisible version. */}
                <div className="absolute inset-0 pointer-events-none">
                    <LanternSweep />
                </div>

                {/* 3D Canvas — streams in via the dynamic ssr:false chunk */}
                <SceneLoader links={links} />

                {/* Overlay UI */}
                <ProjectIntro name={project.name} description={description} links={links} />
            </div>

        </IntlScope>
    )
}
