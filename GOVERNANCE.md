# Governance

This document describes how decisions are made in this project — who has
authority over what, how proposals turn into shipped code, and what happens
when people disagree. It exists so the process is legible to contributors,
reviewers, and anyone evaluating the repo.

## Project model

This is a **maintainer-led, proprietary project**.

- The repository is owned and operated by a single maintainer (see
  [MAINTAINERS.md](MAINTAINERS.md)).
- The codebase is not open for general external contribution. The
  [LICENSE](LICENSE) is a proprietary "all rights reserved" notice — code,
  design, and documentation may not be reused without written permission.
- Collaborators may be invited at the maintainer's discretion. When that
  happens, this document defines the framework they operate within.

The point of this governance file is twofold:

1. **Clarity today.** Even with one maintainer, decisions follow a documented
   process so the rationale is reconstructable later.
2. **Scalability tomorrow.** If the project ever grows past one person, the
   structure here is what it scales into without rewriting.

## Roles

### Maintainer

The role with final authority over code, direction, releases, and access.
Currently held by a single person — see [MAINTAINERS.md](MAINTAINERS.md).

Responsibilities:

- Setting project direction and priorities.
- Reviewing and merging pull requests.
- Cutting releases and managing deployments.
- Enforcing the [Code of Conduct](CODE_OF_CONDUCT.md).
- Triaging security reports per the [Security Policy](SECURITY.md).
- Maintaining the documentation in this repo.

### Collaborator

An invited contributor with write access to specific repository areas. A
collaborator can:

- Open issues and pull requests against their owned area.
- Approve PRs in their owned area (but cannot self-merge without maintainer
  sign-off on cross-cutting changes).
- Triage incoming issues.

Collaborators are designated in [MAINTAINERS.md](MAINTAINERS.md) and are the
mechanism through which this governance scales beyond one person.

### Reporter / external user

Anyone interacting with the project through issues, security advisories, or
public discussion. Reporters can:

- Open issues using the templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/).
- Submit security reports via [SECURITY.md](SECURITY.md).
- Contact the maintainer for general questions per
  [`.github/SUPPORT.md`](.github/SUPPORT.md).

Reporters do not have write access and are not bound by this governance
document beyond the [Code of Conduct](CODE_OF_CONDUCT.md).

## How changes are proposed

All non-trivial changes follow this path:

1. **Issue first.** Open an issue using the appropriate template before
   writing code, unless the change is a single-line fix or a typo. The issue
   captures the problem, the proposed direction, and acceptance criteria.
2. **Branch.** Branch off `main` using the convention in
   [CONTRIBUTING.md](CONTRIBUTING.md): `<type>/<issue#>-<topic>`.
3. **Pull request.** Open a PR against `main` using
   [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).
   Link the issue with `Closes #N`.
4. **Review.** CodeRabbit performs an automated review. The maintainer (or a
   collaborator who owns the affected area per
   [`.github/CODEOWNERS`](.github/CODEOWNERS)) performs a human review.
5. **Merge.** Squash-merge with a Conventional Commits message once approved
   and CI passes.

Trivial changes — typo fixes, comment clarifications, dependency patch
bumps — may skip the issue step at the maintainer's discretion.

## Major changes

A change is "major" if it does any of the following:

- Breaks a public API contract (e.g., changes the response shape of any route
  under `/api/`).
- Removes or fundamentally restyles a user-facing page or component (e.g.,
  retiring the live maintenance header).
- Introduces a new third-party runtime dependency that the production
  deployment must resolve at runtime.
- Changes the licensing posture of the project (e.g., proprietary →
  open-source, or vice versa).
- Changes how user-submitted data (contact form, etc.) is collected, stored,
  or transmitted.
- Changes deployment infrastructure (host, runtime, region).

For major changes:

- The originating issue must use a label of `major-change` and call out the
  scope explicitly in the issue body.
- The PR description must include a **migration / rollback section** in the
  Deployment Notes block of the PR template.
- A minimum **48-hour notice window** between PR opening and merge must be
  observed (no same-day merges of major changes), to allow for considered
  review.

## Approval rules

| Change scope | Required approvals |
| --- | --- |
| Trivial (typo, comment, patch deps) | Maintainer self-approval |
| Standard (one issue, one area, no API break) | 1 maintainer or area collaborator |
| Cross-cutting (multiple areas, no API break) | 1 maintainer |
| Major (per definition above) | 1 maintainer + 48-hour notice window |
| Licensing / governance changes (this file, LICENSE, CODE_OF_CONDUCT) | 1 maintainer + explicit sign-off in PR description acknowledging the policy implication |

In all cases, **automated checks (lint, build, CodeRabbit) must pass** before
merge. A failing automated check overrides any human approval — the underlying
issue must be fixed or the failure must be explicitly documented as
intentional in the PR.

## Conflict resolution

If contributors (collaborators or maintainers, where applicable) disagree on
a technical decision:

1. **Document the disagreement** in the relevant issue or PR thread. State
   the positions and the trade-offs, not personal preferences.
2. **Look for a third option.** Most disagreements dissolve when a synthesis
   is found that addresses both concerns.
3. **Defer to the area owner** per [`.github/CODEOWNERS`](.github/CODEOWNERS)
   if the disagreement is local to one area.
4. **Maintainer breaks the tie** if the disagreement persists past steps 1-3.
   The maintainer's decision is final, but they must document the reasoning
   in the issue/PR thread for future reference.

Personal disputes — as opposed to technical disagreements — are out of scope
for this document. Those are governed by the
[Code of Conduct](CODE_OF_CONDUCT.md) and its enforcement procedures.

## Maintainer unavailability

This is a part-time, single-maintainer project. The maintainer takes regular
time off and occasionally drops out of the loop for a week or more during
heavy work cycles, illness, or travel. This section sets expectations for
what happens during those windows.

### Planned absences

For absences expected to last **longer than one week**, the maintainer will:

1. Pin a GitHub issue titled `Notice: maintainer offline YYYY-MM-DD → YYYY-MM-DD`
   with the date range and any partial-coverage info.
2. Apply the `pinned` label so the stale workflow's exemption keeps it
   surfaced for the duration.

Issues and PRs continue to accept submissions during this window — they
simply aren't triaged or reviewed until the maintainer returns.

### Unplanned absences

Without prior notice, the response-target table in
[MAINTAINERS.md](MAINTAINERS.md) silently slips. Reporters who haven't
received an acknowledgement after **2x the published target** can assume an
unplanned absence is in effect. No escalation path exists beyond patience —
this is a deliberate trade-off of running the project solo.

### Critical security during absences

Security reports continue to land in `team@ma.codes` and the GitHub Security
Advisory queue regardless of maintainer availability. Acknowledgement
timeline may slip, but no security report is silently dropped — the email
alias and advisory queue both persist incoming reports until they're read.

If a reporter believes a critical vulnerability is being actively exploited
and no acknowledgement has arrived after **7 calendar days**, GitHub's
responsible-disclosure window in [SECURITY.md](SECURITY.md) gives them a
documented path to escalate.

### Site availability during absences

The deployed site at [ma.codes](https://ma.codes) continues to function
without maintainer intervention. The Vercel deployment, edge cache, and
GitHub Actions (CI, stale management, issue triage workflow) all run
autonomously. The live maintenance header continues to reflect actual
GitHub activity via the daily cron in `vercel.json`. Visitors notice no
disruption.

### Permanent unavailability

If the maintainer becomes permanently unable to maintain the project —
including succession on death or long-term incapacity — the project's
intent is one of:

1. **Hand off** to a designated successor, named in
   [MAINTAINERS.md](MAINTAINERS.md) under "Active maintainers" if/when one
   exists.
2. **Sunset** the repository: remove production deployments, archive the
   GitHub repo with a final notice in the README explaining its
   maintained-until date, leave the source available under the existing
   [LICENSE](LICENSE).

No formal succession plan is in place today. This section will be updated
when one is established, following the **licensing / governance changes**
row of the approval table above.

## Amending this document

Changes to this file follow the **licensing / governance changes** row of the
approval table above. The PR description must explicitly call out what is
changing in the governance model and why.
