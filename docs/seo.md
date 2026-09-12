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
> `tests/unit/sitemapDrift.test.js` asserts no entry carries a timestamp within
> 60 seconds of now, so a future "fix" that reintroduces build-time stamping
> fails CI.

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

### 🔴 The landmine: regenerating the CV can silently break `/about`

[`/api/experience-summary`](../src/app/api/experience-summary/route.js) parses
this exact file **at runtime** via
[`parseExperienceFromPdf`](../src/utils/experience/pdfExperienceParser.js) to
derive the employment figure on `/about`. A reflowed text layer makes the
parser's regexes miss, `roles` comes back empty, and `/about` renders
**"Employment 0%"** — with no exception, no log line, and a 200 response,
because an empty result is indistinguishable from a CV with no jobs on it.

That parser was guarded by **no test at all**.
[`tests/unit/pdfExperienceFixture.test.js`](../tests/unit/pdfExperienceFixture.test.js)
now pins both roles with their exact dates and durations. It was written and
passing **before** the binary was touched, then re-run after.

`pdf-lib` was chosen over recompiling precisely because it rewrites only the
info dictionary and trailer, leaving content streams alone. **Verified: the
extracted text layer is string-identical, 4,923 characters before and after.**

**If that test ever fails after a CV update**, the PDF is what changed and
`/about` is what broke. Do not relax the assertions — restore the layout the
parser reads, or update the parser and re-pin the values deliberately.

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

**This needs a row in [#141](https://github.com/MA1002643/theabdullahfolio/issues/141)'s
disclosure inventory** — the privacy page must state that the CV is published
and indexed, and what it contains.

### Flagged, not decided: an HTML `/cv` route

Would outrank the PDF for name queries, extract far more reliably for AI
crawlers, and could carry `Person` + `Occupation` schema — but duplicates
content `/about`, `/journey` and `/qualifications` already carry. The issue
flagged this as "a bigger scope call than this issue should make on its own",
and it was **not** built.

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

**It is not a general pattern.** Reaching for `sr-only` to add keyword text
would be the abuse this reasoning does not license.

### Related: reveal animations use `opacity: 0` on SSR'd text

This is fine and standard — the text is in the DOM and not `hidden` — but noted
here so a future audit does not misread it as hidden text. The F1 fix relies on
it: the orbit buttons are now **always mounted** and the staggered reveal
animates only `opacity`/`scale`.

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

## 8. Analytics — GA4 vs Vercel, and why GA4 is not mounted

### GA4 is not mounted yet

Hard-blocked on [#141](https://github.com/MA1002643/theabdullahfolio/issues/141)
(privacy notice & consent gating), which is open. Analytics must not fire before
consent exists, and inventing a consent primitive here would build a throwaway
surface on that issue's turf and risk getting the gate wrong.

**What did land**, so #141 does not have to re-derive it:

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

**To switch it on**, #141 needs exactly two things, both outside
`analytics.js`: mount GA4 after consent with Consent Mode v2 defaults
(`analytics_storage: 'denied'`, `ad_storage: 'denied'`) set *before* any tag
loads, and set `NEXT_PUBLIC_GA_MEASUREMENT_ID`. `trackEvent` starts working the
moment `window.gtag` exists, because that is the only thing it checks.

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

### Wiring

Invoked as a **third step in [`/api/daily-warmup`](../src/app/api/daily-warmup/route.js)'s
fan-out**, not as a second `vercel.json` cron entry. Hobby caps cron *count*, so
a standalone entry would silently never run — which is exactly why
`daily-warmup` exists at all.

It **counts toward `daily-warmup`'s `allOk` verdict, but only once it is
configured** — the revisit the previous note asked for, now done.

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

> One residual, stated rather than hidden: `/api/seo-report` also answers
> 503 + `skipped` when the **Upstash** credentials are absent, so that specific
> misconfiguration is forgiven too. A genuine Upstash *outage* is not — the
> client throws and the route answers 502. Tighten this if the two ever need
> telling apart.

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

> **The service-account key is a real secret.** Name in `.env.example`, value in
> Vercel only. See `CLAUDE.md` §1.

### Report lag

The window ends **three days ago** and spans 28 days. GSC data lags ~2 days and
the most recent days are always incomplete, so a window ending "today" shows a
cliff that looks like a traffic collapse and is purely an artefact.

### The comparison baseline, and why a rerun stores nothing

The API can only report a *window*; it cannot say what changed since you last
looked. That is the entire reason snapshots are stored, and it makes the choice
of baseline the part most worth getting right.

Both `seo:gsc:<date>` and `seo:gsc:latest` hold the **first** snapshot captured
on their day — the daily key is written `nx`, and `latest` is left alone once it
already holds a capture from today. Run the route a second time on the same day
(by hand, with the bearer token) and it reports fresh figures but **writes
nothing**, answering `rerun: true`.

Without that, the second run became tomorrow's baseline, tomorrow compared
against an afternoon capture instead of the morning one, and every new query and
position drop from the hours in between was reported by *no* run — silently,
with both responses looking perfectly well-formed. `tests/unit/seoReportBaseline.test.js`
drives three runs across a day boundary to pin it.

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

1. Add an entry to `ROUTES` in `src/lib/seo/site.js` — path, title, description
   (110–160 chars), `changeFrequency`, `priority`, `sources`.
2. Build its metadata with `sectionMetadata({ title: ROUTE.title, ... })`.
3. Render a `<JsonLd>` block — `sectionPage()` unless a more specific type fits.
4. Run `npx vitest run tests/unit/sitemapDrift.test.js tests/unit/metadataContract.test.js`.

**Skipping step 1 fails CI.** The drift test walks `src/app` on disk and fails
on any `page.js` that is in neither the registry nor its own `EXCLUDED` map —
verified by adding a throwaway route and watching it go red.

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

Add it to `projectsData` and nothing else needs editing. `sitemap.js` generates
the URL, `/llms.txt` describes it, `/projects/[id]` gets its params, and the two
places that state the count in prose both recount themselves:

| Surface | How the count is stated |
| --- | --- |
| `/projects` meta description (`src/lib/seo/site.js`) | `` `${countWord(projectsData.length)} builds — …` `` |
| Homepage `sr-only` summary (`src/app/page.js`) | `{countWord(projectsData.length).toLowerCase()} projects` |

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

### Replacing the CV

```bash
node scripts/seo-pdf-metadata.mjs                            # set /Title etc.
npx vitest run tests/unit/pdfExperienceFixture.test.js       # prove /about works
```

If the fixture test fails, see §4's landmine before doing anything else.

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
npx playwright test tests/e2e/seo.spec.js     # 27 tests, incl. every sitemap URL → 200
npx vitest run tests/unit/sitemapDrift.test.js tests/unit/metadataContract.test.js \
              tests/unit/schema.test.js tests/unit/cspAnalytics.test.js
```

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
| `programmingLanguage` on each project | Omitted | Same build-time-secret problem, with no equivalent local source. Omitted rather than guessed (P4); the builder accepts it the moment a build-safe source exists. |
| `EducationalOccupationalCredential[]` from the qualifications carousel | Derived from `journeyData`, **awarded entries only** | The carousel's `CARDS` array is inside a `'use client'` module, is not exported, and carries only title/category/image — **no issuer and no date**, which is the half that makes a credential checkable. `journeyData` has both, and is already cross-checked against the CV. Entries still in progress (`end: null`) are filtered out: `hasCredential` means "awarded to", so the in-flight BSc would be a claim to hold a degree not yet conferred — see the note below. |
| GA4 mounted | CSP + event map + tests only | Hard-blocked on #141. See §8. |
| PDF accessibility tagging | `/Lang` only | Needs the LaTeX source. See §4. |
| Lighthouse CI in GitHub Actions | Not built | Needs per-route budgets derived from a measured baseline that does not exist yet (the Lighthouse half of §1 was not captured). A budget nobody can pass gets disabled within a week, which is worse than no budget. |
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
