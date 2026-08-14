# Project rules

Rules for anyone — human or AI agent — working in this repository. Claude Code
loads this file automatically at the start of every session.

---

## 1. Never commit or push secrets

**No API token, key, password, or other credential may ever enter a commit, a
branch, or a push to GitHub.** This repository is public: anything that lands in
a commit is world-readable the moment it is pushed, and stays readable in forks,
clones, and the GitHub events API even after the commit is deleted.

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
