<!--
Release notes template — copy this into a GitHub Release when tagging a
new version. Fill in every section; delete sections that don't apply with
"_None this release._" rather than leaving them blank.

Title format: `vX.Y.Z — short, evocative tag`
Tag format:   `vX.Y.Z`
-->

# vX.Y.Z — `<short, evocative tag>`

_Released YYYY-MM-DD_

## Highlights

<!-- Two or three bullets capturing the headline of this release in the user's voice, not the engineer's. Lead with what someone visiting ma.codes will notice. -->

- Headline 1
- Headline 2
- Headline 3

## User-facing changes

<!-- Everything a visitor or contributor will notice. Group under the same Keep-a-Changelog categories used in CHANGELOG.md. -->

### Added

-

### Changed

-

### Fixed

-

### Removed

-

### Deprecated

-

### Security

<!-- If this release ships a security fix, link to the GitHub Security Advisory and credit the reporter (with permission). -->

-

## Breaking changes

<!-- Anything that would force a fork to update. Include API response shapes, env var renames, removed features. Use "_None this release._" for non-breaking releases. -->

_None this release._

## Migration notes

<!-- For each breaking change above: what action must someone running a fork take to keep working? Concrete steps, not high-level guidance. -->

_None this release._

## Verification checklist

<!-- Tick before publishing. The release is not "done" until every box is ticked. -->

- [ ] All issues referenced in this release are closed.
- [ ] `CHANGELOG.md` updated — `[Unreleased]` content moved to this versioned section, dated.
- [ ] Production build passes locally (`npm run build`).
- [ ] Lint passes locally (`npm run lint`).
- [ ] Site verified working at production URL after deploy:
  - [ ] Home page loads, live maintenance header renders correctly.
  - [ ] About / Projects / Qualifications / Contact pages render and animate.
  - [ ] All API routes return 200 (`/api/work-status`, `/api/github-stats`, `/api/send-mail`).
  - [ ] Mobile (≤ 479px) layout verified — orbital nav switches to two-column, laptop centres correctly, header pushes down per breakpoint rule.
- [ ] No new console errors or warnings on the deployed site.
- [ ] Tag pushed to `main` (`git tag vX.Y.Z && git push --tags`).
- [ ] GitHub Release published from the tag with these notes.

## Acknowledgements

<!-- Credit reporters, reviewers, collaborators. Skip if solo-maintained release. -->

-

## What's next

<!-- One or two bullets pointing at the next release's themes — gives readers a forward look without committing to a roadmap. Optional. -->

-
