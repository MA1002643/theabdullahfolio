# Discoverability — decisions, rationale, runbook

Issue [#32](https://github.com/MA1002643/theabdullahfolio/issues/32).

This is an ADR, not a checklist. It records **why** each decision was taken, so
a future audit can tell a deliberate choice from an oversight — which is the
distinction that made #32 necessary in the first place (the CV PDF was
crawlable, and nobody could say whether that was intended).

---

## 1. Baseline — captured 2026-09-11, before any change

Every target is relative to this. An SEO change with no before-state is
unfalsifiable (P6).

### Live probe

```
GET https://ma.codes/robots.txt            → 404
GET https://ma.codes/sitemap.xml           → 404
GET https://ma.codes/manifest.webmanifest  → 404
GET https://ma.codes/llms.txt              → 404
GET https://ma.codes/                      → 200
GET https://www.ma.codes/                  → 200   (no redirect, no Location)
```

`rel="canonical"` on `/`: **absent.** `application/ld+json` anywhere: **absent.**

### Server-rendered content, per route

Measured with JavaScript **not** executed — the view a non-JS crawler gets:

| Route | SSR words | SSR internal links |
|---|---:|---:|
| **`/`** | **10** | **0** |
| `/about` | 599 | 8 |
| `/contact` | 413 | 8 |
| `/guestbook` | 345 | 8 |
| `/journey` | 1,050 | 8 |
| `/my-past` | 371 | 8 |
| `/projects` | 499 | 19 |
| `/projects/1` | 335 | 8 |
| `/qualifications` | 428 | 15 |
| `/uses` | 1,720 | 8 |

The homepage's ten words were: *"Muhammad Abdullah / Muhammad Abdullah /
Software Engineer / MUHAMMAD ABDULLAH / 0 %"*.

### CV PDF

```
Title     (absent)     ← what Google names the search result
Author    (absent)
Subject   (absent)
Keywords  (absent)
Lang      (absent)
Tagged (accessible) PDF: no
Pages: 2 · 104,070 bytes
Headers: content-type: application/pdf, content-disposition: inline
         (no X-Robots-Tag)
```

### After this work

| | Before | After |
|---|---:|---:|
| Homepage SSR words | 10 | **106** |
| Homepage SSR internal links | 0 | **8** |
| Routes with a canonical | 0 | **10 + 11 project pages** |
| JSON-LD nodes site-wide | 0 | **22, zero dangling references** |
| `robots.txt` / `sitemap.xml` / `manifest` / `llms.txt` | 404 | **200** |
| URLs declared in a sitemap | 0 | **21** |
| `/about` `<h1>` count | 3 | **1** |

Not yet captured, because they need accounts rather than code: Search Console
impressions/clicks (property not yet verified — see §8), and Vercel Analytics
30-day traffic.

---

## 2. Why the apex is canonical

`ma.codes` and `www.ma.codes` both answered `200` with byte-identical content,
the same `etag`, and no `Location` header. With no canonical tag anywhere,
Google had to **guess** which host was authoritative, and inbound link equity
split across two origins.

The apex wins for no deep reason beyond consistency: it is what
`metadataBase` already declared, what the OG tags already pointed at, and what
every link in the footer already used. Three signals now say it:

1. **A 308 from `www` → apex**, in [`next.config.mjs`](../next.config.mjs).
2. **A self-referential canonical on every route.**
3. **`Host:` in `robots.txt`**, for the crawlers that honour it.

### Why the redirect is in config, not the Vercel dashboard

A dashboard redirect is invisible to this repository: it cannot be reviewed in
a diff, cannot be tested, and is silently lost if the project is recreated or
forked. In `next.config.mjs` it is all three, and
[`tests/unit/cspAnalytics.test.js`](../tests/unit/cspAnalytics.test.js) asserts
both that it exists and that it cannot loop.

If a dashboard-level redirect is *also* configured, the two agree — the
platform's fires first and this one becomes dead weight rather than a conflict.

`permanent: true` emits **308**, not 301. Both are permanent; 308 additionally
guarantees the method and body survive, which costs nothing to have.

---

## 3. Why `lastModified` comes from git — and when it is absent

`lastModified: new Date()` is the reflex implementation and it is a lie: it
re-stamps every URL on every deploy, claiming the whole site changed because one
typo was fixed. Search engines detect that pattern and discount the field
wholesale, so the lie does not even pay.

[`src/lib/seo/lastModified.js`](../src/lib/seo/lastModified.js) runs
`git log -1 --format=%cI -- <paths>` per route at **build time**, and when git
cannot answer it returns `undefined` and the sitemap **omits `<lastmod>`**.
`<lastmod>` is optional in the sitemap protocol; an absent field is honest, a
fabricated one is not (P4).

> ### ⚠️ Known consequence: production sitemaps may ship without `<lastmod>`
>
> Vercel builds Git deployments from a source tarball, so the build container
> generally has **no `.git` directory** and every lookup fails. Local and CI
> builds emit real per-route commit dates (verified: nine distinct dates across
> nine routes); production may emit none.
>
> This is accepted rather than worked around. The alternative — committing a
> generated manifest — trades a *missing* field for a *stale* one and breaks P1
> (nothing hand-maintained). `<lastmod>` is also the weakest signal in the
> sitemap; the URLs are what matter.
>
> **To verify which you are getting:** `curl -s https://ma.codes/sitemap.xml |
> grep -c lastmod`. If you want real dates in production, add a build step that
> writes the git dates before `next build` runs — do **not** switch to
> `new Date()`.
>
> `tests/unit/sitemapDrift.test.js` asserts every entry's date is *identically*
> the value `lastModifiedFor(route.sources)` returns, so a future "fix" that
> reintroduces build-time stamping fails CI. (It used to require each date to be
> more than 60 seconds old, which is the same statement made by timing — and
> failed whenever someone committed a source file and ran the suite inside a
> minute. A day's clock-skew tolerance still caps how far into the future a date
> may sit, since committer dates come from the committing machine's clock.)

---

## 4. The CV PDF is indexable, on purpose

**Decision (owner, 2026-09-11): the CV stays indexable.** It is a first-class
landing page for name queries, not a liability to hide.

That makes the preparation work *required*, not optional — an indexable PDF that
nobody prepared for indexing is the worst of both outcomes.

### What was done

| | |
|---|---|
| `/Title` | `Muhammad Abdullah — Software Engineer CV` — this is literally what the search result is called |
| `/Author` | `Muhammad Abdullah` |
| `/Subject`, `/Keywords` | Aligned with the `/` intent map (§7) |
| `/Lang` | `en-GB`, so a screen reader does not pronounce an English CV in the reader's own locale |
| `X-Robots-Tag` | `index, follow, max-snippet:-1, max-image-preview:large` |
| Sitemap | Declared, rather than left to footer-link discovery |
| `Content-Disposition` | Left `inline` — correct for a document read in-browser from a search result |

Written by [`scripts/seo-pdf-metadata.mjs`](../scripts/seo-pdf-metadata.mjs).
`node scripts/seo-pdf-metadata.mjs --check` reports the current state and exits
non-zero if anything is unset.

### Why a post-process, not `\hypersetup{}`

Setting `pdftitle`/`pdfauthor` in the LaTeX source is the better approach and is
**not available: there is no `.tex` in this repository.** Only the compiled PDF
is tracked.

> **Recommendation:** commit the LaTeX source. The CV becomes reproducible and
> reviewable like everything else here, the metadata moves into
> `\hypersetup{}` where it belongs, and accessibility tagging (below) becomes
> possible. Until then, re-run the script after every CV replacement.

### Regenerating the CV: what breaks, and what no longer can

**The old danger here is gone, and is recorded because the shape of the tests
below only makes sense against it.**
[`/api/experience-summary`](../src/app/api/experience-summary/route.js) used to
parse this exact file at runtime via
[`parseExperienceFromPdf`](../src/utils/experience/pdfExperienceParser.js) to
derive the employment figure on `/about`. A reflowed text layer made the regexes
miss, `roles` came back empty, and `/about` rendered "Employment 0%" — no
exception, no log line, HTTP 200, because an empty parse is indistinguishable
from a CV with no jobs on it.

**That runtime dependency no longer exists.** The route derives employment from
`journeyData` through
[`employmentFromJourney`](../src/utils/experience/journeyEmployment.js) — the
same array `/journey` renders. The parser has **no production importer**; the
only two files that call it are tests. A reflowed PDF cannot empty a page, and
nobody should be sent to debug a production failure that is no longer
representable.

#### What is actually at risk now

The CV is a **third public surface** and the only one not derived from
`journeyData`: a separately-maintained binary, built from LaTeX that does not
live in this repository, deliberately indexed by this work (its own `/Title`,
its own sitemap entry). So the site can publish **two employment histories** —
one in HTML from the array, one in a PDF nothing regenerates from it — and the
likeliest way to discover they disagree is a recruiter with both open.

Two tests cover that, and they have different jobs:

| Test | Asserts | Fails when |
|---|---|---|
| [`pdfExperienceFixture.test.js`](../tests/unit/pdfExperienceFixture.test.js) | What the parser reads out of the **binary** — both roles, exact dates and durations | The PDF's text layer changed, or the parser lost its grip on it |
| [`cvJourneyConsistency.test.js`](../tests/unit/cvJourneyConsistency.test.js) | What that means **next to `journeyData`** — every difference is declared in `KNOWN_DIVERGENCES` | The two documents newly disagree, *or* a declared divergence was resolved and the entry is now stale |

The order matters: the consistency check can only compare while the parser still
works, so the fixture test is the **instrument check** that keeps it honest. That
is why it pins exact values rather than `roles.length > 0` — a loose assertion
passes when the parser finds one role out of two, which is exactly what a text
reflow produces. A silently broken parser would not fail anything; it would quietly
stop the two documents from ever being compared again.

`pdf-lib` was chosen over recompiling precisely because it rewrites only the info
dictionary and trailer, leaving content streams alone. **Verified: the extracted
text layer is string-identical, 4,923 characters before and after.**

#### If a test fails after a CV update

- **Fixture test** — the PDF is what changed. Do not relax the assertions.
  Either restore the layout the parser reads, or update the parser and re-pin
  the values on purpose. Nothing on the site is broken meanwhile.
- **Consistency test** — the two records now state different things. This is not
  automatically a bug in either: `journeyData` is the LinkedIn record and the CV
  is owner-maintained, and conflicts are settled **per conflict, by the owner, on
  the evidence** — there is no standing rule that one wins. (The BTEC dates went
  to LinkedIn; the Unisys range went the other way on 2026-09-12, and `data.js`
  was corrected to match the CV.) Fix a source, or declare the divergence in
  `KNOWN_DIVERGENCES` with a reason. Deleting a resolved entry is part of the fix.
- **Both** — if the new CV genuinely states different dates, re-pin the fixture
  *and* reconcile `journeyData`, or the consistency test will correctly fail next.

### Not done: accessibility tagging

W1b asks for `/StructTreeRoot`. It is genuinely not possible here: a tagged PDF
needs a semantic structure tree built from the document's logical reading order,
which only the generator knows. `pdf-lib` can add the object but cannot infer
the structure, and a tree that mislabels content is **worse** for a screen
reader than an honest absence of one. Needs `\usepackage{tagpdf}` in the source.

`/Lang` was set instead — the part of the same goal that does not require
knowing the layout.

### Privacy: the phone number is knowingly published

**Decision (owner, 2026-09-11): accept it.**

A presence-only probe found the CV contains an email address and a **UK mobile
number**, plus GitHub, LinkedIn and `ma.codes` URLs. It contains no postcode,
street address, date of birth or nationality.

Indexing it deliberately means that mobile number is crawlable by scrapers as
well as by recruiters. That is accepted as the cost of the CV being a real
landing page.

**Done (2026-09-25, #141).** The privacy page states it: `NOT_VISITOR_DATA` in
[`src/lib/privacy/inventory.js`](../src/lib/privacy/inventory.js) carries a "My
CV, deliberately indexed" row naming the email address and the mobile number,
and [`/privacy`](https://ma.codes/privacy) §6 renders it. It sits among the
"things that look like tracking and are not" rows because it is *my* data rather
than a visitor's — a privacy page that lists only what a site takes from you,
and never what it publishes about its author, is careful in one direction only.

### Flagged, not decided: an HTML `/cv` route

Would outrank the PDF for name queries, extract far more reliably for AI
crawlers, and could carry `Person` + `Occupation` schema — but duplicates
content `/about`, `/journey` and `/qualifications` already carry. The issue
flagged this as "a bigger scope call than this issue should make on its own",
and it was **not** built.

### Decision (owner, 2026-09-26): the PDF canonicalises to `/cv`

**This supersedes the 2026-09-11 decision above.** The entries above are
kept as the record of what was decided and why.

`/cv` was built later (§13) and renders the same record in HTML. Search Console
then reported the PDF under **"Duplicate without user-selected canonical"**. It
had clustered the two documents, and the PDF was the only member of the cluster
that said nothing about which copy was the original. In the same email, the
http→https and www→apex redirects (§2) appeared under "Page with redirect".
Those are intended, and §9 now lists them as expected.

Two fixes were considered:

- **Self-canonical on the PDF** keeps F6, but it only labels the duplicate.
  With the text this close to `/cv`, Google would likely overrule it and report
  "Google chose different canonical than user".
- **Canonical to `/cv`** (chosen). `/cv` is the better result: it carries the
  share card, the JSON-LD and links back into the site, and it reads properly
  on a phone. The PDF is one click away from it.

| | Before | After |
|---|---|---|
| PDF header | `X-Robots-Tag: index, follow, max-snippet:-1, max-image-preview:large` | `Link: <https://ma.codes/cv>; rel="canonical"` |
| Sitemap | PDF listed | PDF **not** listed. A sitemap lists only canonical URLs. |
| `CV_ASSET` | path, changefreq, priority, sources | path only (still used by `llms.txt` and `significantLink`) |

A PDF cannot carry `<link rel="canonical">`, so the `Link` HTTP header is the
only form available. It is **not** `noindex`: noindex beside a canonical is a
conflicting signal, and the canonical alone is what consolidates the PDF's
links onto `/cv`. The `/Title` metadata stays, because the file is still
opened and shared directly. The privacy row requested in the phone-number note
above was reworded to match: only `/cv` is indexed now, but the PDF is still
public, so the cost it discloses stands.

---

## 5. Why the homepage summary is `sr-only`, and why that is not cloaking

Two constraints met: W3 requires real prose in the server HTML, and P7 plus the
acceptance criteria require **no visual diff on `/`**. The only honest way to
satisfy both is text present in the markup and not painted.

`sr-only` is the right tool because **this is a genuine accessibility fix**,
which is also why it survives the cloaking test:

- Tailwind's `sr-only` clips to a 1px box. It is **not** `display: none` and
  **not** `visibility: hidden` — screen readers announce every word. Pinned by
  an e2e assertion on the computed style.
- A non-sighted visitor previously reached `/` and got a name, a job title, and
  eight unlabelled orbit buttons — no statement of what the site is or holds.
- Cloaking is showing crawlers something users cannot get. This is the same text
  serving a second reader, which is the opposite.

Used in exactly two places, both genuine gaps:

| Where | The gap it fills |
|---|---|
| `/` summary | The page's only prose. Previously 10 SSR words. |
| `/projects/[id]` sibling nav | A fixed full-screen 3D scene whose only exit was one floating button; no way to reach another project. Also fixes F8's crawl path. |

**What the summary CLAIMS has to be true, too** (fixed 2026-09-24). It said
"every section is reachable from the ring below" and then linked the two
sections that are not on it. `BtnList` is capped at eight by the sub-480px
two-column layout that slices it 0–3 / 4–7, so `/cv` and `/notes` were never
orbit entries — the code comment beside the paragraph says exactly that, and
the prose beside it said the opposite.

Worth recording as more than a typo, because of who pays for it. A sighted
visitor never reads this sentence and can see the ring; a screen-reader user
has only the sentence, is told the ring is the whole map, and has no way to
notice the two routes named immediately afterwards are outside it. An
accessibility fix that gives its reader a false model of the navigation is
working against the thing it was added for. It now reads "apart from two", and
nothing enforces that — no test can read a claim — so anything changing what
`BtnList` holds changes this sentence with it.

**Both carry `prefetch={false}` on every link inside them**, and for a reason
particular to this technique: `sr-only` clips rather than unmounts, so the
links are in the viewport on every visit while being reachable by no pointer.
Next's default viewport prefetch cannot tell the difference and warms each
destination for **every** visitor — on `/` that was `/cv` and the `/notes`
listing, two RSC round-trips on top of the eight the orbit ring already makes,
to serve links only keyboard and AT users can reach (the sibling nav's three
were stood down when it was written; `/` followed 2026-09-24). The `href`s stay
server-rendered, which is the entire point of both blocks, and hover and touch
still warm the route on intent — `prefetch={false}` stands down only the
viewport pass.

**It is not a general pattern.** Reaching for `sr-only` to add keyword text
would be the abuse this reasoning does not license.

### Related: reveal animations use `opacity: 0` on SSR'd text

This is fine and standard — the text is in the DOM and not `hidden` — but noted
here so a future audit does not misread it as hidden text. The F1 fix relies on
it: the orbit buttons are now **always mounted** and the staggered reveal
animates only `opacity`/`scale`.

**Extended to this document's own body (2026-09-22).** `/cv` and
`/notes/[slug]` both reveal on scroll, which means `opacity: 0` now applies to
**the largest body of indexable prose on the site** — this file. That is a
sharper version of the same question, so the guarantee is correspondingly
stronger rather than merely inherited:

- `opacity: 0` appears **only inside `@keyframes`**, never in a base rule.
  `animation-fill-mode: both` applies that first frame only while the animation
  exists, and the animation exists only inside
  `@supports (animation-timeline: view())` nested in
  `@media (prefers-reduced-motion: no-preference)`.
- So an engine without scroll-timeline support (Firefox; Safari before 26) and
  a reader who asks for reduced motion both get the **finished document**, not
  a page stuck at zero opacity. Verified by emulating reduced motion:
  **0 animations bound, and 0 of 289 sampled elements faded or transformed.**
- No crawler is served a different document from a human. There is no
  JavaScript on the route at all — the reveals are CSS scroll-driven
  animations, so the HTML a crawler receives is the HTML a reader receives,
  fully populated.

The distinction that matters for an audit: a base-rule `opacity: 0` would be
indefensible here, because it would be the one state a non-supporting engine
could never leave. A keyframe-only zero cannot strand anything, which is why it
is the form the rule takes.

---

## 6. F1 — what was actually wrong

The issue attributed the homepage's empty SSR to `LoaderWrapper` gating the ring
client-side. **That was not the cause.** `LoaderWrapper` renders `{children}`
from its first render.

The real cause was one line in
[`src/components/navigation/index.jsx`](../src/components/navigation/index.jsx):

```js
if (!visibleButtons.includes(btn.label)) return null;
```

`visibleButtons` starts `[]` and fills in from `setTimeout`s, so the **server
rendered zero buttons**.

The fix was not new machinery. The sub-480px two-column branch in the same file
**already did it correctly** — always render, drive the reveal through
`NavButton`'s `visible` prop, which only animates `opacity`/`scale`. The orbit
branch was the one that had diverged, so it was brought into line (P5).

Two properties make this safe rather than hopeful:

- **No layout shift is structurally possible.** Every orbital `NavButton` root
  is `position: absolute`, so going from 0 to 8 children adds nothing to the
  `w-max` flex parent's in-flow content.
- **The choreography is unchanged.** The same `visibleButtons` timers fire at
  the same 300 ms spacing, so each button becomes visible at exactly the moment
  it did before. It is now in the DOM at `opacity: 0` beforehand instead of
  absent.

Invisible buttons are made genuinely inert — `pointer-events-none`,
`tabIndex={-1}`, `aria-hidden` — matching the phone branch. `aria-hidden` hides
from assistive tech only; the `href` and anchor text are fully present for
crawlers, and it is strictly better than not rendering the button at all.

---

## 7. Intent map

| Route | Primary intent | Secondary |
|---|---|---|
| `/` | Muhammad Abdullah · Muhammad Abdullah software engineer | software engineer portfolio |
| `/about` | about Muhammad Abdullah | full-stack developer profile, tech stack |
| `/projects` | software engineering projects | Next.js / React portfolio projects |
| `/projects/[id]` | *{project name}* | {project} case study, {stack} project |
| `/qualifications` | Muhammad Abdullah qualifications | software engineering degree, certifications |
| `/journey` | Muhammad Abdullah career timeline | developer journey |
| `/uses` | Muhammad Abdullah uses | developer setup, tools, dev environment |
| `/guestbook` | — *(engagement, not search)* | — |
| `/my-past` | Muhammad Abdullah early work | portfolio archive |
| `/contact` | contact Muhammad Abdullah | hire software engineer |

Titles and descriptions live in
[`src/lib/seo/site.js`](../src/lib/seo/site.js)'s registry, not in each page.
Four consumers read them — the page, the sitemap, the JSON-LD and `llms.txt` —
and four copies were four chances to disagree.

### Project-page descriptions are composed, not taken from the data

`project.description` is a **four-word card subtitle** (~36 characters), which as
a SERP description is short enough that Google discards it and substitutes
scraped text. It cannot simply be lengthened: it is load-bearing as the
`/projects` card subtitle *and* the `ProjectIntro` headline subtitle, both sized
around four words.

[`src/lib/seo/projectMeta.js`](../src/lib/seo/projectMeta.js) composes one from
facts the record already carries. Writing that composer produced **four bugs in
a row**, none visible by reading it:

1. `charAt(0).toLowerCase()` turned `AI-powered` into `aI-powered`.
2. `A AI project` — needed *an*.
3. All eleven ran 157–180 characters against a 160 cap.
4. The fix for (3) — capitalising the string's first character — silently
   rewrote the **repository names** (`culina` → `Culina`), whose casing is
   load-bearing in this repo.

All four were caught by *measuring generated output*, which is why
`tests/unit/metadataContract.test.js` asserts against the composer's real
results rather than trusting the composer.

---

## 8. Analytics — GA4 vs Vercel, and the consent gate over both

### GA4 is mounted, behind the gate (shipped 2026-09-25, #141)

**Decision (owner, 2026-09-25): all three measurement scripts now load only
after a visitor has agreed.** This section previously recorded GA4 as hard-blocked
on [#141](https://github.com/MA1002643/theabdullahfolio/issues/141); that issue
shipped, and §17 is the record of how. The history below stands as written.

The single mount is inside
[`ConsentedAnalytics.jsx`](../src/components/privacy/ConsentedAnalytics.jsx),
below its `if (!analytics) return null`. Vercel Web Analytics and Speed Insights
moved behind the same boundary — their old `process.env.VERCEL` condition was
never a consent gate, only a "can the platform serve this" gate, and it is
preserved *inside* the boundary for that original reason.

**What had landed earlier**, so #141 did not have to re-derive it:

1. `https://www.googletagmanager.com` in `script-src`. This is **F4**, the
   issue's most dangerous finding: without it, dropping in `<GoogleAnalytics />`
   yields a page that looks completely healthy, sends **zero hits**, and logs no
   error. The measurement baseline this work exists to create, quietly
   destroyed for however long it took someone to think to check.
2. [`src/lib/seo/analytics.js`](../src/lib/seo/analytics.js) — a frozen event map
   and a typed `trackEvent()` that no-ops until a tag exists.
3. `tests/unit/cspAnalytics.test.js`, which pins the allow-list **in both
   directions** — every host the stack needs must be present, and no host beyond
   the declared set may be. Verified to fail when the GTM host is removed.

**What switching it on actually took**: the mount inside the boundary, and
`NEXT_PUBLIC_GA_MEASUREMENT_ID`. Nothing in `analytics.js` changed — `trackEvent`
started working the moment `window.gtag` came into existence, because that is the
only thing it checks.

**One documented departure.** §14 and the component's own header both specified
`gtag('consent', 'update', { analytics_storage: 'granted' })` on accept. It is
not issued. What a visitor consents to is whether the tag **loads**; Consent Mode
stays denied on all four signals permanently, so **no `_ga` cookie is ever
written, for anyone, in either state**. §14 had already accepted every cost of
the cookieless mode, so granting storage bought nothing the measurement needed —
and `tests/unit/gaConsentMode.test.js`'s assertion that `'granted'` appears
nowhere in that module survives untouched rather than being weakened to
accommodate the change. See §17.

### The two will disagree, permanently and by design

> **Do not file this as a bug.**

| | Vercel Analytics | GA4 |
|---|---|---|
| Answers | how many, from where, how fast | what did they *do* |
| Covers | **100%** of traffic | the **consenting subset** only |

GA4 will under-report against Vercel Analytics, by whatever share of visitors
decline consent. Both numbers are correct; they measure different populations.

### Assistant referrals

GA4's default channel grouping files `chatgpt.com`, `perplexity.ai`, `claude.ai`
and friends under **Referral**, mixed in with every other site that links here —
so the trend that matters most to this work's actual goal is the one the default
report cannot show. `ASSISTANT_REFERRERS` in `analytics.js` is the list to build
a custom channel group from.

**Search Console cannot report these at all** — it sees Google Search only. The
`/api/seo-report` payload says so in its `note` field, so whoever reads a cron
log is told rather than left to file it.

---

## 9. The Search Console loop

[`/api/seo-report`](../src/app/api/seo-report/route.js) pulls Search Analytics,
stores a rolling 90-day snapshot in Upstash, and derives what is actionable:
new queries, positions that dropped > 3, pages with impressions but CTR < 1%,
and the geographic split.

All four reach the caller. The first three arrive as `findings`; the geographic
split is returned as `countries` — it was fetched and stored but left out of the
response until 2026-09-17, so reading it meant opening Upstash by hand, which is
the "go and look" this loop exists to remove.

### Wiring

Invoked as a **third step in [`/api/daily-warmup`](../src/app/api/daily-warmup/route.js)'s
fan-out**, not as a second `vercel.json` cron entry. Hobby caps cron *count*, so
a standalone entry would silently never run — which is exactly why
`daily-warmup` exists at all.

It **counts toward `daily-warmup`'s `allOk` verdict, but only once it is
configured** — the revisit the previous note asked for, now done.

**A 2xx is not a verdict** (tightened 2026-09-17). `daily-warmup` judged each
step by HTTP status alone, and `/api/repo-refresh` answers **200** when only its
`/api/experience-summary` warm failed — a best-effort semantic it documents on
purpose, since a non-2xx there is a retry/alert signal about a cache that
refills on the next visitor anyway. The two together produced an all-green cron
over a half-failed step: the body said `ok: false` and nobody read it. A step
that answers 2xx and then says `ok: false` in its body is now counted as a
failure, marked `bodyReportedFailure: true` so a 200-that-failed stays
distinguishable from a 502. That check reads only an explicit `ok: false` and
fails **open** — the deliberate opposite of the `skipped` check, which must not
let an ambiguous body excuse a step — because `/api/work-status` returns no `ok`
field at all and inventing an admission from it would turn every healthy run
red.

**A 2xx it cannot read is not a verdict either** (closed 2026-09-18), and this
is where the rule stops being uniform across the three steps — the paragraph
above describes the check, not a blanket policy. Failing
open is right for a body that carries no `ok`, and wrong for every body that
could not be read at all — an intermediary's HTML error page, a truncated
payload, a body that threw on read. Those went back through `res.ok`, which is
true, so the step whose status was never the verdict was still being green-lit
by it. Each step now declares what its own 2xx *means*: `statusIsVerdict`
defaults to true, and only `/api/repo-refresh` sets it false, so only that step
must be **corroborated** by a body parsing to `ok: true` (a field it sets on
every 2xx it emits). An uncorroborated 200 there fails the run and is marked
`bodyUnverified: true` — a separate marker from `bodyReportedFailure`, because a
step that could not answer and a step that admitted failure call for different
actions. Per step rather than globally: demanding corroboration from
`/api/work-status`, which carries no `ok`, would fail every healthy run.

The cron's own deadline is also no longer a guess: the route **declares**
`maxDuration`, and `CRON_RUN_BUDGET_MS` defaults to 75% of it. A budget is only
a bound if it expires before the platform kills the function, and 45 s against a
"60 s, lower on smaller plans" comment was a bet on an unstated plan fact — one
that, on the smaller of its own two claims, could not fire at all. A plan that
cannot grant the declared duration now fails at deploy time rather than at
01:00.

The step answers 503 with a `skipped` reason whenever `GSC_SERVICE_ACCOUNT_KEY`
is **unset**, which is the correct state until verification is done by hand, and
alarming nightly about an unconfigured step trains whoever reads the alerts to
ignore them. So that exact answer — **503 with a `skipped` field** — is the one
thing `daily-warmup` forgives, and it marks the step `notConfigured: true` in
the response so a run that is green *because a step opted out* is not mistaken
for one where everything worked.

**Unset and unusable are different answers.** A variable that is *set* but does
not decode — a truncated paste, a re-encoded value, the wrong JSON swapped in
during a rotation — or that decodes to an object without `client_email` and
`private_key`, answers **500 with an `error`** and no `skipped` field, so the
run fails. It reads as a server-configuration fault rather than a 502 because
nothing upstream was reached, and it will not fix itself on tomorrow's retry.
This distinction is load-bearing: both cases used to return the same `null`
internally, so a broken credential claimed to be an opt-out, `daily-warmup`
honoured that claim, and the cron stayed green while the report stopped
arriving — the blind spot the verdict fix closed, re-entered through the
credential reader. Pinned by `tests/unit/seoReportCredentials.test.js`, whose
cases assert the answer is one `daily-warmup` will *count*, not merely that the
status changed.

Everything else counts. With the credential in place, an expired key, revoked
property access, a Search Console outage and an Upstash failure all answer 502,
and each now fails the run rather than returning a green 200 that no cron
monitor would flag. The check **fails closed**: a 503 with no reason, a body
that is not JSON, a `skipped` on any other status, or a thrown fetch all read as
failures. Pinned by `tests/unit/dailyWarmupVerdict.test.js`.

**Missing storage is not a `skipped` state** (tightened 2026-09-13; this was
previously recorded here as a known residual). `/api/seo-report` used to answer
503 + `skipped` when the **Upstash** credentials were absent, which
`daily-warmup` forgives — so with `GSC_SERVICE_ACCOUNT_KEY` configured the run
came back green every night while no snapshot was ever stored.

That is the blind spot the verdict fix closed, re-entered one guard further down.
It is also self-concealing in a way the credential case is not: every finding
this route reports is derived by comparing today's snapshot against the **stored**
previous one, so with no storage the feedback loop cannot start at all — and the
one signal that would have said so was suppressed by design.

The storage check sits **after** the credential checks, which is what makes the
rule expressible: reaching it means the integration is switched on, and a
configured integration that cannot store anything is broken, not dormant. It now
answers **500 with an `error`** (and logs the reason), matching the invalid-credential
branch — nothing upstream was reached, it is the server's own configuration, and
it will not fix itself by being retried tomorrow. `skipped` is now claimable by
exactly one condition: `GSC_SERVICE_ACCOUNT_KEY` absent.

### No `googleapis` dependency

The obvious implementation imports `googleapis`: hundreds of generated API
clients pulled in to call two endpoints. This repo already talks to GitHub's
GraphQL and REST APIs with bare `fetch` and no SDK, so this follows that
precedent — the service-account JWT is signed with `node:crypto`, which
`safeBearerEqual` already depends on. ~40 lines versus a dependency that would
dominate the function bundle.

### Every upstream call has a deadline

The token exchange and the three `searchAnalytics` queries all go through one
`fetchBounded()` helper, at `SEO_REPORT_TIMEOUT_MS` (default **10s**). Worst case
is therefore ~2× that — one token call, then three queries in parallel.

That worst case now has a **declared ceiling to fit inside** (added 2026-09-18).
This route inherited whatever function duration the account defaulted to — and a
route killed at its ceiling returns no 502 and no message naming which of its
four calls stalled, leaving the orchestrator with a bare transport failure.
(Measured 2026-09-18: this project runs Fluid Compute with
`functionDefaultTimeout` at **300 s** on Hobby, so the 10 s written into the
repo's older GitHub routes is the pre-Fluid number, not the live ceiling. The
point of declaring a duration is that a deployment which cannot grant it fails
at deploy time rather than at 01:00.) It declares `maxDuration = 30` (two phases at 10 s, leaving a third of the budget
for the Upstash writes and the response, which carry no bound of their own), and
the per-call ceiling is arithmetic over it — `(maxDuration * 1000 * 0.75) /
UPSTREAM_PHASES` — with `SEO_REPORT_TIMEOUT_MS` clamped against that ceiling, so
an override cannot put one phase past the whole function the way
`CRON_RUN_BUDGET_MS` once could. The default is unchanged by the clamp.

The bound matters more here than in a standalone route. This one runs *inside*
`/api/daily-warmup`'s fan-out, and that orchestrator returns **one** response
carrying every step's result, so an unbounded stall would hold the whole cron
open until the platform killed the function — taking the work-status and
repo-refresh results already collected down with it. Same reasoning as
`/api/repo-refresh`'s `CRON_WARM_TIMEOUT_MS` and `/api/work-status`'s per-query
bounds; this route was the one that had been missed.

A timeout surfaces as a 502 naming the step and the budget
(`token exchange timed out after 10000ms`) — never the request body, which
carries the signed assertion, nor the bearer token. Pinned by
`tests/unit/seoReportTimeout.test.js`.

**Only messages this route wrote are quoted back** (tightened 2026-09-18). The
handler's `try` wraps the RS256 signing, the four upstream calls *and* the four
Upstash operations, so `error.message` was not reliably this route's own
wording: a non-timeout `fetch` rejection keeps undici's, and `@upstash/redis`
rejects with text that can name the REST endpoint — half of `KV_REST_API_URL`,
a credential by CLAUDE.md's table. Since `/api/daily-warmup` returns this body
verbatim as its own `detail`, anything quoted reaches every holder of
`CRON_SECRET`. Quoting is now opt-in: the route marks the messages it authors
(the relabelled timeouts, `token exchange failed (HTTP …)`,
`searchAnalytics(…) failed (HTTP …)`) with a module-private Symbol — unforgeable
by a library or a downstream — and everything else answers
`Search Console report failed; see server logs` while the real error goes to
`console.error`. The timeout classification is carried as a separate `timedOut`
field so it survives the fixed message and any future reword of the label.

### Setup, which must be done by hand

1. **Verify the property** in Search Console. Set
   `GOOGLE_SITE_VERIFICATION` in Vercel; the root layout emits the meta tag
   only when it is present.
2. **Submit** `https://ma.codes/sitemap.xml`.
3. **Create a service account**, grant it read access to the property, download
   the JSON key, and set `GSC_SERVICE_ACCOUNT_KEY` in Vercel as
   **base64-encoded JSON** (`base64 -i key.json`). Base64 because a raw key
   contains newlines inside `private_key` and every env-var UI mangles those
   differently.
4. Set `GSC_SITE_URL` if the property is URL-prefix
   (`https://ma.codes/`) rather than Domain (`sc-domain:ma.codes`, the default).

Steps 1 and 3 have a Google half that cannot be scripted (clicks in Search
Console and the Google Cloud console) and a Vercel half that can.
`scripts/set-gsc-credentials.mjs` does the second:

```sh
node scripts/set-gsc-credentials.mjs \
  --verification <token from Search Console> \
  --key ./service-account-key.json
```

It validates the key's shape before sending (a malformed one otherwise fails at
request time, days later, in a cron run nobody is watching), base64-encodes it,
writes both variables to Vercel production over STDIN rather than argv, prints
neither value, and then prints the `client_email` — which is not a secret and is
the address that has to be added as a user on the property.

> **The service-account key is a real secret.** Name in `.env.example`, value in
> Vercel only. See `CLAUDE.md` §1. It belongs **outside** this tree; the command
> above names a path in the repository root only because that is where someone
> will put the file they just downloaded. `service-account-key*.json` and
> `*-service-account*.json` are gitignored (added 2026-09-24) so the obvious way
> to run this cannot leave a live RSA private key one `git add -A` from a public
> repo. That is a net, not a plan: a key committed under any other name is still
> a rotate-first incident, and rotation comes before any history rewrite.
>
> Environment variables are baked into a deployment when it is **created**, not
> read per request, so production must be redeployed before either takes
> effect. The same property means a variable deleted after a deploy keeps
> working until the next one — which is how the contact form's SMTP credentials
> were absent from the project for nine days without anything failing.

### Reading the Page indexing report

Some "not indexed" rows are the site working as designed. Before fixing
anything, match the URL against this list:

| Reason | URL | Why it is correct |
|---|---|---|
| Page with redirect | `http://ma.codes/…` | Vercel 308s every `http://` request to `https://`. |
| Page with redirect | `www.ma.codes/…` | `next.config.mjs` `redirects()` 308s the www host to the apex (§2). |
| Alternate page with proper canonical tag | `/Muhammad_Abdullah_CV.pdf` | Its `Link` header names `/cv` as the canonical (§4, 2026-09-26). |
| Alternate page with proper canonical tag | any `?utm_…` or other query-string variant | Every page's canonical drops the query. |
| Not found (404) / Excluded by `noindex` | a URL that never existed | The 404 page is `noindex` on purpose. |

Anything **outside** that list is a real finding. Two in particular mean
something regressed: an HTML route under "Duplicate without user-selected
canonical" (the route has lost its canonical, so check `sectionMetadata()`),
or a sitemap URL under "Page with redirect" (the sitemap is emitting a
non-canonical form). After a fix, use **Validate fix** in the report. Search
Console re-crawls the affected URLs over the next few days to weeks.

### Report lag

The window ends **three days ago** and spans 28 days. GSC data lags ~2 days and
the most recent days are always incomplete, so a window ending "today" shows a
cliff that looks like a traffic collapse and is purely an artefact.

**28 days counted the way the API counts them** (fixed 2026-09-17). Search
Console treats `startDate` *and* `endDate` as inclusive, so the first cut —
`start = LAG_DAYS + WINDOW_DAYS`, `end = LAG_DAYS` — requested **29** calendar
days: the arithmetic counted the gap between the endpoints while the API counted
the days. Every total, CTR and average position was computed over a day more
than this page and the response's own `window` field claimed, and because a
29-day figure was compared against another 29-day figure nothing looked wrong.
The start offset is now `LAG_DAYS + WINDOW_DAYS - 1`, derived once and used by
both the request and the `window` recorded in the snapshot — the two
disagreeing would be worse than the off-by-one, since the stored window is what
a later reader trusts when interpreting the figures. Pinned as an inclusive day
count in `tests/unit/seoRequestContract.test.js`.

### The comparison baseline, and why a rerun stores nothing

The API can only report a *window*; it cannot say what changed since you last
looked. That is the entire reason snapshots are stored, and it makes the choice
of baseline the part most worth getting right.

**Both keys expire** (fixed 2026-09-17). `SNAPSHOT_TTL_SECONDS` is the 90-day
policy, and only the daily keys carried it: `seo:gsc:latest` was written without
an expiry, and it holds a *full* snapshot — every query, page and country row of
the run that published it. A rolling 90-day store with one permanent key that
grows as the site accrues impressions is not a retention policy. The publish
script now takes the TTL as an argument (`ARGV[3]`) so both writers read the
same constant. In steady state the pointer never actually expires, because every
run rewrites it and restarts the clock; the expiry only bites after 90 days with
no successful run, by which point the baseline is older than the retention
window and worthless as a comparison anyway.

Both `seo:gsc:<date>` and `seo:gsc:latest` hold the **first** snapshot captured
on their day. The daily key is claimed with `nx`, and that claim — not a date read
a moment earlier — decides which run owns the day. A run that loses it reads back
the snapshot that won and republishes *that* as `latest`, so a second run reports
fresh figures without becoming the baseline (`rerun: true`), and a `latest` left
stale by a half-completed run is repaired rather than skipped.

Without that, the second run became tomorrow's baseline, tomorrow compared
against an afternoon capture instead of the morning one, and every new query and
position drop from the hours in between was reported by *no* run — silently,
with both responses looking perfectly well-formed.

**`nx` only serialises runs that share a daily key** (tightened 2026-09-13), and
two runs either side of UTC midnight do not: one claims `seo:gsc:<day1>`, the
other `seo:gsc:<day2>`, both claims succeed, and nothing ordered their `latest`
writes. With an unconditional `SET` the last writer won — and the likely last
writer is the run that was already delayed, i.e. the *older* one. The baseline
then went **backwards**, which is the original failure one boundary over: the
next report compares against data a day too old and silently skips everything in
between.

`latest` is therefore published by a Lua compare-and-set (`PUBLISH_LATEST_LUA`),
not a `SET`. Redis runs a script atomically, so the version check and the write
cannot interleave — a read-then-write in JS would be the same race with more
steps. The version is the snapshot's own `capturedAt`: `toISOString()` is fixed
width and always UTC, so a lexicographic compare in Lua *is* chronological and
nothing has to parse a date. The comparison is strict, so an equal timestamp
still writes and the self-healing republish above keeps working; a stored value
with no readable `capturedAt` is overwritten rather than stranded. A run whose
snapshot was refused answers `baselinePublished: false` and logs it.

`tests/unit/seoReportBaseline.test.js` pins both halves: three runs across a day
boundary for the rerun case, and a delayed run publishing *after* a newer day for
this one — asserting on the stored baseline rather than the payloads, which
looked correct before the fix either way.

`rerun: true` is also the thing to check before reading an empty report: near-empty
findings mean "you have already run this today", not "the site stopped ranking".

A **missed** day is handled by the same pointer degrading gracefully — `latest`
means "the last day that actually captured", so a gap widens the comparison
window rather than resetting it. This is why the baseline is not simply
yesterday's dated key: one skipped run would leave that key absent, and an absent
baseline makes every query look new.

---

## 10. Runbook

### Adding a route

1. Write the English title and description (110–160 chars) in
   `messages/en/Meta.json` under `routes.<key>`. Since #82 that catalogue is
   the one source for the English `<title>`, the translation pipeline's input
   and every locale's metadata.
2. Add an entry to `ROUTES` in `src/lib/seo/site.js`: path, that `key`,
   `title` / `description` read from `META.routes.<key>`, `changeFrequency`,
   `priority`, `sources`. Add `translated: false` only for a document that
   stays English in every locale (§18). Its `sources` name the files under
   `src/app/[locale]/…`; the sitemap appends `messages/` to every translated
   route itself.
3. Put the page under `src/app/[locale]/(sub pages)/`. Export
   `generateMetadata({ params })` returning `routeMetadata(ROUTE.path, params)`
   (`src/lib/og/meta.js`), which composes `sectionMetadata` from the localised
   copy and adds the hreflang set. In the page, call `setRequestLocale(locale)`
   and wrap the content in `<IntlScope locale={locale} route={ROUTE.path}>`.
4. Give the route the namespaces its client components read in
   `ROUTE_NAMESPACES` (`src/i18n/namespaces.js`). Use a dotted subtree
   (`Data.journey`) where it renders one slice of a shared namespace.
5. Render a `<JsonLd>` block — `sectionPage()` unless a more specific type fits —
   passing `locale`, so `inLanguage` and the page `@id` follow it.
6. Translate and audit (*Translations*, below).
7. Give the page's full-bleed background `loading="eager"` and
   `fetchPriority="low"`, never `preload` (§19). A viewport-covering image is
   never the LCP, and without the low hint React preloads it anyway. `preload`
   is only for an image that measured as the route's LCP, and it then needs an
   entry in `tests/fitness/imageLoadingPolicy.test.js`.
8. Run `npx vitest run tests/unit/sitemapDrift.test.js tests/unit/metadataContract.test.js tests/unit/i18nAlternates.test.js tests/fitness/i18nCatalogues.test.js tests/fitness/i18nBudget.test.js tests/fitness/imageLoadingPolicy.test.js`.

**Skipping step 1 fails CI.** The drift test walks `src/app` on disk and fails
on any `page.js` that is in neither the registry nor its own `EXCLUDED` map —
verified by adding a throwaway route and watching it go red.

**`sources` must name the directories the route actually renders from**, which is
worth checking against the route's own imports rather than reasoning from the
name. `/projects/[id]` had been watching `src/components/projects` — the
`/projects` LISTING directory, and the correct value for the entry directly above
it — while the detail route renders out of the sibling
`src/components/project-detail`. A wrong-but-real path does not fail anything: it
produces a perfectly well-formed `<lastmod>` carrying another file's date, which
goes stale when the route changes *and* moves when something unrelated does. Only
the project route's list is pinned against its imports on disk (the `project
detail sources` cases in `sitemapDrift.test.js`); for a new route, read the
`page.js` import block.

**An entry with routes beneath it names FILES, and must name its two card
handlers among them.** `opengraph-image.js` and `twitter-image.js` are siblings
of a `page.js` that nothing imports — Next composes the pair by convention — so
a directory entry covers them for free and a file list silently does not. Both
errors cost a wrong date and neither looks wrong at either end:

- *Too broad.* `/notes` watched `src/app/(sub pages)/notes`, which holds
  `[slug]/` — so editing a note's TEMPLATE re-stamped the index, a date
  asserting a change that did not happen to that document. `/projects` was
  narrowed to files for this reason on the day it was written; `/notes` was not
  (fixed 2026-09-24).
- *Too narrow.* Narrowing is what puts the handlers outside every list.
  `NOTE_SHARED_SOURCES` named `page.js` and the reader and stopped, so redrawing
  a note's share card changed what every crawler and unfurler displays for all
  of them while `<lastmod>` swore the documents had not moved (same fix).

The four lists that must name handlers today are `/projects` and `/notes` in
the registry, and `PROJECT_SOURCES` and `NOTE_SHARED_SOURCES` in `sitemap.js`.
The drift test's *watches the card renderer of every route that publishes one*
case now derives the dynamic routes from disk and **fails on any it cannot
date**, so a third dynamic route cannot quietly inherit this gap the way the
second did — it was a hardcoded list of the project pair, and a hardcoded list
cannot fail for a route it does not mention.

**On a DYNAMIC route the same non-inheritance costs a second thing: the card
handlers must restate `generateStaticParams` *and* `dynamicParams = false`.**
Independent composition means the pair inherits neither from the `page.js` next
door, and the two exports do different jobs — `generateStaticParams` says
"prerender at least these", `dynamicParams = false` is what closes the set.
Restating only the first leaves the route prerendering the real slugs while
still answering *any* other slug on demand with whatever the handler's fallback
draws, so `/notes/anything-at-all/opengraph-image` returns a 200 and a generic
card instead of a 404. Nothing about the build output says so — the route
prints as `●` either way, because the enumerated params did prerender; the
difference only appears when you request a slug that is not one of them. Both
dynamic routes export the pair from their `opengraph-image.js`, and each
`twitter-image.js` carries **both** alongside `default`/`alt`/`size`/
`contentType` — it is a separate module again, so closing the set next door
does nothing for it (fixed 2026-09-24; `/notes` had shipped with neither).
`generateStaticParams` is re-exported, but `dynamicParams` is declared in the
file itself: from Next 15 a re-exported segment config is ignored with a single
build warning and the default (`true`) applies, which silently reopened both
sets during the upgrade (fixed 2026-10-11; `tests/fitness/routeSegmentConfig.test.js`
now fails on any re-export).

**Under `[locale]` (#82), a closed set must also name the locale** (fixed
2026-11-07). The multilingual merge put every route beneath a `[locale]`
segment, and the card handlers do not inherit the layout's locale list any
more than they inherit the page's ids. The two dynamic handlers still returned
`{ id }` and `{ slug }` alone. With the set closed, that list matched no URL:
the build prerendered no project or note card, and every project and note page
advertised an `og:image` and `twitter:image` that answered **404**, in every
language. The build still printed both routes as `●`. It was found by
requesting the image URLs production served. Both now build their list from
`localeParams()` × ids, the helper the static cards already used. The same
check found the `[locale]` segment itself open: a one-segment path with a dot
(`/favicon.ico`, `/ads.txt`, a scanner's `/wp-config.php`) skips the proxy,
arrives as the "locale" `favicon.ico`, and was answered **500** ("Page changed
from static to dynamic at runtime"), about 25 times in three days of logs. The
layout now declares `dynamicParams = false`, so those are 404s.
`tests/fitness/localeParamSets.test.js` fails on either gap.

**You do not add `src/lib/seo/site.js` yourself** — `SHARED_ROUTE_SOURCES` is
appended to every entry when `ROUTES` is built. It is there because the registry
is itself published: a route's `title` and `description` become its `<title>`,
meta description, OG/Twitter fields, JSON-LD description and `llms.txt` line, and
`ORIGIN`/`IDENTITY` reach every page through `canonical.js` and `schema.js`. Until
2026-09-12 no list named it, so editing a description changed five published
surfaces at a URL while the sitemap swore it had not changed.

**`src/app/data.js` you do add yourself, but only if the route renders from it.**
It holds `projectsData`, `journeyData`, `usesData` and `BtnList` — content, not
infrastructure — and six routes list it: `/`, `/projects`, `/journey`, `/about`,
`/qualifications` and `/uses`, plus the project pages. The test to apply is not
"can this route reach the module", because every route can: the registry imports
`projectsData` to count builds for the `/projects` description, so `/contact`,
`/my-past` and `/guestbook` reach it while rendering nothing from it. The rule is
**reachable by a path that does not pass through `src/lib/seo/site.js`**, and
`sitemapDrift.test.js` enforces it as a biconditional — a route that renders from
the module and does not watch it fails, and so does one that watches it without
rendering from it.

**Some inputs are shared, and still belong on the individual entries.** Three
are in neither shared list because the set of URLs publishing each is neither
"all of them" nor "all but the homepage":

- `src/components/PageTitle.jsx` renders the `<h1>`/`<h2>` of the eight section
  routes — real text in the server HTML. Not `/` (its headline is the orbit
  hero) and not `/projects/[id]` (its heading comes from the project record), so
  either shared list would stamp URLs that publish none of it. It is spread from
  the `PAGE_TITLE_SOURCE` constant rather than typed eight times, because a
  typo'd pathspec fails *silently* — `git log` over a path that matches nothing
  simply contributes no date. Silently at runtime, that is: since 2026-09-18
  every entry in every route's `sources` is `statSync`'d by
  `sitemapDrift.test.js`, so a misspelling fails CI naming the route and the
  path. The shared lists and the project set each had that check; the per-route
  lists, the largest and most edited of the three, did not.
- `src/lib/numberWords.js` decides how a count is *spelled*, and two published
  sentences read through it: the homepage's `sr-only` summary and the
  `/projects` description the registry composes. `/projects` reaches it only
  through the registry, which is where this differs from the `data.js` rule
  above — the registry is computing *that route's own* snippet, not another
  route's, so it is genuinely that URL's crawl surface.
- `src/components/footer/footer-data.js` holds the two profile URLs `schema.js`
  states as the Person's `sameAs`. The nineteen non-home URLs cover it through
  `src/components/footer`; `/` publishes it through the root layout's graph
  while rendering no footer, so it names the module exactly — watching the whole
  directory there would re-stamp the sitemap's highest-priority URL for every
  footer edit.

The `narrowly shared sources` cases in `sitemapDrift.test.js` enforce all three
as biconditionals, reading reachability off disk in both directions.

Watch out for `layout.js`. Three routes (`/about`, `/qualifications`,
`/guestbook`) have client-component pages that cannot export `metadata`, so their
metadata and JSON-LD live in a pass-through layout — `/qualifications` reads
`journeyData` there and publishes it as credentials. Reading only `page.js` when
deciding `sources` misses it.

**A `'use client'` page still prerenders, and the line runs through what it
prerenders.** `/about` watches `src/utils/experience/experiencePresentation.js`
because `buildExperienceCardLabel` runs during that prerender with no payload
yet, so its `loading` sentence ships in the server HTML as the years card's
`aria-label` — editable with nothing in `src/components/about` touched. The
hook, `/api/experience-summary` and `journeyEmployment` are deliberately *not*
watched: they decide what the card says after hydration — the months, the split,
the breakdown rows — and none of that is ever in the HTML a crawler reads.
`<lastmod>` dates the crawl surface, not the module graph, and listing them
would re-stamp the URL for changes no crawler can see.

**And watch out for inputs that are not imports at all.** `/uses` reads eight
repository paths at build time through `readBuildFacts()` — `package.json`,
`package-lock.json`, `.nvmrc`, `vercel.json`, `.github/workflows`,
`tests/vitest-cases.json`, `tests/browser-cases.json` (the two test counts, each
written from its runner's own collected list), `src/app/api` — with `fs`, not
`import`, so no dependency walk can
find them. Listing `src/lib/uses` covers the *reader*; it says nothing about what
the reader *reads*, and that distinction is what left a dependency bump able to
rewrite the page's bill of materials with the timestamp unmoved. If a new route
ever derives content from a file it opens rather than imports, its `sources` need
that file by name. The `uses build facts` cases in `sitemapDrift.test.js` pin this
one by scraping `buildFacts.js` for path literals that exist on disk.

The consequence to know about: `git log` resolves **per file**, so all nine routes
share that one input. Editing a single route's description moves every route's
`<lastmod>`, and so does editing `AI_CRAWLERS`, which changes only `robots.txt`.
That is the same granularity every other entry already has — `src/app/data.js`
sits in three lists — and it is the deliberate direction to err in, since an
over-stamped date costs a crawl and a stale one suppresses it. If a route ever
needs a date of its own, the fix is to move its metadata into a per-route file,
not to reach for `git log -L`: line ranges break on the next reformat of the array
and fail silently.

### Credentials: only what has been awarded

`credentialsFromJourney` emits a `type: 'education'` entry **only once it has an
`end` date**, and dates it by that completion.

The reason is the property, not the date. `Person.hasCredential` is defined as
"a credential **awarded to** the Person", so listing study still in progress
asserts possession of a qualification that has not been conferred. An earlier
cut dated every record by `start` specifically to avoid naming a completion that
had not happened — which made the date honest and left the stronger claim false.
It also disagreed with the page it was attached to: the `/qualifications`
carousel shows awarded certificates only, and the BSc is not among them.

Nothing needs remembering when that changes. Fill in `end` on the journey entry
the day the degree is conferred and it joins the structured data by itself,
dated by the award.

> **Known gap while the BSc is in progress.** The degree is now absent from
> every structured-data surface, and §7's intent table still names "software
> engineering degree" as a target for `/qualifications`. Schema.org has no
> well-supported way to say "currently enrolled" on a `Person`
> (`alumniOf` would be just as false), so the honest place to state it is
> prose — the route description in `ROUTES`, or the page copy, which is what
> answer engines read anyway. Deliberately left as an editorial decision rather
> than papered over with a schema property that does not mean what it says.

### Adding a project

Add it to `projectsData`, then regenerate and translate its copy:

```bash
npm run i18n:data        # derive messages/en/Data.json from src/app/data.js
npm run i18n:translate   # translate the new strings into every locale
npm run i18n:audit       # what CI runs
```

Nothing else needs editing. `sitemap.js` generates the URL in every locale,
`/llms.txt` describes it, `/projects/[id]` gets its params, and the two places
that state the count in prose both recount themselves:

| Surface | How the count is stated |
| --- | --- |
| `/projects` meta description (`src/lib/seo/site.js`, `messages/*/Meta.json`) | `{countWord}` in the catalogue, filled with `countWord(projectsData.length)` in English and a locale-formatted number elsewhere |
| Homepage `sr-only` summary (`src/app/[locale]/(home)/page.js`, `messages/*/Home.json`) | `{count}` in the catalogue, filled with `countWord(projectsData.length).toLowerCase()` in English and a locale-formatted number elsewhere |

`npm run i18n:data` matters because the content catalogue is derived, not
hand-written. Skip it and `i18nCatalogues.test.js` and the audit both fail on
the stale `Data.json`, and until it runs the new project's copy has no
catalogue entry for the translator to work from.

`tests/unit/projectCountDrift.test.js` fails if either goes back to a typed
number — which is how both were originally written, and how they would have
kept saying "eleven" after a twelfth project landed.

**`countWord` lives in `src/lib/numberWords.js`, not in the registry**, and that
placement is load-bearing: the homepage is `'use client'`, so importing it from
`src/lib/seo/site.js` would pull every route's metadata into the browser bundle.
The module imports nothing, which is what keeps it usable from either side of
the server/client line.

Deriving the homepage count is close to free because `Navigation` already
imports `BtnList` from `@/app/data`, so the project array is in that route's
bundle either way — `.length` cannot be tree-shaken away from the array it
belongs to. Measured at the time: `/` went from 32.7 kB to 32.9 kB, with First
Load JS unchanged at 191 kB.

> **`src/lib/seo/site.js` must stay server-only.** It reads `projectsData` so
> the registry can state counts without anyone retyping them, which is free
> today because every importer is a server module. A `'use client'` importer
> would pull the registry — and everything it references — into a browser
> bundle.

### Adding a note

Drop the markdown in `docs/`. There is no registry entry to write: the slug
comes from the filename (override it in `SLUG_OVERRIDES` if the filename is not
what a reader should see in a URL), and the sitemap, `generateStaticParams` and
the share cards all expand the same `readNotes()` call.

Two things are derived from the file and only one of them is bounded, so run
`npx vitest run tests/unit/metadataContract.test.js tests/unit/notesCorpus.test.js`
and read what it says:

1. **The title** is the H1. It is subject to the same ≤60-rendered-character
   rule as every other route, measured after the `%s · Muhammad Abdullah`
   template.
2. **The description** is composed by `src/lib/seo/noteMeta.js` and must land in
   110–160. It prefers the document's opening paragraph, which is the outcome
   to aim for — a note that introduces itself in one paragraph of the right
   length needs nothing else. Where the opening paragraph is not a summary (a
   reference line, a table, a heading), the test fails naming the document and
   the length, and the fix is a curated entry in that file's `CURATED` map, not
   a rewrite of the document's first line to suit a search engine.

Do not add a curated entry pre-emptively for a document that does not need one:
it is an override, and an override written beside a paragraph that already
works is a second description that will silently stop matching the first.

### Replacing the CV

```bash
node scripts/seo-pdf-metadata.mjs                            # set /Title etc.
npx vitest run tests/unit/pdfExperienceFixture.test.js       # parser still reads the binary
npx vitest run tests/unit/cvJourneyConsistency.test.js       # CV and journeyData still agree
```

Run both, and in that order — the second can only compare while the parser the
first pins still works.

Neither one is guarding a live page: `/about` derives employment from
`journeyData`, not from this file. What they guard is the **published PDF
agreeing with the HTML record**. The PDF's canonical is `/cv` (§4, 2026-09-26),
so a replacement needs no sitemap or header change. See §4 for which failure means what, and note that a
genuine CV edit is expected to fail the consistency test — that is the check
doing its job, and the fix is to reconcile `journeyData` or declare the
divergence, not to loosen the test.

### Touching browser storage, or anything a visitor sends

The privacy page is **generated from a module, and the module is enforced**, so
this is a two-line job rather than a documentation exercise — but skipping it
fails CI rather than going quietly.

1. Add the key to `STORAGE_KEYS` in
   [`src/lib/privacy/inventory.js`](../src/lib/privacy/inventory.js) with its
   `kind` (`localStorage` / `sessionStorage`), a `group` that exists in
   `STORAGE_GROUPS`, and a `purpose` written **for a reader** — it is published
   verbatim on [`/privacy`](https://ma.codes/privacy).
2. `npx vitest run tests/unit/privacyInventory.test.js`

```bash
npx vitest run tests/unit/privacyInventory.test.js tests/unit/consentStore.test.js
```

The drift test walks every `.js`/`.jsx` under `src/`, finds each
`localStorage` / `sessionStorage` call, resolves the key expression to the literal
it stores under, and fails on any key the inventory does not disclose. Verified
to fail by adding a throwaway key and watching it name the file and the line.

It checks four things, and the last two are the ones that catch a *stale*
document rather than an incomplete one:

- Every resolvable key is disclosed.
- Every expression it **cannot** resolve is declared in that test's
  `DYNAMIC_KEYS` map, naming the pattern it produces, with a written reason.
  A key built by a function or a template literal does not get to be invisible.
- The declared `kind` matches how the key is actually used. `/privacy` prints
  "this tab only" or "until you clear it" from that field, so getting it
  backwards is a small, specific lie about how long something is kept.
- Nothing is disclosed that the site no longer stores.

It found three key families the hand audit had missed when it was first written
— `github-stats:lastGood:<username>`,
`experience-summary:last-payload:<username>` and the retired `projects-category`
the handoff module still deletes — which is the argument for having it.

**A new third party, a new cookie, or a new thing kept server-side** goes in the
matching array in the same file (`PROCESSORS`, `COOKIES`, `SERVER_DATA`). Each
row names the source file it came from and the test asserts that file still
exists, because the page's standfirst invites the reader to check any claim
against the code and a citation pointing at a moved file turns that invitation
into an embarrassment.

#### The counts in the page's prose recount themselves

Three ledes on `/privacy` say how many of something the section beneath them
lists. All three interpolate `countWord()` over the array rather than spelling
the number out, so adding a row is still the two-line job above — the sentence
follows on its own.

| Lede | How the count is stated |
| --- | --- |
| §1 Analytics | `` `${countWord(ANALYTICS_SURFACES.length)} scripts` `` |
| §2 Cookies | `` `${countWord(COOKIE_COUNT)}, all from the guestbook sign-in` `` |
| §6 Not tracking | `` `all ${countWord(NOT_VISITOR_DATA.length).toLowerCase()}` `` |

`COOKIE_COUNT` is deliberately **not** `COOKIES.length`. The PKCE pair shares one
row because it shares one purpose and one lifetime, so four rows describe five
cookies — and what the page states is the number of *cookies*, which is what a
reader can check in their own devtools. Deriving a count is only safe when it
derives the thing actually being claimed.

`tests/unit/privacyInventory.test.js` fails if any of the three goes back to a
typed word, and separately if `COOKIE_COUNT` collapses into a row count. Same
mechanism as `projectCountDrift.test.js` (§ Adding a project), pointed at the
page that can least afford a wrong number.

**Why it exists (fixed 2026-09-25).** §6 was written as "all three are data about
me" and was wrong by the end of the same sitting: the CV row §4 of this document
asked for by name became the fourth, and nothing counted. A stale figure one
layer above a generated table is the worst version of this defect, because the
machine-checked list underneath it lends the sentence a credibility it has not
earned — and CLAUDE.md's rule against hand-copied figures applies to the framing
prose around generated data, not just to the data.

**A new analytics or measurement script** goes inside
[`ConsentedAnalytics.jsx`](../src/components/privacy/ConsentedAnalytics.jsx),
below its `if (!analytics) return null`, and into `ANALYTICS_SURFACES` so the
preference centre names it. Never in `src/app/layout.js` —
`tests/unit/gaConsentMode.test.js` fails on that, because a mount there bypasses
the gate entirely while looking completely ordinary in review.

**If what a visitor is agreeing to materially changes**, bump `CONSENT_VERSION`
(and the `v1` in `CONSENT_KEY` with it — the test pins that they agree). Every
stored decision then reads as `undecided` and everyone is asked again. That is
the only safe direction, and it is deliberately the *only* thing a bump can do:
it can neither silently grant nor silently deny. Reword a sentence without
bumping it; change the bargain and bump.

### Translations

English copy lives in `messages/en/<Namespace>.json`, one file per namespace.
The content fields of `src/app/data.js` are the exception: they are derived into
`messages/en/Data.json` (and the `links` block of `Nav.json`) by
`npm run i18n:data`, so edit `data.js` and regenerate rather than editing the
derived file. Every other locale is `messages/<code>/`, and
`messages/.i18n-lock.json` records, per locale and key, a hash of the English
each translation was made from.

**After changing any English string:**

```bash
npm run i18n:data                          # only if src/app/data.js changed
npm run i18n:translate -- --dry-run        # what would be sent; needs no key
npm run i18n:translate                     # every locale, only what changed
npm run i18n:audit                         # what CI runs; must report 0 errors
```

**After adding any visible text, label or `aria-label`:** CI also crawls every
page in the pseudo-locale `en-XA` and fails on English that never reached a
catalogue (`docs/testing.md`, "The pseudo-locale gate"). To run it locally:

```bash
npm run test:i18n        # i18n:pseudo → build with NEXT_PUBLIC_I18N_PSEUDO=1 → crawl
```

A name, an address or data (a repository, a package, a town) is not a leak:
mark its element `translate="no"`. Never set `NEXT_PUBLIC_I18N_PSEUDO` on
Vercel: the pseudo-locale would become a public route. It is not in `LOCALES`,
so it is never in the sitemap, `hreflang` or the selector, but a build with
the flag still serves `/en-XA`.

`i18n:translate` needs `AI_GATEWAY_API_KEY` in `.env.local` (or the
`VERCEL_OIDC_TOKEN` that `vercel env pull` provides). It sends only keys that
are **missing** in a locale or whose English hash has **changed**, so editing
one sentence costs one sentence per locale, and a key whose English has not
changed is never sent again. A translator's hand edit survives every later run
for that reason, except a `--force` run, which retranslates everything it
selects and so overwrites reviewed work. The keys in the script's `HAND_SET`
(the owner's name, `Common.owner.*`, §18) are never sent, not even under
`--force`: edit them in each locale's `Common.json` by hand, and when adding a
locale, add its spelling there before running the audit. `--locale ar,ja`, `--ns Home`, `--force` and `--dry-run`
are documented in the script's header; `--model` (or `I18N_MODEL`), `--batch`
and `--concurrency` are read beside them, and the model defaults to
`anthropic/claude-sonnet-5.5`. Every response is checked
by `icuProblems` (`scripts/i18n-lib.mjs`) and retried with the error stated, up
to three times, before anything is written.

**The one interaction to know about.** When English changes, the audit reports
that key as `outdated` in every locale, and the next `i18n:translate` run
replaces it with a fresh machine translation — in a reviewed locale too. The
locale's `status` stays `reviewed`, so after a copy change to a reviewed
locale, ask its reviewer to look at the changed keys. `--locale xx --dry-run`
shows how many keys per namespace a run would replace before you make it.

**A locale goes from machine to reviewed** through one pull request, labelled
`i18n:locale-<code>`:

1. A native speaker edits `messages/<code>/*.json`, using the context in
   `messages/_notes/<Namespace>.json` and keeping the ICU structure (the
   translator workflow in `CONTRIBUTING.md` has the rules).
2. The same PR changes that locale's `status` from `'machine'` to `'reviewed'`
   in `src/i18n/locales.js`. That is the only thing that removes the
   "machine-translated" notice, and nothing else should ever change it: not
   the translation script, and not a maintainer who has not had the review done.
3. The maintainer reviews **layout**, not language. Right-to-left locales are
   checked at ≥ 1024, 640–1023 and ≤ 479 px, because a longer string is what
   breaks a layout.
4. `npm run i18n:audit` passes.

**Adding a locale** is one row in `LOCALES` (`src/i18n/locales.js`): code,
endonym, English name, `dir`, `hreflang`, `og`, `script`, `tier`, and
`status: 'machine'`. Then run `npm run i18n:translate -- --locale <code>`. Check
that its `script` has a font chain in `src/i18n/fonts.js`, and add a register
line for it to `REGISTER` in `scripts/i18n-translate.mjs`.
`tests/unit/i18nLocales.test.js` pins the launch count and the set of
right-to-left codes, so it fails until it is updated, deliberately: a new locale
adds a URL to every translated page, every sitemap cluster and every hreflang
set.

### Weekly

- Read the latest `/api/seo-report` output (or `seo:gsc:latest` in Upstash).
  Act on `lowCtrPages` first — but read it as a list of pages worth
  **investigating**, not a diagnosis.

  **Check `position` before you conclude anything.** The filter is
  `impressions >= 50 && ctr < 0.01` and says nothing about rank, so a page
  sitting at average position 40 qualifies exactly like one at position 3. A
  result below the first page collects few clicks almost regardless of how good
  its snippet is, so a poor average position is itself a sufficient explanation
  for low CTR. Each row carries `position` for this reason — use it to split the
  list in two:

  - **Ranking well and still not clicked** — the interesting case, and the one
    the rest of this section is about.
  - **Ranking poorly** — low CTR is the expected consequence, not a separate
    problem. Rewriting the description here fixes nothing; the work is
    relevance, internal links and content depth, i.e. the ranking itself.

  A page can of course be both, and average position is an *average* across
  queries and devices — a page averaging 12 may sit at 4 for the query that
  matters and 30 for a long tail. That is another reason to look at the live
  result rather than acting on the row alone.

  **Look at the live result before rewriting anything.** Google composes the
  snippet itself and frequently ignores `<meta name="description">` in favour of
  a passage from the page, chosen per query; it rewrites title links too, though
  less often. So the description is an input Google may take, not the text we
  publish. Search the query the page ranks for, read what is actually displayed,
  and then fix whichever input it came from — the description if Google is using
  it, the on-page copy if it is not. Re-check after the page is next crawled
  rather than expecting the change to land immediately, and treat a rewritten
  snippet as information: it usually means Google judged the description a worse
  answer to that query than the body copy.

  If the findings come back near-empty, check `rerun` before concluding anything
  (§9).
- Check `droppedPositions` for regressions while they are still cheap.

### Monthly

- Search Console → Enhancements: zero errors expected.
- Re-run the identity-consistency check (§11).
- Ask an assistant "who is Muhammad Abdullah, the software engineer?" and read
  the answer. **This is the actual goal**; everything else is instrumentation
  for it.

### Verifying the whole surface

```bash
npm run build
npx playwright test tests/e2e/seo.spec.js     # incl. every sitemap URL → 200
npx vitest run tests/unit/sitemapDrift.test.js tests/unit/metadataContract.test.js \
              tests/unit/schema.test.js tests/unit/cspAnalytics.test.js \
              tests/unit/gaConsentMode.test.js tests/unit/privacyInventory.test.js \
              tests/unit/consentStore.test.js tests/unit/i18nAlternates.test.js \
              tests/unit/i18nProxy.test.js
npm run i18n:audit
```

`i18nAlternates` and `i18nProxy` are #82's: the hreflang cluster is reciprocal
and English canonicals are unchanged, and no browser language ever redirects
anyone. The audit is the catalogue check CI runs.

The three before them are #141's and belong in this list for the reason the others do:
they guard claims that are **published** and that nothing else can check. The
consent gate is the only thing standing between an undecided visitor and three
measurement scripts, and `/privacy` is a document that is legally required to be
true and structurally guaranteed to go stale.

The e2e suite asserts origins against `NEXT_PUBLIC_SITE_ORIGIN` when it is set,
reading the same `.env*` files the build read, and `https://ma.codes`
otherwise. A fork that sets the variable before `npm run build` runs the suite
unchanged. It must be the same value at build and at test time: the `Link`
header and the canonicals are fixed when the site is built.

---

## 11. Entity consistency

An engine merges the site, GitHub and LinkedIn into one entity by matching these
strings. **Divergence is what stops the merge**, so they must stay
byte-identical across all three:

| | Value |
|---|---|
| Name | `Muhammad Abdullah` |
| Role | `Software Engineer` |
| Location | `Bolton, Greater Manchester` |
| Site | `https://ma.codes` |

Single source: `IDENTITY` in `src/lib/seo/site.js`. `sameAs` is sourced from
`footer-data.js` (P5) rather than a second list, so the schema and the visible
footer links cannot disagree.

---

## 12. Deliberate deviations from the issue

Recorded so they read as decisions rather than omissions.

| Issue asked for | What shipped | Why |
|---|---|---|
| `Person.knowsAbout` from live `/api/github-skills` | Derived from `usesData.stack` | The claim must be in server HTML to matter, so it would have to be fetched at **build** — making `next build` depend on a secret and a network call, failing or silently emptying when the token is absent or rate-limited. And a build-time fetch is a *snapshot*, which rots exactly like a curated list while being invisible to review. `usesData.stack` is the reviewed mirror of that same crawl, already rendered on `/uses`, so schema and page cannot disagree. |
| `programmingLanguage` on each project | ~~Omitted~~ → **now published**, from a committed map | The original objection was to the SOURCE, not the property: `/api/github-skills` would have made `next build` depend on a secret and a network call. `src/data/project-languages.json`, regenerated by an explicit script run and reviewed as a diff, has neither problem. See §13. |
| `EducationalOccupationalCredential[]` from the qualifications carousel | Derived from `journeyData`, **awarded entries only** | The carousel's `CARDS` array is inside a `'use client'` module, is not exported, and carries only title/category/image — **no issuer and no date**, which is the half that makes a credential checkable. `journeyData` has both, and is already cross-checked against the CV. Entries still in progress (`end: null`) are filtered out: `hasCredential` means "awarded to", so the in-flight BSc would be a claim to hold a degree not yet conferred — see the note below. |
| GA4 mounted | CSP + event map + component + tests only — **the mount stayed with #141** (mounted 2026-09-22, reverted 2026-09-24, shipped behind the consent gate 2026-09-25 — see §17) | Consent Mode v2 with `analytics_storage: 'denied'` writes no cookie, which answers the *storage* question and not the one #141 asks: an undecided visitor must issue no analytics request, and a cookieless ping is still a request. See §14. |
| PDF accessibility tagging | `/Lang` only | Needs the LaTeX source. See §4. |
| Lighthouse CI in GitHub Actions | ~~Not built~~ → **built**, budgets measured first | The objection was to unmeasured budgets, and it was right: measuring first found three real defects that would have made a 100 floor unpassable. See §15. |
| `www` → apex at the Vercel domain level | Done in `next.config.mjs` | Reviewable, testable, survives a fork. See §2. |

### Also fixed, not in the issue's scope

- **`/about` rendered three `<h1>` elements.** Two stat cards used
  `<motion.h1>` for a *number*, so navigating by heading announced "11 completed
  projects" as a peer of the page title. Demoted to `<motion.div>` — nothing
  styles them by tag, so zero visual change. Caught by the e2e suite's
  "exactly one h1" check.
- **Alt-text audit (W7).** `alt="laptop"` on the hero, `alt="contact-bg"` (a
  filename read aloud) on `/contact`, and `alt="slide-0"` on the project-detail
  laptop screenshots. All three are decorative and are now `alt=""`. The
  `alt="CodeBucks"` values elsewhere are inside commented-out template dead
  code and never render.

---

## 13. The HTML CV, and `programmingLanguage`

Two decisions §12 recorded as deferred, both taken now. They are grouped
because they share a shape: neither was blocked on wanting the thing, both were
blocked on not having a source that could be trusted at build time.

### `/cv` — why the PDF was not enough

§4 shipped `Muhammad_Abdullah_CV.pdf` as a deliberately indexable document and
the closing note flagged an HTML route as *flagged, not decided*. Decided: the
PDF stays, and `/cv` is added beside it. A PDF structurally cannot do three
things, and each one matters most on exactly this document:

- **It carries no JSON-LD.** The page most likely to be reached by a search for
  a name plus a role could state nothing machine-readable about the person it
  describes.
- **It is a dead end.** Nothing in it links back into the site, so a crawler
  arriving at the most externally-linked URL on the domain finds no path
  onward — F8, restated for the worst possible page.
- **It is a fixed-width page on a phone**, which is the device a CV link opened
  from a message is most often read on.

The page derives from `journeyData`, for the reason `journeyEmployment.js`
already derives from it: the CV and the timeline are two records of one history
and they have drifted on real dates before. A hand-written HTML CV would be a
third copy and a third chance to disagree.

Two consequences worth stating rather than discovering:

- **No computed tenure.** The page is statically rendered, so "3 yr 2 mo" for
  an ongoing role would freeze at build time and drift further every day the
  site is not rebuilt — a figure wrong by construction (P4). It prints the date
  range, which stays true. `/journey` computes tenure live in the browser,
  which is where that is safe.
- **`worksFor` is not claimed.** It takes a single `Organization`, and the
  current state is two concurrent roles. Naming one would publish an
  exclusivity the data does not support. `hasOccupation` carries the roles
  without it.

`alumniOf` publishes `Manchester Metropolitan University`, not the `MMU` the
timeline shows. The short label is correct to *display* and useless to
*publish* — §11's argument is that divergence stops an entity merge, and an
alma mater no consumer can resolve is that failure in miniature.
`ORG_LEGAL_NAMES` in `site.js` maps one to the other and passes anything
unmapped through unchanged, so adding an institution never requires editing the
map first.

The footer's Résumé row now points at `/cv` rather than straight at the PDF.
Without that, `/cv` would have been an orphan on the day it shipped — F1,
reintroduced by the fix for it.

### `programmingLanguage` — a build-safe source exists now

The property is published from `src/data/project-languages.json`, regenerated
by `scripts/refresh-project-languages.mjs`. `next build` still performs no
network call and reads no secret; it opens a committed file, exactly as it
opens `data.js`.

The refresh being an explicit, reviewable act is the point, not an
inconvenience. A build-time fetch bakes a new public claim into the HTML with
nothing to review; a script run produces a diff a human reads in a pull
request. A stale file also degrades honestly — languages change on the order of
months, and a build-time fetch that 403s degrades to *nothing at all*.

Private repositories get no entry, matching `codeRepository`, which is withheld
for them for the same reason: an unverifiable claim about a repository nobody
can open. A project added since the last refresh degrades to the property being
absent — the pre-existing behaviour — rather than failing the build, so no new
project is ever blocked on someone remembering to run a script.

**The refresh merges over the existing file, and distinguishes two things that
look identical in the output** (fixed 2026-09-24). A partial run must not drop
repositories it could not reach: a 404 or a rate-limit says nothing about a
repository, so its previous entry is retained. But GitHub answering `{}` — a
docs-only or empty repository, which `AfaaqX` is today — is a *positive* result
and must clear the entry instead. Both arrive at the merge as "no languages for
this repo", and the first version collapsed them, which meant a repository that
went docs-only kept publishing a `programmingLanguage` claim its own repository
contradicted, permanently: every rerun reproduced the same empty answer and
every rerun kept the stale list. The script now records which repositories
*answered* and deletes those that answered with nothing.

---

## 14. GA4 — written, then mounted behind a gate

**Decision (owner, 2026-09-25): superseded by §17.** #141 shipped and GA4 now
mounts inside `<ConsentedAnalytics />`. The two dated decisions below are kept
exactly as written — they are the record of what was argued and when, and the
2026-09-24 revert is precisely what made the gate the right answer rather than a
formality. One thing in them is now out of date and worth naming here rather
than editing in place: the closing line offers "granting is one
`gtag('consent', 'update', …)` from wherever the accept button lives", and the
implementation deliberately did not do that. Consent gates the LOAD; storage
stays denied in both states. §17 has the reasoning.

**Decision (owner, 2026-09-24): the mount is reverted; §8 stands.** This
section was written when the component was rendered from `RootLayout`, and the
argument below — that a cookieless, storage-denied GA4 has nothing for PECR to
bite on — is kept because it is still the reason the component is configured
the way it is. What it does not establish is the thing that mattered: #141's
acceptance criterion is that a visitor who has **not decided** issues no
analytics request at all, and a cookieless ping is still a request carrying
page path, referrer and coarse geography. A narrower claim about *storage* was
being used to settle a broader question about *collection*.

So `src/components/analytics/GoogleAnalytics.jsx` ships finished and unmounted,
with the CSP allowance and the event map alongside it, and #141 renders it
inside its `<ConsentedAnalytics />` boundary. `tests/unit/gaConsentMode.test.js`
pins the absence of the mount as well as the defaults, so it cannot return by
accident. The denied defaults below are what a visitor who **declines** stays
in permanently — not a licence to skip the gate.

The original reasoning, as recorded:

§8 recorded GA4 as hard-blocked on #141's consent gating. That was correct
about the default configuration and too broad about the product.

What the GDPR and PECR prohibit is **storage** — reading or writing information
on someone's terminal equipment — not measurement. GA4's default behaviour
writes a `_ga` cookie, which is storage and does require consent. Consent Mode
v2 with `analytics_storage: 'denied'` writes nothing: no cookie, no identifier
stored or read, and what leaves the browser is a cookieless ping. There is no
storage to consent to, so no banner is required for it.

**Correction (owner, 2026-09-24): the terminal-equipment rule is PECR's alone,
and it settles less than the paragraph above claims.** The record stays as
written — it is what was argued — but it names the wrong pair of instruments and
this is a published page now, not a private note. PECR is what governs reading
or writing information on someone's device, and it is the rule a cookieless,
storage-denied GA4 genuinely has nothing to bite on. The UK GDPR is a *separate*
question that the storage argument never reaches: it governs the **processing of
personal data** whether or not anything is stored on the device, and the
cookieless ping still carries page path, referrer and coarse geography. If that
payload is personal data, a lawful basis and transparency are owed regardless of
what the device stores. So "no banner is required" answers the PECR question
only; the GDPR one needs its own assessment and never received one here.

This does not change the outcome — it sharpens why the outcome was right. A
narrow claim about *storage* was being used to settle a broad question about
*collection*, which is the same overreach the decision at the top of this
section reverted the mount for. #141's gate answers both questions at once, by
sending nothing at all before a decision.

The trade is real and the numbers will look wrong to anyone expecting ordinary
GA4:

- No stable user identifier, so *users* is modelled rather than counted.
- No cross-session attribution — a recruiter who visits on Monday and returns
  on Thursday is two unrelated pings.
- Anything depending on a user journey (funnels, cohorts, retention) is
  meaningless.

What survives is what GA4 was wanted for here and what Search Console cannot
give: which pages are read, in what proportion, and from where. Vercel
Analytics already counts visits; §8's warning that the two will disagree
permanently now has a third cause on top of its original two.

All four Consent Mode v2 signals are named explicitly rather than left to GA4's
defaults, because an unnamed signal takes whatever value the product currently
ships and that default has changed before. `tests/unit/gaConsentMode.test.js`
pins all four and asserts that the string `'granted'` appears nowhere in the
module's code — there is no UI that could produce consent, so a grant could
only ever be unconditional.

If a banner is wanted later, the shape makes it a small change: granting is one
`gtag('consent', 'update', …)` from wherever the accept button lives, and no
call site of `trackEvent` moves.

---

## 15. Lighthouse CI — measured first, then enforced

§12 refused to build this on the grounds that per-route budgets need a measured
baseline, and that *a budget nobody can pass gets disabled within a week*. That
reasoning held up: measuring first found three real defects that would have
made a 100 floor unpassable, and each was fixed at the source rather than
accommodated in the config.

1. **`aria-label` on `<span>` and `<p>`.** The footer's split-flap text
   restored its accessible name with `aria-label` on the wrapper — an attribute
   ARIA *prohibits* on `generic` and `paragraph` roles, and which a consumer is
   therefore permitted to ignore. Because the footer renders on every page, it
   capped accessibility at **96 site-wide**. Replaced with visually-hidden real
   text, which no role can forbid. Every route now scores 100.
2. **Three textures that never existed.** `aurora-bg.jsx` rendered three layers
   whose only content was `/aurora-band-1.png`, `/aurora-band-2.png` and
   `/fog.png` — none of which has ever been committed to this repository. It
   drew nothing while costing three 404s per project-page view and a `mousemove`
   listener that called `setState` on every pointer move. Deleted rather than
   disabled, so restoring the aurora has to start by committing the assets.
3. **Vercel's telemetry scripts, off-platform.** `@vercel/analytics` and
   `@vercel/speed-insights` fetch from `/_vercel/…`, a path the platform serves
   and the Next output does not — so they 404 on every CI run and every
   self-hosted build. The root layout now mounts them only when `VERCEL` is
   set. Silencing `errors-in-console` was the alternative and would have hidden
   every real console error to accommodate two fake ones.

A fourth was caught and reverted: `/notes/[slug]` initially shipped without the
shared backdrop, and the `PageTitle` subtitle then composited against the bare
body colour at 2.9:1 — just under the 3:1 floor for large text. Consistency was
the right default and the measurement agreed with it.

**A fifth, found in CI rather than locally (fixed 2026-09-24): a scroll reveal
cannot fade text up from nothing.** `/notes/discoverability` scored
accessibility **0.96** on every run against the 1.0 assertion, on a single
`color-contrast` failure — one `<h3>` at **1.03:1**. The cause is structural
rather than a colour mistake: `.note-prose` elements reveal with `opacity: 0 →
1` on a `view()` timeline, so the element straddling the viewport's bottom edge
is sampled at ~2% progress and is, at that instant, genuinely unreadable while
on screen. No `animation-range` value fixes it — at the fold the progress *is*
zero, so the first keyframe is what a reader sees there.

The floor is now **0.7** on every keyframe that moves text, measured rather
than picked: the dimmest text on the page lands at 5.5:1 and the gold headings
at 5.2:1, where 0.65 is the bare minimum. Ornaments that carry no text still
start at 0.

**The second half was found by the same audit refusing to go green.** With the
floor in, `/notes/discoverability` scored 0.96 again on entirely different
nodes: table cells at **4.1:1** and **3.37:1**, and the inline `code` inside
them at 3.41:1. `opacity` multiplies down the tree, and the text in a cell is
already `--foreground`/0.84 before any animation touches it — so a *container*
that fades dims text that was never at full strength. The rule that came out of
it is blunter than the arithmetic suggests and should be taken as measured
rather than derived: **a block that contains text a reader reads through must
not fade at all.** Tables now rise by transform only, and list items are matched
as direct children of a top-level list so a nested item cannot sit under its
parent's fade as well as its own.

Three notes for whoever measures next.

- `td-has-header` fails on two tables here and is weight **0**, so it does not
  move the score: several of this document's tables open with an empty top-left
  header cell, which leaves the first column's cells with no header to point at.
- **The table rows have never animated**, which this work found by accident
  rather than fixed. `note-deal` is bound to `.note-prose tbody tr`, and
  `table` is `display: block; overflow-x: auto` so a phone can scroll a wide
  decision table sideways — which makes the table the nearest scrollport for
  its own rows, and a `view()` timeline against a scrollport that cannot scroll
  in the block axis is degenerate. All eight tables measure `progress: 1`,
  `playState: "finished"`, opacity 1. Fixing it means moving the scroll
  container onto a wrapper, which needs a `marked` renderer override in
  `readNotes.js`, since nothing wraps a generated table today. The keyframe is
  left in place with its floor correct so that change lands on a working
  animation rather than a new contrast regression.
  *(Fixed 2026-09-26, by removal.)* The measurement above no longer held: the
  rows were resolving against the page's scroll and dealing in — and that was
  the defect. Under `border-collapse: collapse` the gridlines belong to the
  table, not the row, so a translated `tr` moves its text but not its borders.
  Every row still inside its range — the last few of each table, the ones at
  the bottom of the viewport — sat up to 14px left of its own column. Rows and
  header cells no longer animate; the table lifts as one piece.
- `/cv` uses the same reveal system with `opacity: 0` first keyframes. It passes
  today because no text element happens to straddle the fold at load, which is
  luck rather than a property — if it starts failing, this is the entry to read.

### What fails the build, and what only warns

`accessibility`, `best-practices` and `seo` are asserted at **1.0** and fail the
build. They are deterministic — they inspect the DOM and the response, not the
clock — so a loaded CI runner returns the same score as a laptop.

`performance` is collected and **warned** at 0.5. It is timing-dependent, and a
shared GitHub runner is both slower and far noisier than any developer machine,
so a floor picked from local numbers would fail green builds. Once a few weeks
of CI numbers exist the floor can be set from *those* and promoted to an error.
A warning is honest; a hard failure on a number nobody controls is theatre.

Baseline, 2026-09-19, production build, three runs per route (medians):

| Route | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| `/` | 94 | 100 | 100 | 100 |
| `/cv` | 99 | 100 | 100 | 100 |
| `/about` | 91 | 100 | 100 | 100 |
| `/projects/1` | 94 | 100 | 100 | 100 |
| `/notes/discoverability` | 100 | 100 | 100 | 100 |

`uses-http2` is skipped — it is decided by Vercel's edge, not by this
repository, and always fails against a local `next start`. `canonical` is
**not** skipped: the obvious prediction is that it would fail, since every page
served from localhost declares a canonical on `https://ma.codes`, but it was
measured instead of assumed and it passes.

---

**Beyond the six routes (2026-09-28, [#92](https://github.com/MA1002643/theabdullahfolio/issues/92)).**
Lighthouse runs a subset of axe on the six routes above. The browser a11y
suite now runs the full WCAG 2.2 AA axe rule set on **every** route at 1440 px
and 390 px, and on its first run it found what the six-route budget could not:
four sub-4.5:1 colours on `/uses` (not one of the six) and the unreachable
scrollers noted in §16. Both are fixed; the Lighthouse budget above is
unchanged and still enforced at 100.

**Decision (owner, 2026-10-31): the intro seal plays only on visits that enter
at `/`.** Vercel Speed Insights showed a Real Experience Score of 54, with LCP
at 12.46 s. Two things were true at once. The score rested on about ten visits
in thirty days, and its FCP, LCP and TTFB were a single visit to
`/qualifications`, so it was mostly noise. But the one structural cost behind it
was real: each sub-page's headline waits for the seal's reveal, so on a first
visit no sub-page could post an LCP before the ~3.4 s seal finished. Measured
on production, `/qualifications` was at 4.6 s with the seal and 1.7 s without.
The homepage was never affected, because its LCP is the H1, painted at ~0.3 s
underneath the overlay.

Three options were weighed: shorten the seal everywhere (helps, but a slow
phone still misses 2.5 s), paint the sub-page titles under it from the start
(LCP lands early, but the title ignite no longer plays on a first visit), or
play it only on `/`. The last was chosen. A visitor arriving on `/cv` from a
link came to read the CV, and the homepage loses nothing. `LoaderWrapper`
decides from the pathname on its first render, so a sub-page does not ship
the overlay in its HTML at all. After the change, on a production build at 4×
CPU, `/qualifications` reached LCP in about 1.8 s instead of about 4.2 s.

Considered and **not** changed, because the measurements did not support it:
INP (about 72 ms per click on a real GPU; the 208 ms p75 was one sample) and
Lighthouse's mobile TBT on `/` (380 ms to 8 s on one build, and not
reproducible outside Lighthouse).

## 16. `/notes` — publishing the reasoning

This document is well over a thousand lines recording why each decision on this
site was taken. (Hedged rather than counted, on purpose: it said "1,000-odd
lines" while standing at 1,741, which is the exact drift CLAUDE.md warns about
and which `readNotes.js` had already been caught by once. The figure the PAGE
prints is derived from the file at build — `countLines()` — and is the only
version of this number worth trusting.) Until `/notes` it lived only in the GitHub tree, where nobody arriving
at the site would ever find it.

That is a discoverability failure of exactly the kind this issue is about,
applied to the repository's own reasoning: a document with no inbound path is
undiscovered however good it is. Serving it gives it a URL, a canonical, a
sitemap entry and a place in the site's link graph — and gives the site a
substantial body of genuine technical prose, which is depth no amount of
metadata tuning substitutes for.

`docs/*.md` is read at build time, parsed with `marked`, and prerendered. The
parser never enters a client bundle: a reader downloads HTML, not a markdown
engine. Slugs come from the filename with an override map, so adding
`docs/anything.md` publishes at `/notes/anything` with no code change — and the
sitemap expands the same `readNotes()` call that `generateStaticParams()` does,
which is the property that stops a declared URL answering 404.

The rendered HTML is injected with `dangerouslySetInnerHTML`. That is safe here
for one reason that must stay true: the only input is markdown committed to
this repository and reviewed in a pull request. It is never user input, never
fetched, never derived from a request. If that changes, this needs a sanitiser
first — and the constraint is recorded at the top of `readNotes.js` because it
would not be obvious from the call site.

The H1 is stripped from the rendered body: the page renders the title itself,
and leaving it would give the document two top-level headings — the same defect
the `/cv` masthead avoids, and one the e2e suite's "exactly one h1" check
catches.

Schema is `TechArticle`, not `BlogPosting`. These are technical documentation
about how a system works, which is what that type is for; `BlogPosting` would
imply a dated editorial post and invite a `datePublished` these documents do
not have — they are revised continuously, and a made-up publication date is
precisely the fabrication P4 rules out.

**For a while the page said that without emitting it** (fixed 2026-09-24). The
route built its graph by spreading `sectionPage({…})` into a node position and
setting `'@type': 'TechArticle'` beside it. `sectionPage` returns a whole
*document* — `{'@context', '@graph': [WebPage, BreadcrumbList]}` — not a node,
so what shipped was a node containing a nested `@context` and a nested `@graph`.
The article had no `url`, `name`, `headline` or `description` of its own; the
`WebPage` holding them was still typed `WebPage`, so the page never declared
itself a `TechArticle` at all; and it published **two** breadcrumb trails, the
nested two-crumb one and the real three-crumb one, with nothing to tell a
consumer which hierarchy was true.

Worth recording because of how invisible it was. Both a document and a node are
plain objects, spreading either is valid JavaScript, the JSON parsed, and the
e2e check that every route emits *parseable* JSON-LD passed throughout — it
asserts the block is valid, not that it says what the file claims. The graph is
now composed by a `notePage()` builder in `src/lib/seo/schema.js`, beside every
other page's, and `tests/unit/schema.test.js` asserts the shape rather than the
`@type`: no `@context` or `@graph` inside the node, no surviving `WebPage`, and
exactly one trail.

### The description is composed, and measured (fixed 2026-09-24)

A note's meta description was its first paragraph of prose, read by
`summaryOf()`. That is the right default and needs no override for a document
opening with an abstract — but it is a *derivation*, not a contract, and
nothing was checking the result against one. This document opens by citing the
issue it came from, so what shipped was a ten-character description:
`Issue #32.`

Below roughly 110 characters Google tends to discard the description and
substitute its own scraped page text, so ten characters is not a short
description; it is no description, plus a wasted slot. It is the same defect
`projectMeta.js` exists for at the other end of the site, where the eleven
project pages were using 36-character card subtitles — and §10 has required
110–160 of every registry entry since it was written. The notes route was the
one description surface with no case in `metadataContract.test.js`, and the
only one derived from a file rather than written by hand.

`src/lib/seo/noteMeta.js` now composes it from three sources: a curated string
where one is written, the document's own opening paragraph when it already fits
the window, and a composed sentence otherwise — so a note that opens with a
heading, a table or a reference line can never publish an empty description.
Nothing is truncated to fit: cutting prose mid-clause at 160 characters is the
defect `summaryOf` was rewritten to stop committing, and doing it downstream
would only move it. `metadataContract.test.js` measures every note in the
corpus, and its failure tells the author to write a curated entry — which will
always be a better description than a title and a line count.

**It is computed once, on the record.** The string is published twice, as the
route's `<meta name="description">` and as the `TechArticle`'s `description`,
and those had *separate fallbacks*: a composed sentence in the head, the bare
title in the graph. Two fallbacks for one fact is a note describing itself
differently to a crawler reading the head and a crawler reading the graph.
`readNotes()` attaches the finished value as `description` and both call sites
read it, so there is no second place to fix.

The window itself moved to `src/lib/seo/descriptionWindow.js` to make that
possible. It had lived in `projectMeta.js`, which was correct while the only
caller was a test; the first production caller outside `/projects/[id]` made
every note page render from the project description composer, which
`sitemapDrift.test.js` failed on. The repair it *offered* — move `projectMeta.js`
to a shared source list — would have been the "too broad" error §10 records,
re-stamping every URL on the site for a change only eleven can see. A window is
not a project fact.

---

**A second document, and scrollers a keyboard can reach (2026-09-28, [#92](https://github.com/MA1002643/theabdullahfolio/issues/92)).**
`docs/testing.md`, the testing strategy and runbook, now publishes at
`/notes/testing` by the rule above, with no code change: a second
`TechArticle`, a second sitemap entry, and its own share cards. It is written
for the same reader as this one (someone who wants to know *why*, not just
*what*), and the structural suite (`notesCorpus.test.js`) covers it
automatically. The same issue's axe pass found that at 390 px this document's
code blocks and wide tables scroll sideways but could not be reached by
keyboard (`scrollable-region-focusable`), so `renderNote()` now gives every
rendered `<pre>` and `<table>` a `tabindex="0"`
(`makeScrollersFocusable()`, pinned by `notesScrollersFocusable.test.js`).

## 17. The consent gate, and the privacy page that had to be true

[#141](https://github.com/MA1002643/theabdullahfolio/issues/141), shipped
2026-09-25. §8 and §14 record the argument that led here; this is what was built
and the three decisions worth disagreeing with.

### The issue was re-audited before it was built, and had gone stale

It was written before the guestbook (#40), `/uses` (#37), `/cv` and most of #32
landed, and **three of its conclusions were no longer true** — one of them
load-bearing enough to have shipped a falsehood to visitors.

| The issue said | Actually |
|---|---|
| "This site sets **zero cookies**", and proposed notice copy reading *"No cookies"* | Auth.js v5 sets four `authjs.*` cookies at guestbook sign-in. All strictly necessary, none needing consent — so the *consent* conclusion survived and the blanket denial did not. |
| `<Analytics />` / `<SpeedInsights />` "mount **unconditionally** … at `layout.js:84-85`" | Already conditional on `process.env.VERCEL` (they 404 off-platform, which capped Lighthouse best-practices at 0.96 — §15). Preserved inside the new boundary rather than replaced. |
| Two surfaces to gate | **Three.** GA4 did not exist when the issue was written. |

The corrected inventory is the issue body, re-audited in place with a "what
changed" section rather than silently edited.

### Decision: consent gates the LOAD; Consent Mode stays denied

Both the issue and `GoogleAnalytics.jsx`'s own header specified
`gtag('consent', 'update', { analytics_storage: 'granted' })` on accept. It is
not issued, and will not be.

What a visitor agrees to is whether the tag **loads at all**. All four Consent
Mode signals stay denied permanently, so **no `_ga` cookie is ever written, for
anyone, in either state** — which /privacy can state flatly instead of hedging.
§14 had already accepted every cost of the cookieless mode (users modelled
rather than counted, no cross-session attribution), so granting storage bought
nothing the measurement needed. It also leaves
`tests/unit/gaConsentMode.test.js`'s assertion that `'granted'` appears nowhere
in that module **intact rather than weakened** — a gate that required loosening
the test guarding it is a worse gate.

### Decision: revoking reloads the page, and says so first

Unmounting is not unloading, and treating it as such would have been the same
category of error as the one above. Unmounting removes the tags and stops
everything React drives, but Vercel's insights script has already attached its
own history listeners inside its own closure and **nothing reachable from the
app can detach them** — so an unmount-only revocation keeps sending a pageview
per SPA navigation, silently, to somebody who has just refused.

The only mechanism that genuinely unloads an executed script is discarding the
document. So a revocation that follows a real load reloads the page, the
preference centre states that **next to the switch that causes it**, and the
reload is skipped on the paths where nothing was loaded (declining from the
notice, or revoking in a tab that opened already denied).

*(Tightened 2026-09-27.)* "Nothing was loaded" now also covers a grant that
rendered nothing: with `VERCEL` and `NEXT_PUBLIC_GA_MEASUREMENT_ID` both unset
(local dev, previews, forks), `ConsentedAnalytics` records no load, so a revoke
does not reload. The preference centre's warning still shows in that case. It
is accurate everywhere the site is public, because production always has
`VERCEL` set. A cross-tab revocation now also includes `localStorage.clear()`:
its `key: null` event removes the record, so a granted tab moves to undecided
and tears down instead of staying granted against empty storage.

### Decision: the policy is a module with a drift test, not prose

A privacy policy is the one document on a site that is legally required to be
true and structurally guaranteed to go stale: it describes behaviour spread
across dozens of files, is written once, and nothing ordinary notices when the
behaviour moves. The failure is silent *and* published.

That is the same class of defect the sitemap registry exists for (P1/P2), so it
got the same treatment.
[`src/lib/privacy/inventory.js`](../src/lib/privacy/inventory.js) is the source;
`/privacy` renders it; the preference centre reads its categories; and
`tests/unit/privacyInventory.test.js` walks `src/` and fails CI on an
undisclosed key. **It found three key families the hand audit had missed** —
`github-stats:lastGood:<username>`, `experience-summary:last-payload:<username>`
and the retired `projects-category` — before it had finished being written.

It is deliberately **not** `docs/privacy.md`: `readNotes()` publishes every
`docs/*.md` at `/notes/<slug>`, so a markdown policy would have shipped a second
indexable copy at `/notes/privacy` competing with this URL — §2's
duplicate-URL defect, arrived at by accident through a convenience.

### What is measured, and what it cost

- **Zero analytics requests before a decision**, verified in a real browser
  against a build with `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `VERCEL` set, so the
  assertion could not pass for the wrong reason. 48 acceptance checks.
- **Lighthouse accessibility 1.0 on all six CI routes**, `/privacy` added to the
  list. The first draft scored **0.97** — eleven real `color-contrast`
  failures from `#7a7a7a` / `#6f6f6f` body copy and a `text-[#ff6d05]/70`
  ordinal at 3.59:1. The measured floor for 4.5:1 on this site's grounds is
  `#838383` (page), `#7d7d7d` (key chips) and `#777777` (the dialog plate), so
  `#8a8a8a` is the one value to remember. `aria-hidden` bought no exemption,
  correctly: contrast is about being seen.
- **No hydration warning added.** The four reduced-motion React #418/#423 errors
  on this site are pre-existing and unchanged — measured identically with the
  notice rendering and suppressed, and zero under normal motion.
- **Orchid & ember and a scroll reveal (added 2026-09-26).** The neutral greys
  were replaced with ember titles, violet-white reading copy and lilac small
  print, with `#c8a6ee` as the quietest step (about 8.4:1 on the page plate),
  and the page gained a CSS `view()` reveal. The
  reveal is CSS rather than JavaScript so the policy stays a server component.
  It follows the rules from the `/notes` fix above: text floors at 0.7 for
  headings and 0.8 for body copy; cards move by transform only; and the ember
  ordinal moves by blur and slide instead of fading, because `#ff6d05` at 0.8
  is 4.35:1. The headings' focus pull animates `letter-spacing`, the one
  property on the page that changes layout, so it runs only at 900px and
  wider. At those widths every heading was measured at the same height with
  its widest tracking as at rest; below 900px a heading could wrap mid-reveal
  and shift the text under it. The audit caught one case the arithmetic missed: an ember **link**
  inside a fading lede measured **4.33:1**. The two links inside ledes now use
  `#ff8a1e`. The general lesson is that a floor chosen for the body colour
  says nothing about an inline element of a different colour inside it. The
  one remaining dev-server failure, the intro loader's `loader-percent`
  sampled mid-fade, reproduces identically on the untouched `/contact`, so it
  was not introduced here.

### Out of scope, and still open

Global Privacy Control / Do Not Track. Honouring a browser-level signal needs
its own decision about precedence over a stored choice — specifically whether a
GPC header should override an explicit grant the same visitor gave — and that is
a policy question, not a wiring one.

---

## 18. Twenty languages, without moving an English URL

[#82](https://github.com/MA1002643/theabdullahfolio/issues/82), built
2026-10-25 → 2026-10-29. The issue was written for a Next 14 site with five
pages. By the time it was built, the site had the canonical builder and route
registry this document describes, a consent gate and a test plan, and several of
the original choices would have undone them. The spec was revised against `main`
on 2026-10-25 before any code was written. This section records what that
revision decided, because every choice below changes what a crawler sees.

**Decision (owner, 2026-10-29): the multilingual site ships as follows.**

### English stays unprefixed

next-intl's default is a prefix for every locale (`/en/about`). Here
`localePrefix: 'as-needed'` keeps English at `/about` and puts the other
locales at `/{locale}/…`. Every URL Search Console has indexed, every canonical
§2 declared, and every inbound link names `ma.codes/about`. Prefixing the
default locale would have 308'd the whole site and restarted its indexing
history to gain a URL segment nobody needed. `/en/about` still resolves, by
redirecting to `/about`, so English has exactly one URL per page.

The request proxy is Next 16's `src/proxy.js` (the file formerly called
`middleware`). It rewrites `/about` onto the `[locale]` segment invisibly, so
the visitor and the crawler both see the URL they asked for.

### No `Accept-Language` redirect

The original spec redirected `/` on the browser's language. Rejected, for two
reasons. Google advises against locale-adaptive redirects: its crawler sends no
`Accept-Language`, so it would only ever see one version, and the redirect hides
the others from it. And a recruiter who was sent an English link should read it
in English unless they have said otherwise.

So next-intl's detection is off (`localeDetection: false`), and so is its
automatic cookie (`localeCookie: false`), which would otherwise turn "followed a
link to `/ja/about` once" into a sticky preference. The one redirect the site
makes is a **307** from an unprefixed URL to the same page in the visitor's
language, and only when they have **chosen** one in the language selector,
which is the only thing that writes `NEXT_LOCALE`. It is temporary rather than
permanent because its target depends on one visitor's cookie, and a cached 308
would outlive that. It applies only to document requests, never to prefetches.

A browser whose `navigator.languages` prefers a supported locale gets a
dismissible **suggestion**, worded in the suggested language, instead. It is an
offer. Nothing moves until the visitor accepts.

### hreflang, from the seam that was left for it

`alternatesFor()` in `src/lib/seo/canonical.js` was written with an empty
`languages` slot for this issue (§10, *Adding a route*). It is now filled. A
translated page is canonical **in its own locale**: `/ar/about` is the
canonical URL of the Arabic document, not a duplicate of `/about`. Every page in
a cluster carries the **same** full set of alternates, keyed by hreflang, plus
`x-default` pointing at the English URL. The set is identical on every member
because Google ignores an alternate that does not link back.
`tests/unit/i18nAlternates.test.js` pins that reciprocity, and pins that every
English canonical is byte-identical to what it was before #82.

Chinese is published as `zh-Hans`, not `zh`. The bare code names a
macrolanguage, and the catalogue is Simplified Han. A Traditional-script
browser is never offered it as "your language".

next-intl can also advertise alternates in a `Link` response header. That is
off (`alternateLinks: false`): it cannot know which documents are untranslated,
so it would advertise translations of the notes, which have none.

### The sitemap lists every locale, with the same alternates

Each translated page is one `<url>` per locale, and each carries the same
`xhtml:link` set as the documents' `<head>`. The sitemap and the head are built
by the same `alternatesFor()` call, so they cannot disagree about which URLs are
siblings.

**The cost:** `messages/` is a source of every translated route
(`MESSAGE_SOURCES` in `src/app/sitemap.js`), and `git log` resolves per path, so
editing any catalogue moves the `<lastmod>` of every translated URL, in every
locale. That errs in the direction §3 already chose: an over-stamped date costs
a crawl, and a stale one suppresses it. The twenty URLs of one page share one
date, because they are rendered from the same sources.

### English-only documents canonicalise to English and leave the sitemap

Three kinds of content stay English, by decision: the engineering decision
records under `/notes` (this document is one), the `/privacy` policy body (a
legal text should have one authoritative version; the consent notice and the
preference centre around it *are* translated), and what visitors write in the
guestbook. Translating a document of well over a thousand lines nineteen times
would multiply its maintenance for the smallest audience.

Their locale URLs (`/ar/notes/discoverability`) still resolve, because the
chrome around them is translated. But they render an English document, so
they canonicalise to the English URL, declare no alternates, name only `en_GB`
as their `og:locale`, and are listed once in the sitemap. A sitemap may list
only canonical URLs, and an hreflang claiming an Arabic version of a document
that has none is a false alternate, which Search Console reports. The registry
marks these routes `translated: false`, and `isTranslated()` is the only thing
that reads the flag. The English islands render inside an `EnglishOnly` wrapper
carrying `lang="en" dir="ltr"`, so a screen reader switches voice.

### Open Graph text per locale; the card images stay English

`og:title`, `og:description`, `og:url` and `og:locale` follow the page's locale,
and a translated page lists every other locale as `og:locale:alternate`. The
card **images** are the English brand cards on every locale. Satori, the
renderer behind `opengraph-image.js`, has no Arabic shaping and no bidi, so an
Arabic card would render as disconnected letters in the wrong order. The image
carries the name and the seal, not prose, so nothing is lost by keeping it.

### Structured data

JSON-LD `WebPage.inLanguage` follows the page, and each localised document has
its prefixed URL as its `@id`. The **entity** ids (`#person`, `#website`,
`#project`) do not change with the locale. They name the thing being described,
not the document describing it, and a per-locale id would split one person into
twenty in the graph §11 works to keep consistent.

### The name in the reader's script (decision, owner, 2026-10-31)

The homepage `<h1>`, the intro seal and the footer masthead print the owner's
name in the page's own script: محمد عبدالله on `/ar`, ムハンマド・アブドゥッラー on `/ja`,
Muhammed Abdullah on `/tr`, and Muhammad Abdullah in every language that writes
it that way. The spellings are hand-set in `Common.owner`, one per locale, and
`scripts/i18n-translate.mjs` never sends them to the model: a name is a fact
about a person, and a model asked twice can spell it two ways.

The rest stays Latin on purpose. Titles, Open Graph text and the JSON-LD
`Person.name` keep "Muhammad Abdullah", the name on the CV, the GitHub and
LinkedIn profiles and every inbound link, so all twenty documents still resolve
to one entity. The English `<h1>` is byte-identical to what it was. A localised
`<h1>` that does not repeat the Latin title text is the normal shape of a
translated page, and the hreflang cluster already says the documents are one.
Not done, and the next step if native-script searches matter: listing the
spellings as `Person.alternateName`.

### Fonts: Naskh for Urdu, system faces for CJK

Arabic, Persian and Urdu use a self-hosted Noto Sans Arabic, with Noto Sans
Hebrew and Noto Sans Devanagari beside it, each sliced by `unicode-range` and
never preloaded. An English visitor downloads none of them.

Urdu is set in the **Naskh**-style Noto Sans Arabic, not Nastaliq. Nastaliq is
the traditional Urdu hand, and an Urdu reader will notice its absence. But its
vertical extent is roughly double Naskh's, and every line height on the site was
set for Latin. Nastaliq would either clip or reflow every page. The spec's goal
of no structural change outranked typographic tradition here. That is a real
cost, so it is recorded rather than buried.

Chinese, Japanese and Korean use **system stacks**, one per language, composed
onto the brand font variables by `src/i18n/fonts.js` (PingFang SC, Hiragino or
Apple SD Gothic Neo first, then Noto Sans CJK and Source Han, then YaHei, Yu
Gothic or Malgun Gothic). A CJK webfont is
megabytes even when sliced, and every target OS ships a first-class CJK face.
The `lang` attribute plus a per-language stack is also what gives each reader
their own regional glyph forms for unified Han code points.

### Every locale launches machine-translated, and says so

No native reviewers were available at launch. So every non-English catalogue
was produced by `npm run i18n:translate`, which sends only missing or outdated
strings through the Vercel AI Gateway and validates every response against the
English ICU structure before writing it. Every non-English locale ships with
`status: 'machine'` in `src/i18n/locales.js`. While it is `machine`, the footer
and the language selector say the translation is unreviewed. A native review
changes the status to `'reviewed'`, and that is the only thing that removes the
notice. The tiers in the registry now set review **priority**, not launch
quality. The `locale_switch` analytics event (behind the consent gate, §17)
records which languages visitors actually choose, so review effort can follow
real readers.

### What it measured

The spec set a client message budget of 8 kB gzipped per locale per route. Two
routes were over it when first measured (English, 2026-10-29): `/uses` at
10.8 kB and `/about` at 9.1 kB. After routes were given only the subtrees they
render, and `/uses`'s tool descriptions were deferred to a file fetched alongside
the live crawl, the figures were 7.0 kB and 6.1 kB.
`tests/fitness/i18nBudget.test.js` holds every locale × route to the budget.

**Re-measured in every locale (2026-11-01).** The figures above were English,
and a stale local test cache had been measuring every other locale as English
too (`docs/testing.md`, defects table). Measured for real, translated copy ran
over in 16 of 20 locales: `/uses` up to 10.1 kB (Russian), `/about` 9.0 kB,
`/journey` 8.6 kB. Copy nobody sees until they ask for it now loads on demand:
the privacy preferences dialog, the `/uses` ⌘K commands and the 404's own
copy. After that, every route passes in every locale except Russian `/uses`, at
8.3 kB, and what remained there was all on screen at first paint (42 curated
tool descriptions, 2.4 kB). **Decision (owner, 2026-11-01):** `/uses` alone is
allowed 9 kB, and the 8 kB line stays for every other route. Rejected:
raising the line for every route, and deferring the tool descriptions, which
would paint the stack in English first.

### Out of scope, and still open

- **Native review**, locale by locale (§10, *Translations*).
- **Browser-level coverage of locale URLs.** The E2E, axe and visual suites
  still walk the English URLs only (`docs/testing.md`, L5).
- **The Auth.js sign-in pages** the guestbook hands off to are English.

## 19. Loading what is needed, when it is needed (issue #55)

### The issue was re-measured before it was built

#55 was written before the `[locale]` move, the Next 16 upgrade, the three.js
split (#83) and `optionalChunk` (#92). Most of its file paths no longer
existed, and much of it was done. It was rescoped on 2026-11-07 against a
production build: the bundle analyser for what each route's first load
contains, and a Playwright probe of the LCP element on every route at
1440×900 and 390×844 @3x.

### What it found

- **The shared floor is mostly irreducible.** About 250 kB (gzip) is common to
  every route. React and the Next runtime are about 183 kB of it, and
  framer-motion about 54 kB. Above that floor were two things nobody uses
  before a click: the live Ember Passage (overlay, WebGL swarm, shader, ember
  field) on every route, and `/about`'s two dialogs, a third of that route's
  own code.
- **No full-bleed background was ever an LCP candidate.** On every sub-page
  the LCP is text (the title, a paragraph, the `MA` mark), painted in
  80–200 ms. Chrome treats a viewport-covering image as a background. Yet all
  fifteen backgrounds sent a `<link rel=preload>`, 32 image preloads across
  the probe, competing with the fonts that LCP text needs.
- **`priority` was not the whole cause.** Removing it changed nothing in the
  HTML, which the new perf spec caught. React 19's server renderer emits its
  own preload for up to ten non-lazy `<img>` elements per page, and skips
  only `loading="lazy"` and `fetchPriority="low"` ones.

### Decision: three image intents, enforced

| Intent | Props | Where |
| --- | --- | --- |
| The measured LCP image | `preload` | The home backdrop (LCP on a phone) and the centre `/qualifications` certificate (LCP on a phone). |
| Above the fold, never the LCP | `loading="eager"` + `fetchPriority="low"` | Every full-bleed background and the home laptop. It is fetched at parse time, behind what the LCP needs. |
| Everything else | the default, `lazy` | Unchanged. |

`priority` is deprecated in Next 16 and is gone from `src/`.
`tests/fitness/imageLoadingPolicy.test.js` holds the source to the table: no
`priority`, `preload` only in an allowlist that records the measurement behind
each entry, and no `eager` without `low`. `tests/perf/image-loading.spec.js`
holds the rendered page to it on every route at both sizes: every preloaded
image is an LCP candidate at one of them, and an LCP image is never lazy. Both
were run against `main` first and failed there.

**Measured after (same build pipeline, same probe):** image preloads fell
from 32 to 4. The LCP element is unchanged on every route. `/qualifications`
on a phone, whose certificate no longer shares bandwidth with a backdrop,
reached LCP in 968 ms instead of 1,660 ms. The other routes moved by a few
milliseconds either way, within run-to-run noise.

### Decision: chunks that load ahead of need, not on first render

- **The Ember Passage runtime** is one async chunk
  (`src/components/pageTransition/passageRuntime.js`). It is fetched in idle
  time, which is when it was already being warmed. The provider keeps the
  phase machine and a small eager `PassageStill`. Each navigation chooses live
  or still once, at the click, so a chunk that lands mid-passage never swaps
  the overlay. Reduced-motion visitors never download it, and a click that
  beats the download gets the still.
- **The `/about` dialogs** are `next/dynamic` chunks. They are fetched in idle
  time, or on pointer-over, focus or touch on their card, and mounted once
  they arrive. The progress data hook moved up to the page so the dialog
  still opens populated.
- **One primitive for both**, `src/lib/deferredChunk.js`: a memoised
  `preload()` that forgets a failure so the next call retries, and an
  `optionalChunk` loader, so a chunk that never arrives renders nothing
  instead of blanking the page. `tests/fitness/deferredChunks.test.js` fails
  on any static import that would pull these modules back into a first load.
  The bundle budget cannot catch that: its 10 % headroom is larger than the
  modules.

**Measured:** every route's first load is 6.3 kB (gzip) lighter, and `/about`
is 12.8 kB lighter (350.3 → 337.5 kB). `bundle-budget.json` was re-baselined,
so the savings are now the ceiling.

### Rejected

- **A generic `LazyMount` (an IntersectionObserver wrapper).** No module is
  still both heavy and below the fold. The only candidates were the `/about`
  stat cards, which are server-rendered. `ssr: false` would remove real HTML
  for crawlers and no-JS readers, and swap content for a skeleton (a CLS
  risk), to save JS that hydration needs anyway.
- **A central `lazyImports.js`.** A single file that imports every deferred
  loader invites exactly the static import the fitness test forbids. Each
  `deferredChunk` sits beside its consumer instead.
- **Deferring `sonner`.** A toast fired from a mount effect is already lost
  when the Toaster subscribes late. Lazy-loading it would widen that race.

### Out of scope, and still open

- **framer-motion's `LazyMotion`.** About 40 kB off every route, the largest
  remaining win, but it touches 383 `motion.*` call sites in 98 files. It
  is tracked in issue #200.
- **The consent notice as LCP.** For a first-time visitor the notice arrives
  1.1 s after the reveal, by design. On `/cv`, `/projects`, `/guestbook` and
  `/projects/1` its paragraph is larger than the page's own LCP, so the field
  LCP moves from about 0.1 s to 1.4–3 s. This is a consent-UX timing choice
  for the owner, not a loading one.
