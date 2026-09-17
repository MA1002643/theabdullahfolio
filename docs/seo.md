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
over a half-failed step: the body said `ok: false` and nobody read it. Each
step's result is now `res.ok && body.ok !== false`, marked
`bodyReportedFailure: true` so a 200-that-failed stays distinguishable from a
502. It reads only an explicit `ok: false` and fails **open** — the deliberate
opposite of the `skipped` check, which must not let an ambiguous body excuse a
step — because `/api/work-status` returns no `ok` field at all and inventing an
admission from it would turn every healthy run red.

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

1. Add an entry to `ROUTES` in `src/lib/seo/site.js` — path, title, description
   (110–160 chars), `changeFrequency`, `priority`, `sources`.
2. Build its metadata with `sectionMetadata({ title: ROUTE.title, ... })`.
3. Render a `<JsonLd>` block — `sectionPage()` unless a more specific type fits.
4. Run `npx vitest run tests/unit/sitemapDrift.test.js tests/unit/metadataContract.test.js`.

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
  simply contributes no date.
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

**And watch out for inputs that are not imports at all.** `/uses` reads eight
repository paths at build time through `readBuildFacts()` — `package.json`,
`package-lock.json`, `.nvmrc`, `vercel.json`, `.github/workflows`, `tests/unit`,
`tests/e2e`, `src/app/api` — with `fs`, not `import`, so no dependency walk can
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
npx vitest run tests/unit/pdfExperienceFixture.test.js       # parser still reads the binary
npx vitest run tests/unit/cvJourneyConsistency.test.js       # CV and journeyData still agree
```

Run both, and in that order — the second can only compare while the parser the
first pins still works.

Neither one is guarding a live page: `/about` derives employment from
`journeyData`, not from this file. What they guard is the **indexed PDF agreeing
with the HTML record**. See §4 for which failure means what, and note that a
genuine CV edit is expected to fail the consistency test — that is the check
doing its job, and the fix is to reconcile `journeyData` or declare the
divergence, not to loosen the test.

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
