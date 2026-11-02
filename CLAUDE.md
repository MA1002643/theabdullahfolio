# Project rules

Rules for anyone — human or AI agent — working in this repository. Claude Code
loads this file automatically at the start of every session.

---

## 1. Never commit or push secrets

**No API token, key, password, or other credential may ever enter a commit, a
branch, or a push to GitHub.** This repository is currently private, but write
every commit as if it were public: a private repository can be made public, and
anything that lands in a commit stays in every clone, in forks, and in the
history that would go public with it, even after the commit is deleted.

Because the repository is private on a personal account, GitHub's secret
scanning and push protection are not available (the API answers "Secret
scanning is not available for this repository"). Nothing on GitHub blocks a
secret at push time. The only automated check is the `Gitleaks (full history)`
job in `.github/workflows/security.yml`, and it runs *after* the push. The
pre-commit diff check below is the real guard.

This rule is absolute. It is not relaxed for "just a test key", "it's already
revoked", "only on a feature branch", "it's in a comment", or "I'll remove it in
the next commit".

### What counts as a secret

Every value in `.env.local` is a secret. The credentials this project uses:

| Variable | What it unlocks |
| --- | --- |
| `GITHUB_TOKEN` | GitHub PAT — repo/stats API reads |
| `CRON_SECRET` | Bearer secret for `/api/daily-warmup`, `/api/work-status`, `/api/repo-refresh` |
| `SMTP_USER`, `SMTP_PASS` | Mail account used by the contact form |
| `ABSTRACT_API_KEY` | Email-verification API |
| `LOCATION_INGEST_TOKEN`, `LOCATION_INGEST_QUERY_TOKEN` | Write access to `POST /api/location` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (write) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` | Spotify account access; the refresh token does not expire |

Also treat as secret, even though they are not in the table: Vercel tokens,
`.vercel/` project credentials, `.npmrc` auth lines, SSH/`*.pem` keys, session
cookies, signed URLs, and any bearer token captured from a request while
debugging.

### Where secrets are allowed to live

| Place | Allowed | Notes |
| --- | --- | --- |
| `.env.local` | ✅ | Gitignored via `.env*`. The only place real values go locally. |
| Vercel → Project → Settings → Environment Variables | ✅ | Source of truth for deployed environments. |
| GitHub → Settings → Secrets and variables → Actions | ✅ | For workflow use only, via `${{ secrets.NAME }}`. |
| `.env.example` | ⚠️ placeholders only | Tracked. Names and `your-…` placeholders — never a real value. |
| Anywhere else in the repo | ❌ | Source, config, tests, fixtures, docs, `README.md`, `CHANGELOG.md`, scripts, `*.mjs` helpers. |

Read secrets in code only through `process.env.NAME`, server-side. Never inline
a literal as a fallback (`process.env.X || "sk-real-value"`).

### The `NEXT_PUBLIC_` rule

Next.js inlines every `NEXT_PUBLIC_*` variable into the client bundle at build
time. A secret given that prefix is published to every visitor even though its
file was never committed.

- **Never** prefix a credential with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_` is only for values that are already public by design —
  e.g. `NEXT_PUBLIC_GITHUB_USERNAME`, `NEXT_PUBLIC_CONTACT_EMAIL`.
- Keep the public and private forms as separate variables. `RECEIVER_EMAIL`
  (server-only delivery inbox) and `NEXT_PUBLIC_CONTACT_EMAIL` (displayed
  address) exist separately for exactly this reason.
- API routes must return only display data. `/api/spotify` exchanges the refresh
  token server-side and returns title/artist/art — the token never reaches the
  browser. Preserve that shape in any new route.

### Also never expose a secret value in

Commit messages · branch names · PR and issue titles or bodies · code comments ·
`README.md` / `CHANGELOG.md` / any doc · test fixtures and snapshots ·
`console.log` or error messages that get committed · screenshots and recordings
attached to issues or PRs.

When something must be referenced, name the **variable**, never the value:
"set `CRON_SECRET` in Vercel", not the string itself.

### Before every commit and push

1. Read the actual diff — `git diff --staged` — rather than staging blind.
   Prefer explicit paths over `git add -A` / `git add .`.
2. Confirm no new file holds a credential, and that nothing gitignored is being
   force-added (`git add -f` on an env file is never correct).
3. When a new credential is introduced, add its **name and a placeholder** to
   `.env.example` in the same commit, and set the real value in Vercel and
   `.env.local` — separately, outside the repo.

### Rules for AI agents specifically

- Do not print real secret values into the transcript, into tool output, or into
  a summary — a chat log is another place a token can leak from. Confirm a
  variable is *set* without echoing it (`[ -n "$X" ] && echo set`).
- Never run `git commit` or `git push` without the user asking for that specific
  action.
- When a task needs a credential that is missing, say which variable is unset
  and let the user supply it. Do not invent, guess, or hardcode one.
- Test and debug scripts (`*.mjs` helpers at the repo root) follow the same
  rules; they read from `process.env` and are gitignored or contain no values.

### If a secret is exposed anyway

Order matters — treat the value as burned the instant it is pushed.

1. **Rotate first.** Revoke the credential at its provider and issue a new one.
   Do this before touching git history; history rewriting does not un-publish a
   value that forks, clones, and the events API have already seen.
2. Update the new value in Vercel and `.env.local`.
3. Then scrub the repository (history rewrite / GitHub secret-scanning
   revocation) and force-push, coordinating with anyone holding a clone.
4. Tell the repository owner what leaked, where, and for how long.

---

## 2. Keep documentation in step

Every commit includes a `CHANGELOG.md` entry, and updates `README.md` when the
change touches something the README documents.

**The one exemption: the automated screenshot commits.** The
`test(visual): render screenshots for <sha>` commits pushed by
`github-actions[bot]` from `.github/workflows/visual-baselines.yml` carry no
`CHANGELOG.md` entry, no test-plan record (§3) and no privacy check, by design.
They are generated output, not a change: they touch only
`tests/visual/__latest__/` (and `tests/visual/__screenshots__/` on a seeding or
`promote: true` run), they render the commit named in their subject, and that
commit already carried the entry and the checks. A changelog line per push
would be noise that conflicts on every rebase. The exemption covers that bot,
that workflow and those two directories only. A person or agent promoting
baselines by hand, or a bot commit that touches anything else, follows the
normal rules.

### `docs/seo.md` is checked on every change

`docs/seo.md` is the decision record — why each choice on this site was made,
what was rejected, and what it cost. **Every change checks whether it needs
updating, and the update lands in the same commit as the change.** It is not a
file to revisit later: a decision record that trails the code by a few commits
is a record of a system that no longer exists.

This is now a public page, not an internal note. It is served at
[`/notes/discoverability`](https://ma.codes/notes/discoverability), it carries a
canonical and a sitemap entry, and it is prerendered from the file at build. A
stale paragraph is published to readers, not just left in the tree.

**Nothing enforces this.** The tests around the corpus are structural only —
every slug resolves, exactly one `<h1>`, the sitemap and `generateStaticParams`
agree, the line count is honest. None of them can tell whether the prose is
still true, so the document can rot silently while CI stays green. The check is
a habit, not a gate.

#### What to update, and what to leave alone

The file holds two kinds of content with opposite rules. Getting this backwards
destroys the thing that makes it worth publishing.

| | Rule |
| --- | --- |
| **Dated record** — the §1 baseline, `Decision (owner, YYYY-MM-DD)` entries, the `(tightened YYYY-MM-DD)` / `(fixed YYYY-MM-DD)` notes | **Leave it.** This is history: what was true, what was decided, and when. Add a new dated entry beside it; never rewrite it to match today. The §1 baseline is deliberately frozen — it is the "before" measurement. |
| **Living description** — §10 Runbook above all, plus the sections describing analytics, the Search Console loop, Lighthouse CI thresholds and any live endpoint | **Update it.** These say how the system works *now*, and they name real file paths, env vars and commands someone will follow. |

§10 is the section with the standing obligation: it is the one a person actually
executes. If a change touches how routes are registered, how analytics or CI
behave, or what any runbook step names, the runbook changes in that commit.

#### Do not hand-copy figures into prose

A count, size or measurement typed into a comment or a paragraph is stale the
week after it is written, and nothing will flag it. Two live examples were found
in a single sitting: `readNotes.js` said `docs/seo.md` "is 1,022 lines" when it
had reached 1,257, and §16 of the document says "1,000-odd lines" about itself.

Prefer a figure **derived at build** (`countLines()` is the pattern — the page's
line count is computed from the file, so it cannot drift), or hedged prose that
cannot go wrong ("well over a thousand lines"). If an exact figure genuinely has
to be written down, date it so a reader knows how much to trust it.

### `/privacy` is checked on every commit

[`/privacy`](https://ma.codes/privacy) tells every visitor what this site
collects. If it is out of date, it is not just old documentation: it is a
false statement published to every reader. **Before every commit, check whether
the change alters what the site collects, stores, sends or keeps. If it does,
update the policy in the same commit**, without being asked. An agent does the
update itself and then reports what it changed.

#### Where the policy lives

`src/lib/privacy/inventory.js` is the only source. `/privacy`, the preference
centre and the notice all render from it. Edit the inventory, not the prose in
`src/components/privacy/PrivacyPolicy.jsx`. Counts on the page are interpolated
from the lists, so do not type one by hand.

#### What triggers an update

| If the change… | Update in `inventory.js` |
| --- | --- |
| Adds, renames or removes a `localStorage` / `sessionStorage` key | `STORAGE_KEYS` (and `STORAGE_GROUPS` if it needs a new group) |
| Sets or stops setting a cookie, including one set by a third-party script | `COOKIES` |
| Adds a third-party service, script, SDK, API or host that receives visitor data (a new env-var credential, a new CSP `connect-src`/`script-src` host, a new `fetch` to an outside origin) | `PROCESSORS`, and `ANALYTICS_SURFACES` if it measures visitors |
| Stores something server-side: a KV key, a log, an email, a guestbook field, a new form field | `SERVER_DATA`, with its retention period |
| Changes a retention period, what a form collects, or where a message is delivered | the matching entry's `detail` / retention |
| Changes consent behaviour or the analytics gate | `CATEGORIES` / `ANALYTICS_SURFACES` |
| Changes how a visitor can exercise a right (contact route, deletion) | `RIGHTS` |
| Stops collecting something | remove the entry — a stale entry is also false |

Changes that only affect styling, copy, animation or layout don't need an
update. Neither does anything that never touches visitor data.

#### The two dates and the version

- **`POLICY_UPDATED`**: bump it to the commit date when the substance of the
  policy changes. Leave it alone when a sentence is only reworded.
- **`CONSENT_KEY` / `CONSENT_VERSION`**: bumping these wipes every stored
  consent decision and asks every visitor again. Only do it when what the
  visitor agreed to has materially changed, and **ask the owner first**.

#### What CI catches, and what it does not

`tests/unit/privacyInventory.test.js` walks `src/` and fails when a
browser-storage key is not disclosed. **That is the only part enforced.**
Nothing enforces cookies, processors, server-side data, retention or rights,
so those can go stale while CI stays green. Run `npx vitest run
tests/unit/privacyInventory.test.js` after editing the inventory. Record the
policy change in the commit's `CHANGELOG.md` entry, or state there that the
privacy check found nothing to change.

---

## 3. Keep the test plan in step

`docs/testing.md` is the master test plan. It started as issue #92, and it is
a living document: it has to cover whatever the project is *now*, not what it
was when #92 closed. **Every new issue or task re-considers the plan, and the
tests and plan updates it calls for land in the same commit as the change.**
An agent does this without being asked, then reports what it added, or that
it found nothing to add.

Do it twice: **when planning** the issue (so the tests are designed with the
feature, not bolted on), and **before the commit** (so nothing that changed
while building is missed).

### What to check

| If the change… | Then |
| --- | --- |
| Adds or renames a page | Add it to `tests/support/routes.js`. Static routes are enforced against the sitemap registry; a new **dynamic** template needs a sample in `DYNAMIC_SAMPLES` by hand. Every browser layer (navigation, axe, keyboard, motion, headers, Web Vitals, image warm-up) then covers it. |
| Adds or changes an API route | A `tests/api/` test (MSW for outbound calls, `fakeRedis` for state), and a hostile-request case in `tests/security/api-hardening.spec.js` if it accepts input or a secret. The method surface in `apiSurface.test.js` fails until the new endpoint is reviewed into it. |
| Adds interactive UI | A `tests/component/` test driven by role and label, and keyboard reachability; a new modal, popover or overlay also needs Escape and focus-return checks. |
| Adds a user journey (a form, a multi-step flow, an offline path) | A `tests/e2e/` spec, tagged `@cross-browser` if a visitor on any browser takes it. |
| Adds animation or motion | It must stop under `prefers-reduced-motion` (`tests/a11y/motion.spec.js` checks every route); read the preference through `src/hooks/useReducedMotion.js`, never framer-motion's hook. |
| Adds pure logic with an invariant (parsing, ranking, diffing, paging) | A unit test, and a fast-check property in `tests/property/` where an invariant exists. If it is critical, add it to `stryker.config.mjs`'s mutation targets. |
| Adds an env var, a secret, or an outside host | `.env.example` (enforced by `envHygiene.test.js`); the hermetic network (MSW handler, `tests/support/fixtures/api.js`, and the Playwright sandbox) so no test reaches the real host. |
| Changes the look of a page in the visual set | Review the re-rendered `tests/visual/__latest__/` gallery, and promote the baselines deliberately if the change is intended. |
| Adds a dependency, or a heavy client import | The first-load JS budget (`npm run test:bundle`); the audit gate if it brings an advisory. |
| Finds a bug, whether while building or because a test caught it | A test that fails without the fix, and a row in the defects table in `docs/testing.md`. |

Then update `docs/testing.md` itself wherever the change alters how a layer
works, what it covers, or a command it names. Like `docs/seo.md` it is
published (at `/notes/testing`), so a stale paragraph is published too.

Record the result in the commit's `CHANGELOG.md` entry: the tests added, or
"test-plan check: nothing to add". Changes that only touch copy or docs, or
styling outside the visual set, usually need nothing, but the check still
happens and is still recorded.

### What CI catches, and what it does not

Some of this is enforced: `routeRegistry` (static routes), `apiSurface` (new
endpoints), `envHygiene` (new env vars), `testHygiene` (no skipped or focused
tests, no hard-coded fast-check run counts), `reducedMotionHook` (the banned
import), `loaderInertBoundary` (interactive overlays under the intro loader's
`inert` boundary), `routeSegmentConfig` (route config declared, never
re-exported), `escapeOwnership` (every Escape handler claims the key), the
two test counts `/uses` publishes (CI fails until `npm run test:count`
regenerates `tests/browser-cases.json` and `tests/vitest-cases.json`), and the error
sentinel in every browser test. **Everything else in the table is not**: a new feature
with no tests at all passes CI. The check is a habit, not a gate, which is why
it is written here.

---

## 4. Every new component ships in every language

The site is served in twenty languages, four of them right to left (Arabic,
Urdu, Persian, Hebrew), since issue #82. **Any new component, page or piece of
UI is fully localized in the same commit that adds it**, and so is any change
that adds visitor-facing text to an existing one. An agent does this without
being asked, then reports what it localized, or why nothing needed it. A
component that only works in English is unfinished, not "English for now".

How the system works, and why each choice was made, is in
`docs/multilingual.md` (published at `/notes/multilingual`). Read it before the
first localized component of a session.

### What to do

| If the component… | Then |
| --- | --- |
| Shows any text a visitor reads: labels, buttons, headings, placeholders, toasts, errors, empty states | Put every string in `messages/en/<Namespace>.json` (an existing namespace, or a new file) and read it with next-intl (`useTranslations` in a Client Component, `getTranslations` in a Server one). No hard-coded English in JSX. |
| Has a name or description no one sees but assistive tech: `aria-label`, `alt`, `title`, sr-only text | The same: these are translated too. Keep the visible words first and contiguous in the accessible name (WCAG 2.5.3, which axe enforces in every locale). |
| Builds a sentence from parts: a count, a name, a date inside text | One ICU message with arguments (`{count, plural, …}`, `{name}`), never concatenated fragments or a template literal; word order differs between languages. |
| Formats a number, date, time or relative age | Take the locale tag from `src/i18n/format.js` (`intlTag`, `formatNumber`, `formatRelativeMs`); never a hard-coded `'en-GB'` or the browser's locale. |
| Adds a new namespace, or a client component on a route that did not need that namespace before | Register it in `src/i18n/namespaces.js` (`GLOBAL_NAMESPACES` or the route's `ROUTE_NAMESPACES` entry) so its client provider receives it. Hand down a dotted subtree (`'Data.journey'`) rather than a whole namespace when only a slice is rendered; every route has a client message budget (`i18nBudget`). |
| Shows text drawn from `src/app/data.js` | Run `npm run i18n:data` so the `Data` catalogue mirrors it, and read it through `useDataT` / `getDataT` (`src/i18n/`). |
| Has a layout with a side: margins, padding, borders, alignment, icons that point, slide-ins | Logical properties only (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, `margin-inline-start`, `text-align: start`). Mirror directional icons and motion under right to left (`useDirection` from `src/i18n/useDirection.js`, or `:dir(rtl)` in CSS on its own selector). |
| Takes typed input | Typed text follows its own direction, and an empty field starts on the page's side (`dir="auto"`, or `dir="ltr"` for emails, URLs and code). The contact fields do this through `applyTypedDirection`; reuse `FireInput` / `FireTextarea`, or the helper, rather than a bare `dir` that resolves left to right while empty. |
| Holds something that must stay as written: a name, handle, email address, code, a brand | `translate="no"`, and `dir="ltr"` if it is Latin text that would print backwards inside a right-to-left line (see the footer email, `tests/e2e/rtl.spec.js`). |
| Is English by decision (it appears in a list in `docs/multilingual.md`) | Mark the island `lang="en" dir="ltr"`, and add it to that list with the reason. |
| Has a string whose meaning a translator could misread: length limits, tone, wordplay, a word that is a UI term | Add a note under the same key in `messages/_notes/<Namespace>.json`. |

### Then, before the commit

1. Translate: `npm run i18n:translate -- --ns <Namespace>` sends only the
   missing or changed keys to every locale, and validates each response
   (placeholders, plurals, tags). It needs the AI Gateway credential
   (`AI_GATEWAY_API_KEY`, or the OIDC token from `vercel env pull`). If it is
   missing, say which variable is unset (rule §1): do not hand-write
   nineteen translations, and do not ship English copied into the other
   locales.
2. Audit: `npm run i18n:audit` must report 0 errors. Review its
   identical-to-English warnings rather than ignoring them.
3. Look at it in the browser in a right-to-left locale (`/ar/…` or `/ur/…`) and
   a CJK one (`/ja/…`), not only in English: alignment, mirroring, text that
   overflows, glyphs that print backwards.
4. Tests (§3): a component test in a second locale when the component has
   locale-specific behaviour, and a case in `tests/e2e/rtl.spec.js` when it has
   direction-sensitive layout or input. A new route is covered by the localized
   axe and navigation runs once it is in `tests/support/routes.js`.
5. Record it in the commit's `CHANGELOG.md` entry: the namespaces and keys
   added and the locales translated, or "i18n check: no visitor-facing text".

### What CI catches, and what it does not

Enforced: `i18nCatalogues` (every English namespace is loaded and parses as
ICU), `i18nCatalogueText` (no escaped characters in a translation),
`i18nBudget` (each route's client messages stay within budget), `logicalCss`
(no physical inline-axis property in `globals.css`), the pseudo-locale gate
(`npm run test:i18n`, in CI: any visible English word on a route fails), and
axe in Arabic and Japanese. **Not enforced:** a hard-coded string inside a
component that the pseudo-locale run never renders (a toast, an error, a
closed popover), a physical Tailwind class (`ml-`, `left-`, `text-left`), a
missing translator note, or a layout that is merely wrong in right to left
without overflowing. As with §3, the check is a habit, not a gate.
