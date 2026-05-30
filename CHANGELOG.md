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

_Scope: changes shipped by the Repository Governance & Templates Suite ([#81](https://github.com/MA1002643/theabdullahfolio/pull/81), closing [#23](https://github.com/MA1002643/theabdullahfolio/issues/23)); the Experience Summary live-data feature for the about page (`#102` + `#106`, combined into `feat/experience-summary-combined`); and the Unify Page Titles refactor ([#104](https://github.com/MA1002643/theabdullahfolio/issues/104))._

### Added

- Shared `<PageTitle title subtitle id?>` component
  (`src/components/PageTitle.jsx`) consumed by every sub-page header,
  so the font sizes, neon stroke, and flanked pink-neon subtitle
  treatment can't drift per page. About, Projects, Contact, and
  Qualifications all render identical headings now ([#104](https://github.com/MA1002643/theabdullahfolio/issues/104)).
- `.elite-cta-text` / `.elite-cta-icon` utility classes in
  `src/app/globals.css` for the 404 page's TAKE ME BACK / About /
  Projects / Contact CTAs — faded warm-ember resting state, fire-amber
  gradient text + warm double-drop-shadow halo (and solid `#ffaa2a`
  icon stroke + matching halo) when the parent group is hovered or
  keyboard-focused, smooth 300 ms transition. Replaces ad-hoc
  per-CTA styling.
- First-visit em-dash placeholder for the Years in the Craft digit
  while `useExperienceSummary` resolves, so the slot never reads as
  "0 months of experience" on a true cold start. Returning visitors
  see their cached value instantly via the new localStorage hydration
  path (see _Fixed_).
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

### Changed

- Page-title treatment unified across `(sub pages)/about`,
  `(sub pages)/projects`, `(sub pages)/contact`, and
  `(sub pages)/qualifications` via the shared `<PageTitle>` component
  ([#104](https://github.com/MA1002643/theabdullahfolio/issues/104)). Per-page header markup,
  decorative inline dashes that flanked "WHO I AM" / "MY WORK", and
  per-page font-size drift (some pages used `text-[3rem] md:text-[3.5rem]`,
  others `text-2xl sm:text-5xl`) are gone in favour of the shared
  `text-[2rem] md:text-[3rem]` plus the flanked pink-neon `<h2>`.
- `.text-glow-stroke-neon` fill colour from `#000e1700` (near-transparent)
  → solid `#ff6d05` so wide-interior glyphs (M, W) on CONTACT ME /
  ABOUT ME render as filled orange shapes instead of outline-only
  letters with a visible interior gap. `text-transparent` dropped
  from `PageTitle` and `glowing-project-name` so the Tailwind utility
  doesn't override the new fill.
- Years in the Craft card and the Experience Breakdown modal now wear
  the same two-layer chrome as the Most Active Repository card —
  outer `custom-bg-abt` carries the amber `1px solid #ffcd5bcc`
  border + dark slate gradient + backdrop blur; inner wrapper carries
  `repo-card-breathe` for the pulsing orange halo on a slightly inset
  perimeter (`rounded-lg` inside `rounded-xl` / `rounded-xl` inside
  `rounded-2xl` respectively).
- `.repo-card-breathe` keyframe radii tightened: baseline `6 / 14 px`
  → `4 / 9 px`, peak `16 / 30 px` → `10 / 18 px`. Same hue and opacity
  stops, narrower spread.
- HomeBtn and ProjectsBtn hover tooltips wear `.custom-bg-abt` chrome
  (amber border, dark slate gradient interior, warm orange halo)
  instead of the previous grey `bg-background`. ProjectsBtn tooltip
  aligned to HomeBtn's responsive sizing
  (`text-xs sm:text-sm md:text-base`, `px-2 py-1 sm:px-2.5 sm:py-1.5`,
  `ml-2 md:ml-3`, `desktop-hover-only`).
- Empty-category sonner toasts on `/projects` and `/qualifications`
  shrink to content width
  (`width: fit-content; maxWidth: min(90vw, 28rem); alignSelf: center;
  marginInline: auto;`) and centre-align text on every viewport. Text
  colour standardised to `#ff6d05` to match the years digit.
- Project list typography normalised: name uses solid `#ff6d05`;
  description uses `.text-fire-amber`; the dashed divider between
  description and date uses `#ffaa2a`; the date keeps `#ff6d05`.
  Removed the `.text-shadow-neon-orange` class on the name + date so
  its `color: #f9d174` rule no longer overrode the Tailwind colour
  utility.
- Qualifications carousel title `<h3>` and Prev/Next buttons render
  with `.text-fire-amber` (gradient fill + warm halo). Picture wrapper
  carries an inline `background: '#00000020'` override so the
  qualifications photos sit on the prior transparent dark backdrop
  without touching the eight other consumers of `.custom-bg-abt`.
- Projects page category buttons re-styled to mirror the qualifications
  carousel tab treatment — orange `#ff6d05` neon glow when active,
  pink `#fc83ff` neon glow when inactive, brighter halo on hover,
  `<button>` semantics with `aria-pressed`.
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

### Fixed

- **Production employment 0%** on `/api/experience-summary` (preview
  deployments returned `pdfStatus: { message: "DOMMatrix is not
  defined" }` and an empty Employment side in the Years card and the
  Career Snapshot modal). Fixed by expanding `outputFileTracingIncludes`
  in `next.config.mjs` to glob both the root and the
  `pdfjs-dist`-nested `@napi-rs/canvas` JS shim *and* the
  `linux-x64-gnu` platform binary subpackage, plus pinning all
  transitive copies of `@napi-rs/canvas` to `0.1.80` via the
  `package.json` `overrides` field so `pdfjs-dist`'s runtime
  `createRequire(import.meta.url)("@napi-rs/canvas")` lands on a
  bundled file regardless of which install copy npm resolves.
- Years digit `Counter` and the Personal / Employment `PercentCount`
  in `src/components/about/index.jsx` could remain at `0` indefinitely
  because the parent `ItemLayout`'s `initial={{ scale: 0 }}` entrance
  collapsed every descendant's `IntersectionObserver` rect to zero
  area, so `useViewportCountTrigger`'s `playToken` never armed and
  the count-up early-return suppressed the animation. Both components
  now drive their animations directly from `(from, to)` / `value`
  effect deps with no viewport gate. Both honour
  `prefers-reduced-motion`. Bar segments inside `ExperienceSplitBar`
  swapped `whileInView` for `animate` for the same reason.
- `useExperienceSummary` (`src/hooks/useExperienceSummary.js`) now
  hydrates `data` from `localStorage` on mount. The hook already wrote
  the diff baseline there but never read it back as initial state, so
  returning visitors saw "0 months of experience" briefly before the
  network fetch resolved. Diff-message logic still compares the live
  payload against the same stored baseline before overwriting it.
- `/api/experience-summary` PDF parse timeout: the `Promise.race`
  setTimeout is now cleared in `finally` so the timer doesn't keep the
  serverless instance's event loop alive (or delay freeze) for up to
  `PDF_PARSE_TIMEOUT_MS` after every successful request. Mirrors the
  sibling `/api/github-stats` discipline.
- `FireInput` (`src/components/contact/FireInput.jsx`) `sync()` wraps
  `input.selectionEnd` in `try/catch`. Reading the property on
  `<input type="email">` throws `InvalidStateError` in current Chrome
  and Firefox; previously the throw propagated out of the input/scroll
  handler and stopped the gradient overlay from updating on the email
  field.
- Empty-category sonner toast on `/projects` and `/qualifications`
  persisted across route changes — the toast id is now tracked in a
  ref and dismissed on component unmount and on every category switch
  (including back-to-back disabled clicks), so navigating to the home
  page closes the message immediately.
- Contact form: tightened the gap between input fields and their
  required-field error messages (`Full Name is required!`, `Email is
  required!`, `Subject is required!`, `Message is required!`) —
  `marginTop: -0.25rem` on the Message error and `marginTop: 2px` on
  the other three so the messages no longer sit ~16px adrift of the
  input glow.
- Project detail title typography unified with the qualifications
  reference (`text-[2rem] md:text-[3rem]`). The cinematic bloom-ring
  and flicker animation on `GlowingTitle` are preserved.
- Duplicate `id="about"` on the projects page header (a copy-paste
  artefact from the about page markup) removed. No anchor link
  referenced it; the surviving `#about.text-glow-stroke-neon` compound
  CSS selector no longer matches anything under the new `PageTitle`
  structure regardless.
- `<input type="email">` error placement on the contact form no longer
  forces the message half-under the input shadow on every viewport.
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

### Removed

- Decorative `-` / `–` flanks inside the Qualifications and Contact
  page subtitle strings ("-accomplishments-" / "– get in touch –").
  The shared `<PageTitle>` now ships flank pills on either side of the
  subtitle, so the literal characters were doubling up.
- `useViewportCountTrigger` import from `src/components/about/index.jsx`
  after the `Counter` and `PercentCount` refactors stopped consuming
  it. `AnimatePresence` import from the same file as similar dead
  weight from earlier refactors.
- Stale root direct dependency on `@napi-rs/canvas@^1.0.0` from
  `package.json`. The version didn't satisfy any transitive
  consumer's range (`pdfjs-dist` wants `^0.1.80`, `pdf-parse` pins
  `0.1.80`) and only added install weight while masking the real
  resolution.

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
