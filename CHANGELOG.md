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

_Scope: the Repository Governance & Templates Suite; the Experience Summary live-data fix; the Unify Page Titles refactor; five About-page card overhauls (Most Used Languages, GitHub Stats, Completed Projects, Current Streak, and the Skills grid); the Contact Form submit-animation feature; and the route-wide editorial footer ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30)) — its live-location and project-metadata endpoints, guitar-string wordmark, and the "Stone Passage" page transition; the Now Playing live-Spotify widget ([#42](https://github.com/MA1002643/theabdullahfolio/issues/42)) with its data + one-time-token endpoints and the shared HoverHint tooltip primitive; and the site-wide sound control lifted out of the footer so the guitar track survives navigation; and the homepage hero's vection-drift fix ([#87](https://github.com/MA1002643/theabdullahfolio/issues/87)) — the calmed laptop float, the GPU-isolated title, the hero + glow-headline `prefers-reduced-motion` coverage, and the reading-order gold→ember fill shared by the About and contact prose; and the `/qualifications` certificate carousel's image-loading overhaul ([#84](https://github.com/MA1002643/theabdullahfolio/issues/84)) — eliminating the `(canceled)` `_next/image` requests, adding intent-based certificate preloading, and self-limiting card image sizes without a global optimiser cap; and the `/projects` list's project-detail intent warming ([#83](https://github.com/MA1002643/theabdullahfolio/issues/83)) made connection-aware, so it respects Save-Data / 2G; and the `/projects` category system made data-driven ([#27](https://github.com/MA1002643/theabdullahfolio/issues/27)) — tabs derived from the project data with a validated stored-filter fallback, the slower per-card reveal choreography, and the card text roles (`project-title` / `project-meta` / `project-separator-dot`) aligned with the About page's #14 amber, with the same tab derivation ported to the `/qualifications` parent/sub category tree; and the `/qualifications` cinematic water scene & centre-out card entrance ([#52](https://github.com/MA1002643/theabdullahfolio/issues/52)) — the crisp lantern-corridor background brought to life by a full-scene ambient video loop (rippling water, flickering lantern light), and the carousel's centre-out staggered entrance (banner second-beat included) replayed on every category switch; and the `/projects` unified fluid scaling system ([#50](https://github.com/MA1002643/theabdullahfolio/issues/50)) — every breakpoint jump on the page replaced by one CSS-computed `--fluid-scale` factor, delivered as a reusable opt-in `.fluid-scale` scope with `fluid()`/`fluidText()` helpers (`src/lib/fluidScale.js`) that any sub-page can adopt, and the project-card description made always-visible (ellipsizing instead of vanishing below 640px); and the maintenance-header Focus line made self-contained ([#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up) — every `topItems` record now carries its own repo attribution and GitHub URL, so Focus resolution no longer depends on the capped per-repo breakdown lists (which could leave the line link-less, or worse, number-collide into the wrong repo's item); and the project data's private-repo demo links defused — `auxo` and `clearway` (private repositories) now carry `demoLink: null` + `private: true` instead of repo URLs that 404 for every visitor; and the category fold's `ACRONYMS` lookup hardened against prototype keys — a `Map` instead of a bare object, so `normalizeCategory` always returns a string even for labels like `"constructor"`. Each change below is its own table — field labels on the left, full detail on the right._

### Added

#### Route-wide editorial footer (colophon)

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/index.jsx`, `src/app/(sub pages)/layout.js` |
| **Details** | **Route-wide editorial footer** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/index.jsx`). An editorial "colophon" footer rendered **once** in the `(sub pages)` layout as a `contentinfo` sibling of `<main>`, so it appears on `/about`, `/qualifications`, `/projects`, and `/contact` with no per-page duplication. Composed as an asymmetric 5 / 4 / 3 masthead — **Identity** (name, role, positioning line, the mandatory project-GitHub CTA, and one honest availability signal), **Index** (a numbered, route-aware table of contents), and **Elsewhere** (professional links + a contact micro-block) — over a layered atmospheric plate and a giant "plucked-string" wordmark. Everything reuses the site's existing neon-orange glass design system; all motion is transform / opacity / colour (no layout, no CLS) and honours `prefers-reduced-motion`. |

#### Footer Identity block — "Wet Ink" signature entrance

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/FooterIdentity.jsx`, `src/components/footer/AvailabilityStatus.jsx` |
| **Details** | **Footer Identity block** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/FooterIdentity.jsx`). On first scroll-into-view (gated on the intro loader) the block "writes itself on" like a signature — an ember rule draws to full width then retracts as the name lands, the name inks down top→bottom via `clip-path`, the role snaps up from a sparking tick, the statement rises "as the ink dries", and the GitHub CTA lands last and self-draws its git graph on top. Choreographed in pure CSS keyframes keyed off a `data-revealed` attribute (so the rule keeps its `:hover` transform). `AvailabilityStatus.jsx` contributes the one live, semantic signal the block earns — an honest "open to new roles" line with a single breathing dot — SSR-/hydration-safe and stilled under reduced motion. |

#### Footer Index — split-flap "Departures" board

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/FooterManifest.jsx` |
| **Details** | **Footer Index board** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/FooterManifest.jsx`). The site's four routes staged as a mechanical split-flap **departures board** that "arrives" the first time the footer reveals: each row's two-digit ordinal scrambles across its flap tiles and settles, row by row, and the route you're on reads **NOW BOARDING** with a live pulse while the rest sit **ON TIME**. Rows stay real internal `<TransitionLink>`s — SPA page-transition preserved, keyboard-focusable, `aria-current`, with the per-glyph hover-swap on the destination; the scrambling flap glyphs are decorative (`aria-hidden`) so the accessible name never depends on how far they've settled. SSR-safe (final ordinals render on the server and first client render — correct with JS off, no hydration mismatch), every tile reserves its box (no CLS), and reduced motion shows the board already settled. |

#### Footer Elsewhere — live terminal

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/ElsewhereTerminal.jsx` |
| **Details** | **Footer Elsewhere terminal** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/ElsewhereTerminal.jsx`). The three professional destinations (GitHub / LinkedIn / Résumé) staged as a small graphite terminal that "runs a session" on first reveal — each command types itself out, its resolved destination prints beneath, and a blinking ember caret waits at the prompt. Each command + output entry stays one real `<a>` with the honest `aria-label` from `footer-data`; the typed glyphs are decorative. SSR-safe (renders fully "run" server-side, no hydration mismatch), each output row reserves its height (no CLS), and reduced motion shows the session already run and still. |

#### Live-location signal — "Ember Meridian"

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/LiveLocation.jsx`, `src/utils/liveLocation.js` |
| **Details** | **Live-location signal** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/LiveLocation.jsx`). The calling card's static place line replaced by the owner's **real current town + local time**, engraved into the graphite plate: a day/night glyph, an ember-gradient clock, the town kicker, the UTC offset, and a **LIVE** pulse shown only when the GPS fix is genuinely fresh. Fed by `/api/location` (below), which returns only `{ town, tz, live }` — never coordinates — with a freshness guard, so when the tracker is off it quietly shows the home city (Bolton) with no LIVE flag. Hydration-safe: the clock is `null` on the server and first client render (SSR and hydration agree), then fills in and ticks on mount, and the live time is surfaced exactly once across the whole footer. |

#### `/api/location` — live-location ingest + read endpoint

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `/api/location`, `src/app/api/location/route.js`, `src/utils/liveLocation.js` |
| **Details** | **`/api/location` endpoint** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/app/api/location/route.js`). `POST` ingests a GPS fix from the owner's phone tracker (OwnTracks / Overland / an iOS Shortcut). Two **independent** write secrets gate it — `LOCATION_INGEST_TOKEN` via an `Authorization` header and a separate `LOCATION_INGEST_QUERY_TOKEN` via `?token=`, so the inevitably-log-exposed query secret is isolated from the header token — each constant-time compared and failing closed when unset. The handler derives the timezone **offline** (`tz-lookup`), reverse-geocodes to a town, and stores the latest fix in Upstash KV. `GET` is a public read returning only `{ town, tz, live }` (never coordinates) with the freshness guard applied. Privacy-hardened: coordinates are rounded to a ~1 km floor **before** the third-party geocode and before storage, the geocode fetch is `cache: 'no-store'`, and the handler short-circuits to `503` before geocoding when KV is unconfigured. Node runtime, `force-dynamic`. |

#### Footer project-GitHub CTA — self-drawing git graph

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/ProjectGithubCta.jsx` |
| **Details** | **Project-GitHub CTA** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/ProjectGithubCta.jsx`). The colophon's one mandatory "View this project on GitHub" call-to-action, built as a single etched-graphite plate that **is** a git graph — a hairline ember branch that forks and merges, self-drawn on scroll-in via framer's `pathLength` (the same language as the contact SEND check), commit nodes popping in along it. On hover a bright pulse travels the branch to HEAD (CSS `offset-path`), the octocat leans, and an ember light rakes across once; the plate leans magnetically toward the cursor (`useMagneticPull`). It carries an **honest** terminal caption — `❯ main · N commits · pushed <rel>` — fed live by `/api/project-repo`, degrading to the branch + "open source" (never a faked number) if the fetch can't complete. Transform / opacity / colour only (no CLS); reduced motion shows the graph fully drawn and still. |

#### `/api/project-repo` — live repo-metadata endpoint

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `/api/project-repo`, `src/app/api/project-repo/route.js` |
| **Details** | **`/api/project-repo` endpoint** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/app/api/project-repo/route.js`). A tiny, pinned GraphQL fetch of live metadata (default branch, commit count, last-push time) for the **one** repository this site is built from — deliberately distinct from `/api/github-stats`, whose `repo` field is the algorithmically-chosen *most active* repo. Pinned to a single owner/name with **no query params** (no cache-key surface to abuse; every caller gets the same cached payload), wrapped in `unstable_cache` with a 10-minute revalidate, Node runtime, and **fails soft** to a bundled snapshot so the CTA never renders an empty caption. Owner and repo name are env-overridable (`NEXT_PUBLIC_GITHUB_USERNAME` / `NEXT_PUBLIC_PROJECT_REPO`) so a fork retargets both the CTA link and this caption with no code change. |

#### "Plucked-string" footer wordmark + Web Audio guitar

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/FooterWordmark.jsx`, `src/components/footer/pluckSynth.js`, `src/components/footer/footerMelody.js`, `src/components/footer/SoundControl.jsx` |
| **Details** | **Plucked-string wordmark** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/FooterWordmark.jsx`). The giant half-sunk wordmark rebuilt as horizontal "guitar strings" — the name is rasterised to an offscreen canvas and **scanline-sampled** into one horizontal line segment per filled run, reproducing the "letters made of lines" construction for arbitrary text. Hovering a string plucks it (a pinned-end standing wave that rings down ~0.9 s); sweeping the cursor strums the name. On hover-capable devices each pluck sounds the next note of an **original** qawwali-style melody (`footerMelody.js`) through an **original** Web Audio plucked-string synth (`pluckSynth.js`, ships no audio files); touch / keyboard-less devices instead play a self-hosted acoustic track (`SoundControl.jsx` owns the toggle and unlocks the `AudioContext` from the click gesture). Physics run on one rAF, paused off-screen. Purely decorative (`aria-hidden`); reduced motion stills the strings. |

#### Footer link micro-interactions — hover-swap, Decipher email, meta cascade

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/HoverText.jsx`, `src/components/footer/DecipherEmail.jsx`, `src/components/footer/FooterMetaReveal.jsx` |
| **Details** | **Footer link micro-interactions** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30)). `HoverText.jsx` gives the link columns a per-glyph "swap" hover — each letter rolls out as a fresh copy rolls up (with a per-letter colour lift), the face + clone stacked **inside** each character box so long values (e.g. the contact email) still wrap character-by-character; a pure CSS `transition-delay` stagger, so it works before hydration and costs nothing at rest. `DecipherEmail.jsx` resolves the contact address out of a cipher on first reveal (each glyph scrambles through monospace characters then locks in left→right). `FooterMetaReveal.jsx` ripples the meta row (sound toggle + copyright) in glyph-by-glyph as a split-flap cascade. All three expose the real, unsplit string via an `sr-only` node (decorative glyphs `aria-hidden`), run on text/colour only (no CLS), and collapse to a plain fade / colour lift under reduced motion. |

#### Shared footer reveal gate (`useFooterReveal`)

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/useFooterReveal.js` |
| **Details** | **Shared footer reveal gate** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/footer/useFooterReveal.js`). The single re-arming, loader-gated "is this footer block on screen?" primitive every footer entrance shares. Because the footer is rendered once and **persists** across SPA navigations, a `useInView(once)` observer would latch on a transient off-screen flicker during a route swap / page-transition overlay and leave entrances "spent" where nobody sees them. This fires when a meaningful `amount` of a block is on screen **and** the intro loader has lifted, then resets once it is fully out of view — two-threshold hysteresis so a partial scroll-away never blanks a still-visible block — so every entrance replays when the visitor actually scrolls it into view. |

#### About-page Skills grid

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/components/about/SkillsCard.jsx` |
| **Details** | **About-page Skills grid** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/components/about/SkillsCard.jsx`). An icon grid sourced **entirely from a live GitHub crawl** — there is no hardcoded skill list, so it only ever shows what your repositories actually use. Detections are grouped into five ordered buckets (languages, frameworks, libraries, tools, software — headings hidden, used only for sequence), rendered as illustrated icons via skillicons.dev with `cdn.simpleicons.org` / devicon fallbacks, with a total count-up, a `· live from GitHub` label shown only on genuinely live data, a `prefers-reduced-motion`-aware staggered entrance, and a "No skills detected" empty state. An unmapped detection is dropped rather than shown as a broken image. |

#### `/api/github-skills` route

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `/api/github-skills`, `src/app/api/github-skills/route.js` |
| **Details** | **`/api/github-skills` route** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/app/api/github-skills/route.js`). A budget-bounded GraphQL + REST crawler that, for the allowlisted owner, pages the owner's repositories and extracts skills two ways: **repo languages** inline from GraphQL, and **dependency names** parsed from manifests discovered at any depth in each repo's default-branch tree (recursive Git tree → batched blob fetch). Wall-clock is bounded by a shared per-request deadline (`AsyncLocalStorage`) plus per-call, cumulative, and pagination caps, so a slow GitHub response can't exceed the serverless limit — partial results are retained on exhaustion. A `?username=` other than `NEXT_PUBLIC_GITHUB_USERNAME` returns `403`; a total failure returns an empty payload (`_fallback: true`) and the 10-min TTL retries on the next visit. |

#### Multi-ecosystem manifest parsing

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/utils/manifestParsers.js`, `Backend/`, `Frontend/` |
| **Details** | **Multi-ecosystem manifest parsing** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/utils/manifestParsers.js`). `parseManifest` recognises 12 manifest filenames across 7 ecosystems — `package.json` (JS/Node), `requirements.txt` / `pyproject.toml` / `Pipfile` (Python), `go.mod` (Go), `Cargo.toml` (Rust), `Gemfile` (Ruby), `composer.json` (PHP), `pubspec.yaml` (Dart/Flutter), and `pom.xml` / `build.gradle` / `build.gradle.kts` (JVM) — matched by basename at **any tree depth** (so a `Backend/`/`Frontend/` monorepo is fully covered), skipping vendored/build directories (`node_modules`, `dist`, …). |

#### Skill detection → icon mapping

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/utils/skillsIconMap.js`, `src/utils/simpleIconsSlugs.js` |
| **Details** | **Skill detection → icon mapping** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/utils/skillsIconMap.js`). A curated `SKILL_MAP` of canonical skillicons.dev short names (plus a handful of Simple Icons additions) resolves first and owns ambiguous names; anything else falls back to the Simple Icons slug algorithm against a bundled ~3.4k-slug catalog (`src/utils/simpleIconsSlugs.js`). `categorizeSkillsWithRepos` dedupes by slug and attaches the repositories each skill was detected in. |

#### Per-skill repository popover + keyboard-accessible icons

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/components/about/SkillIcon.jsx` |
| **Details** | **Per-skill repository popover + keyboard-accessible icons** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/components/about/SkillIcon.jsx`). Activating a skill icon opens a panel (themed like the languages card's breakdown popover) listing the repos that skill was detected in — portaled to `<body>`, viewport-clamped, internally scrolling. It opens by **hover** (fine pointer), **keyboard focus** (input-modality tracked, so an attached keyboard behaves like hover), or **tap** on touch. Each interactive tile is exposed as a `role="button"` with `aria-haspopup`, `aria-expanded`, and Enter/Space activation (wired to a modality-agnostic toggle in the parent that opens in the blur-closable mode, so tabbing away still dismisses it); non-interactive icons stay out of the tab order. |

#### Per-device skills-change banner

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/hooks/useSkillsUpdateSignal.js`, `src/utils/skillsDiff.js` |
| **Details** | **Per-device skills-change banner** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/hooks/useSkillsUpdateSignal.js` + `src/utils/skillsDiff.js`). A localStorage-baselined "skills changed since this device last saw them" signal (same model as the languages / streak / project signals): the fingerprint (slug + category) is **client-computed** via `skillsFingerprint` so it can't drift from the server, and `diffSkills` / `buildBannerMessage` surface a human-readable added/removed message via the shared `UpdateBanner` only on a real change. |

#### Client-safe `src/utils/skillsIconUrl.js`

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/utils/skillsIconUrl.js` |
| **Details** | **Client-safe `src/utils/skillsIconUrl.js`** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20)) — the small surface UI components need (`CATEGORY_ORDER`, `emptyCategories`, `getIconUrl`), split out of the heavy detection module so the ~3.4k-slug Simple Icons catalog and the `SKILL_MAP` build never reach the client bundle. |

#### Completed Projects category breakdown

| | |
|:--|:--|
| **Ref** | [#16](https://github.com/MA1002643/theabdullahfolio/issues/16) |
| **Files** | `src/components/about/index.jsx` |
| **Details** | **Completed Projects category breakdown** ([#16](https://github.com/MA1002643/theabdullahfolio/issues/16), `ProjectsSplitBar` in `src/components/about/index.jsx`). A two-segment proportional bar (Web / System, grouped from each project's `category`) with an `aria-hidden` animated fill that re-fires on viewport entry, a responsive count legend (stacked below `sm`; side-by-side from `sm` up with a vivid `#ff6d05` `\|` divider, wrapping back to stacked when the pair won't fit), and raw per-category counts driven by the card's count-up. The grouping is computed once at module scope as `PROJECT_CATEGORY_BREAKDOWN` from the static `projectsData`, so adding a project to a category (or a brand-new category) updates the count, colour, legend, and a new `\|`-separated entry automatically. |

#### `sr-only` "Completed projects by category — …" summary on the Completed Projects card so the per-…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `sr-only` "Completed projects by category — …" summary on the Completed Projects card so the per-category breakdown (information not expressed in text anywhere else on the card) reaches assistive tech while the decorative bar and legend stay `aria-hidden`. |

#### Shared `useViewportCountUp` hook

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | Shared `useViewportCountUp` hook (`src/components/about/index.jsx`) backing all three about-page imperative counters (`Counter`, `CountUp`, `PercentCount`): animates `from → to` on a true viewport entry, replays on re-entry, and **debounces the out-of-view reset** (`COUNT_RESET_DELAY_MS = 300`) so an `IntersectionObserver` flicker during the parent `ItemLayout`'s `scale: 0 → 1` entrance never snaps a digit to 0. It also leaves an in-flight tween running through a flicker (no restart, no freeze), re-arms cleanly when disabled/re-enabled, and is `prefers-reduced-motion` aware. |

#### `src/hooks/useProjectCountSignal.js` — a per-device "completed-projects count changed since this…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/hooks/useProjectCountSignal.js` |
| **Details** | `src/hooks/useProjectCountSignal.js` — a per-device "completed-projects count changed since this device last saw it" banner signal (localStorage baseline, same model as `useLanguagesUpdateSignal`), surfaced once the card scrolls into view via the shared `UpdateBanner` and auto-hidden after ~4.5 s. |

#### Completed Projects card promoted to the same two-layer "elite" chrome as the Years-in-the-Craft /…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Completed Projects card promoted to the same two-layer "elite" chrome as the Years-in-the-Craft / Most Active Repository cards (outer `custom-bg-abt` amber border + inner `repo-card-breathe` glow), with a "Projects shipped" eyebrow microlabel. |

#### GitHub Stats per-stat change banner

| | |
|:--|:--|
| **Ref** | [#19](https://github.com/MA1002643/theabdullahfolio/issues/19), [#115](https://github.com/MA1002643/theabdullahfolio/pull/115) |
| **Files** | `src/utils/statsDiff.js`, `src/components/about/index.jsx`, `src/components/about/StatsCard.jsx` |
| **Details** | **GitHub Stats** per-stat change banner ([#19](https://github.com/MA1002643/theabdullahfolio/issues/19), [#115](https://github.com/MA1002643/theabdullahfolio/pull/115)). New `src/utils/statsDiff.js` `computeStatsDiff(prev, current)` returns a per-stat `{ prev, current, delta, increased }` breakdown plus a signed-delta summary message (`Total Stars +5 \| Total Commits +50`), wired through `src/components/about/index.jsx` → `src/components/about/StatsCard.jsx`. The banner appears only on a real value change (never on first load or an unchanged re-fetch), auto-hides after ~4.5 s, and is gated on viewport visibility so an update that lands off-screen can't expire before it's seen. |

#### `statsLive` flag on the about-page stats state

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | `statsLive` flag on the about-page stats state (`src/components/about/index.jsx`) distinguishing genuinely live GitHub stats from the bundled `_fallback` snapshot. Drives the GitHub Stats card's new **"Live GitHub Metrics"** eyebrow, which is omitted whenever the stats are kept/stale so the card never claims "live" over fallback data — mirroring the languages card's `· live from GitHub` suffix. |

#### Interactive Most Used Languages card overhaul

| | |
|:--|:--|
| **Ref** | [#18](https://github.com/MA1002643/theabdullahfolio/issues/18) |
| **Files** | `src/components/about/LanguagesCard.jsx` |
| **Details** | Interactive **Most Used Languages** card overhaul (`src/components/about/LanguagesCard.jsx`, [#18](https://github.com/MA1002643/theabdullahfolio/issues/18)). Two-way hover/focus spotlight linking each list row to its stacked-bar segment (the active language stays lit, the rest dim + desaturate, and vice-versa); a monospaced rank index plus a `PRIMARY` pill on the dominant language; a one-shot `.lang-bar-sheen` shimmer sweep across the bar on viewport entry; and a `· live from GitHub` meta line under the title that hides whenever the displayed list is stale and returns on the next live fetch. |

#### Per-language repository breakdown popover in the languages card

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Per-language **repository breakdown popover** in the languages card. Activating a row opens a "Career snapshot"-themed panel listing the repos that use that language with each repo's share of the language's bytes, repo names in the language's own `.text-fire-amber` gradient, a slim share bar, and the card's fast-start/slow-finish count-up on every percentage (started on open, killed on close via the row's unmount). It opens by hover (fine pointer), keyboard focus (input modality is tracked, so an attached keyboard behaves like hover even on a touch device), or tap on touch (re-tap / tap-outside / Escape to close). Portaled to `<body>` to escape the card's `overflow-hidden`, clamped so it never overflows the viewport, and scrolls its repo list internally (`max-height: calc(100dvh - 16px)` flex column) when a breakdown is taller than the available height. |

#### `repos: [{ name, url, percentage }]` per-language breakdown on the `/api/github-stats` payload

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/api/github-stats`, `src/app/api/github-stats/route.js` |
| **Details** | `repos: [{ name, url, percentage }]` per-language breakdown on the `/api/github-stats` payload (`src/app/api/github-stats/route.js`) — each repo's share of *that language's* bytes, sorted biggest-first and capped at 12 (`MAX_REPOS_PER_LANGUAGE`). The owned-repos languages query now also selects each repo's `name` + `url`. |

#### `src/hooks/useLanguagesUpdateSignal.js` and `src/utils/languageDiff.js` — a per-device "languages…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/hooks/useLanguagesUpdateSignal.js`, `src/utils/languageDiff.js` |
| **Details** | `src/hooks/useLanguagesUpdateSignal.js` and `src/utils/languageDiff.js` — a per-device "languages changed since this device last saw them" banner signal and the pure fingerprint/diff helper it and the card share. The fingerprint is derived client-side from the language list, so it also works on the bundled fallback and the server/client can't drift. |

#### `.lang-bar-sheen` utility in `src/app/globals.css`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/app/globals.css` |
| **Details** | `.lang-bar-sheen` utility in `src/app/globals.css` (reuses the existing `shimmer-sweep` keyframe — one iteration, `both` fill — for the languages-bar entry sweep). |

#### Shared `<PageTitle title subtitle id?>` component

| | |
|:--|:--|
| **Ref** | [#104](https://github.com/MA1002643/theabdullahfolio/issues/104) |
| **Files** | `src/components/PageTitle.jsx` |
| **Details** | Shared `<PageTitle title subtitle id?>` component (`src/components/PageTitle.jsx`) consumed by every sub-page header, so the font sizes, neon stroke, and flanked pink-neon subtitle treatment can't drift per page. About, Projects, Contact, and Qualifications all render identical headings now ([#104](https://github.com/MA1002643/theabdullahfolio/issues/104)). |

#### `.elite-cta-text` / `.elite-cta-icon` utility classes in `src/app/globals.css` for the 404 page's…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/app/globals.css` |
| **Details** | `.elite-cta-text` / `.elite-cta-icon` utility classes in `src/app/globals.css` for the 404 page's TAKE ME BACK / About / Projects / Contact CTAs — faded warm-ember resting state, fire-amber gradient text + warm double-drop-shadow halo (and solid `#ffaa2a` icon stroke + matching halo) when the parent group is hovered or keyboard-focused, smooth 300 ms transition. Replaces ad-hoc per-CTA styling. |

#### First-visit em-dash placeholder for the Years in the Craft digit while `useExperienceSummary` res…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | First-visit em-dash placeholder for the Years in the Craft digit while `useExperienceSummary` resolves, so the slot never reads as "0 months of experience" on a true cold start. Returning visitors see their cached value instantly via the new localStorage hydration path (see _Fixed_). |

#### Repository governance and community-health suite: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECUR…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `.github/ISSUE_TEMPLATE/` |
| **Details** | Repository governance and community-health suite: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `GOVERNANCE.md`, `MAINTAINERS.md`, `CHANGELOG.md`, `RELEASE_TEMPLATE.md`, full `.github/ISSUE_TEMPLATE/` set (bug, feature, UI/UX, docs, security redirect), `PULL_REQUEST_TEMPLATE.md`, `SUPPORT.md`, `CODEOWNERS`, and stale + issue-triage workflows. The existing proprietary `LICENSE` was kept unchanged. |

#### `GOVERNANCE.md` "Maintainer unavailability" section documenting planned and unplanned absences, s…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `GOVERNANCE.md` "Maintainer unavailability" section documenting planned and unplanned absences, security-report continuity during absences, site availability under autopilot, and a hand-off / sunset framework for permanent unavailability. |

#### `SECURITY.md` "Escalation if reports go unanswered" section with three time-tiered recourse paths

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `SECURITY.md` "Escalation if reports go unanswered" section with three time-tiered recourse paths (7-day alternate-channel contact, 30-day CERT/CC coordination, 90-day responsible-disclosure window) and a 48-hour compressed timeline for active-exploitation cases. |

#### Current Streak card overhaul

| | |
|:--|:--|
| **Ref** | [#21](https://github.com/MA1002643/theabdullahfolio/issues/21), [#117](https://github.com/MA1002643/theabdullahfolio/pull/117) |
| **Files** | `src/components/about/StreakStatsCard.jsx` |
| **Details** | **Current Streak card overhaul** ([#21](https://github.com/MA1002643/theabdullahfolio/issues/21), [#117](https://github.com/MA1002643/theabdullahfolio/pull/117), `src/components/about/StreakStatsCard.jsx`). Three stat blocks — Total Contributions, the Current Streak progress ring, and Longest Streak — that reveal in a staggered left-to-right cascade on every viewport entry, with vertically-centred content. The ring is a flat-stroke arc whose fill encodes the current streak as a share of the longest, sweeping in once on entry, with a `GitCommitVertical` "commit node" perched at the top. Numbers count up imperatively via the new `animateToTarget` util. |

#### `src/hooks/useStreakUpdateSignal.js` + `src/utils/streakDiff.js`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/hooks/useStreakUpdateSignal.js`, `src/utils/streakDiff.js` |
| **Details** | `src/hooks/useStreakUpdateSignal.js` + `src/utils/streakDiff.js` (`computeStreakDiff` / `streakFingerprint`) — a per-device "streak stats changed since this device last saw them" banner signal (localStorage baseline, same model as `useLanguagesUpdateSignal` / `useProjectCountSignal`), surfaced via the shared `UpdateBanner` once the card is in view and auto-hidden after ~4.5 s. The fingerprint is computed **client-side** from the three streak values plus the current/longest date ranges (the rolling `totalContributions` range is deliberately excluded so a daily window roll-over never reads as a change), so it works on the bundled fallback and the server/client can't drift. |

#### `src/utils/animationCurves.js` — `animateToTarget`, a cancellable `requestAnimationFrame` count-u…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/utils/animationCurves.js` |
| **Details** | `src/utils/animationCurves.js` — `animateToTarget`, a cancellable `requestAnimationFrame` count-up on the shared fast-start/slow-finish easing (`fastStartSlowFinish`), driving the streak digits. SSR-safe and short-circuits with a no-op fast-path when there is nothing to tween (`from === to`). |

#### Most Used Languages entrance animation brought to 1:1 parity with the GitHub Stats card

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/LanguagesCard.jsx` |
| **Details** | **Most Used Languages** entrance animation brought to 1:1 parity with the GitHub Stats card (`src/components/about/LanguagesCard.jsx`): a spring `cardVariants` lift, per-character blur-in `AnimatedTitle`, and the language list rows sliding in from the left as a staggered cascade (the Stats card's `metricRowVariants`). All driven off `settledInView` so the whole entrance **replays on every true viewport re-entry**, with a reduced-motion no-op variant set that holds everything still for users who opted out. |

#### `settledInView` added to `useViewportCountTrigger` — a debounced, reversible visibility flag

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `settledInView` added to `useViewportCountTrigger` — a debounced, reversible visibility flag (true on a real entry, false only after a *sustained* exit) that drives the GitHub-card entrance fades + per-character titles so they **replay on every re-entry** instead of latching after the first, while still absorbing the `IntersectionObserver` flicker the monotonic `playToken` was introduced to ignore. |

#### `src/hooks/useReliableInView.js` — a transform-safe "is this in view?" hook measuring `getBoundin…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/hooks/useReliableInView.js` |
| **Details** | `src/hooks/useReliableInView.js` — a transform-safe "is this in view?" hook measuring `getBoundingClientRect` (plus a short post-mount `rAF` burst to catch the entrance settling) instead of an `IntersectionObserver`. Needed because an observer attached anywhere inside a `scale: 0 → 1` `ItemLayout` reads zero area at entry and never re-fires after the transform-only scale-up, so the count-ups it gated never ran. |

#### Real contribution-calendar total now backs Total Contributions in the streak payload

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/app/api/github-stats/route.js` |
| **Details** | Real contribution-calendar total now backs **Total Contributions** in the streak payload (`computeStreaks` in `src/app/api/github-stats/route.js`), replacing the previously hardcoded value so the displayed count and its change-diff are accurate. |

#### Contact page WebGL aurora backdrop

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/components/contact/AuroraBackground.jsx`, `next/dynamic` |
| **Details** | **Contact page WebGL aurora backdrop** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/components/contact/AuroraBackground.jsx` + `AuroraMount.jsx`). A full-viewport GLSL domain-warped-fBm aurora in the amber→ember palette that drifts and bends gently toward the cursor, composited `mix-blend: screen` at low opacity so it only adds warm light over the dark backdrop (never neon). Loaded via a client-only `next/dynamic` import so `three` / react-three-fiber never enter the route's critical bundle, and mounted only **after the intro loader lifts** and only when `prefers-reduced-motion` is unset — the static `contact-bg.png` stays the reduced-motion fallback. |

#### Molten submit-CTA state machine

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/components/contact/Form.jsx` |
| **Details** | **Molten submit-CTA state machine** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/components/contact/Form.jsx`). One continuous pill morphs in place across idle → sending → sent/held with no shape or colour swap: a grey "SENDING…" that a turbulent molten-orange wavefront sweeps through, driven by the **real** request progress (an inline `<svg>` using `feTurbulence` / `feDisplacementMap` so the ragged front boils natively rather than via fragile CSS masks); a self-stroking "✓ SENT" checkmark on delivery; and a self-drawing "✦ HELD" clock when a send is parked offline. The button's footprint is locked by the always-mounted label so the overlays never resize it. Every path honours `prefers-reduced-motion`. |

#### Sliced-letter hover label + magnetic CTA

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/components/contact/SliceLabel.jsx`, `src/hooks/useMagneticPull.js` |
| **Details** | **Sliced-letter hover label + magnetic CTA** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/components/contact/SliceLabel.jsx`, `src/hooks/useMagneticPull.js`). The "SEND MESSAGE!" letters part along a single sweeping blade on hover — one `progress` motion value drives the line and every letter, so hover-in/out can never desync — while the button leans toward the cursor with a spring-eased magnetic pull. Both are gated to precise-pointer, non-reduced-motion devices. |

#### Gradient-overlay contact fields

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/components/contact/FireInput.jsx` |
| **Details** | **Gradient-overlay contact fields** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/components/contact/FireInput.jsx`, `FireTextarea.jsx`). Typed text is painted with the fire-amber gradient via a sibling overlay `<div>` that mirrors the field's value and scroll position, working around the WebKit/Blink/iOS bugs where `background-clip: text` on a scrolling `<input>` / `<textarea>` drifts against the glyphs or blanks the text entirely. Paired with notched floating-label outlines and an "ember charge-up" ripple while sending / "combust-clear" as the message clears. |

#### "Materialize from the ether" intro reveal

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/components/contact/ContactIntro.jsx` |
| **Details** | **"Materialize from the ether" intro reveal** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/components/contact/ContactIntro.jsx`). The contact copy de-blurs and rises word-by-word in a left→right stagger, **held until the intro loader wipes away** (`useLoaderRevealed`) so the reveal lands exactly as the page first appears instead of playing unseen behind the overlay. Reduced motion gets a single still fade. |

#### AI "Refine my message"

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/app/api/refine-message/route.js`, `src/hooks/useMessageRefine.js`, `src/components/contact/MessageRefine.jsx`, `"anthropic/claude-haiku-4.5"` |
| **Details** | **AI "Refine my message"** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/app/api/refine-message/route.js`, `src/hooks/useMessageRefine.js`, `src/components/contact/MessageRefine.jsx`). A quiet ember affordance under the message field streams an AI rewrite of the visitor's message **token by token** into a ghosted panel they can accept into the field or discard. The server route uses `ai@7` `streamText` routed through the **Vercel AI Gateway** (a plain `"anthropic/claude-haiku-4.5"` string, overridable via `REFINE_MODEL`) and returns a plain UTF-8 text stream the client reads with a `ReadableStream` reader (no client-side AI deps). Degrades to a hidden feature when the Gateway isn't configured (a clean `503`), so the form is unaffected on local dev. |

#### Offline send queue with auto-retry

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/hooks/useOfflineQueue.js` |
| **Details** | **Offline send queue with auto-retry** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/hooks/useOfflineQueue.js`). When a send can't reach the server (offline, or a transport-level drop mid-request), the message is parked in `localStorage` and delivered automatically on reconnect — and drained with capped exponential backoff while online — durable across a tab close. The CTA morphs to "✦ HELD" and a connection-aware status line reassures the visitor it will send itself when they're back online. Lives above the form's post-send remount so its listeners and pending state survive each send. |

#### Draft autosave & restore

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/hooks/useFormDraft.js` |
| **Details** | **Draft autosave & restore** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/hooks/useFormDraft.js`). All four fields debounce-save to `localStorage` as the visitor types and restore on a later visit behind a "Restored your unsent message · Keep / Clear" banner (7-day TTL, cleared on a successful send). Restore and the AI-accept both write values through `setNativeValue` (a native value-setter + dispatched `input` event) so react-hook-form **and** the gradient overlays repaint from one event. |

#### Idempotent contact-send path

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/app/api/send-mail/route.js`, `src/lib/contact.js` |
| **Details** | **Idempotent contact-send path** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/app/api/send-mail/route.js`, `src/lib/contact.js`). A stable per-message key (`newIdempotencyKey`, generated once and reused on every retry) lets the server dedupe: an atomic Upstash Redis `SET NX` writes a short-lived `PENDING` claim promoted to `SENT` only after delivery, so a retry of an already-sent message dedupes to success (`200`) and a retry of an in-flight one gets a `retryable` `409` — never a duplicate email. Bounded SMTP connection/greeting/ socket timeouts keep every attempt inside the `PENDING` TTL. `src/lib/contact.js` adds `postContactMessage` — a discriminated `{ ok \| errors \| network \| aborted }` result with its own request timeout — shared by the live form and the queue flush, plus the DOM/storage helpers. |

#### Now Playing widget — live Spotify presence

| | |
|:--|:--|
| **Ref** | [#42](https://github.com/MA1002643/theabdullahfolio/issues/42) |
| **Files** | `src/components/spotify/NowPlaying.jsx`, `src/components/spotify/{Marquee,ProgressRing,Spectrum,SpotifyBars}.jsx`, `src/components/spotify/{useNowPlaying.js,format.js}`, `src/app/layout.js`, `src/app/globals.css`, `public/spotify/demo-cover.svg` |
| **Details** | **Now Playing widget** ([#42](https://github.com/MA1002643/theabdullahfolio/issues/42), `src/components/spotify/NowPlaying.jsx`). A floating bottom-left badge — mounted once in the **root** layout so it rides every route — that surfaces the owner's currently-playing (or last-played) Spotify track and expands into a console on hover: album art with an accent + blur derived from the cover, a scrolling `Marquee` title, a live `ProgressRing` / progress bar that advances **locally** from the server-anchored `progressMs` (so a slightly-stale cached poll still renders a correct position), a CSS-only equaliser (`SpotifyBars`, animated off the main thread), and a `Spectrum` flourish. Polls `/api/spotify` on a visibility-gated interval (`useNowPlaying`), renders `null` until data arrives (no SSR/hydration mismatch), and honours `prefers-reduced-motion` (the entrance snaps; the bars hold a static mid-frame). Stays hidden in production when Spotify isn't configured, and shows a bundled demo track in dev or under `SPOTIFY_DEMO=true`. |

#### `/api/spotify` + `/api/spotify/auth` — Now Playing data + one-time token helper

| | |
|:--|:--|
| **Ref** | [#42](https://github.com/MA1002643/theabdullahfolio/issues/42) |
| **Files** | `/api/spotify`, `/api/spotify/auth`, `src/app/api/spotify/route.js`, `src/app/api/spotify/auth/route.js`, `src/app/api/_utils/spotify.js` |
| **Details** | **`/api/spotify` endpoint** ([#42](https://github.com/MA1002643/theabdullahfolio/issues/42), `src/app/api/spotify/route.js`). `GET` exchanges the **server-only** `SPOTIFY_REFRESH_TOKEN` for a short-lived access token server-side and returns display-only fields (title / artist / album art / accent / blur / progress) — **never** a token or secret. Ads and podcast episodes are filtered out; a genuine empty state is a cacheable `200` (widget stays hidden) while an upstream/auth failure is an **uncached** `502` so the client keeps its previous track instead of blanking mid-session. Edge-cached `s-maxage=30, stale-while-revalidate=60` so Spotify sees ~2 calls/min regardless of visitor count; the access token + per-album accent are memoised in the KV store when present (pure optimisation — works without KV). Node runtime (`sharp` album-art colour extraction), `force-dynamic`. `/api/spotify/auth` is a **DEV-ONLY**, loopback-gated helper that mints the refresh token once: it hard-`404`s under `NODE_ENV=production` (so on every Vercel prod **and** preview deploy) and otherwise serves loopback hosts only, and on failure surfaces only Spotify's documented OAuth error fields (`error` / `error_description`) and the HTTP status — never the raw token-endpoint body. |

#### HoverHint — styled tooltip primitive

| | |
|:--|:--|
| **Ref** | [#42](https://github.com/MA1002643/theabdullahfolio/issues/42) · [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) |
| **Files** | `src/components/home/HoverHint.jsx` |
| **Details** | **HoverHint** ([#42](https://github.com/MA1002643/theabdullahfolio/issues/42), `src/components/home/HoverHint.jsx`). The site's in-page replacement for the un-styleable native `title` tooltip — the same `custom-bg-abt` glass surface as the rest of the chrome — portalled to `<body>` and positioned `fixed` so an `overflow-hidden` / transforming ancestor can't clip or re-anchor it. Two anchoring modes: `trigger` (centred above the trigger, flips below without headroom — the maintenance-header hint, a [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up) and `inside` (centred **within** a large trigger and narrowed to fit — the Now Playing badge). Hover-intent open with a warm-open shortcut for reading across adjacent fields, `:focus-visible` keyboard support, touch-gated off (`matchMedia`), and dismissal on leave / Esc / scroll / pointerdown; the bubble is `pointer-events-none` (a label, never a hover target). Clamps against the **rendered** width in inside mode, keeps `placement` in its bail-when-unchanged position guard, and snaps its entrance under `prefers-reduced-motion`. |

#### Homepage hero & glow-headline reduced-motion coverage

| | |
|:--|:--|
| **Ref** | [#87](https://github.com/MA1002643/theabdullahfolio/issues/87) |
| **Files** | `src/app/globals.css`, `src/components/navigation/index.jsx`, `src/components/navigation/NavButton.jsx` |
| **Details** | **Hero reduced-motion coverage** ([#87](https://github.com/MA1002643/theabdullahfolio/issues/87)). Everything that moved in the homepage hero now honours `prefers-reduced-motion: reduce`. CSS stills the laptop float + hover-scale and the three `.animate-ripple-neon` rings — `animation` / `transition` pinned, but `transform: none` scoped to the laptop selectors **only** so the rings keep their inline `perspective(600px) rotateX(80deg)` instead of flattening (a stylesheet `!important` would beat that non-important inline transform). The orbital navigation ring — an infinite `requestAnimationFrame` rotation a CSS query cannot reach — is gated in **JS**: the effect returns early under reduced motion, so no frame is ever scheduled and the ring holds its resting angle. Nav-button entrances drop their `scale` (a transform) for a plain opacity fade, with `scale` pinned to `1` in every target so an omitted-property animation can never strand a button undersized. Separately, `.text-glow-stroke-neon` — the shared glow-headline utility used **sitewide** (the hero title, page titles, the project name, the loader, the footer wordmark) — has its `filter` transition disabled sitewide in its own rule, so glow changes are instant everywhere; hover **colour** changes (not vestibular motion) are deliberately left intact. |

#### Certificate image preloading & cache warming

| | |
|:--|:--|
| **Ref** | [#84](https://github.com/MA1002643/theabdullahfolio/issues/84) |
| **Files** | `src/components/qualifications/preloadCerts.js`, `src/components/navigation/NavButton.jsx`, `src/components/qualifications/Carousel.jsx` |
| **Details** | **Certificate preloading** ([#84](https://github.com/MA1002643/theabdullahfolio/issues/84), `src/components/qualifications/preloadCerts.js`). A new utility warms every `/qualifications` certificate image into the browser's HTTP cache **before** the carousel mounts, so the page paints instantly on arrival and category switches are immediate instead of popping in card by card. It asks Next's own `getImageProps` for each card's exact optimiser `srcSet`/`sizes` and warms it through a detached `Image()`, so the warmed `/_next/image` URL matches the carousel's later request byte-for-byte (a real cache hit, not a near-miss on a different width). It fires the moment intent is shown — `NavButton` triggers it on hover / focus / pointer-down of the `/qualifications` link, so the ~2 s "Stone Passage" transition hides the fetch — and again on carousel mount via `requestIdleCallback` to cover deep-links / refreshes (no transition) and to pre-warm the other category buckets. Idempotent (per-src + module-level guards) and it skips the bulk warm under `navigator.connection.saveData` or a 2G link. `NavButton` pulls the preloader in through a **cached dynamic `import()`**, so the preloader and its dimensions manifest stay out of the homepage/nav bundle for visitors who never open `/qualifications`. |

#### `/qualifications` cinematic water scene — crisp lantern corridor + ambient scene-video loop

| | |
|:--|:--|
| **Ref** | [#52](https://github.com/MA1002643/theabdullahfolio/issues/52) |
| **Files** | `public/background/qualifications-bg.webp`, `public/background/qualifications-water.mp4`, `src/components/qualifications/SceneVideo.jsx`, `src/app/(sub pages)/qualifications/page.js`, `src/app/globals.css` |
| **Details** | **Cinematic water scene** ([#52](https://github.com/MA1002643/theabdullahfolio/issues/52), `src/components/qualifications/SceneVideo.jsx`). The static circuit-board backdrop is replaced by a mystical lantern-corridor scene — hanging amber lanterns receding into a misty forest arch over a dark water channel — generated to match the issue's brief (its referenced attachment was never uploaded) via the site's AI-Gateway image pipeline at **native ~4MP** (`bfl/flux-pro-1.1-ultra`, 2752×1536) and shipped as a 299 KB 2560×1440 WebP (the old PNG was a 929 KB 1024-px upscale; the `blur-[0.2px]` that hid its softness is gone). The water itself is a full-scene **ambient video loop** — the same frame, living: water ripples, lantern flames flicker, camera locked — after the reference pattern at casadisolare.com: a plain full-bleed `<video autoplay loop muted playsinline preload="metadata">`, `object-fit: cover`, no blend tricks. It mounts at `-z-[45]`, between the static `Image` (-z-50, the instant "poster" and permanent fallback) and the page's black/80 dimmer (-z-40), with the same `opacity-80` — so both frames darken identically and the video appearing reads as "the picture starts moving", never a reload. Mount gates mirror `AuroraDustMount`'s philosophy: never under `prefers-reduced-motion` (the still **is** the page), never under Save-Data, deferred past the intro-loader reveal (off the LCP path), and unmounted on decode/network error. An earlier CSS/SVG iteration of this water (drifting periodic wave silhouettes + flickering glint table) was superseded by the video before ever shipping; its keyframes were removed from `globals.css`. The clip itself is a true image-to-video animation of the exact background frame (Higgsfield `happy_horse_video`, start-frame mode, prompted as a locked-camera cinemagraph: ripple, reflection wobble, flame flicker — no pan/zoom), then finished locally with ffmpeg: **tripod-stabilized** (two-pass vid.stab locked to frame 1 — the model added a slow global drift despite the locked-camera prompt, which the palindrome halves turned into a visible ping-pong sway; tripod mode strips all global motion while keeping the local water/flame motion), lanczos-upscaled 720p→1080p with light unsharp, slowed ~1.33×, and closed into a **seamless forward-only ~3 s loop** by crossfading the clip's tail into its own head (a raw i2v clip never loops cleanly; an earlier forward+reverse palindrome was rejected because the reversed half read as the water flowing back out — the crossfade keeps the water always advancing), encoded H.264 High yuv420p CRF 22 `+faststart`, silent, 1.3 MB vs the reference site's 4.2 MB. |

#### `/qualifications` carousel — centre-out staggered entrance

| | |
|:--|:--|
| **Ref** | [#52](https://github.com/MA1002643/theabdullahfolio/issues/52) |
| **Files** | `src/components/qualifications/Carousel.jsx` |
| **Details** | **Centre-out staggered entrance** ([#52](https://github.com/MA1002643/theabdullahfolio/issues/52), `src/components/qualifications/Carousel.jsx`). The old all-at-once `hasAnimated` reveal becomes a theatrical ripple: the centred card flies in first, then each flanking ring together (150 ms apart), and every card's title banner follows its card by a further 200 ms — a `hidden → entering → done` phase machine driven by the wrapped wheel offset the carousel already computes (a card's ring **is** its `absOffset`, so the wrap-around delay maths from the issue falls out for free). The sequence replays on initial load **and** on every category/sub switch, because the phase reset keys off the `filteredCards` identity — and it resets in a **layout** effect, so the hidden pose commits before paint and a switch can never flash the new set at the old centre. Delays travel inside the `transition` shorthand (mixing it with a separate `transitionDelay` longhand triggers React's conflicting-property warning and can mis-style), and once the last banner lands the machine flips to 'done', clearing every delay so Prev/Next navigation is never queued behind a stagger; the wheel's original 650 ms nav timing returns untouched. Implemented with staggered CSS transitions rather than the issue's `AnimatePresence` option — Framer Motion and the inline 3-D wheel transforms would fight over the same `transform` property (the issue's own "simpler alternative"). Under `prefers-reduced-motion` (via the same `useReducedMotion` hook `PageTitle` uses) the machine jumps straight to 'done': cards and banners appear in place, no flight, no ripple. |

### Changed

#### `/projects` flagship listing is now the portfolio itself

| | |
|:--|:--|
| **Ref** | Direct request — grounded in [MA1002643/theabdullahfolio](https://github.com/MA1002643/theabdullahfolio) and the ["Portfolio Redesign — Scroll-Driven Rebuild" project board](https://github.com/users/MA1002643/projects/7) |
| **Files** | `src/app/data.js` |
| **Details** | **Project 1 renamed `EcoTracker` → `theabdullahfolio`** (`src/app/data.js`). The placeholder flagship entry on `/projects` is now the site's own repository, and every field is grounded in the real thing: the description — which doubles as the `/projects/[id]` subtitle, since `ProjectIntro` renders `name`/`description` directly — reads "Cinematic scroll-driven portfolio rebuild": four words to match the 3-4-word rhythm every other listing card keeps, distilled from the redesign board's own title and its 48 proposed issues (art direction and motion/design tokens, scroll choreography with GSAP/ScrollTrigger/Lenis, WCAG 2.2 AA, performance budgets, launch); `date` is the repo's creation date (2025-07-20), and `demoLink` points at the production domain [ma.codes](https://ma.codes). The detail page's footer CTA ("View this project on GitHub", fed by `/api/project-repo`) already pins this same repository, so the renamed listing, the sub-page title/subtitle, and the live commit caption now all describe one project. |

#### `/projects` listing 2 is now AfaaqX, filed under System

| | |
|:--|:--|
| **Ref** | Direct request — grounded in [MA1002643/AfaaqX](https://github.com/MA1002643/AfaaqX) and its issue board |
| **Files** | `src/app/data.js` |
| **Details** | **Project 2 renamed `ArtGallery Online` → `AfaaqX`** (`src/app/data.js`), the real repository: "Design and Implementation of a Role-Based Multi-Tenant Business Management System with Integrated Authentication, Real-Time Notifications, and AI-Assisted Customer Support". The four-word description — "Multi-tenant business management platform" — matches the listing's card rhythm and is lifted from the repo's own framing. **Category moved `Web` → `System`**, decided from the issue board rather than the stack: the 183-issue plan is dominated by system-level scope (multi-tenant RBAC, Stripe payment processing, appointment booking, CRM, OWASP/security audits, CI/CD, disaster recovery — plus the dissertation chapters around it), which reads as a business *system*, not a site's presentation layer; no new category tab was needed, and the #27 derived tabs re-count automatically (Web 4 / System 6, verified live). `date` is the repo's creation date (2025-02-13); the repo has no homepage, so `demoLink` points at the repository itself instead of the retired placeholder domain. |

#### `/projects` listing 3 is now culina, filed under a new AI category

| | |
|:--|:--|
| **Ref** | Direct request — grounded in [MA1002643/culina](https://github.com/MA1002643/culina) and its issue board |
| **Files** | `src/app/data.js`, `src/lib/categories.js` |
| **Details** | **Project 3 renamed `BudgetPlanner` → `culina`** (`src/app/data.js`), the real repository: "A smart recipe search platform leveraging AI to help users discover, filter and personalise cooking ideas". The four-word description — "AI-powered recipe discovery platform" — matches the listing's card rhythm and is lifted from the repo's own framing. **Category moved `Web` → a brand-new `AI` tab**, decided from the repo's whole story rather than its current stack (a Vue SPA over Express/SQLite would read as plain Web): the repo's description, its topics (`ai`, `machine-learning`), and the largest feature cluster on its 41-issue board (sous-chef conversational assistant with citations, RAG/embeddings pipeline over pgvector, semantic search and natural-language navigation, gateway integration with model-routing policy and failover, prompt governance and injection defences, AI cost/safety rails, non-AI fallbacks) all lead with AI — product scope neither existing tab describes, so this is the first entry to exercise #27's "add a project under a brand-new category and its tab appears already enabled" contract. That exposed one real gap: the shared `normalizeCategory` fold (`src/lib/categories.js`) Title-cases every label, which would have minted an "Ai" tab — it now carries an acronym map keyed by the lowercased label, so `"ai"`, `"AI"`, and `"Ai "` all land on the one "AI" display form with the same no-lookalikes guarantee as the plain fold, shared by `/projects` and the `/qualifications` tree alike. Downstream needs nothing: the derived tabs re-count (Web 3 / System 6 / AI 1), and the About page's Completed Projects split bar picks up a third proportional segment, legend row, and palette colour automatically. `date` is the repo's creation date (2025-10-09); the repo has no homepage, so `demoLink` points at the repository itself instead of the retired placeholder domain. |

#### `/projects` listing 4 is now muhammadabdullah-portfolio, filed under Web

| | |
|:--|:--|
| **Ref** | Direct request — grounded in [MA1002643/muhammadabdullah-portfolio](https://github.com/MA1002643/muhammadabdullah-portfolio) and its issue board |
| **Files** | `src/app/data.js` |
| **Details** | **Project 4 renamed `HealthBeat` → `muhammadabdullah-portfolio`** (`src/app/data.js`), the real repository: the previous portfolio, live at [muhammadabdullah227.co.uk](https://muhammadabdullah227.co.uk/) — "An elite, motion-driven Next.js portfolio showcasing my projects, skills, and creative design in an immersive scroll experience". The three-word description — "Immersive motion-driven portfolio" — is lifted from that framing and keeps the listing's card rhythm. **Category `Web`**, decided from the repo plus its ~48-issue redesign board ([users/MA1002643/projects/7](https://github.com/users/MA1002643/projects/7)): the scope is presentation-layer end to end — design tokens, GSAP/ScrollTrigger/Lenis scroll choreography, section builds, WCAG 2.2 AA, SEO, performance budgets — a personal *site*, not a System and not AI-led, so no new tab was needed and the #27 derived tabs re-count automatically (Web 3 / System 6 / AI 1). `date` is the repo's creation date (2024-07-08); `demoLink` points at the live site instead of the retired placeholder domain. |

#### Maintenance header now reads every tracked project board (#94 Phase 3)

| | |
|:--|:--|
| **Ref** | Direct request — completing the board generalisation [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) deferred as "Phase 3" |
| **Files** | `src/utils/workTrackedRepos.js`, `src/app/api/work-status/route.js`, `src/utils/workSignal.js`, `README.md` |
| **Details** | **The home-page maintenance header's Projects v2 signal goes multi-board.** Each tracked repo in `workTrackedRepos.js` may now declare its user-level board via a `projectNumber` field (AfaaqX 2 · theabdullahfolio 3 · vigil 4 · tailorhawk 5 · muhammadabdullah-portfolio 7 · culina 8), and `fetchProjectActivity` reads **all** declared boards in ONE aliased GraphQL query (same pattern as the portfolio repo query), grouping In Progress / Done(≤48h) items by the underlying issue/PR's repository and attaching them to the matching tracked repo — the roll-up in `workSignal.js` was already multi-repo, so SHIPPING/IN_PROGRESS now fire from any project's board, and `topItems` interleave across board-fed repos freshest-first (the records now carry `updatedAt` for exactly that sort) instead of whichever repo leads the tracked list. The allow-list stays authoritative: a board card pointing at an untracked repo is dropped. The per-item query cost was cut ~20× by replacing the `fieldValues(first: 20)` subtree with a single aliased `fieldValueByName(name: "Status")` — six boards of 100 items stay well inside the 5 s GitHub fetch timeout and the route's rate-limit floors. Verified live in dev: SHIPPING fired from the Culina board's freshly-closed audit PR while the secondary message rotated through In-Progress cards from three different repos. On the GitHub side, the stale auto-generated board titles were renamed to match their repos — `@MA1002643's AfaaqX Project` → **AfaaqX**, `@MA1002643's ma.codes` → **ma.codes**, `Portfolio Redesign — old` → **muhammadabdullah-portfolio** (vigil, Tailorhawk and "Culina — Delivery" were already clean; empty board 6 left untouched). README's Live Maintenance Header section updated to document the widened scope. |

#### `/projects` listing 5 is now colophon, filed under AI

| | |
|:--|:--|
| **Ref** | Direct request — grounded in [MA1002643/colophon](https://github.com/MA1002643/colophon) and its "Colophon — Product Programme" board ([users/MA1002643/projects/9](https://github.com/users/MA1002643/projects/9)) |
| **Files** | `src/app/data.js` |
| **Details** | **Project 5 renamed `RecipeFinder` → `colophon`** (`src/app/data.js`), the real repository (formerly `article-server-full-stack-blogging-platform`): "Colophon — a cross-platform, AI-powered publishing platform. Vue 3 · Express · Postgres · pgvector". The four-word description — "Cross-platform AI-powered publishing platform" — is the repo's own phrasing and keeps the card rhythm. **Category `AI`** on the culina precedent: the description leads with AI and the defining cluster on the 36-issue board is AI/RAG (provider-agnostic AI gateway with failover, embeddings + pgvector store with re-index-on-change, grounded conversational assistant with tool-calls, semantic search and NL navigation, AI cost rails with halt-and-notify, prompt-injection defences and eval suite) alongside cross-platform delivery (Tauri desktop, Capacitor mobile, installable PWA) — so the existing AI tab fits and no new category was needed; derived tabs re-count to Web 2 / System 6 / AI 2. `date` is the repo's creation date (2023-03-04); no homepage exists, so `demoLink` points at the repository. |

#### `/projects` listing 6 is now dhun, filed under System

| | |
|:--|:--|
| **Ref** | Direct request — grounded in [MA1002643/dhun](https://github.com/MA1002643/dhun) and its "Dhun — Streaming Rebuild" board ([users/MA1002643/projects/10](https://github.com/users/MA1002643/projects/10)) |
| **Files** | `src/app/data.js` |
| **Details** | **Project 6 renamed `JourneyLogger` → `dhun`** (`src/app/data.js`), the real repository (formerly `fullstack-singer-platform`): "Dhun — cross-platform music streaming platform: web, desktop and mobile from one codebase". The four-word description — "Cross-platform music streaming platform" — is the repo's own phrasing. **Category `System`** on the AfaaqX precedent: the 60-issue board is dominated by system-level scope — HLS playback engine, FFmpeg ingest pipeline, catalogue + Meilisearch, realtime sync and multi-device handoff, R2/CDN signed-URL storage, RBAC, monorepo CI — with web as just one of five delivery targets (not Web) and only ~3 AI-flavoured issues of 60 (not AI), so the existing System tab fits and no new category was needed; derived tabs re-count to Web 2 / System 5 / AI 2. `date` is the repo's creation date (2023-03-04); no homepage exists, so `demoLink` points at the repository. |

#### `/projects` listing 7 is now plenary, filed under System

| | |
|:--|:--|
| **Ref** | Direct request — grounded in [MA1002643/plenary](https://github.com/MA1002643/plenary) and its "Plenary — Educational Session Platform" board ([users/MA1002643/projects/11](https://github.com/users/MA1002643/projects/11)) |
| **Files** | `src/app/data.js` |
| **Details** | **Project 7 renamed `StudyBuddy` → `plenary`** (`src/app/data.js`), the real repository (formerly `vevox-real-time-chat-web-application`). The repo is today a real-time chat app, but its ~60-issue board rebuilds it into a live audience-engagement platform for teaching sessions — poll/quiz/word-cloud/Q&A activities, presenter console + projection view, 3,000-participant scale certification with Redis fan-out, reconnection outbox, LTI 1.3 + institutional SSO, cohort analytics, and Tauri/Capacitor/PWA shells. The four-word description — "Real-time educational engagement platform" — blends the realtime core with the board's own framing. **Category `System`** on the AfaaqX/dhun precedent: realtime product-platform scope dominates the board, while the AI cluster (RAG pipeline, question generation, thematic clustering, summaries, study assistant — 8 of ~60 issues) is supporting rather than the lead, so the existing System tab fits and no new category was needed; derived tabs re-count to Web 2 / System 5 / AI 2. `date` is the repo's creation date (2023-03-04); no homepage exists, so `demoLink` points at the repository. |

#### Maintenance header board audit: two new repos + boards tracked, webhooks installed

| | |
|:--|:--|
| **Ref** | Direct request — full audit of the boards feeding the header, follow-up to [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) Phase 3 |
| **Files** | `src/utils/workTrackedRepos.js`, `README.md` |
| **Details** | Audit result: all 11 previously tracked repos still resolve (no new renames), every declared board's title matches its product, and the empty untitled board 6 was closed upstream. Two gaps found and fixed: two brand-new repos (created the same day, feeding boards 12 and 13) were untracked, so board 12's items were being dropped by the allow-list. Both are now tracked with `projectNumber` 12 / 13, and webhooks were installed on both via the house procedure and ping-verified (HTTP 200), so pushes/issues bust the header cache like every other tracked repo. Later the same day both products were christened — the fitness repo's "name TBD" placeholder `still-do-decide` became **`auxo`** (board 12: "Auxo — Elite AI Fitness & Nutrition App") and `hgv` became **`clearway`** (board 13: "Clearway") — rename-trap instances five and six, caught by re-audit; the tracked entries and display names (**Auxo**, **Clearway**) follow the final names, and webhooks migrated with the renames (no reinstall needed). README's board list now runs `projects/2·3·4·5·7·8·9·10·11·12·13`. |

#### Maintenance-header popover sections renamed to board-aligned product names

| | |
|:--|:--|
| **Ref** | Direct request — follow-up to the [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) Phase 3 board generalisation |
| **Files** | `src/utils/workTrackedRepos.js` |
| **Details** | The PRS / ISSUES / PUSHES popovers' per-project section headers (each tracked repo's `displayName`) no longer show raw repo slugs. Where a repo has a Projects v2 board the name now mirrors the board title (minus phase suffixes): `theabdullahfolio` → **ma.codes**, `culina` → **Culina**, `tailorhawk` → **Tailorhawk** (AfaaqX, muhammadabdullah-portfolio and vigil already matched); the boardless repos swap their slugs for clean product names — `article-server-full-stack-blogging-platform` → **Article Server**, `fullstack-singer-platform` → **Singer Platform**, `jokes-platform` → **Jokes Platform**, `vevox-real-time-chat-web-application` → **Vevox**, `aura-motion` → **Aura Motion**. Safe as a single-file change because `displayName` is both the item label *and* the key of the signal's `byRepo` totals — the popover's totals join (`totalsByRepo[group.repo]`) renames on both sides at once, and the "+ N more on GitHub" links key off `nameWithOwner`, which is untouched. Verified live in dev: `byRepo` and the ISSUES section order both serve the new names. |

#### `/projects` category tabs are now derived from the project data

| | |
|:--|:--|
| **Ref** | [#27](https://github.com/MA1002643/theabdullahfolio/issues/27) |
| **Files** | `src/components/projects/index.jsx` |
| **Details** | **The category row is now data-driven** ([#27](https://github.com/MA1002643/theabdullahfolio/issues/27), `src/components/projects/index.jsx`). The hand-kept module-scope `CATEGORIES = ["All", "Web", "System", "App"]` list is gone; tabs are derived per render (memoised) as the unique set of `category` labels worn by at least one project in `data.js`, in first-appearance order, behind the forced "All" reset. Adding a project under a brand-new category makes its tab appear already enabled; removing a category's last project removes its tab — there is no second list to fall out of sync. Labels are normalised (trimmed, Title-cased) before compare/display so a `category: "web"` typo folds into the existing "Web" tab instead of minting a lookalike. The empty-category wording is centralised in one `emptyCategoryMessage(cat)` helper — `No projects in "{Category}" yet.` — feeding the disabled-tab click toast, the disabled tab's tooltip, and the stored-filter fallback note, all sharing one `INFO_TOAST_STYLE`. The saved `projects-category` localStorage value is now validated against the **derived** tabs on restore (§2.5): a stored label whose category has since lost its projects (or been renamed away) no longer strands a returning visitor on a bare "No Projects Found!" panel — the page falls back to "All", explains once via toast (§2.4), and heals the stored value to "All" so the note never repeats. The `isCategoryDisabled` guard is retained even though derived tabs can't be empty — it is part of the shared strip's API (the qualifications page uses it) and keeps `/projects` safe should the tab source ever widen beyond pure derivation. |

#### `/qualifications` category tree now derived from the card data

| | |
|:--|:--|
| **Ref** | [#27](https://github.com/MA1002643/theabdullahfolio/issues/27) (pattern ported) |
| **Files** | `src/components/qualifications/Carousel.jsx`, `src/lib/categories.js`, `src/components/projects/index.jsx` |
| **Details** | **The qualifications parent/sub tree is now data-driven** (`src/components/qualifications/Carousel.jsx`), porting [#27](https://github.com/MA1002643/theabdullahfolio/issues/27)'s `/projects` derivation to the two-level case. The hand-kept `CATEGORY_TREE = { All: null, Education: [School, College, University], Employment: [Security, Tech] }` literal is gone; the tree is built once at module load from `CARDS` — parents in first-appearance order behind the forced "All", each parent's subs in first-appearance order within it, a sub-less parent collapsing to `null` so its sub row doesn't render. Adding a card under a new category or sub makes its tab appear already enabled; removing a category's last card removes its tab. The cards are authored grouped in display order, so the derived tree is **identical to the old literal** — but the order is now a stated data contract (keep new cards grouped with their category block, per the comment). Labels are folded through a **shared** `normalizeCategory` helper, extracted to `src/lib/categories.js` and now imported by both `/projects` and the carousel so the two pages' folds can't drift; the derivation, the `COUNTS` precompute, and the `filteredCards` comparisons all go through `cardParent`/`cardSub` rather than raw fields, so a `category: 'education'` typo folds into "Education" everywhere at once. `COUNTS` seeding and the empty-tab guards are retained as belt-and-braces (a derived tab can't be empty) with comments updated to say so. Both pages' derivations also skip any entry whose label folds to the reserved **"All"** (review finding): on `/projects` such a project would have minted a duplicate "All" tab (a `key` collision in the strip) and inflated the All count past `projects.length`; on `/qualifications` it was harsher — `tree.All` is seeded `null`, so `tree.All.includes(sub)` would throw at module load and take the page down. Skipped entries stay reachable through the All view itself. |

#### `/projects` list reveal slowed to an elegant, blur-focused stagger

| | |
|:--|:--|
| **Ref** | [#27](https://github.com/MA1002643/theabdullahfolio/issues/27) |
| **Files** | `src/components/projects/index.jsx`, `src/components/projects/ProjectLayout.jsx` |
| **Details** | **Category-switch choreography retimed** ([#27](https://github.com/MA1002643/theabdullahfolio/issues/27) §3). The container stagger moves from `0.15/0.3` to `staggerChildren: 0.22` / `delayChildren: 0.18`, and each card's entrance is retuned from a dramatic `y: 100` leap to a short rise with a focus pull — `opacity 0→1`, `y 28→0`, `blur(2px)→blur(0)` over `0.7s` on the site's signature `[0.22, 1, 0.36, 1]` ease. The `AnimatePresence mode="wait"` handoff keeps its sequential beat, with the outgoing list's exit made deliberately brisker (`0.25s` ease-in fade) than the entrance so switching filters reads as a beat, not a wait. Both files gain explicit `prefers-reduced-motion` variants (plain cross-fades — no travel, no blur, no stagger), mirroring the `REDUCED_*` pattern in `ScrollHijackCategories` so both halves of the page stand down together; previously the list had no reduced-motion path at all. |

#### `/projects` card text roles named and recoloured

| | |
|:--|:--|
| **Ref** | [#27](https://github.com/MA1002643/theabdullahfolio/issues/27) |
| **Files** | `src/components/projects/ProjectLayout.jsx`, `src/app/globals.css` |
| **Details** | **Card colours live in semantic classes** ([#27](https://github.com/MA1002643/theabdullahfolio/issues/27) §4–5, `src/app/globals.css`). The scattered inline `style={{ color, textShadow: 'none' }}` overrides in `ProjectLayout` are replaced by three named roles: `.project-title` (the ember `#ff6d05` with a **subtle** two-layer glow — the PROJECTS headline's colour family at a fraction of its energy, the only role allowed a shadow under §4.5), `.project-meta` (shared by description **and** date — the flat `#ffaa2a` "eyebrow amber" the About page settled on for the Architect of Enchantment heading in [#14](https://github.com/MA1002643/theabdullahfolio/issues/14), `text-shadow: none`), and `.project-separator-dot` (the leader between name and date — **real dots** in the title's colour via a repeating 1px-per-9px radial-gradient tile on a single stretchable element, replacing the dashed `border-b` hack). The description deliberately drops `.text-fire-amber`: its `background-clip: text` gradient is the exact pattern that has painted at full opacity inside GPU-promoted animated containers before, and these cards now animate opacity + blur on every category switch — the flat #14 amber is immune and matches the issue's "colour only, no shadow" rule. The date keeps its `id="date"` hook (Varela Round). |

#### `/projects` sizing unified onto one fluid scale factor

| | |
|:--|:--|
| **Ref** | [#50](https://github.com/MA1002643/theabdullahfolio/issues/50) |
| **Files** | `src/app/globals.css`, `src/lib/fluidScale.js`, `src/components/projects/index.jsx`, `src/components/projects/ProjectLayout.jsx`, `src/app/(sub pages)/layout.js`, `src/components/PageTitle.jsx`, `src/components/shared/ScrollHijackCategories.jsx` |
| **Details** | **Every size on `/projects` now derives from one unitless factor, `--fluid-scale`** ([#50](https://github.com/MA1002643/theabdullahfolio/issues/50), `src/app/globals.css`) — a straight line from 0.6 at ≤864px through 1.0 at 1440px to 1.3 at ≥1872px, computed in pure CSS via `tan(atan2(100vw, var(--fluid-base)))`. The 1440px unity anchor is hardware truth, not a round number: the scale-1 reference sizes are the legacy `md:`+ Tailwind values, designed against a 13" MacBook's 1440×900 logical viewport — an earlier 1000px base put that same laptop at the 1.3 ceiling, rendering everything 30% over its design size on the very screen the design targets (caught on-device and retuned) (the trig pair cancels the units, so no resize listener, no hydration risk, no first-paint jump; an `@supports` guard pins pre-2023 engines at the scale-1 reference sizes). **Reusable by design, off by default:** the factor exists only inside a `.fluid-scale` scope; adopting a page is adding its pathname to `FLUID_SCALE_PAGES` in `(sub pages)/layout.js`, and per-page tuning is three inline custom-prop knobs (`--fluid-min` / `--fluid-max` / `--fluid-base`) on the scoped element. JSX inline sizes ride the factor through the new `fluid()` / `fluidText()` helpers (`src/lib/fluidScale.js`); shared markup rides it through semantic classes (`.page-title-*`, `.category-tab`, `.category-strip-track`) whose **base rules are the old Tailwind arbitrary values exactly**, so `/about`, `/contact`, and `/qualifications` — which share `PageTitle` and the category strip but haven't opted in — render pixel-identical (verified: heading 48px/32px, tab 19.2px/16px, main padding 64px/8px at 1440/375px). Converted jumps: sub-page main padding (`px-2 → md:px-16`), wrapper `xl:max-w-4xl px-4 lg:px-10 space-y-6 md:space-y-8` (space-y → flex `gap`, so AnimatePresence's exiting copy can't leave a double margin), title/subtitle/flank pills, category tab text (`!text-[1rem] md:!text-[1.2rem]`) and strip gap/padding, card `text-sm md:text-base p-4 md:p-6` plus border-radius, card text roles, dot-leader height *and* dot pitch (background-size scales with it, so the leader stays dots, never a smear), empty-state text/padding, and list `space-y-4`. Text sizes carry `max()` legibility floors (`fluidText`): spacing shrinks to 0.6×, type stops where it stays readable (e.g. tabs and card text hold 12.48px at 320px instead of 9.6px). **The card description is always in the layout now** — the old `hidden sm:inline-block` popped it in at 640px, the page's most abrupt breakpoint; `.project-card-desc` (min-width 0, ellipsis) is the row's one shrinkable passenger between `shrink-0` name/date and a leader with a scaled flex-basis floor, so it uses every pixel a wide card can spare and ellipsizes only when the row genuinely runs out. Verified at 320/375/768/1007/1280/1440/1920/2560px across the retune: values track the factor exactly — heading 28.8px on phones (0.6 floor, unchanged by the retune), exactly 48px/3rem on the 1440px design viewport (down from the 62.4px the 1000px base produced there), 62.4px from 1872px up (1.3 cap, so large monitors keep their generous sizing) — zero horizontal overflow at every width. |

#### `engines.node` tightened from a floor to the supported LTS majors

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `package.json`, `scripts/dev.mjs`, `README.md`, `CONTRIBUTING.md` |
| **Details** | **`engines.node` now declares `^22.3.0 \|\| ^24.0.0`** (was `>=22.3.0`). The dev launcher (`scripts/dev.mjs`) has always enforced the real constraint — LTS 22.x ≥ 22.3.0 or 24.x, because non-LTS majors (e.g. Homebrew's auto-bumped Node 25) crash the Next 14 dev server — but the floor-only `engines` range still admitted 25.x, so the mismatch only surfaced at `npm run dev`. With `.npmrc`'s `engine-strict=true`, the tightened range now fails `npm ci` / `npm install` immediately and loudly on any non-LTS major, surfacing the constraint at install time instead of as a surprising dev-script failure. The range and the launcher's `isSupportedNode` predicate were verified to agree on all boundary versions (22.2.x/22.3.0, 23.x, 24.0.0, 25.x); the launcher keeps its own check because `engines` only guards install time, not what an already-installed repo is launched with. Vercel deploys are unaffected (no Node pin in `vercel.json`; the platform's 22.x/24.x runtimes satisfy the range). Stale docs updated to match: `scripts/dev.mjs` header + node-picker comments, the README Node badge and Prerequisites bullet, and CONTRIBUTING.md's prerequisites table (which still advertised Node 18.17+). |

#### Project-detail intent warming now respects Save-Data / 2G

| | |
|:--|:--|
| **Ref** | [#83](https://github.com/MA1002643/theabdullahfolio/issues/83) |
| **Files** | `src/components/projects/ProjectLayout.jsx` |
| **Details** | **Project-detail intent warming is now connection-aware** ([#83](https://github.com/MA1002643/theabdullahfolio/issues/83), `src/components/projects/ProjectLayout.jsx`). The hover/focus/touch warming on each `/projects` row — `router.prefetch` of the detail route plus the speculative download of the ~1 MB three.js scene chunk — previously ran unconditionally, deliberately re-covering the slow-connection cases Next's own in-viewport prefetch stands down for. That inverted an explicit user preference: hover is a hint, not a click, and Save-Data visitors could pay for megabytes of scene they never navigate to. `warmDetail` now checks `navigator.connection` first and skips both calls when `saveData` is set or `effectiveType` is `2g`/`slow-2g` — the same signals Next's built-in suppression uses — so constrained visitors simply fetch the chunk on navigation itself, as they did before the warming existed. The API is Chromium-only; where it is absent there is no signal to respect and warming behaves as before. |


| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/app/(sub pages)/layout.js` |
| **Details** | **Sub-pages layout** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/app/(sub pages)/layout.js`) became a `min-h-screen` flex column so the shared `<Footer>` anchors to the true bottom of every sub-page as a `contentinfo` sibling of `<main>`. The content region is now `flex-1`, so `justify-center` still centres it within the available space rather than lifting the footer up. This renders the footer **once** for `/about`, `/qualifications`, `/projects`, and `/contact` instead of per-page. The floating Home / Projects button is `position: fixed`, so it is unaffected by the wrapper. |

#### Page transition redesigned — the "Stone Passage"

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/pageTransition/StonePassageOverlay.jsx`, `src/components/pageTransition/PageTransitionProvider.jsx`, `src/components/pageTransition/constants.js` |
| **Details** | **Page transition redesigned** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30)). The inter-page transition overlay was recut from the flame "Sigil" to a **"Stone Passage"**: a rough basalt slab rises out of the void and the MA monogram is **engraved** into it, drawn stroke-by-stroke by a chisel — an SVG stroke-mask sweeps a hand-authored centreline over a pixel-matched plain/carved image pair, a hot-cut tip riding the leading edge — before a radial mask wipe (the intro loader's language) uncovers the destination. `PageTransitionProvider` now mounts `StonePassageOverlay`; timing lives in `constants.js`, with a minimum showcase window so a fast route can't cut the engraving off mid-stroke. The ember portal ring expands via a compositor `scale` transform (not per-frame width/height). Reduced motion shows the finished mark with no draw. |

#### `src/utils/skillsIconMap.js` is now server-only

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/utils/skillsIconMap.js`, `/api/github-skills`, `src/components/about/SkillsCard.jsx`, `src/utils/skillsDiff.js` |
| **Details** | **`src/utils/skillsIconMap.js` is now server-only** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20)). The detection machinery (the `SKILL_MAP` build + the ~3.4k-slug Simple Icons catalog) is imported solely by `/api/github-skills`; client components consume the new catalog-free `skillsIconUrl.js` instead, keeping the catalog out of the about-page bundle. `src/components/about/SkillsCard.jsx` now seeds its grid from `emptyCategories()` rather than a client-side `categorizeSkills([])` call that previously dragged the whole heavy module in (and `src/utils/skillsDiff.js` likewise imports `CATEGORY_ORDER` from the client-safe module). |

#### About-page count-ups consolidated onto the shared `useViewportCountUp` hook

| | |
|:--|:--|
| **Ref** | [#16](https://github.com/MA1002643/theabdullahfolio/issues/16) |
| **Files** | `src/components/about/index.jsx` |
| **Details** | About-page count-ups consolidated onto the shared `useViewportCountUp` hook ([#16](https://github.com/MA1002643/theabdullahfolio/issues/16), `src/components/about/index.jsx`), replacing three near-duplicate `useEffect` count-up implementations in `Counter`, `CountUp`, and `PercentCount`. The years digit, projects total, per-category counts, and the Personal / Employment percentages now all **replay on every viewport entry**, and the Personal/Employment and Web/System split-bar segments re-fill on entry too. |

#### Years-in-the-Craft legend is now responsive

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | **Years-in-the-Craft legend** is now responsive (`src/components/about/index.jsx`): the Personal / Employment rows stack on mobile and sit side-by-side from `sm` up, separated by a vivid `#ff6d05` `\|` divider, wrapping back to a stacked column when the pair doesn't fit (a narrow `lg` card, or the wider "Unavailable" labels). |

#### Most Used Languages card title recoloured from amber `#ffaa2a` to vivid orange `#ff6d05`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/LanguagesCard.jsx` |
| **Details** | **Most Used Languages card title** recoloured from amber `#ffaa2a` to vivid orange `#ff6d05` (`src/components/about/LanguagesCard.jsx`) so it matches the GitHub Stats card title and the two side-by-side headers read as one system. |

#### Completed Projects category breakdown hoisted to module scope

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `react-hooks/exhaustive-deps` |
| **Details** | Completed Projects category breakdown hoisted to module scope (`PROJECT_CATEGORY_BREAKDOWN`) instead of a component `useMemo` with an empty dependency array over the static `projectsData` import — cheaper than a per-mount memo and sidesteps the `react-hooks/exhaustive-deps` warning. |

#### Extended the "Architect of Enchantment" about paragraph with three more sentences in the existing…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | Extended the "Architect of Enchantment" about paragraph with three more sentences in the existing mystical register so the card fills its column instead of leaving large top/bottom gaps (`src/components/about/index.jsx`). |

#### GitHub Stats card redesign

| | |
|:--|:--|
| **Ref** | [#19](https://github.com/MA1002643/theabdullahfolio/issues/19) |
| **Files** | `src/components/about/StatsCard.jsx` |
| **Details** | **GitHub Stats card redesign** ([#19](https://github.com/MA1002643/theabdullahfolio/issues/19), `src/components/about/StatsCard.jsx`) to share the Most Active Repository card's design system: vivid-orange (`#ff6d05`) stat numbers, title, and rank arc; `text-fire-amber` labels; amber icons; the `repo-card-breathe` container; a spring-staggered entrance; a per-character blur-fade title; hover-spotlight metric rows; simultaneous `fastStartSlowFinish` count-ups; and a rank arc with a faded track plus a breathing radial glow. The header is now title-over-meta (matching the adjacent languages card), and the whole card honours `prefers-reduced-motion`. |

#### Most Used Languages list is now a responsive count + column layout

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/LanguagesCard.jsx` |
| **Details** | Most Used Languages list is now a **responsive count + column layout** (`src/components/about/LanguagesCard.jsx`): a single column on mobile through `lg` (incl. iPad-landscape) showing the **top 5**, switching to two columns at `xl` (≥1280px) showing up to **10**. The rank index and `PRIMARY` pill are hidden at `xl`+ so the longest names aren't truncated in the tighter two-column cells; the list also drops to `text-sm` there. |

#### About section horizontal padding is now responsive

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | About section horizontal padding is now responsive (`px-6 sm:px-10 md:px-16`, `src/components/about/index.jsx`) instead of a flat `px-16`, giving phones roughly 80px more content width while leaving the desktop layout unchanged. |

#### `/api/github-stats` no longer blanks the Most Used Languages card on a partial outage

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/api/github-stats`, `src/components/about/index.jsx` |
| **Details** | `/api/github-stats` no longer blanks the Most Used Languages card on a partial outage. When the languages GraphQL aborts mid-fetch but the user/stats/streaks queries succeed, the route substitutes the bundled snapshot's languages and flags them `languagesFallback: true` (HTTP 200, no `_fallback`) instead of caching an empty list for the 10-min TTL. The client (`src/components/about/index.jsx`) treats snapshot/stale languages as a **soft default** — used to populate a cold card for a first-time visitor, but never allowed to overwrite a returning visitor's own (possibly fresher) `localStorage` last-good. |

#### Homepage hero name "Muhammad Abdullah"

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/app/page.js` |
| **Details** | Homepage hero name "Muhammad Abdullah" (`src/app/page.js`) pinned back to its original outline-only look via an inline `color: #000e1700` (transparent fill + orange neon stroke + glow). The Unify Page Titles change had switched the shared `.text-glow-stroke-neon` fill to a solid `#ff6d05` for the sub-page headers (ABOUT ME / CONTACT ME), which also filled in the homepage name; the override restores the hollow hero glyphs without touching the now-solid sub-page titles. |

#### Page-title treatment unified across `(sub pages)/about`, `(sub pages)/projects`, `(sub pages)/con…

| | |
|:--|:--|
| **Ref** | [#104](https://github.com/MA1002643/theabdullahfolio/issues/104) |
| **Files** | `(sub pages)/about`, `(sub pages)/projects`, `(sub pages)/contact`, `(sub pages)/qualifications` |
| **Details** | Page-title treatment unified across `(sub pages)/about`, `(sub pages)/projects`, `(sub pages)/contact`, and `(sub pages)/qualifications` via the shared `<PageTitle>` component ([#104](https://github.com/MA1002643/theabdullahfolio/issues/104)). Per-page header markup, decorative inline dashes that flanked "WHO I AM" / "MY WORK", and per-page font-size drift (some pages used `text-[3rem] md:text-[3.5rem]`, others `text-2xl sm:text-5xl`) are gone in favour of the shared `text-[2rem] md:text-[3rem]` plus the flanked pink-neon `<h2>`. |

#### `.text-glow-stroke-neon` fill colour from `#000e1700`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `.text-glow-stroke-neon` fill colour from `#000e1700` (near-transparent) → solid `#ff6d05` so wide-interior glyphs (M, W) on CONTACT ME / ABOUT ME render as filled orange shapes instead of outline-only letters with a visible interior gap. `text-transparent` dropped from `PageTitle` and `glowing-project-name` so the Tailwind utility doesn't override the new fill. |

#### Years in the Craft card and the Experience Breakdown modal now wear the same two-layer chrome as…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Years in the Craft card and the Experience Breakdown modal now wear the same two-layer chrome as the Most Active Repository card — outer `custom-bg-abt` carries the amber `1px solid #ffcd5bcc` border + dark slate gradient + backdrop blur; inner wrapper carries `repo-card-breathe` for the pulsing orange halo on a slightly inset perimeter (`rounded-lg` inside `rounded-xl` / `rounded-xl` inside `rounded-2xl` respectively). |

#### `.repo-card-breathe` keyframe radii tightened: baseline `6 / 14 px` → `4 / 9 px`, peak `16 / 30 p…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `6 / 14 px`, `4 / 9 px`, `16 / 30 px`, `10 / 18 px` |
| **Details** | `.repo-card-breathe` keyframe radii tightened: baseline `6 / 14 px` → `4 / 9 px`, peak `16 / 30 px` → `10 / 18 px`. Same hue and opacity stops, narrower spread. |

#### HomeBtn and ProjectsBtn hover tooltips wear `.custom-bg-abt` chrome

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | HomeBtn and ProjectsBtn hover tooltips wear `.custom-bg-abt` chrome (amber border, dark slate gradient interior, warm orange halo) instead of the previous grey `bg-background`. ProjectsBtn tooltip aligned to HomeBtn's responsive sizing (`text-xs sm:text-sm md:text-base`, `px-2 py-1 sm:px-2.5 sm:py-1.5`, `ml-2 md:ml-3`, `desktop-hover-only`). |

#### Empty-category sonner toasts on `/projects` and `/qualifications` shrink to content width

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/projects`, `/qualifications` |
| **Details** | Empty-category sonner toasts on `/projects` and `/qualifications` shrink to content width (`width: fit-content; maxWidth: min(90vw, 28rem); alignSelf: center; marginInline: auto;`) and centre-align text on every viewport. Text colour standardised to `#ff6d05` to match the years digit. |

#### Project list typography normalised: name uses solid `#ff6d05`; description uses `.text-fire-amber…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Project list typography normalised: name uses solid `#ff6d05`; description uses `.text-fire-amber`; the dashed divider between description and date uses `#ffaa2a`; the date keeps `#ff6d05`. Removed the `.text-shadow-neon-orange` class on the name + date so its `color: #f9d174` rule no longer overrode the Tailwind colour utility. |

#### Qualifications carousel title `<h3>` and Prev/Next buttons render with `.text-fire-amber`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Qualifications carousel title `<h3>` and Prev/Next buttons render with `.text-fire-amber` (gradient fill + warm halo). Picture wrapper carries an inline `background: '#00000020'` override so the qualifications photos sit on the prior transparent dark backdrop without touching the eight other consumers of `.custom-bg-abt`. |

#### Projects page category buttons re-styled to mirror the qualifications carousel tab treatment

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Projects page category buttons re-styled to mirror the qualifications carousel tab treatment — orange `#ff6d05` neon glow when active, pink `#fc83ff` neon glow when inactive, brighter halo on hover, `<button>` semantics with `aria-pressed`. |

#### Maintainer contact channel migrated from a personal Gmail to `team@ma.codes`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Maintainer contact channel migrated from a personal Gmail to `team@ma.codes` (a Cloudflare Email Routing alias forwarding to the maintainer's inbox). Updated in `SECURITY.md` and `CODE_OF_CONDUCT.md`. |

#### GitHub label inventory standardised: 22 new labels added

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | GitHub label inventory standardised: 22 new labels added (status / triage, severity, the `area:*` family covering every owned directory, plus `dependencies` and `config`), and four spaced labels renamed to dash form (`good first issue` → `good-first-issue`, `help wanted` → `help-wanted`, `in progress` → `in-progress`, `review needed` → `review-needed`) for consistency with workflow references. The `enhancement` label description was clarified to differentiate it from the kept-as-distinct `feature` label. |

#### Contact send migrated from an inline `fetch` in the form to the shared `postContactMessage`

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/lib/contact.js` |
| **Details** | Contact send migrated from an inline `fetch` in the form to the shared `postContactMessage` ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/lib/contact.js`), which **discriminates a server rejection from a transport failure** so the form can queue-and-retry the latter (offline / drop) while still surfacing validation errors for the former. The form's success path clears the saved draft and the offline-hold path enqueues for retry. |

#### `/api/send-mail` hardened for idempotency

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `/api/send-mail` |
| **Details** | `/api/send-mail` hardened for idempotency ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5)): pinned to the Node.js runtime (`export const runtime = 'nodejs'`, required by nodemailer) and given bounded SMTP connection/greeting/socket timeouts whose combined worst case stays well under the `PENDING` claim TTL, so a hung mail server can never let a send outlive — and thus have a concurrent retry reclaim — its idempotency claim. |

#### `@upstash/redis` and `ai` added as dependencies

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `@upstash/redis`, `.github/workflows`, `@react-three/fiber` |
| **Details** | `@upstash/redis` and `ai` added as dependencies (`package.json`) for the idempotency store and the Gateway-routed refine endpoint; the Node engine was bumped to 22 (`package.json` + `.github/workflows`). The aurora reuses the already-present `three` / `@react-three/fiber`. |

#### Footer audio lifted into a root-layout sound provider

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/sound/SoundProvider.jsx`, `src/components/sound/FloatingSoundToggle.jsx`, `src/app/layout.js`, `src/components/footer/index.jsx` |
| **Details** | **Persistent footer audio** ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30), `src/components/sound/SoundProvider.jsx`). The footer guitar track's `<audio>` element and on/off state moved out of `Footer` into a `SoundProvider` mounted in the **root** layout. `Footer` is rendered by the `(sub pages)` layout, which **unmounts on navigation to `/`** — that was destroying the audio node mid-play and cutting the music off. The track now survives route changes; the footer renders the same visible control but reads its state from context (`useSound`). A new `FloatingSoundToggle` gives footerless routes (the homepage) an always-available stop control, rendering `null` where a footer already carries one. The purely-visual overlays (Now Playing, toaster, cursor) render **outside** the provider, so a toggle can't re-render them. |

#### Architect & contact-intro copy darkens gold→ember in reading order

| | |
|:--|:--|
| **Ref** | [#87](https://github.com/MA1002643/theabdullahfolio/issues/87) |
| **Files** | `src/lib/fireRamp.js`, `src/components/about/index.jsx`, `src/components/contact/ContactIntro.jsx` |
| **Details** | **Reading-order fire fill** ([#87](https://github.com/MA1002643/theabdullahfolio/issues/87), `src/lib/fireRamp.js`). The About "Architect of Enchantment" paragraph and the contact-page intro clipped an **identical** per-word vertical gold→ember gradient to every word, so the copy read as one flat colour band left-to-right. A new shared helper `wordFill(i, total)` samples the `.text-fire-amber` ramp at each word's position and slides its sheen window along it, so the paragraph now darkens from bright gold (first words) to deep ember (last words) **in reading order** — restoring the whole-paragraph gradient that per-word clipping (the earlier GPU-compositing fix) had flattened, without reintroducing the clip-once-per-layer bug: each word still owns its clip. `rampColor(t)` linearly interpolates the ramp and both paragraphs stay in sync via the single helper (mirroring the `.text-fire-amber` stops). The first word's top edge is still exactly `#ffd27d`, so the opening reads unchanged — only the tail darkens. |

#### Qualifications image sizing, formats & cache TTL

| | |
|:--|:--|
| **Ref** | [#84](https://github.com/MA1002643/theabdullahfolio/issues/84) |
| **Files** | `next.config.mjs`, `src/components/qualifications/certSizes.js`, `src/components/qualifications/Carousel.jsx` |
| **Details** | **Image optimiser tuning** ([#84](https://github.com/MA1002643/theabdullahfolio/issues/84), `next.config.mjs`). The optimiser now sets a one-year `minimumCacheTTL` — immutable certificate assets stop sending an `If-Modified-Since` revalidation on every navigation — and prefers AVIF over WebP. It deliberately keeps Next's **default** `deviceSizes` (no global cap): `images.*` is site-wide, and a cap would clamp every full-bleed `sizes="100vw"` background (home / about / projects) to 1200 px and soften it on large / high-DPR displays. Instead the carousel self-limits **at the source** — a new shared `certSizes.js` derives each card's responsive `sizes` from its *true* height-bound rendered width (`min(--cert-w-cap, aspectRatio × --cert-cap)`), so the browser targets ~1080/1200 for certificates on their own merit while every other image keeps its full variant set (verified: cards resolve to `w=640`/`1080` while the home background stays `w=1920` on desktop). `certSizes` is the single source of truth imported by **both** the carousel `<Image>` and the preloader, so their requested widths — and therefore the cache-hit contract — can't drift apart. |

### Fixed

#### Category fold could return a non-string for prototype-key labels

| | |
|:--|:--|
| **Ref** | Review finding on the [#27](https://github.com/MA1002643/theabdullahfolio/issues/27) acronym map |
| **Files** | `src/lib/categories.js` |
| **Details** | `normalizeCategory`'s `ACRONYMS` lookup indexed a bare object literal, which also reads **inherited** properties — `normalizeCategory("constructor")` returned the `Object` constructor function and `"__proto__"` returned `Object.prototype`, and being truthy they short-circuited the `??` fallback, breaking the fold's every-result-is-a-string contract. The label reaches the fold not only from the data files but from the `localStorage` stored-filter fallback (visitor-writable), and the result feeds the derived tab builder on `/projects` and `/qualifications`. `ACRONYMS` is now a `Map` (`.get()` reads own entries only), with the constraint noted at the declaration. Verified by direct unit runs — `"constructor"` → `"Constructor"`, `"__proto__"` → `"__proto__"`, `"hasOwnProperty"` → `"Hasownproperty"`, all strings — while `"ai"` / `"AI"` / `"Ai "` still fold to **AI** and the derived tabs render live with correct counts (the trailing Mobile tab's `(0)` observed en route is the scroll-strip's designed lazy count-up for offscreen tabs, tallying to `(2)` on entry — verified by filtering to Mobile: exactly `auxo` + `clearway`, no empty-category toast). |

#### Private repositories no longer offered as public demo links (auxo, clearway)

| | |
|:--|:--|
| **Ref** | Review finding on the project-data overhaul — the "repo as demo link" precedent only holds for public repos |
| **Files** | `src/app/data.js` |
| **Details** | The `auxo` and `clearway` entries pointed `demoLink` at their GitHub repositories on the plenary precedent — but both repos are **private**, so those URLs 404 for every visitor without access. Both entries now carry `demoLink: null` plus a `private: true` flag, with the entry comments rewritten to state the rule (no public URL exists yet; swap in a real one once a landing page or public repo does). Nothing user-facing changes today — `demoLink` is currently unrendered (the `/projects` cards link internally to `/projects/[id]` and ignore it; the detail page's "Live Demo" / "GitHub" buttons are `href="#"` placeholders) — so this defuses the trap before those buttons get wired, and the `private` flag gives that future consumer the signal to render an explicit private-project state instead of a dead link. The other nine entries' demo links verified against live GitHub visibility: all public (or [ma.codes](https://ma.codes) itself). `/projects` verified rendering all nine cards with zero console errors after the change. |

#### Maintenance header Focus line lost its link — or linked to the wrong repo — when the focus item fell outside the breakdown caps

| | |
|:--|:--|
| **Ref** | [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up — board-fed `topItems` vs the capped breakdown join |
| **Files** | `src/app/api/work-status/route.js`, `src/utils/workSignal.js`, `src/components/home/LiveMaintenanceHeader.jsx` |
| **Details** | **Board-fed `meta.topItems` are now self-contained.** Since [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) Phase 3, the Focus queue can be populated from project-board items across every tracked repo, but each record carried only `{type, number, title, updatedAt}` — the client re-derived repo attribution and the GitHub link by joining against `meta.breakdown.prs/issues`, and those lists are capped at the 10 most-recently-updated open items per repo (`first: 10` in the portfolio query). A board "In Progress" item outside that slice (easy with repos holding 65–167 open issues) had no entry to join with, so the Focus line rendered link-less and repo-less — and the number-only fallback made it worse: caught live in dev, vigil's issue #2 (ADR-002, outside vigil's top-10) number-collided with Dhun's issue #2, attributing the wrong repo **and linking to the wrong GitHub page**. Fixed at the source: the Projects v2 board query now fetches each item's `url` and `createdAt`, the board records carry them, and both `topItems` construction paths in `workSignal.js` tag every record with `repo` / `nameWithOwner` / `url` / `createdAt` / `updatedAt` (the board path from the owning tracked repo, the non-board fallback from the already-tagged breakdown items it draws from) — the full §4.2 `ActivityItem` shape, so a breakdown-style entry can be synthesized from a focus item alone if a future fallback needs one. The client prefers the item's own fields, keeps the exact number+title breakdown join solely for stale cached payloads that predate the new shape, and **drops the number-only fallback** — with multiple tracked repos a bare number can exist in several, and degrading to a non-link beats linking to the wrong item. Payload change is purely additive, so stale client builds keep working (§4.6). |

#### Maintenance header dropped all plenary activity after that repo's rename; its new board tracked

| | |
|:--|:--|
| **Ref** | [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up — fourth rename-trap instance in two days |
| **Files** | `src/utils/workTrackedRepos.js` |
| **Details** | `vevox-real-time-chat-web-application` was renamed to **plenary** on GitHub — the same silent-drop failure as the culina, colophon and dhun renames. Tracked entry updated to `plenary` / display name **Plenary**, and its new "Plenary — Educational Session Platform" board declared as `projectNumber: 11` so its In Progress / Done columns feed the header. The allow-list comment now records all four incidents. The freshly created board 12 ("Elite AI Fitness & Nutrition App") holds no items and maps to no repository yet, so it stays deliberately unwired until a repo exists to attach it to. |

#### Maintenance header dropped all dhun activity after that repo's rename

| | |
|:--|:--|
| **Ref** | [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up — third rename-trap instance in two days |
| **Files** | `src/utils/workTrackedRepos.js` |
| **Details** | `fullstack-singer-platform` was renamed to **dhun** on GitHub — the same silent-drop failure as the culina and colophon renames (lookups redirect, payloads carry the new `nameWithOwner`, every allow-list join misses). Tracked entry updated to `dhun` / display name **Dhun**, keeping its `projectNumber: 10`; the allow-list comment now records all three incidents and the pattern behind them (repos get renamed as they productise). On the GitHub side the board title was re-aligned too: "Singer Platform — Streaming Rebuild" → **"Dhun — Streaming Rebuild"**, per the board-naming convention set when the boards were first normalised. |

#### Maintenance header dropped all colophon activity after that repo's rename; two new boards tracked

| | |
|:--|:--|
| **Ref** | [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up — second instance of the rename trap in two days |
| **Files** | `src/utils/workTrackedRepos.js` |
| **Details** | `article-server-full-stack-blogging-platform` was renamed to **colophon** on GitHub, re-triggering the same silent-drop failure the culina rename caused (lookups redirect, payloads carry the new `nameWithOwner`, every allow-list join misses). Tracked entry updated to `colophon` / display name **Colophon**, and its new "Colophon — Product Programme" board declared as `projectNumber: 9` so its In Progress / Done columns feed the header signal. The freshly created "Singer Platform — Streaming Rebuild" board was declared too (`projectNumber: 10` on `fullstack-singer-platform`) — it holds no cards yet, but the header will pick them up the moment they land. The allow-list comment now records both rename incidents as the caution precedent. |

#### Maintenance header dropped all culina activity after the repo's rename

| | |
|:--|:--|
| **Ref** | [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up |
| **Files** | `src/utils/workTrackedRepos.js` |
| **Details** | The tracked-repo allow-list still named `ai-powered-recipe-search-platform`, but that repository was renamed to **culina** on GitHub. Renames redirect *lookups* (the GraphQL query kept succeeding), yet payloads carry the **new** `nameWithOwner` — so every join against the allow-list (`isTrackedRepo`, `displayNameFor`, the webhook gate, and the board-item grouping) silently missed, dropping culina's activity from the header. Entry updated to `culina`; the list's comment now documents the rename trap so the next rename is caught at the list, not in production behaviour. |

#### Projects v2 board queries silently 401'd when `GITHUB_PROJECT_TOKEN` was present-but-empty

| | |
|:--|:--|
| **Ref** | [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up |
| **Files** | `src/app/api/work-status/route.js` |
| **Details** | `PROJECT_TOKEN` fell back to `GITHUB_TOKEN` with `??` — but env files routinely carry the override as an **empty string** (`GITHUB_PROJECT_TOKEN=""`, exactly what `.env.local` held), which `??` passes through as a real value. The route then sent `Authorization: Bearer ` (blank), GitHub answered 401, and the board fetch's silent-null auth branch swallowed it — the header had been running on the repo-wide fallback signal with nothing logged, in every environment with the empty var. The fallback is now `\|\|`, so an empty override behaves like an absent one; with it, the board signal lit up in dev for the first time (SHIPPING from the Culina board verified live). |

#### `/qualifications` backdrop re-zoomed on mobile URL-bar collapse; blurry background on portrait viewports

| | |
|:--|:--|
| **Ref** | [#52](https://github.com/MA1002643/theabdullahfolio/issues/52) follow-up |
| **Files** | `src/app/globals.css`, `src/app/(sub pages)/qualifications/page.js`, `src/components/qualifications/SceneVideo.jsx` |
| **Details** | **The page's three fixed full-bleed layers — still image, ambient scene video, black dimmer — now share one `.qualifications-backdrop` rule** (`src/app/globals.css`) instead of three copies of `fixed top-0 left-0 w-full h-full`. The `h-full` was the bug: a fixed element's percentage height resolves against the mobile **layout** viewport, which grows when the browser's URL bar collapses mid-scroll — so all three layers resized on every toolbar show/hide and the `object-cover` crop visibly re-zoomed while scrolling on phones and tablets. The shared rule pins height to `100lvh` (large-viewport units: at least as tall as the visible area in every toolbar state, so the crop is rock-steady) with a `100vh` fallback line for pre-lvh engines, which measured mobile vh against the large viewport anyway. Sharing one rule also means the layers can never drift out of alignment again. Separately, the still image's `sizes` moves `100vw → max(100vw, 178vh)`: the image is `object-cover`'d, so on any viewport narrower than the scene's 16:9 (every portrait phone, both iPad orientations) it paints height-bound at ~178vh CSS px wide — `100vw` made the browser pick a srcset entry sized to the viewport and stretch it ~2.3× into that wider paint box (worse at 3× DPR), i.e. a blurry background. Engines too old to parse math in `sizes` treat the value as invalid and fall back to `100vw` — exactly the old behaviour, never worse. |

#### `(canceled)` certificate image requests on `/qualifications`

| | |
|:--|:--|
| **Ref** | [#84](https://github.com/MA1002643/theabdullahfolio/issues/84) |
| **Files** | `src/components/qualifications/Carousel.jsx` |
| **Details** | **Carousel mount-churn** ([#84](https://github.com/MA1002643/theabdullahfolio/issues/84), `src/components/qualifications/Carousel.jsx`). On a cold load the carousel mounted with `activeIndex` at `0`, painted the wrong seven cards (starting seven `_next/image` fetches), then an effect immediately recentred to the middle — unmounting those seven `<Image>`s and firing seven fresh fetches. The browser aborted the first seven mid-flight, surfacing as `(canceled)` rows in the network panel. `activeIndex` now initialises **synchronously** to the middle via a lazy `useState` initialiser, and the recenter effect is guarded so it only fires on real filter changes, never on first mount — so the correct cards mount on the first paint and no fetch is ever thrown away. Eager neighbours were also cut from five to one — only the centred (LCP) card loads `eager` / high `fetchPriority`, neighbours `lazy` / low — which cuts the number of **high-priority** requests competing for bandwidth from five to one. (A fast filter switch can still cancel in-flight *lazy* neighbour fetches when their cards unmount, since the rendered cards are all in-viewport and begin loading immediately; the change reduces prioritised requests, not cancellations to one.) |

#### Unguarded `ResizeObserver` in the carousel's `FitOneLineTitle`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/qualifications/Carousel.jsx` |
| **Details** | **`FitOneLineTitle` hardened against missing `ResizeObserver` and post-unmount font callbacks** (`src/components/qualifications/Carousel.jsx`). The title-fitting effect called `new ResizeObserver(fit)` unconditionally — on pre-2020 WebKit and older Android webviews that don't ship the API this threw at mount and took the whole carousel down. It now follows the guard used by every other observer in the codebase (`typeof ResizeObserver !== 'undefined'`, per `ScrollHijackCategories`), with a `window` `resize` fallback listener on browsers without it — sufficient there because card widths are vh/vw-derived, so only viewport changes can move the title wrapper. Separately, the `document.fonts.ready.then(fit)` re-fit could resolve after the component unmounted (or after `text` changed and the effect re-ran), running `fit` against a detached DOM node; a per-effect-run `cancelled` flag, set in cleanup, now drops any late resolution. |

#### Near-invisible category-strip edge arrows could swallow taps

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/shared/ScrollHijackCategories.jsx` |
| **Details** | **Edge-arrow hit targets now wait for meaningful visibility** (`src/components/shared/ScrollHijackCategories.jsx`). The category strip's edge arrows fade continuously in CSS (`opacity: calc(1 − var(--edge-*))` over the 24px `FADE_RAMP`), but their pointer-events were toggled by a plain `left < 1` / `right < 1` boolean — true from the first sub-pixel of scroll. Within a few pixels of either end, a ~2–10%-opaque arrow could sit over the row intercepting taps aimed at the tab underneath, defeating the component's own stated rule that "an invisible arrow must not swallow taps". The booleans are now thresholded on the arrow's calc()'d opacity: pointer-events (and the glyph's draw-in replay) only switch on once opacity clears `ARROW_HIT_OPACITY` (0.35, ≈8px into the ramp), so a nearly-transparent arrow is inert and taps fall through to the tabs. Below the threshold nothing else changes — the fade itself still tracks the finger continuously. |

#### Finite-positive validation for GitHub timeout / budget env vars

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/app/api/github-stats/route.js`, `src/app/api/github-skills/route.js`, `src/app/api/project-repo/route.js` |
| **Details** | The GitHub routes parsed their timeout and wall-clock-budget env vars (`GITHUB_TIMEOUT_MS`, `GITHUB_OVERALL_TIMEOUT_MS`, `GITHUB_OVERALL_BUDGET_MS`) with `Number(env) || fallback`, which only rejects *falsy* results (`0`, `NaN`): a negative value slipped through and forced immediate aborts / instant budget exhaustion, and `Infinity` slipped through and disabled the cap entirely. All seven sites now route through a shared `envPositiveMs` guard that falls back unless the parsed value is finite and positive — matching the pattern already used by `/api/experience-summary` and `/api/repo-refresh`. |

#### Reduced-motion hydration flash on the footer availability dot

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/AvailabilityStatus.jsx` |
| **Details** | The breathing availability halo read `useReducedMotion()` directly. On the server that hook returns `null`, so SSR rendered the animated halo **even for reduced-motion users**, then the first client render removed it — a hydration mismatch and a visible flash. It is now gated behind a `mounted` flag (the pattern the other footer blocks already use): SSR and the first client render agree, then the real preference settles a frame after mount. |

#### Copyright hydration mismatch across the year boundary

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/components/footer/index.jsx` |
| **Details** | The footer copyright year is now read from `new Date()` **only after mount**. Evaluating it during the server render (and the first client render) risked a hydration mismatch when a page is served across a year boundary — server on Dec 31, client hydrating Jan 1 — because the two renders would emit different year strings. Pre-mount SSR and the first client render omit the year so they agree; it fills in a frame later, well before the split-flap copyright cascade plays. |

#### Live-location freshness treats future timestamps as stale

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/utils/liveLocation.js` |
| **Details** | `effectiveLocation`'s freshness test was upper-bound-only (`now - updatedAt <= STALE_AFTER_MS`), so a timestamp in the **future** (a forward clock skew on the ingest server) yields a negative age that trivially passes and could pin the footer to a stale "live" town for up to the whole stale window. The age is now bounded on both sides — within `[−CLOCK_SKEW_TOLERANCE_MS, STALE_AFTER_MS]` — with a small (1-minute) skew tolerance so benign cross-instance clock drift never false-negatives a just-written fix. |

#### Reverse-geocode fetch marked non-cacheable

| | |
|:--|:--|
| **Ref** | [#30](https://github.com/MA1002643/theabdullahfolio/issues/30) |
| **Files** | `src/utils/liveLocation.js` |
| **Details** | The third-party reverse-geocode `fetch` now sets `cache: 'no-store'`. Under Next.js 14 the App Router's patched `fetch` defaults to caching GET responses in the Data Cache keyed by URL — and that URL embeds the (rounded) coordinates — so caching would retain a location-derived response longer than intended, an avoidable privacy exposure. Opting out treats every reverse-geocode as non-cacheable. |

#### Skills cache could pin stale data forever

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/SkillsCard.jsx` |
| **Details** | **Skills cache could pin stale data forever** (`src/components/about/SkillsCard.jsx`). A corrupt / hand-edited `skillsLastFetched` localStorage value (non-numeric) made `Number(lastFetched)` `NaN`, and `Date.now() - NaN > TTL` is always `false`, so the hook trusted the cached payload indefinitely and skipped every live refresh. The staleness check now coerces first and treats a non-finite timestamp (and a missing one) as stale. |

#### `getIconUrl` now URL-encodes the slug

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/utils/skillsIconUrl.js` |
| **Details** | **`getIconUrl` now URL-encodes the slug** (`src/utils/skillsIconUrl.js`) — defensive hardening so a slug with reserved characters can't produce a malformed icon URL (a no-op for the current `[a-z0-9]` slugs, which are guaranteed by the curated table + the Simple Icons fallback's non-alnum strip). |

#### False "completed projects changed" banner on a tie/reorder

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/hooks/useProjectCountSignal.js` |
| **Details** | **False "completed projects changed" banner on a tie/reorder** (`src/hooks/useProjectCountSignal.js`). The effect's change-trigger fingerprint was derived from the count-sorted breakdown's **array order**, so a tie (or a reorder of `projectsData`) could change the key without any per-category count changing. It is now an order-insensitive (sorted) signature, matching the order-insensitive comparison it gates. |

#### About-page entry glitch on the Most Used Languages, GitHub Stats, and Most Active Repository cards

| | |
|:--|:--|
| **Ref** | [#16](https://github.com/MA1002643/theabdullahfolio/issues/16) |
| **Files** | — |
| **Details** | About-page **entry glitch** on the Most Used Languages, GitHub Stats, and Most Active Repository cards ([#16](https://github.com/MA1002643/theabdullahfolio/issues/16)). Each card drove its entrance fade + per-character title off the **raw** `useInView` observer, which flickers true/false/true while the parent `ItemLayout` scales in (`scale: 0 → 1`), replaying the entrance and reading as a flicker. The entrance and title `play` now latch to the hysteresis-debounced `playToken > 0` (`hasEntered`) so they play once cleanly; the count-ups still replay on a real re-entry via the `playToken` value (`LanguagesCard.jsx`, `StatsCard.jsx`, `RepoStatsCard.jsx`). |

#### `useViewportCountUp` reset/teardown hardened across all early-return branches

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | `useViewportCountUp` reset/teardown hardened across all early-return branches (`src/components/about/index.jsx`): (a) a brief out-of-view flicker no longer snaps the digit to 0 — the reset is debounced and cancelled on a quick re-entry, and an in-flight tween is left to finish rather than restarted; (b) the disabled / no-node branch (e.g. `PercentCount`'s `unavailable`) re-arms the latch so a later re-enable with the same target animates fresh instead of staying stuck at the JSX `0`; (c) the reduced-motion branch clears any pending reset timer (so it can't fire and overwrite the final value back to `from`) and marks the value "shown" so re-enabling motion while in view doesn't trigger a redundant re-animation. |

#### `useProjectCountSignal` baseline validation

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/hooks/useProjectCountSignal.js` |
| **Details** | `useProjectCountSignal` baseline validation (`src/hooks/useProjectCountSignal.js`). `readStored()` validates the **parsed** value before coercion, so a corrupt / hand-edited `null`, `false`, `""`, or `[]` (all of which `Number(...)` collapses to `0`) is treated as "no baseline" instead of fabricating a phantom "N new completed projects added" banner on the next visit. A genuine `0` is accepted as a legitimate baseline (empty project list) in both the read validation and the effect's write guard, so a real `0 → N` change still announces. |

#### Most Used Languages update banner never auto-hid — it stayed on screen until the user manually re…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/LanguagesCard.jsx` |
| **Details** | Most Used Languages **update banner never auto-hid** — it stayed on screen until the user manually refreshed (`src/components/about/LanguagesCard.jsx`). The 4.5 s auto-hide `setTimeout` lived in the same effect that `consume()`d the pending message; consuming it nulled the effect's `pendingMessage` dependency, so React fired the cleanup (clearing the timer) before it could elapse. Split into a separate `bannerMessage`-keyed effect that the consume step can't cancel, mirroring the experience banner's `shown`-keyed timer. |

#### GitHub Stats banner auto-hide timer started even while the card was off-screen, so an update land…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/StatsCard.jsx` |
| **Details** | GitHub Stats banner auto-hide timer started even while the card was off-screen, so an update landing off-screen could be dismissed unseen. The timer is now gated on `isInView` (`src/components/about/StatsCard.jsx`). |

#### A stale per-stat diff could be shown

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | A stale per-stat diff could be shown (and announced) for a later non-stat update such as a display-name change: `statsDiffMessage` was set-only. It's now reconciled — cleared whenever a poll's stat values are unchanged (`src/components/about/index.jsx`), so the card falls back to its generic copy instead of replaying an old delta. |

#### Mobile

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Mobile (`< sm`) truncated the longest language name (e.g. `JavaScript`): the flat `px-16` section padding left phones only ~247px of content. Fixed by the responsive section padding noted under **Changed**. |

#### New-account GitHub Stats count-up burned a full ~120-frame `requestAnimationFrame` loop computing…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/StatsCard.jsx` |
| **Details** | New-account GitHub Stats count-up burned a full ~120-frame `requestAnimationFrame` loop computing `0` every frame for the headline Stars row (its `pulseOnComplete` flag had excluded it from the zero-target fast path). The fast path now applies to any `0` target regardless of `pulseOnComplete` (`src/components/about/StatsCard.jsx`). |

#### Most Used Languages card could blank — and then hydrate empty on the next cold load — after a lan…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | Most Used Languages card could blank — and then hydrate empty on the next cold load — after a languages-fetch timeout: the empty-but-`200` response overwrote the good list both in memory and in `localStorage` (the `_fallback` guard didn't catch the partial case). The client now treats an empty/snapshot languages list as "no fresh data this fetch" and keeps the last good breakdown, dropping the `live from GitHub` label until a genuine live fetch returns (`src/components/about/index.jsx`). |

#### 404 page phantom scroll on mobile portrait

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/app/globals.css` |
| **Details** | 404 page phantom scroll on mobile portrait (`src/app/globals.css`). `min-h-screen` / `100vh` is measured against the viewport with the mobile address bar hidden, so the single-screen layout could scroll by the toolbar's height with nothing below it. Portrait phones (`max-width: 640px`) now pin `.not-found-bg` to `100svh`; landscape keeps `100vh` + scroll because the short height genuinely needs it. |

#### Production employment 0% on `/api/experience-summary`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/api/experience-summary`, `outputFileTracingIncludes["/api/experience-summary"]`, `@napi-rs/canvas`, `node_modules/@napi-rs/canvas/**/*`, `node_modules/pdfjs-dist/node_modules/@napi-rs/canvas/**/*`, `createRequire(import.meta.url)("@napi-rs/canvas")`, `node_modules/pdfjs-dist/node_modules/@napi-rs/canvas` |
| **Details** | **Production employment 0%** on `/api/experience-summary` (preview deployments returned `pdfStatus: { message: "DOMMatrix is not defined" }` and an empty Employment side in the Years card and the Career Snapshot modal). The primary fix is `next.config.mjs` `outputFileTracingIncludes["/api/experience-summary"]` tracing **both possible install locations** for the `@napi-rs/canvas` JS shim and its `linux-x64-gnu` platform binary subpackage — the root `node_modules/@napi-rs/canvas/**/*` and the surviving `node_modules/pdfjs-dist/node_modules/@napi-rs/canvas/**/*` nest — so `pdfjs-dist`'s runtime `createRequire(import.meta.url)("@napi-rs/canvas")` lands on a bundled file regardless of which copy Node resolves first. The `package.json` `overrides` field also pins `@napi-rs/canvas` to `0.1.80`, which collapsed the duplicated `pdf-parse` install but **did not** flatten `pdfjs-dist`'s nested optional dependency: the committed lockfile still resolves `node_modules/pdfjs-dist/node_modules/@napi-rs/canvas` to `0.1.100`, which is exactly why both glob paths are listed. |

#### Years digit `Counter` and the Personal / Employment `PercentCount` in `src/components/about/index…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | Years digit `Counter` and the Personal / Employment `PercentCount` in `src/components/about/index.jsx` could remain at `0` indefinitely because the parent `ItemLayout`'s `initial={{ scale: 0 }}` entrance collapsed every descendant's `IntersectionObserver` rect to zero area, so `useViewportCountTrigger`'s `playToken` never armed and the count-up early-return suppressed the animation. Both counters now run through the shared `useViewportCountUp` hook, which drives the animation from the **card-level** in-view signal (`isExperienceCardInView`) rather than a per-digit observer that the `scale(0)` entrance would collapse, and debounces the out-of-view reset so a scroll/scale flicker can't snap the digit back to 0. Both honour `prefers-reduced-motion`. Bar segments inside `ExperienceSplitBar` (and the new projects `ProjectsSplitBar`) likewise gate their fill on that card-level signal instead of a per-segment `whileInView`. |

#### `useExperienceSummary`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/hooks/useExperienceSummary.js` |
| **Details** | `useExperienceSummary` (`src/hooks/useExperienceSummary.js`) now hydrates `data` from `localStorage` on mount. The hook already wrote the diff baseline there but never read it back as initial state, so returning visitors saw "0 months of experience" briefly before the network fetch resolved. Diff-message logic still compares the live payload against the same stored baseline before overwriting it. |

#### `/api/experience-summary` PDF parse timeout: the `Promise.race` setTimeout is now cleared in `fin…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/api/experience-summary`, `/api/github-stats` |
| **Details** | `/api/experience-summary` PDF parse timeout: the `Promise.race` setTimeout is now cleared in `finally` so the timer doesn't keep the serverless instance's event loop alive (or delay freeze) for up to `PDF_PARSE_TIMEOUT_MS` after every successful request. Mirrors the sibling `/api/github-stats` discipline. |

#### `FireInput`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/contact/FireInput.jsx`, `try/catch` |
| **Details** | `FireInput` (`src/components/contact/FireInput.jsx`) `sync()` wraps `input.selectionEnd` in `try/catch`. Reading the property on `<input type="email">` throws `InvalidStateError` in current Chrome and Firefox; previously the throw propagated out of the input/scroll handler and stopped the gradient overlay from updating on the email field. |

#### Empty-category sonner toast on `/projects` and `/qualifications` persisted across route changes —…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/projects`, `/qualifications` |
| **Details** | Empty-category sonner toast on `/projects` and `/qualifications` persisted across route changes — the toast id is now tracked in a ref and dismissed on component unmount and on every category switch (including back-to-back disabled clicks), so navigating to the home page closes the message immediately. |

#### Contact form: tightened the gap between input fields and their required-field error messages

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Contact form: tightened the gap between input fields and their required-field error messages (`Full Name is required!`, `Email is required!`, `Subject is required!`, `Message is required!`) — `marginTop: -0.25rem` on the Message error and `marginTop: 2px` on the other three so the messages no longer sit ~16px adrift of the input glow. |

#### Project detail title typography unified with the qualifications reference

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Project detail title typography unified with the qualifications reference (`text-[2rem] md:text-[3rem]`). The cinematic bloom-ring and flicker animation on `GlowingTitle` are preserved. |

#### Duplicate `id="about"` on the projects page header

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Duplicate `id="about"` on the projects page header (a copy-paste artefact from the about page markup) removed. No anchor link referenced it; the surviving `#about.text-glow-stroke-neon` compound CSS selector no longer matches anything under the new `PageTitle` structure regardless. |

#### `<input type="email">` error placement on the contact form no longer forces the message half-unde…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `<input type="email">` error placement on the contact form no longer forces the message half-under the input shadow on every viewport. |

#### Breakpoint range definitions unified across `CONTRIBUTING.md`, `PULL_REQUEST_TEMPLATE.md`, and `.…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `.github/ISSUE_TEMPLATE/ui_ux_improvement.yml` |
| **Details** | Breakpoint range definitions unified across `CONTRIBUTING.md`, `PULL_REQUEST_TEMPLATE.md`, and `.github/ISSUE_TEMPLATE/ui_ux_improvement.yml` — previously `CONTRIBUTING.md` said `tablet (≤ 768px)` while the templates said `tablet (640–1023px)`. |

#### `.github/ISSUE_TEMPLATE/ui_ux_improvement.yml` `breakpoints` field converted from `checkboxes`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `.github/ISSUE_TEMPLATE/ui_ux_improvement.yml` |
| **Details** | `.github/ISSUE_TEMPLATE/ui_ux_improvement.yml` `breakpoints` field converted from `checkboxes` (with invalid block-level `validations.required`) to `dropdown` with `multiple: true` so GitHub accepts the form schema. |

#### `.github/workflows/issue-triage.yml` `pull_request_target` triggers expanded from `[opened]` to `…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `.github/workflows/issue-triage.yml` |
| **Details** | `.github/workflows/issue-triage.yml` `pull_request_target` triggers expanded from `[opened]` to `[opened, synchronize, reopened, ready_for_review]` so path-based PR labels stay in sync with the latest diff across the PR lifetime, with the welcome job gated by `github.event.action == 'opened'` to avoid re-greeting on every push. |

#### Current Streak always reported `0`

| | |
|:--|:--|
| **Ref** | [#21](https://github.com/MA1002643/theabdullahfolio/issues/21) |
| **Files** | `src/app/api/github-stats/route.js` |
| **Details** | **Current Streak always reported `0`** ([#21](https://github.com/MA1002643/theabdullahfolio/issues/21), `computeStreaks` in `src/app/api/github-stats/route.js`). GitHub returns the full current *week*, so the calendar was padded with future days at `contributionCount: 0`; scanning forward, the first of those closed the active run and the trailing zeros kept the counter at 0, so the ongoing-streak tail was never reached (the streak read `0` every day except Saturday). The current streak is now found by **walking backward** over days filtered to `<= today`, treating an empty *today* as "not yet broken" (the day isn't over). `end` is pinned to `today` in that case so the range keeps printing **"Present"** and `currentStreak.dateRange` doesn't shift at midnight (which `streakFingerprint` would otherwise read as a real change). |

#### "Projects shipped" / "Years in the craft" count-ups stuck at `0` on `/about`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/about` |
| **Details** | **"Projects shipped" / "Years in the craft" count-ups stuck at `0`** on `/about`. Two stacked causes: (1) the `useInView` gating those counters was attached to the `scale: 0 → 1` `ItemLayout`, which reads zero area at entry and never re-fires after the transform settles — replaced with the new `useReliableInView`; and (2) the `Counter` component was defined *inside* `AboutDetails`, so every parent re-render remounted it and reset the tween to 0 — hoisted to module scope so it runs once to completion. |

#### `streakFingerprint({})` treated the About page's `streaks: {}` loading placeholder as a valid all…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `streakFingerprint({})` treated the About page's `streaks: {}` loading placeholder as a valid all-zeros snapshot and returned a non-null fingerprint, recording it as a baseline and then firing a **false "updated" banner** the instant real streak data arrived. It now returns `null` for a payload missing every tracked block, so the baseline is only recorded once real data lands. |

#### Repo-breakdown popover dismissed when keyboard focus moved into it

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/LanguagesCard.jsx` |
| **Details** | **Repo-breakdown popover dismissed when keyboard focus moved into it** (`src/components/about/LanguagesCard.jsx`). The row's `onBlur` scheduled a close that only a pointer-enter could cancel, so tabbing from a language row to its repo links closed the panel before they were reachable. The row now gates that close on `relatedTarget` (skip it when focus moves into `[data-lang-popover]`), and the popover gained focus enter/leave handlers so it stays open while focus is within it or the trigger row, closing only once focus leaves both. |

#### `animateToTarget` scheduled a full ~2 s `requestAnimationFrame` loop of no-op repaints even when…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | `animateToTarget` scheduled a full ~2 s `requestAnimationFrame` loop of no-op repaints even when `from === to` (reachable from the streak card at a value of 0); a fast-path early return now paints the final value once and finishes synchronously. |

#### Reduced motion is now honoured across the whole Most Used Languages entrance, not just the title:…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Reduced motion is now honoured across the **whole** Most Used Languages entrance, not just the title: the card/header/list/row variants swap to a resting no-op set under `prefers-reduced-motion` so nothing springs, slides, or replays for users who opted out. |

#### Idempotency claim could be released/promoted by a non-owner

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/app/api/send-mail/route.js` |
| **Details** | **Idempotency claim could be released/promoted by a non-owner** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/app/api/send-mail/route.js`). When the initial `SET NX` claim write threw, the handler failed open by pretending it had acquired the claim, then ran the unconditional `DEL` (on send failure) and `SET … SENT` (on success) — which could delete or overwrite a `PENDING`/`SENT` key a **concurrent** attempt legitimately owned, stranding or duplicating that attempt's message. Ownership is now tracked with a `claimOwned` flag set only when the atomic `SET NX` returns `'OK'`; both the release and the promotion are gated on it, so a fail-open request still sends but never touches a key it doesn't own. |

#### About "Architect" paragraph painted fully visible on GPU Chrome

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/components/about/index.jsx` |
| **Details** | **About "Architect" paragraph** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/components/about/index.jsx`). The scroll-revealed word-by-word gold→ember paragraph painted **fully visible** — ignoring its per-word `opacity` — in real GPU Chrome, while every headless / software-raster test passed. The `.text-fire-amber` gradient was clipped-to-text on the **parent** `<p>` while the reveal animated `opacity` on child word spans; inside the tilt card's GPU-promoted layer (`custom-bg-abt` `backdrop-filter` + hover `perspective()`), Blink rasterises the parent's clip-to-text fill **once**, so per-word `opacity:0` no longer fades the glyphs. Fixed by co-locating the gradient clip and the opacity on the **same** element (`WORD_FILL`) — each word owns its clip, robust in every compositing path (the pattern `ContactIntro` already uses). The reveal now starts fully hidden and is deliberately kept under `prefers-reduced-motion` (it is opacity-only and scroll-scrubbed — the reader drives it — so it isn't the autonomous motion the setting suppresses). |

#### Homepage hero title vection drift

| | |
|:--|:--|
| **Ref** | [#87](https://github.com/MA1002643/theabdullahfolio/issues/87) |
| **Files** | `tailwind.config.js`, `src/app/page.js` |
| **Details** | **Hero title vection drift** ([#87](https://github.com/MA1002643/theabdullahfolio/issues/87), `src/app/page.js`). The static hero name appeared to slowly **drift** while the laptop beneath it bobbed — an induced-motion (**vection**) illusion: the eye borrowed the laptop's large periodic transform and mis-attributed it to the neighbouring still title. Fixed on two fronts. (1) The `float-laptop` keyframe amplitude is cut below the vection threshold — `translateY` 20→6px, `scale` 1.1→1.02, `rotateX` 18→6deg — with an ember `drop-shadow` that pulses in sync with the up-phase so the laptop still reads as "alive" rather than merely smaller. (2) The headline is given its **own compositor layer** (`transform-gpu` → `translateZ(0)` plus `[backface-visibility:hidden]`) so WebKit can't fold it back into the parent and couple sub-pixel jitter across during the laptop's per-frame transform. No `will-change` — the headline is static, so a permanently-warmed layer would be wasted. |

### Removed

#### `MindfulMoments` placeholder listing from `/projects`

| | |
|:--|:--|
| **Ref** | Direct request |
| **Files** | `src/app/data.js` |
| **Details** | The `MindfulMoments` placeholder (id 10, "Meditation and mindfulness app", `demoLink: www.google.com`) is deleted from `projectsData` — the last-but-one of the original dummy entries, with no real repository behind it. Everything downstream re-derives on its own: the `/projects` tabs re-count (System 6 → 5), the About page's Completed Projects total and Web/System/AI split-bar recompute from the same array, and the per-device project-count signal surfaces its standard "count changed" banner exactly as designed. A visitor with `projects-category` still stored can't strand either way since other System projects remain; the id sequence now ends at 9 with no gaps. |

#### `languagesFingerprint` field from the `/api/github-stats` response

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `/api/github-stats`, `src/utils/languageDiff.js` |
| **Details** | `languagesFingerprint` field from the `/api/github-stats` response (and its `import` in the route). No client read it — the change signal recomputes the fingerprint locally from the languages list via `src/utils/languageDiff.js` — so it was dead bytes on every cached response. As a side benefit, because the client's `prevStats` never carried the field, its absence stops `detectChanges` from emitting a spurious `languagesFingerprint` diff on every 10-minute poll. |

#### Decorative `-` / `–` flanks inside the Qualifications and Contact page subtitle strings

| | |
|:--|:--|
| **Ref** | — |
| **Files** | — |
| **Details** | Decorative `-` / `–` flanks inside the Qualifications and Contact page subtitle strings ("-accomplishments-" / "– get in touch –"). The shared `<PageTitle>` now ships flank pills on either side of the subtitle, so the literal characters were doubling up. |

#### `useViewportCountTrigger` import from `src/components/about/index.jsx` after the `Counter` and `P…

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `src/components/about/index.jsx` |
| **Details** | `useViewportCountTrigger` import from `src/components/about/index.jsx` after the `Counter` and `PercentCount` refactors stopped consuming it. `AnimatePresence` import from the same file as similar dead weight from earlier refactors. |

#### Stale root direct dependency on `@napi-rs/canvas@^1.0.0` from `package.json`

| | |
|:--|:--|
| **Ref** | — |
| **Files** | `@napi-rs/canvas@^1.0.0` |
| **Details** | Stale root direct dependency on `@napi-rs/canvas@^1.0.0` from `package.json`. The version didn't satisfy any transitive consumer's range (`pdfjs-dist` wants `^0.1.80`, `pdf-parse` pins `0.1.80`) and only added install weight while masking the real resolution. |

### Security

#### Skills crawl restricted to owner-owned repositories

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | `src/app/api/github-skills/route.js`, `/api/github-stats` |
| **Details** | **Skills crawl restricted to owner-owned repositories** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), `src/app/api/github-skills/route.js`). The repo query used `ownerAffiliations: [OWNER, COLLABORATOR]` which — combined with crawling the PRIVATE scope — could surface the **names of repos owned by other accounts / orgs (including private org repos) that the token-holder only collaborates on** in the public, CDN-cached per-skill `repos` lists. Restricted to `[OWNER]` (matching `/api/github-stats`'s crawl), so only the owner's own repositories are ever enumerated. Caught in review before release. |

#### Private repository names withheld from the public payload

| | |
|:--|:--|
| **Ref** | [#20](https://github.com/MA1002643/theabdullahfolio/issues/20) |
| **Files** | — |
| **Details** | **Private repository names withheld from the public payload** ([#20](https://github.com/MA1002643/theabdullahfolio/issues/20), same route). Private repos are still crawled for skill **detection**, but each detection is attached to a disclosure-safe identifier that is `null` for any repo whose `isPrivate` is true — so a private repo's name never enters the per-skill `repos` lists or their `https://github.com/…` links (the skill still appears, just without naming the private repo). The `unstable_cache` key was bumped `github-skills-v2 → v3` so a stale pre-fix entry can't serve private names after deploy. |

#### Idempotency key hardened against a crafted header

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/app/api/send-mail/route.js` |
| **Details** | **Idempotency key hardened against a crafted header** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/app/api/send-mail/route.js`). The client-supplied `Idempotency-Key` arrives in a public, attacker-controllable request header, so it is validated against the exact shape the client emits and **namespaced** under a dedicated `contact:idempotency:` prefix before it ever becomes Redis key material — a malformed or malicious key can't write oversized/unbounded keys or reach keys outside its keyspace, and simply falls back to no-dedupe (fail open). |

#### Refine endpoint guards

| | |
|:--|:--|
| **Ref** | [#5](https://github.com/MA1002643/theabdullahfolio/issues/5) |
| **Files** | `src/app/api/refine-message/route.js` |
| **Details** | **Refine endpoint guards** ([#5](https://github.com/MA1002643/theabdullahfolio/issues/5), `src/app/api/refine-message/route.js`). The untrusted visitor message is wrapped in `<message>` delimiters with a system instruction to treat it as content, never instructions (prompt-injection guard); per-IP rate limiting, a request-body-size cap, and min/max message-length checks gate abuse before the model is called; the Gateway credential stays **server-only** (OIDC `VERCEL_OIDC_TOKEN` / `AI_GATEWAY_API_KEY`, never shipped to the client); and error logging records only `name` + `statusCode`, never the AI SDK error's free-text body, which can echo provider request/response content. |

---

## How to update this file

When opening a PR:

1. Add a new change table under the appropriate category in **[Unreleased]**,
   with a row each for **Ref**, **Files**, and **Details** (use `—` when a
   field does not apply).
2. Be concrete in **Files** — name the affected file, route, or component.
3. Link the closing issue in **Ref** with `[#NN](…)` so the entry is traceable.

When tagging a release:

1. Move the **[Unreleased]** content into a new versioned section dated
   `YYYY-MM-DD`.
2. Reset **[Unreleased]** to empty placeholders.
3. Tag the commit on `main` with the version (`v1.2.3`).

Trivial changes (typo fixes, comment clarifications, dependency patch
bumps) don't need a CHANGELOG entry.
