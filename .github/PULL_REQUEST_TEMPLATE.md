<!--
Thanks for the PR. Fill in every section. Empty sections will block review.
Keep summaries direct and active-voice ("Adds X", "Fixes Y", not "This PR aims to...").
-->

## Summary

<!-- One paragraph: what changed and why. The "why" is more important than the "what". -->

## Type of change

<!-- Tick exactly one. Use Conventional Commits vocabulary so the squash-merge title matches. -->

- [ ] `feat` — new user-facing feature
- [ ] `fix` — bug fix
- [ ] `refactor` — internal change, no behaviour difference
- [ ] `docs` — documentation only
- [ ] `test` — tests only
- [ ] `chore` — repo hygiene, deps, config, polish
- [ ] `ci` / `build` — pipelines or build config

## Linked issue

<!-- Use "Closes #N" so the issue auto-closes on merge. Use "Refs #N" if related but not closing. -->

Closes #

## Screenshots / video (UI changes only)

<!-- Drop images or short clips. For responsive changes, show desktop, tablet, AND mobile (≤ 479px). -->

| Before | After |
| --- | --- |
| | |

## Testing performed

<!-- Be specific. "Manually tested" doesn't help a reviewer. -->

- [ ] Ran the affected page locally and exercised the changed feature end-to-end.
- [ ] Verified at desktop (≥ 1024px), tablet (640–1023px), and mobile (≤ 479px) breakpoints.
- [ ] For API routes: hit the endpoint directly (curl / network tab), verified shape and status code.
- [ ] Other (describe):

## Risk assessment

<!-- What could go wrong? Mark the riskiest interaction. -->

- [ ] Touches a production-critical API route.
- [ ] Changes deployment or build config.
- [ ] Modifies cache headers or invalidation logic.
- [ ] Changes how external API tokens / secrets are read or used.
- [ ] None of the above — low-risk change.

## Deployment notes

<!-- Anything ops needs to know: new env vars, expected cold-start regression, behaviour during the seconds after deploy, etc. Write "None" if nothing to flag. -->

## Definition-of-done checklist

- [ ] `npm run lint` passes with no new warnings.
- [ ] `npm run build` succeeds.
- [ ] Browser console shows no new errors or warnings on affected pages.
- [ ] Responsive behaviour verified at all three breakpoints noted above.
- [ ] Accessibility quick-check done (keyboard tab order, focus visibility, screen-reader labels for any new interactive element).
- [ ] Documentation updated where behaviour, env vars, or API responses change.
- [ ] No secrets or `.env` files committed.
- [ ] Commit messages follow Conventional Commits (`type(scope): summary`).
- [ ] CodeRabbit findings addressed or explicitly acknowledged as invalid.
