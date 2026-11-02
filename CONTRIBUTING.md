# Contributing

Thanks for taking an interest in this project. Note that this repository is
**proprietary** (see [LICENSE](LICENSE)) — external contributions are not
accepted by default. This guide exists for the maintainer's own reference and
for any collaborators who have been explicitly invited to work on the project.

If you have been invited to contribute, this document tells you exactly how.

---

## Prerequisites

| Tool            | Version                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| Node.js         | **22.x (≥ 22.18.0) or 24.x (≥ 24.11.0)** — LTS majors only (Babel 8, via Stryker, sets both floors; `.nvmrc` pins the current 22 LTS); `engine-strict` fails `npm ci` outside this range |
| Package manager | **npm** (a `package-lock.json` is committed; do not switch to yarn or pnpm) |
| Git             | Any modern version                                                          |

A code editor with TypeScript / ESLint support is strongly recommended.

## Setup

```bash
# 1. Clone
git clone https://github.com/MA1002643/theabdullahfolio.git
cd theabdullahfolio

# 2. Install dependencies
npm install

# 3. Pull environment variables (Vercel CLI required)
vercel env pull .env.local

# 4. Run the dev server
npm run dev
```

The app runs on http://localhost:3000.

If you don't have Vercel CLI access, ask the maintainer for an `.env.local`
template — see [SECURITY.md](SECURITY.md) for the contact path.

## Common commands

```bash
npm run dev      # Start the Next.js dev server (Turbopack disabled by default)
npm run lint     # Run ESLint over src/
npm run build    # Production build — ALWAYS run before opening a PR
npm run start    # Serve the production build locally
npm run i18n:audit       # Check every translation catalogue against English (CI runs this)
npm run i18n:translate   # Machine-translate missing or outdated strings (see Translations below)
```

## Branch naming

Use the pattern: `<type>/<issue#>-<short-kebab-description>`

| Type        | Use for                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| `feat/`     | New features (e.g. `feat/24-live-maintenance-header`)                       |
| `fix/`      | Bug fixes                                                                   |
| `chore/`    | Maintenance, polish, repo hygiene (e.g. `chore/14-architect-title-styling`) |
| `docs/`     | Documentation-only changes                                                  |
| `refactor/` | Internal refactors with no behavior change                                  |

Always branch off `main`. Never push directly to `main` — use a PR.

## Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <summary>

<optional body>

<optional footer>
```

Examples:

```text
feat(home): add live maintenance header polling /api/work-status
fix(navigation): align mobile icons to laptop center, not viewport
chore(deps): bump framer-motion to 11.x
```

Keep summaries under 72 characters and in the imperative mood ("add", not
"added"). Reference issues in the body or footer (`Closes #14`).

## Pull request process

1. **Open the PR against `main`** with a clear title and the
   `.github/PULL_REQUEST_TEMPLATE.md` checklist filled in.
2. **Link the issue** the PR closes (e.g. "Closes #14").
3. **Run `npm run lint` and `npm run build` locally** — both must pass.
4. **Verify visually in the browser** for any UI change. Check the golden path
   at desktop, tablet, and mobile breakpoints (xs ≤ 479px is a meaningful
   breakpoint in this project).
5. **Wait for CodeRabbit's automated review** — it usually posts within
   minutes. Address actionable findings (or explain why a finding is invalid).
6. **Wait for maintainer review** — see [MAINTAINERS.md](MAINTAINERS.md) for
   ownership by area.
7. **Squash-merge** when approved. Keep the squash message Conventional.

## Review expectations

When reviewing or being reviewed:

- Address the **code**, not the author.
- Be specific. "This loop is O(n²) on the visible items" beats "this is slow".
- Suggest, don't dictate, when there's more than one reasonable answer.
- If a finding is wrong, push back politely with reasoning rather than
  silently complying.

## Definition of done

A PR is ready to merge when:

- [ ] `npm run lint` passes with no new warnings.
- [ ] `npm run build` succeeds.
- [ ] Browser console shows no new errors or warnings on affected pages.
- [ ] Verified at desktop (≥ 1024px), tablet (640–1023px), and mobile (≤ 479px) breakpoints.
- [ ] Accessibility quick-check done (keyboard tab order, screen-reader labels).
- [ ] Documentation updated where behavior or APIs change.
- [ ] CodeRabbit + maintainer review approved.

## Style guidelines

### Components

- Co-locate component files under `src/components/<area>/`.
- Use `'use client'` only when the component genuinely needs client features
  (state, browser APIs, framer-motion). Default to server components.
- Prefer Tailwind utility classes over inline styles. Use inline styles only
  when a value needs to be dynamic or escapes Tailwind's vocabulary
  (e.g. `style={{ filter: 'drop-shadow(...)' }}`).
- Keep components under ~200 lines — split presentational sub-components when
  they grow beyond that.

### Utilities

- Pure logic goes in `src/utils/` (no React, no I/O where avoidable).
- Side-effectful modules (cache, network) get explicit names like
  `workStatusCache.js` so the impurity is visible at the import site.

### API routes

- Routes live under `src/app/api/<name>/route.js`.
- Always validate inputs at the route boundary. Trust internal calls.
- Always set `Cache-Control` headers explicitly — never rely on framework
  defaults for routes that hit external APIs.
- Use `runtime = 'nodejs'` unless you specifically need the Edge runtime.

## Testing expectations

- Run the affected page locally and exercise the changed feature end-to-end.
- For API routes: hit the endpoint directly with `curl` or in the browser
  network tab; verify the response shape and status code.
- Verify all three breakpoints noted above for any UI change.

## Translations

The site is published in English and in every language listed in
`src/i18n/locales.js` ([#82](https://github.com/MA1002643/theabdullahfolio/issues/82)).
English is the source. Every other language launched **machine-translated**
and shows a notice saying so until a native speaker has reviewed it. If you
have been invited to review a language, this is the workflow.

### Where the words live

```text
messages/
├── en/<Namespace>.json      # English, the source (one file per page or component)
├── <code>/<Namespace>.json  # one directory per language (ar, ja, es, ...)
├── _notes/<Namespace>.json  # context for translators, keyed by the message's dotted path
└── .i18n-lock.json          # which English each translation was made from (generated)
```

- **Edit only `messages/<code>/`** for your language. Do not edit
  `messages/en/Data.json` by hand: it is generated from `src/app/data.js` by
  `npm run i18n:data`.
- **Read `messages/_notes/` first.** A note says where a string appears, how
  much room it has, and what must stay as it is. For example: a label that sits
  in a narrow pill, a heading set in capitals, or a tag that becomes a link.
- **Never edit `messages/.i18n-lock.json` by hand.** It records a hash of the
  English each translation was made from. That is how the audit knows a
  translation is outdated, and how the translation script knows to leave your
  edits alone.

### The rules a translation must keep

Messages use [ICU MessageFormat](https://formatjs.github.io/docs/core-concepts/icu-syntax/).
`npm run i18n:audit` fails on any of these, and so does CI:

- **Placeholders** keep their names exactly: `{count}`, `{title}`. You may move
  them to suit the grammar, but never translate the name inside the braces.
- **Rich-text tags** keep the same names: in `<link>read the notes</link>`,
  translate the words and leave `<link>` and `</link>` as they are.
- **Plurals** (`{count, plural, one {…} other {…}}`) use *your* language's
  plural categories: Arabic has `zero one two few many other`, Russian and
  Polish `one few many other`, and Japanese only `other`. Every plural must
  keep an `other` branch, and each branch must carry the same tags as `other`.
- **Selects** (`{state, select, open {…} closed {…} other {…}}`) keep exactly the
  same branch keys. Translate only the text inside each branch.
- A literal brace is written `'{'` and `'}'`. Do not add `<` or `>` characters.
- **Never translate** names and brands: Muhammad Abdullah, ma.codes, GitHub,
  Next.js, React, project names, organisation names. Code, file names, URLs,
  email addresses, keyboard keys and version numbers stay as they are.
- Use your language's own punctuation (`،` `؟` `。` `、` `«»`) and keep symbols
  such as `→`, `·`, `—` and `%`.

### Reviewing a language

1. Branch off `main` following the naming pattern above (for example
   `chore/<issue#>-review-ar`).
2. Edit `messages/<code>/*.json`. Read each page in the browser as you go
   (`npm run dev`, then `http://localhost:3000/<code>/about`), because a string
   that reads well in a file can still overflow its button.
3. When the whole language has been reviewed, change its `status` from
   `'machine'` to `'reviewed'` in `src/i18n/locales.js`, in the same PR. That is
   the only thing that removes the machine-translation notice. Do not change it
   for a partial review.
4. Run `npm run i18n:audit`. It must report 0 errors. A warning that text is
   identical to English is fine when it is correct, for a brand name or "CV".
5. Open the PR with the label **`i18n:locale-<code>`**. The maintainer reviews
   layout rather than language: right-to-left languages are checked at the
   three breakpoints above.

### Running the machine pass (maintainer)

When English copy changes, every other language needs the new strings:

```bash
npm run i18n:data                              # only if src/app/data.js changed
npm run i18n:translate -- --dry-run            # how many strings would be sent; needs no key
npm run i18n:translate                         # every language, only what is missing or changed
npm run i18n:translate -- --locale ar,ja       # just these languages
npm run i18n:translate -- --ns Home            # just this namespace
npm run i18n:audit
```

The script needs `AI_GATEWAY_API_KEY` in `.env.local`, or the
`VERCEL_OIDC_TOKEN` that `vercel env pull` provides. Set it in `.env.local`
only, never in a committed file. It sends only strings that are missing, or
whose English has changed since they were translated, so a reviewer's edit to a
string whose English has not changed is never overwritten. Two exceptions:
`--force` retranslates everything it selects, and a string whose **English**
changes is retranslated by machine even in a reviewed language. After that,
ask the language's reviewer to check the changed strings. Every response is
checked against the English ICU structure and retried if it breaks a rule
above. Other options (`--model`, `--batch`, `--concurrency`) are read at the
top of `scripts/i18n-translate.mjs`.

The full runbook, including how to add a language, is §10 *Translations* of
[`docs/seo.md`](docs/seo.md).

## Questions

For questions that aren't bug reports or feature requests, see
[.github/SUPPORT.md](.github/SUPPORT.md).
