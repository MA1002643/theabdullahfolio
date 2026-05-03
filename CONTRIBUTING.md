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
| Node.js         | **18.17+** (Next.js 14 requirement)                                         |
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

```
<type>(<scope>): <summary>

<optional body>

<optional footer>
```

Examples:

```
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
- [ ] Mobile (≤ 479px), tablet (≤ 768px), and desktop layouts all verified.
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

## Questions

For questions that aren't bug reports or feature requests, see
[.github/SUPPORT.md](.github/SUPPORT.md).
