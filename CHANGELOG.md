# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Categories used

- **Added** — new features.
- **Changed** — changes to existing functionality.
- **Fixed** — bug fixes.
- **Removed** — features deleted in this release.
- **Deprecated** — features still present but slated for removal.
- **Security** — vulnerability fixes (link to advisory once published).

## Versioning notes

- **Major (`X.0.0`)** — breaking change to a public API contract (any
  `/api/*` route response shape, env-var name change, removal of a
  user-facing page).
- **Minor (`x.Y.0`)** — new feature or non-breaking enhancement.
- **Patch (`x.y.Z`)** — bug fix, security patch, or internal refactor with
  no user-facing change.

The deployed site at [ma.codes](https://ma.codes) tracks `main`, so every
merge to `main` is effectively a deploy. Versions are tagged on `main` at
the maintainer's discretion to mark coherent release boundaries.

---

## [Unreleased]

### Added

- Repository governance and community-health suite: `CODE_OF_CONDUCT.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `GOVERNANCE.md`, `MAINTAINERS.md`,
  `CHANGELOG.md`, `RELEASE_TEMPLATE.md`, full `.github/ISSUE_TEMPLATE/`
  set (bug, feature, UI/UX, docs, security redirect),
  `PULL_REQUEST_TEMPLATE.md`, `SUPPORT.md`, `CODEOWNERS`, and stale +
  issue-triage workflows. The existing proprietary `LICENSE` was kept
  unchanged.
- `GOVERNANCE.md` "Maintainer unavailability" section documenting
  planned and unplanned absences, security-report continuity during
  absences, site availability under autopilot, and a hand-off / sunset
  framework for permanent unavailability.
- `SECURITY.md` "Escalation if reports go unanswered" section with
  three time-tiered recourse paths (7-day alternate-channel contact,
  30-day CERT/CC coordination, 90-day responsible-disclosure window)
  and a 48-hour compressed timeline for active-exploitation cases.
- Live maintenance header (`LiveMaintenanceHeader`) with `/api/work-status`
  endpoint, GitHub-Projects-driven state computation, optional OpenAI
  message refinement, and 30-second polling cadence.
- xs-mobile (`≤ 479px`) two-column navigation with mirrored pair-based
  reveal animation and pointer-events / tab-index gating during the
  reveal.

### Changed

- Maintainer contact channel migrated from a personal Gmail to
  `team@ma.codes` (a Cloudflare Email Routing alias forwarding to the
  maintainer's inbox). Updated in `SECURITY.md` and `CODE_OF_CONDUCT.md`.
- GitHub label inventory standardised: 22 new labels added (status /
  triage, severity, the `area:*` family covering every owned directory,
  plus `dependencies` and `config`), and four spaced labels renamed to
  dash form (`good first issue` → `good-first-issue`, `help wanted` →
  `help-wanted`, `in progress` → `in-progress`, `review needed` →
  `review-needed`) for consistency with workflow references. The
  `enhancement` label description was clarified to differentiate it
  from the kept-as-distinct `feature` label.
- Architect-of-Enchantment heading reworked for cleaner zoomed-in
  rendering: warm-orange fill, font-smoothing properties, no text-shadow
  per design constraint.
- Mobile navigation columns now anchor to the laptop's parent flex
  container (not the viewport) so they auto-track the laptop's vertical
  centre across screen heights.

### Fixed

- Breakpoint range definitions unified across `CONTRIBUTING.md`,
  `PULL_REQUEST_TEMPLATE.md`, and `.github/ISSUE_TEMPLATE/ui_ux_improvement.yml` —
  previously `CONTRIBUTING.md` said `tablet (≤ 768px)` while the
  templates said `tablet (640–1023px)`.
- `.github/ISSUE_TEMPLATE/ui_ux_improvement.yml` `breakpoints` field
  converted from `checkboxes` (with invalid block-level
  `validations.required`) to `dropdown` with `multiple: true` so GitHub
  accepts the form schema.
- `.github/workflows/issue-triage.yml` `pull_request_target` triggers
  expanded from `[opened]` to `[opened, synchronize, reopened, ready_for_review]`
  so path-based PR labels stay in sync with the latest diff across the
  PR lifetime, with the welcome job gated by `github.event.action == 'opened'`
  to avoid re-greeting on every push.
- `/api/work-status` and `/api/github-webhook` GraphQL fetches now use
  `AbortController`-based timeouts so a slow GitHub upstream can't burn
  the function's full execution window.
- `LiveMaintenanceHeader` polling protected against out-of-order responses
  by combining a request-id sequence with `AbortController` cancellation.
- `formatRelative()` switched from `Math.round` to `Math.floor` so
  "X minutes ago" never overstates elapsed time (e.g. 59m31s no longer
  reads as "1h ago").
- `?bust=1` responses on `/api/work-status` now return
  `Cache-Control: private, no-store, must-revalidate` so the edge cache
  doesn't replay a stale bust within the 30-second window.
- `top-[calc(50%-2vh)]` Tailwind arbitrary value corrected to
  `top-[calc(50%_-_2vh)]` for spec-compliant CSS `calc()` syntax.

### Security

- No security advisories published yet.

---

## How to update this file

When opening a PR:

1. Add a bullet under the appropriate category in **[Unreleased]**.
2. Be concrete — name the affected file, route, or component.
3. Link to the closing issue with `(#NN)` so the bullet is traceable.

When tagging a release:

1. Move the **[Unreleased]** content into a new versioned section dated
   `YYYY-MM-DD`.
2. Reset **[Unreleased]** to empty placeholders.
3. Tag the commit on `main` with the version (`v1.2.3`).

Trivial changes (typo fixes, comment clarifications, dependency patch
bumps) don't need a CHANGELOG entry.
