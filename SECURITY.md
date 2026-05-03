# Security Policy

Thanks for taking the time to disclose responsibly. This document explains how
to report a vulnerability in this project privately, what to expect after you
report, and how disclosure is handled.

## Supported Versions

This project is the source of a single deployed website ([ma.codes](https://ma.codes)).
Security fixes are only applied to the `main` branch and the currently
deployed production version.

| Version | Security fixes |
| --- | --- |
| `main` (production) | ✅ |
| Any prior commit | ❌ — please verify against `main` first |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Public issues are visible to everyone the moment they're filed and can give
attackers a head start before a fix ships. Use one of the private channels
below instead.

### Preferred: GitHub Security Advisory

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Fill in the form with as much detail as you can.

This creates a private advisory visible only to the maintainer and people you
choose to invite.

### Alternative: Email

If you can't use GitHub's advisory flow, email
**team@ma.codes** with `SECURITY` in the subject line.

If the issue is sensitive enough that you want PGP encryption, ask in your
first email and a key will be provided.

## What to Include in a Report

The more of these you can provide, the faster the fix:

- **A clear description** of the vulnerability and its impact.
- **Steps to reproduce** — including any payloads, URLs, or specific user
  inputs needed.
- **Affected component** — page, API route, dependency, etc.
- **Suggested severity** (informational, low, medium, high, critical).
- **Your environment** if relevant: browser, OS, network.
- **Whether the issue is currently being exploited** in the wild, if known.
- **Whether you'd like attribution** in the eventual public disclosure (and
  the name/handle to credit).

Proof-of-concept code is welcome but not required. **Do not include**
sensitive data (real user credentials, tokens, personal information).

## Response Timeline

| Phase | Target |
| --- | --- |
| **Acknowledgement** of receipt | within **72 hours** |
| **Initial triage** + severity assessment | within **7 calendar days** |
| **Fix shipped to production** | varies by severity (see below) |
| **Public disclosure** (if applicable) | once a fix has been deployed and verified |

Resolution targets by severity:

| Severity | Target |
| --- | --- |
| Critical | within 7 days of triage |
| High | within 30 days of triage |
| Medium | within 90 days of triage |
| Low / Informational | best-effort, included in routine maintenance |

These are targets, not guarantees — complex issues may take longer.

## Escalation if reports go unanswered

The response targets above are best-effort, set by a single part-time
maintainer. If they slip significantly, you have recourse — this section
documents the path.

| Time since report | Recommended action |
| --- | --- |
| **7 days, no acknowledgement** | Try the alternate channel — email if you used the advisory queue first, advisory queue if you used email. Combined silence on both usually means the maintainer is offline; see [Maintainer unavailability in GOVERNANCE.md](GOVERNANCE.md#maintainer-unavailability). |
| **30 days, no triage** | Add a polite follow-up comment on the original advisory. For vulnerabilities that affect users beyond this site (e.g. an exploitable pattern in a dependency), you may also coordinate with a CERT/CC — your national cyber-security agency or CISA — who can apply institutional pressure for a response. |
| **90 days, no fix** | The industry-norm responsible-disclosure window. You're within professional norms to publicly disclose. We ask that you (a) give the maintainer at least 24 hours' notice of the disclosure date, (b) limit the public post to what users need to assess and mitigate risk — don't publish weaponised exploit code, and (c) credit the report and fix history fairly. |

**Active exploitation in the wild** compresses every timeline above. Mark
the report `URGENT — active exploitation` in the subject line or advisory
title and use **both** channels simultaneously. If no response arrives
within **48 hours** at that severity, you may proceed with public
disclosure on a much shorter timeline than the 90-day norm.

The maintainer's commitment in return for this escalation framework: every
report received via the documented channels is logged on receipt; nothing
is silently dropped. If you've followed the escalation steps and still
believe your report has been ignored, that is a bug in this policy — open
an issue against the policy itself (not the underlying vulnerability) so
it can be improved.

## Disclosure Policy

This project follows **coordinated disclosure**:

1. The reporter privately notifies the maintainer.
2. The maintainer confirms, triages, and develops a fix.
3. A fix is deployed to production.
4. After deployment, the maintainer publishes a security advisory describing
   the issue, the fix, and any mitigation steps for users running forks.
5. The reporter is credited (with permission) in the advisory.

If a vulnerability is being actively exploited, this timeline compresses
sharply — the fix may ship before the advisory is fully written.

## Out of Scope

The following are **not** considered security vulnerabilities for this
project:

- Missing best-practice HTTP headers when no concrete exploit is demonstrated
  (HSTS, CSP edge cases, etc.) — these are improvements, not vulnerabilities.
- Vulnerabilities in third-party dependencies that don't affect this
  project's actual use of them. Report those upstream.
- Self-XSS that requires the victim to paste attacker-supplied code into
  their own browser console.
- UI redress / clickjacking on pages that perform no sensitive actions.
- Rate limiting on public endpoints (the `/api/work-status` route is
  intentionally public and cached at the edge).

If you're unsure whether something qualifies, **report it anyway** — the
worst case is a polite "this isn't actually a security issue, but thanks."

## Hall of Fame

Security researchers who have responsibly disclosed valid vulnerabilities
will be credited here (with their permission) once a fix has shipped.

_No disclosures yet._
