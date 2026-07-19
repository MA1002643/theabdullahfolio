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

_Scope: the Repository Governance & Templates Suite; the Experience Summary live-data fix; the Unify Page Titles refactor; five About-page card overhauls (Most Used Languages, GitHub Stats, Completed Projects, Current Streak, and the Skills grid); the Contact Form submit-animation feature; and the route-wide editorial footer ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30)) — its live-location and project-metadata endpoints, guitar-string wordmark, and the "Stone Passage" page transition. Each change below is its own table — field labels on the left, full detail on the right._

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

### Changed

#### Sub-pages layout now anchors the shared footer

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

### Fixed

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

### Removed

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
