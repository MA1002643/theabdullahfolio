# Maintainers

This file lists the active maintainers and collaborators of this project,
their areas of ownership, and what to expect from each. It pairs with
[`.github/CODEOWNERS`](.github/CODEOWNERS), which expresses the same
ownership in a machine-readable form GitHub uses to auto-request reviews.

## Active maintainers

### Muhammad Abdullah

- **GitHub:** [@MA1002643](https://github.com/MA1002643)
- **Role:** Maintainer (sole — see [GOVERNANCE.md](GOVERNANCE.md))
- **Contact:** [team@ma.codes](mailto:team@ma.codes)
- **Time zone:** Europe/London (UTC±00:00 in winter, UTC+01:00 in summer)
- **Availability:** Part-time, evenings and weekends (this is a personal
  project alongside other commitments).

Final authority on direction, code review, releases, deployments, and
licensing.

## Collaborators

_None at this time._

When collaborators are invited, this section will list them with the same
shape as the maintainer entry, plus the specific areas they own (referenced
from `.github/CODEOWNERS`).

## Ownership by repository area

The maintainer currently owns the entire repository. The table below exists
to make scaling explicit when collaborators are added later.

| Path / area | Owner | Notes |
| --- | --- | --- |
| `/` (everything) | @MA1002643 | Default ownership for anything not otherwise listed |
| `/src/app/` | @MA1002643 | Next.js App Router pages and route handlers |
| `/src/app/api/` | @MA1002643 | API routes — work-status, github-stats, github-webhook, send-mail |
| `/src/components/about/` | @MA1002643 | About page composition and stat cards |
| `/src/components/home/` | @MA1002643 | Home hero, live maintenance header |
| `/src/components/navigation/` | @MA1002643 | Orbital + xs-mobile two-column nav |
| `/src/components/projects/` | @MA1002643 | Project grid and detail views |
| `/src/components/qualifications/` | @MA1002643 | Qualifications page composition |
| `/src/components/contact/` | @MA1002643 | Contact form (sender side of `/api/send-mail`) |
| `/src/components/project-detail/` | @MA1002643 | Project detail page sub-components |
| `/src/utils/` | @MA1002643 | Pure logic — `workSignal`, `workMessageAI`, `workStatusCache`, `diffChanges` |
| `/src/styles/` and `/src/app/globals.css` | @MA1002643 | Global theme tokens, neon palette, glow utilities |
| `/.github/` | @MA1002643 | Issue/PR templates, governance, CodeRabbit config, workflows |
| `/.github/workflows/` | @MA1002643 | CI / automation jobs |
| `vercel.json` | @MA1002643 | Cron schedules and Vercel deploy config |
| `/public/` | @MA1002643 | Static assets — backgrounds, project images, icons |

When a collaborator takes ownership of an area, this table is updated
**and** the same change is mirrored into `.github/CODEOWNERS` so GitHub's
auto-review-request matches.

## Availability and response expectations

Targets, not guarantees:

| Channel | Target |
| --- | --- |
| Security advisory / `SECURITY` email | acknowledged within **72 hours** |
| Bug / feature / UI issue (via templates) | triage within **7 days** |
| Pull request review | initial response within **7 days**; faster for trivial changes |
| General-question email | best-effort, may be slower |

Critical-severity security reports are prioritised over everything else.
During heavy work cycles or holidays, responses may slip — see
[GOVERNANCE.md](GOVERNANCE.md) for how the project handles maintainer
unavailability.

## Becoming a collaborator

Collaboration is by invitation only. Factors that make an invitation likely:

- Sustained, high-quality issue reports or PRs against an area.
- Demonstrated alignment with the project's design and code style.
- Acceptance of the [Code of Conduct](CODE_OF_CONDUCT.md) and
  [Governance](GOVERNANCE.md) framework.

There is no public application process. The maintainer reaches out
directly when collaboration makes sense.

## Stepping down

If a collaborator wants to step down, they should:

1. Open a PR removing themselves from this file and from
   `.github/CODEOWNERS`.
2. Note the date and any handover information.
3. Tag the maintainer for review.

The maintainer will reassign ownership of any orphaned areas.
