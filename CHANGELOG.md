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

_Scope: the Repository Governance & Templates Suite; the Experience Summary live-data fix; the Unify Page Titles refactor; five About-page card overhauls (Most Used Languages, GitHub Stats, Completed Projects, Current Streak, and the Skills grid); the Contact Form submit-animation feature; and the route-wide editorial footer ([#30](https://github.com/MA1002643/theabdullahfolio/issues/30)) — its live-location and project-metadata endpoints, guitar-string wordmark, and the "Stone Passage" page transition; the Now Playing live-Spotify widget ([#42](https://github.com/MA1002643/theabdullahfolio/issues/42)) with its data + one-time-token endpoints and the shared HoverHint tooltip primitive; and the site-wide sound control lifted out of the footer so the guitar track survives navigation; and the homepage hero's vection-drift fix ([#87](https://github.com/MA1002643/theabdullahfolio/issues/87)) — the calmed laptop float, the GPU-isolated title, the hero + glow-headline `prefers-reduced-motion` coverage, and the reading-order gold→ember fill shared by the About and contact prose; and the `/qualifications` certificate carousel's image-loading overhaul ([#84](https://github.com/MA1002643/theabdullahfolio/issues/84)) — eliminating the `(canceled)` `_next/image` requests, adding intent-based certificate preloading, and self-limiting card image sizes without a global optimiser cap; and the `/projects` list's project-detail intent warming ([#83](https://github.com/MA1002643/theabdullahfolio/issues/83)) made connection-aware, so it respects Save-Data / 2G; and the `/projects` category system made data-driven ([#27](https://github.com/MA1002643/theabdullahfolio/issues/27)) — tabs derived from the project data with a validated stored-filter fallback, the slower per-card reveal choreography, and the card text roles (`project-title` / `project-meta` / `project-separator-dot`) aligned with the About page's #14 amber, with the same tab derivation ported to the `/qualifications` parent/sub category tree; and the `/qualifications` cinematic water scene & centre-out card entrance ([#52](https://github.com/MA1002643/theabdullahfolio/issues/52)) — the crisp lantern-corridor background brought to life by a full-scene ambient video loop (rippling water, flickering lantern light), and the carousel's centre-out staggered entrance (banner second-beat included) replayed on every category switch; and the `/projects` unified fluid scaling system ([#50](https://github.com/MA1002643/theabdullahfolio/issues/50)) — every breakpoint jump on the page replaced by one CSS-computed `--fluid-scale` factor, delivered as a reusable opt-in `.fluid-scale` scope with `fluid()`/`fluidText()` helpers (`src/lib/fluidScale.js`) that any sub-page can adopt, and the project-card description made always-visible (ellipsizing instead of vanishing below 640px); and the `/contact` page adopted onto that fluid scale ([#9](https://github.com/MA1002643/theabdullahfolio/issues/9)) — the form container, floating-label/notched-outline field system, validation errors, refine + draft-restore + connection-status chrome, intro copy, and submit CTA all scaling continuously from 320px to 2560px+ with legibility floors, the SENDING… overlay re-measuring across mid-send resizes, and ≥44px coarse-pointer hit targets on the small text buttons; and the `/qualifications` page adopted onto the same fluid scale ([#53](https://github.com/MA1002643/theabdullahfolio/issues/53)) — the 3D certificate carousel's stage geometry re-expressed as a smooth `--carousel-t` morph between its old mobile and desktop endpoint sets, coverflow depth and `perspective` riding the factor together so the wheel's 3D composition is invariant while every real size breathes, all card/banner/button chrome scaled with legibility floors, the one-line title fitter re-deriving its now-viewport-derived base per fit, and the shared certificate `sizes` mapping rebanded so the morph can never under-declare a painted width; and the `/about` page adopted onto the same fluid scale ([#25](https://github.com/MA1002643/theabdullahfolio/issues/25)) — the section shell, grid gaps, hero heading + scroll-revealed paragraph, both feature-card counters, all four data-card headings, stat rows, SVG rank/streak/activity rings, the languages bar + list, the skills icon grid, the update banners, and every 10px eyebrow/legend scaling from one `--fluid-scale` factor via four scoped semantic classes (`.abt-card` / `.abt-title` / `.abt-micro` / `.abt-micro-md`) and inline `fluid()`/`fluidText()` rides, with the legacy breakpoint utilities kept in place as the out-of-scope base; and the maintenance-header Focus line made self-contained ([#94](https://github.com/MA1002643/theabdullahfolio/issues/94) follow-up) — every `topItems` record now carries its own repo attribution and GitHub URL, so Focus resolution no longer depends on the capped per-repo breakdown lists (which could leave the line link-less, or worse, number-collide into the wrong repo's item); and the project data's private-repo demo links defused — `auxo` and `clearway` (private repositories) now carry `demoLink: null` + `private: true` instead of repo URLs that 404 for every visitor; and the category fold's `ACRONYMS` lookup hardened against prototype keys — a `Map` instead of a bare object, so `normalizeCategory` always returns a string even for labels like `"constructor"`; and the About page’s completed-projects card promoted to an interactive trigger for the **Project Progress popup** ([#48](https://github.com/MA1002643/theabdullahfolio/issues/48)) — live per-project completion derived from each project’s GitHub Projects v2 board (per-column item counts via batched, paginated GraphQL over the `workTrackedRepos.js` repo→board join), a 12 h `unstable_cache` + CDN `s-maxage`/`stale-while-revalidate` freshness contract guaranteeing at least two syncs a day, a portfolio-wide completion donut with an item-weighted overall percentage, category bars from the now-shared warm palette (`PROJECT_CATEGORY_COLORS` moved to `src/lib/categories.js`), expandable per-project board pipelines (each board’s own columns) with public-board links, a live last-synced age, last-good `localStorage` persistence, a static structural fallback when GitHub is unreachable, and the full house dialog a11y baseline (focus trap, Escape/backdrop close, focus restoration, iOS-safe scroll lock); and the `/projects` backdrop rebuilt as a cinematic **workshop scene** — the native-2560×1440 WebP still (the 1024-px upscale PNG and its `blur-[0.4px]` crutch retired), all three fixed layers pinned to a shared `100lvh` backdrop rule, and the scene brought to life by an ambient flame-flicker video loop — **SceneVideo**, a seedance image-to-video pass generated from the exact still frame via the AI Gateway and loop-closed forward-only with ffmpeg, mounted behind the same reduced-motion / Save-Data / error gates as the qualifications water scene — then re-cut end to end: the arcane rug sigil replaced by the **MA seal** baked into the artwork through a fitted ground-plane homography, the scene regenerated in an **ignite-then-hold two-pass** that finally produced real candle chandeliers, the model's exposure ramp flattened numerically, and delivery split into a three-tier ladder (**full / embers / still**) with a 720p–1440p resolution ladder and tab-hidden pause — which also promotes the procedural **SceneEmbers** canvas out of the dead code it had been sitting in and into the Save-Data / low-power rung it was written for — plus the two artefacts that gave the loop away fixed (the lanterns' boiling interiors relit from the still's structure, and a seam traced to `xfade` never completing its blend and to x264 giving the loop's IDR a lower QP than the frame before it), and a craft layer over the top: a parked-when-idle **camera drift** driven entirely by two CSS custom properties, and the seal **igniting itself** once on arrival; and the `/projects` roster completed — `vigil` and `tailorhawk` (maintenance-header boards 4 and 5, until now card-less) added as the tenth and eleventh projects, closing the 11-tracked-boards-vs-9-cards gap against `workTrackedRepos.js`; and the About page's "Architect of Enchantment" word reveal re-anchored to complete before the paragraph's first line leaves the viewport; and the experience-summary resume parser taught the redesigned CV's stacked ALL-CAPS layout, restoring the employment side of the years-in-the-craft / Career-snapshot figures; and the years-in-the-craft card's count-ups un-stuck — an entrance/visibility feedback deadlock in `useReliableInView` (the hidden pose suppressed its own trigger) plus a StrictMode tween kill in `useViewportCountUp` for late-mounting, already-in-view counters; and the **homepage backdrop rebuilt as the flagship of the scene system** — the 39 KB near-empty murk plate replaced by a hero-composed 2560×1440 lantern causeway generated against a measured negative-space contract, brought to life by a procedural-only living layer (no ambient video on the site's LCP-critical entry route), given an arrival moment in which the causeway **lights itself away from the viewer** toward the vanishing point, a pointer-only camera drift, and an art-directed scrim whose middle band is deliberately the lightest so the vanishing mist rim-lights the floating laptop — with the four gates the two canvas layers on `/projects` had been missing (`visibilitychange` among them) lifted into one shared `useSceneGate` contract — then finished: the lake given real motion on a **three-tier water ladder** (a water-masked ambient loop, a zero-byte procedural shear, or the still), and the hero chrome reharmonised against the new plate, where measurement showed the ripple rings running at double the saturation of the scene's own firelight and the laptop's hover response was a 2px halo on a 490px element — then stilled and re-tuned in an owner-directed pass: the pointer-linked camera drift removed outright, the causeway's lantern posts handed back to the still plate (the water mask had been treating posts standing IN the lake as lake, so the model redrew them every frame at up to 58 temporal std while the stone held at 0.00), and the ripple rings plus the laptop's hover bloom moved onto the headline's own `#ff6d05` so the hero's chrome and its name read as one light source — and then the scene rebuilt again as a **WebGL resample of the plate** after the procedural water was reported as unconvincing: the row-shear tier withdrawn (its only clearly visible output was a compositing bug — painted rows landing at 0.99x plate against 0.90x for the rows it skipped, in bands that travelled with the wave), replaced by a shader that ripples the lake on the axis that actually carries the effect, shades it by facet tilt (displacement alone moved a smooth dark lake by a mean of 0.77/255), and spreads true perspective drizzle rings across it; then the procedural water rejected outright and the lake **filmed** instead — the withdrawn ambient loop restored on a re-derived verdict, re-masked from the rig's own geometry and cut further by the ghost map itself; the lantern flames moved by warping each lantern's own photographed flame rather than drawing over it, for none of the 1.8-5 MB /projects spends on the same effect; and the hero **reharmonised against the photograph** — a scrim stage well and edge vignette, a chroma-only baked plate grade, a real dark substrate under the nav ring's glyphs, and a contact shadow that grounds the laptop; and finally the causeway's lanterns **set alight with filmed fire** — the ambient loop's mask, which stopped at the lake, extended with a window around each of the eleven flames, so the page shows fire that burns (17.3 temporal std) instead of a warp of a frozen photograph (0.02), for +21 KB rather than the second megabyte the shader existed to avoid — the model's 51px lantern walk removed by re-registering each flame onto the wick the plate photographed, each flame closed on its own loop length against a fade budget derived from the clip's own motion, and the plate's own flames re-baked from the loop's first frame so the still-to-video swap lands under one frame of the fire's own movement; and the hero **re-framed for portrait phones**, where the same scene had been reading 51% brighter and half as deep — traced not to any mobile rendering path but to the aspect ratio itself (the same phone in LANDSCAPE measures within 2.8% of desktop), because `object-fit: cover` on a 16:9 plate shows a portrait viewport only the brightest central 25% of the photograph and crops away every dark framing element, so the backdrop layers now become a 65% band on portrait — which re-frames plate, video, glow rig and ignite together through the one box they share — carry a tone curve to restore the dynamic range a multiply mathematically cannot, and sit in a `100svh` shell so the bottom of the composition is no longer below the iOS toolbar — after which that band's `sizes` declaration was brought into line with it, so a portrait phone stops buying a srcset rung sized for the full-height box the plate no longer paints, and the hero's ripple rings were given back their presence at the two ends of the viewport range where measurement showed them reading as empty space — then given a third dial that lifts only their OUTER edge on phones, on the finding that the boundary the eye actually reads a ring by is the faintest stop in the whole gradient, with the value chosen as the largest one whose radial falloff stays strictly monotonic rather than the largest that looked bright; and the fluid-scale system's **iOS collapse** fixed — WebKit resolves a viewport unit passed straight into `atan2()` wrongly, which overshot `--fluid-max` and pinned `--fluid-scale` to its MAXIMUM (1.3, the widest-desktop scale) on phones instead of the 0.6 floor, rendering all four opted-in pages 2.17× oversized and overflowing them far enough sideways that iOS shrink-to-fit widened the visual viewport the homepage nav reads to pick its layout — repaired by registering the viewport unit as an `@property` `<length>` so it is computed to absolute px before the trig sees it, leaving all 56 scoped rules and 116 `fluid()` call sites untouched; and the `/projects` workshop scene's table candles given a little genuine life — the delivered loop's own flames measuring a temporal std of 1.9/255 against 0.2 at a no-flame control, sub-perceptual under the scrim, so each table flame's own filmed pixels are warped a touch per frame (scaled about the wick, leaning a whisper with height, brightness riding its body), at an amplitude deliberately an order gentler than a first attempt that was rejected as unprofessional: ~1.5px of travel rather than 14, lifting flame temporal std 1.88 -> 3.57 while leaving every hanging fixture bit-identical and the seamless loop seamless; and the `/projects` category filter demoted from a permanent `localStorage` preference to a one-hop session handoff, so opening the page shows the whole portfolio again instead of whichever tab a single past card click happened to pin; and the inter-page transition rebuilt as the **Ember Passage**, replacing the "Stone Passage" — the small near-black slab and its two-baked-image crossfade retired for a full-viewport swarm of ~90,000 GPU embers that lift off the page (nearest the point CLICKED first), flow through a warm-cored darkness, converge onto the MA monogram and hold it as a living constellation of firelight before blasting outward to reveal the destination — for no new asset bytes at all, on a sequence tightened from 2.1 s to ~1.6 s — and that passage **welded to the homepage headline's own colour**, with the shine and glow it asked for bought where they cannot cost hue: a two-lobe ember sprite with a glinting specular pinpoint and a bloom pool carried by the veil pass already being drawn, and — after a per-route destination palette was tried and rejected, then the mark measured rendering YELLOW and then too DEEP — the renderer itself split so the swarm accumulates BRIGHTNESS and the ink is multiplied through once at the end, which is what makes "the monogram is exactly the `#ff6d05` that MUHAMMAD ABDULLAH is written in" a property of the pipeline rather than a tuning; and the footer's guitar-string wordmark stopped coming back mis-shapen — plucked strings were being frozen mid-oscillation whenever the footer scrolled out of view, because the loop that erases a wave was cancelled without ever being restarted; and the two live-data endpoints behind the header and the Now Playing widget repaired after both were reported failing in the same terminal session — the maintenance header's Projects v2 read had outgrown its own 5 s timeout (eleven boards in one aliased query measuring 4.8–8.7 s, so the board signal was lost on most refreshes while the rate-limit line in the same log showed a perfectly healthy budget, the cost of that query being 1 point), now split into per-board paginated queries that also close a silent single-page truncation past 100 items, with the portfolio query's own too-thin headroom re-sized from measurement rather than left to tip over next; and `/api/spotify` returning 502 on every poll for as long as a rejected access token stayed cached — with a bare `catch { }` that made the status code the only evidence there was — now able to refresh and replay once on a 401, and to say what failed; and the Node-version guard extended from `dev` to the rest of the toolchain — `engine-strict` only enforces `engines.node` at install time and `dev.mjs` covered only the dev server, leaving `npm run build` (the command that leans hardest on the very webpack cache serialization the Node 25 V8 bug corrupts) running on whatever Node invoked npm, which for anything outside an interactive shell is Homebrew's v25; and the homepage's arrival ignite — the light that runs the causeway away from the viewer and blooms at the vanishing point — moved onto the headline's own `#ff6d05`, the last warm-yellow piece of hero chrome still off the name's colour; and the working tree swept before commit — the scene pipeline's 27 loose root-level scripts collected into `scripts/scene/`, the 19 of them pinned to dead per-session scratchpad paths (and four more to an ffmpeg binary inside one) given a single overridable work-dir contract so they can actually be re-run, three throwaway probes deleted, and the ungraded hero source moved out of `public/` where it was being deployed and served as a build input. and the homepage role line re-cut as a latent security engraving ([#11](https://github.com/MA1002643/theabdullahfolio/issues/11)) — "SOFTWARE ENGINEER" printed in three colour separations over a hairline guilloche ground that carries the words a second time as moiré, and revealed by coming into register, at exactly the size it already shipped at; and the homepage's arrival ignite withdrawn at the owner's request — the wavefront that ran the causeway and bloomed at the vanishing point is gone, leaving the baked plate and its living glow rig to carry the scene from the first frame. Each change below is its own table — field labels on the left, full detail on the right._

### Added

#### Homepage role line re-cut as a latent security engraving — printed in three colours, and revealed by coming into register

| | |
|:--|:--|
| **Ref** | [#11](https://github.com/MA1002643/theabdullahfolio/issues/11) (owner-directed: the issue asks for rose-gold glitter; the owner reviewed that direction in progress and rejected it, then reviewed a thermal-forge pass built in its place and rejected that too, and asked instead for a banknote-style latent engraving — then, on review, for more colour and for an arrival animation. Built, throughout, to work at the line's EXISTING size) |
| **Files** | **new** `src/components/home/HomeRoleLatent.jsx`, `src/components/home/homeRoleEngraving.js` · `src/app/page.js` · `src/app/globals.css` |
| **Details** | **The type is untouched, and that is the constraint the feature is built around.** Same four breakpoints (1rem / 1.2 / 1.4 / 1.6), same 300 weight, same 4px tracking, same `leading-snug` — verified on computed style at 1440 / 1024 / 768 / 390. The type is untouched; the SPACE above it is the one layout number the feature had to move, and it is measured below. At a 300 weight that is a **~1.4px stem**, which rules out every surface treatment there is (a bevel, an emboss, a reflection and a brushed anisotropy all need interior area to shade), so this effect asks for no stem area at all. "SOFTWARE ENGINEER" is printed like a value document: solid type over an engraved ground carrying the words a second time as a latent image. **Three colour separations** of one-device-pixel guilloche are superposed, differing by fractions of a percent in pitch and fractions of a degree in angle; where two coincide the ink covers one line, where they interleave it covers two in two colours, and that swing is a moiré fringe hundreds of pixels long over a field of 1px lines. The word is cut into the separations as a phase step in **thirds of a pitch, different for each ink** — the arrangement that maximally interleaves three line sets, so whatever the inks do outside the letterforms, inside them they are as far from coinciding as three sets can get. That step is the largest signal the physics offers and it costs nothing, but at this size it still asks a reader to lean in, so the word is also printed **half a turn around the hue wheel** from its ground and struck 1.3x harder. The split between those two was measured the hard way: hue adds no light, weight adds it directly under the printed line, and struck hard enough to read instantly (a gain of 0.85) it dropped every ramp stop from ~6.2:1 to **~3.2:1** — through the AA floor — because the latent's upper line passes behind the printed one. Legibility is therefore bought mostly in hue and only a little in weight, with the ramp's middle stops lightened to #bcd2ff / #ddccff and the ground's density dropped to 0.086 to pay for the rest. Colour is **iris printing** (Regenbogendruck): each ink samples a curated six-stop hue wheel at its own offset plus a sweep that advances across the plate, so the ink shifts continuously along the line — the hue is what the fringe is *made of*, not a gradient laid over it. One non-obvious number governs whether that reads as colour at all: spacing the three inks evenly around the wheel makes them **sum to neutral**, printing a perfectly correct grey field from three saturated inks, so they are clustered into a 0.16-turn arc instead — which is also what a split fountain does, since its inks are neighbours in the duct rather than opposites. **The arrival is the press coming into register.** The plate does not fade in: the separations land grossly misregistered (26 and −19 tilt units, ±5% pitch), beat against one another at a period of a few pixels, and converge on a damped oscillator that overshoots and rings into place. Because the moiré period goes as the reciprocal of the misregistration, that convergence makes the fringes rush outward and lock — chaos resolving into order — and the resting design is simply the converged end of the same curve, so there is **no crossfade and no seam** between arrival and idle. Around it: the sheet is blind-embossed before it is inked (`chroma` opens from colourless over 900ms), the three inks arrive 160ms apart and wipe in over 420ms each, the ink is held to 62% while the field is dense with misregistration so the arrival cannot flare, and the iris spins and settles. The printed line is struck last, at 76% of a 2960ms CSS animation, arriving **out of register itself** — two colour ghosts converging into the letterforms, the same event at a different scale. That animation is CSS rather than canvas on purpose: it is the only thing between the reader and an invisible heading, so it runs on the compositor, completes whether or not another frame is ever painted, and `both` leaves the line at full opacity forever after. **The printed line is never the latent line, structurally** — the `<h2>` is ordinary text, the canvas is a sibling *behind* it (`z-index: 1` on the heading) and never draws a pixel of the words meant to be read; a cleared reserve (printed glyphs dilated 0.1em) additionally keeps hairlines off that 1.4px stem. Cheap by construction: each separation's phase field is **separable**, Φ(x,y) = P(x) + Q(y), so a frame is O(W+H) trigonometry into lookup tables plus an inner loop with no transcendentals, and the inks resolve to one colour per column per separation — **59.9fps median through the reveal**, 3 long tasks in 13s including page load and plate build. Ink is specified as the plate's mean alpha and divided by the coverage its pitch produces, which holds the ground's tone steady as the grating changes between devices. Contrast measured against the backdrop **as shipped** (plate on, only the heading hidden, because a light ground lifts what sits under the type): brightest pixel 0.0733 at 1440x900 and 0.0751 at 390x844, giving every ramp stop **5.52:1 to 5.98:1** across both viewports. The plate is **centred on the printed line** rather than hung below it: the printed line sits in the gap between the two ghost lines, so a plate biased downward — as this one first was, 0.85em above the type against 1.6em below — puts the printed line almost on top of the upper ghost with a wide gap under it. Equal pads, and the ghost block hung explicitly from the type's own centre rather than the plate's, bring the gap above and below to within **0.4px** at every breakpoint and DPR. **Which is also why the line needed more headroom, and why a pixel value could not supply it.** Equal pads mean the plate cannot be trimmed on the top alone to fit, so it reaches 1.225em above the heading, and the canvas is absolutely positioned so none of that is reserved in layout. Against `mt-1` — a flat 4px, from when the line was type and nothing else — the plate's top edge landed **8px inside the hero name's ink** at 390px wide, printing hairlines under the bottom of ABDULLAH; the latent word's upper line sat right behind it. The margin moves to `.hero-role` as **`margin-top: 1.3em`**, stated in the role line's own em so it tracks the plate rather than the viewport. That is the whole fix: the name above sets `leading-none` and so gives only **0.149 of its font size** as descender slack, and the name-to-role ratio is not fixed (2.6x at the base breakpoint, 3.125x at `lg`), so a pixel value can be right at exactly one size — which is why the overlap read worst on a phone, where the name is smallest relative to the line. Measured clear air between the name's ink (stroke included) and the plate's top edge: **8.9px at 320 / 390 / 430, 10.0 at 700, 13.3 at 900, 16.9 at 1280 / 1440 / 1920** — 0.52–0.66em of the role line at every width, and 13.9–23.9px to the plate's first visible row of ink. Under `prefers-reduced-motion` the plate still prints — exactly **one** frame, fully registered and phase-aligned to maximum latent contrast, bit-identical after 2.5s, with the heading at full opacity and the strike class never applied. `text-glow-stroke-purple` loses its last consumer and is now dead (kept, and flagged as dead in the README). No new dependency, no new asset, no WebGL context |


#### `.nvmrc` — the supported Node version pinned in the repo

| | |
|:--|:--|
| **Ref** | — (owner report: repeated ".nvmrc not found, using the current version of Node" on every editor reload) |
| **Files** | **new** `.nvmrc` |
| **Details** | The repo declared `engines: ^22.3.0 \|\| ^24.0.0` but carried no version file, so nothing outside `package.json` could act on it — version managers and editor tooling fell back to whatever Node happened to be first on `PATH`, which on this machine is Homebrew's Node 25 (outside the supported range, and the reason `~/.zshrc` hard-codes an nvm path in front of it). `.nvmrc` pins `22.14.0`: inside the declared range, and the exact build already installed, so `nvm use` resolves it without a download. |


#### "Ember Passage" page transition — the page disintegrates into a swarm that reassembles as the mark

| | |
|:--|:--|
| **Ref** | — (owner-directed replacement of the "Stone Passage" transition shipped under [#30](https://github.com/MA1002643/theabdullahfolio/issues/30)) |
| **Files** | `src/components/pageTransition/EmberPassageOverlay.jsx`, `emberSwarm.js`, `emberSwarmShader.js`, `emberField.js`, `constants.js`, `PageTransitionProvider.jsx`, `TransitionLink.jsx`, `src/components/emblem/monogram.js` (comment) · **removed** `StonePassageOverlay.jsx`, `SigilOverlay.jsx` (the latter already dead — nothing imported it), `public/textures/rock/ma-slab-{plain,carved}.webp` (219 KB, now orphaned) |
| **Details** | **Why the old one went.** The Stone Passage rendered a ~33rem slab in a near-black void and "engraved" it by sliding a stroke mask over a CARVED photo laid on a pixel-identical PLAIN one. Both baked textures are charcoal-on-black, so the reveal was near-invisible; more fundamentally a mask can only uncover light already baked into the pixels, which is why no easing made it read as cutting. A first replacement (a WebGL wall of basalt columns with a live signed-distance carve) fixed the mechanism but failed the more important test: **it did not look like this site.** The site is built almost entirely from GLOWING LIGHT ON NEAR-BLACK — the hero is a neon tube sign, the sub-heading is magenta neon, every nav icon is a neon ring, the project cards are neon capsules — and a matte, unlit, grey mineral surface shares nothing with any of it. **What replaced it.** One continuous gesture, driven by a single 0..1 scalar. *Lift*: the page comes apart into ~90,000 embers, the ones nearest the point the visitor CLICKED lifting first, while a warm-cored radial darkness closes over the route swap. *Converge*: the swarm flows inward on a decaying curl and lands on target points sampled uniformly over the monogram\'s AREA (outline sampling was rejected — it reads as a wire frame, and gives no inside/outside information, so stray embers fill the counters of the M). *Hold*: the mark burns as a living constellation, each ember jittering on its own phase, so it reads as a swarm holding a shape rather than a still image of a logo; `router.push` happens under this, and a slow route simply parks here instead of showing a spinner. *Scatter*: blown outward from the mark\'s centre, the destination already behind them. **The architecture is the point.** Nothing is simulated: an ember\'s position at any moment is a PURE FUNCTION of `(start, target, seed, t)` evaluated in the vertex shader. That removes the ping-pong float-texture GPGPU pipeline the effect would normally need — with it the `OES_texture_float` dependency and its mobile precision problems — reduces the whole swarm to ONE draw call over a static buffer uploaded once, and makes the animation deterministic and instantly seekable, so a dropped frame never accumulates error. A second pass redraws a 34% minority much larger and much fainter as a cheap bloom. **Colour** is measured, not eyeballed: additive blending stacks ~90k sprites over a mark a few hundred pixels wide, so a hot end anywhere near white clips every channel and the monogram desaturates to cream — the one colour the site never uses — hence a hot end that stops at warm amber and a core-pass alpha under 1.0, with a ~6% magenta minority tying back to the site\'s secondary neon. The destination name is DOM text carrying `.text-glow-stroke-neon` — the very utility the HOMEPAGE HERO NAME uses — with the hero\'s own inline transparent fill (`#000e1700`), so the hollow `#ff6d05` tube and the three-layer `drop-shadow` halo are shared rather than re-approximated. The one value that cannot be copied verbatim is the stroke WIDTH: the hero carries 3px at 42-80px type (~3.75% of its size), which at label size is wider than the letter stems, filling the tube solid and reading as an orange smudge — so it is scaled to hold the same proportion, and the look matches even though the number does not, and it rides the SAME uT scalar as the swarm rather than a wall clock — it fades up as the embers converge into a legible mark and fades out as they scatter, arriving from below with them and lifting away with them. That coupling is load-bearing, not cosmetic: driven by a timeout the label could only ever be STARTED, never ended, so the name outlived the mark and was still burning on the destination page after the embers had gone. Expressed in uT it also behaves correctly when the gesture STALLS at the hold point waiting for a slow route — it simply holds lit, exactly like the mark it labels. **Cost**: no video and no new image assets — the targets are sampled from the existing `MONO_D` outline during idle time, in a separate idle slice from the shader compile so neither blows the ~50ms an idle slice should use. The GL context, both programs and the ~2.5 MB of static vertex data are a module-level singleton warmed after first paint and re-parented into each overlay, so every navigation after the first draws on frame one. **Responsive**: the mark is sized off the short viewport edge then capped independently against width (82%) and height (60%) — both matter, since on a landscape phone the short edge is the HEIGHT, so a short-edge rule alone would run the square past the left and right edges; ember travel, point size and the label\'s tracking all scale with it, the last because QUALIFICATIONS at desktop tracking overflows a 390px phone and `whitespace-nowrap` cannot wrap out of it. Phone ember count is tuned for matched BRIGHTNESS rather than matched count, because a phone gets both a smaller mark and a smaller point size and a naive proportional count renders visibly dimmer. **Accessibility / fallback**: `prefers-reduced-motion`, no WebGL, or a failed field build all take a static branch — the mark at rest, a plain cross-fade — and never create a GL context; a lost context demotes every later navigation to it automatically. |


#### Ember Passage burns the homepage headline's own colour — one ember, and a renderer that cannot shift hue

| | |
|:--|:--|
| **Ref** | — (owner-directed follow-up to the "Ember Passage" entry above) |
| **Files** | **new** `src/components/pageTransition/passagePalette.js` · `emberSwarmShader.js`, `emberSwarm.js`, `EmberPassageOverlay.jsx`, `PageTransitionProvider.jsx` |
| **Details** | **One colour, and it is the hero's.** The monogram and the destination name under it are `#ff6d05` — the `-webkit-text-stroke` `.text-glow-stroke-neon` paints MUHAMMAD ABDULLAH with — and the label carries that utility's own three-layer `drop-shadow` halo by INHERITANCE rather than by copy, keeping the hero's inline transparent fill (`#000e1700`) so it stays a hollow neon tube. The one value that cannot be copied verbatim is the stroke WIDTH: 3px at the hero's 42-80px type is ~3.75% of its size, which at label size is wider than the letter stems and fills the tube into an orange smudge, so it is scaled to hold the same proportion. A per-route palette keyed to the DESTINATION was tried first and rejected — it made the mark a different object on every navigation — and the ~6% contrasting-hue spark minority went with it, since a minority burning another colour is visible as exactly that, foreign specks inside a monogram meant to be one colour. **Why the colour needed the RENDERER changed, not tuned.** Drawing ~90k additive sprites in colour cannot hold a hue at these densities, for two independent and separately measured reasons. *Clipping*: sprites overlap dozens deep inside the glyph, so red reaches 1.0 long before the stack finishes while green keeps climbing behind it — the body of the monogram measured (255, 255, 10), flat YELLOW, while its sparse edges stayed orange. *Quantisation*: the framebuffer is 8-bit and every add rounds to 1/255, and it is the SMALL channels that round away — probed in isolation, 100 additive draws of this ember at the bloom pass's alpha land on (100, 0, 0), pure red, where the ratio says (100, 43, 2). Green never accumulates at all, so lowering the alphas to stop the clipping simply moved the mark from too yellow to too deep (measured G/R 0.32 against the ink's 0.427) and no uniform value could fix it. **The split.** The veil and the swarm no longer draw in colour: they accumulate BRIGHTNESS — one channel, 0..1 — into an offscreen RGBA8 field, and a third fullscreen pass multiplies the ink through it once. Both failure modes go with it, because there is now a single channel to clip (over-driving costs the mark's TEXTURE, never its hue) and the ink rounds once against a finished value instead of ninety thousand times. Everything the overlay can paint is `#ff6d05 × brightness`, which makes the colour a property of the pipeline rather than a tuning. The palette collapses accordingly: what was two colours plus an accent is now one hex and two LEVELS (a loose ember burns at half a landed one; the veil at 5.5%), since the cool and hot ends were only ever the same ember at two brightnesses. The specular pinpoint survives as brightness rather than a lift toward white — white being all three channels at once was itself a steady deposit of green and blue into the glyph. Alpha stays with the veil alone: an ember is light, and light does not occlude the page it falls on, so during the scatter the swarm brightens the destination instead of punching holes in it. **Measured on the shipped build**, mid-transition in a real browser: the mark renders G/R 0.427 against `#ff6d05`'s own 0.427 (5th-95th percentile 0.422-0.432, i.e. ±1 quantisation step), and in a single reduced-motion frame where the overlay and the homepage headline are both visible, monogram and headline measure the same ratio. The reduced-motion branch reports `fill: #ff6d05`, the hero's exact filter, and a transparent-filled label with a `rgb(255, 109, 5)` stroke. |


#### Interactive Project Progress popup (completed-projects card)

| | |
|:--|:--|
| **Ref** | [#48](https://github.com/MA1002643/theabdullahfolio/issues/48) |
| **Files** | `src/components/about/ProjectProgressPopup.jsx`, `src/app/api/project-progress/route.js`, `src/hooks/useProjectProgress.js`, `src/components/about/index.jsx`, `src/app/data.js`, `src/lib/categories.js` |
| **Details** | **Project Progress popup** ([#48](https://github.com/MA1002643/theabdullahfolio/issues/48)). The passive "Projects shipped" counter card is now a `role="button"` trigger (Enter/Space, `aria-haspopup`, category split folded into its accessible name, the years card's "View progress →" hover affordance) that opens a live delivery-telemetry dialog. **Data**: every project in `data.js` gained a `repo` field; the `/api/project-progress` route reads every project's **Projects v2 board** — repo→board joined through `projectNumber` in `workTrackedRepos.js`, the same mapping the maintenance header uses, so the two surfaces can never disagree about whose board is whose — in batched, aliased GraphQL (every unfinished board per round, paginated at 100 items/page under one 8 s abort budget; the largest live board, AfaaqX at 169 items, takes two rounds), counts items per status column (each board's OWN column set — Todo/In Progress/Done vs Backlog/Ready/In review/…/Done — in the board's own order, empty columns and unset-status items included), computes per-project `Done/total` percentages and an **item-weighted** portfolio percentage (134 of 831 items at verification — a plain mean would let a 36-item board average away a 169-item programme), and caches 12 h via `unstable_cache` + `s-maxage=43200, stale-while-revalidate` — at least two fresh syncs a day. The board, not the repo issue list, is the delivery source of truth: it carries PRs and draft items the issue list never sees (ma.codes: 138 board items vs 69 repo issues), and its Done column is what "complete" actually means on these boards. On upstream failure it degrades to a static structural payload (`_fallback`) built from `data.js` alone — category breakdown intact, projects marked "sync unavailable", never a blank dialog. **Client**: `useProjectProgress` fetches at page mount (the dialog opens warm), re-polls every 12 h, hydrates from a `project-progress:lastGood` snapshot, and never lets a fallback payload overwrite live data. **Dialog**: mirrors the Experience modal's chrome 1:1 (focus trap, Escape/backdrop close, focus restoration, iOS `position:fixed` scroll lock, `dvh` sizing, foreground-return scrollbar repaint) with a gold→ember gradient completion donut, per-category share bars, and per-project rows — a mini completion ring whose colour rides a warm heat ramp (the hotter, the closer to done: tan → gold → amber → ember at ≥80%), a private-repo padlock, and a disclosure panel with a per-column board pipeline (Done first, then most-advanced-first, each segment redrawn 0 → share on every viewport entry — the category bars' once:false replay), a legend in the board's own column order, and a "View project board →" link (server-verified public boards only — the no-dead-links rule). The row list is an accordion — expansion is parent-controlled, so opening a row closes its sibling and the hover tint answers only CLOSED rows (an open row is already the active focus of the list); both the category and per-project lists cap at ~5 rows and scroll WITHIN themselves past that (house thin ember scrollbar, kept inside the rounded corners by giving the radius to an overflow-hidden shell around the scroller — the dialog's own wrapper trick), keeping the dialog one calm height however the data grows; on phones the two hero counters sit side by side split by the vertical `elite-divider-v` (stacked under the ring they read as a totem), sm+ restoring the stacked layout and horizontal rule — and the Career snapshot modal's Personal-Projects / Employment category blocks (`ExperienceBreakdownModal.jsx`) adopt the identical phone split beside their donut, desktop untouched; rows self-reveal individually (whileInView, once:false — a parent stagger would pre-reveal rows below the inner list's fold) and each row's mini ring re-sweeps on every viewport entry, twinned with its pipeline bar; every figure in the section — row percentages, column counts, totals — counts up on viewport entry via the shared `AnimatedNumber`; and the footer's sync age ticks live on the maintenance header's adaptive cadence (per-second under an hour, self-rescheduling timeout) with its digit grammar — digit runs in flat ember, units in the footer colour. Untracked rings render as bare track: "couldn’t measure" is never drawn as 0%. Reduced motion no-ops every reveal/ring/expand animation. |


#### vigil and tailorhawk project cards (`/projects` roster completed)

| | |
|:--|:--|
| **Ref** | — (no tracking issue; closes the roster gap against the [#94](https://github.com/MA1002643/theabdullahfolio/issues/94) tracked-repo list, feeding the [#48](https://github.com/MA1002643/theabdullahfolio/issues/48) popup) |
| **Files** | `src/app/data.js` |
| **Details** | **Roster cross-check**: the maintenance header tracks 13 repos (`src/utils/workTrackedRepos.js`), 11 of which carry a Projects v2 board, while `projectsData` held 9 entries — `vigil` (board 4) and `tailorhawk` (board 5) were feeding live header signal with no card on `/projects`. Both added, description and category derived from each repo and its open issue board per the auxo/clearway recipe. **vigil** (67 open issues): "Automated hourly check-in calls" — the repo's own phrasing — category **Mobile** on the auxo precedent: React Native is the board's *only* delivery target (TestFlight/Play distribution, store listings + submission, mobile crash reporting, WCAG 2.2 AA), with the server-mediated telephony engine (PSTN placement, DTMF PIN entry, IVR/voicemail detection, outcome state machine) and the PIN-custody security cluster as supporting layers; not System, which the dhun/plenary precedent reserves for multi-target platform scope. **tailorhawk** (52 open issues): "AI-powered job discovery & tailoring" — category **AI** on the culina/colophon precedent: the description and every repo topic (`ai`, `ats`, `cv`, `job-search`) lead with AI, and the board's defining engines are AI end to end (repository-analysis, matching/scoring with a documented ranking rubric, ATS-optimised CV rewrite, LinkedIn rewrite, token-spend tracking + daily cost ceilings), cross-platform delivery being the shell. Both repos are **private** → `demoLink: null` + `private: true` (the no-dead-links rule); dates = repo creation (2026-07-25, both). Everything downstream derives: the `/projects` tabs now count Web 2 / System 3 / AI 3 / Mobile 3 across 11 cards, the Project Progress popup's batched GraphQL query grows from nine to eleven aliased boards, its item-weighted portfolio donut re-weights automatically, and both new rows render the private-repo padlock with no board link (private boards). |


#### Architect-of-Enchantment reveal completes before its first line exits

| | |
|:--|:--|
| **Ref** | — (follow-up on the [#45](https://github.com/MA1002643/theabdullahfolio/issues/45) A2 word reveal) |
| **Files** | `src/components/about/index.jsx` |
| **Details** | The scroll-scrubbed 185-word reveal's completion anchor moved from the paragraph's BOTTOM passing 20% of the viewport to its TOP approaching the viewport top: progress hits 1 while the first line still sits ~15% down the screen, so the whole paragraph is lit before any of it scrolls away (previously a tall paragraph's last words only lit ~160px of scroll after line 1 had already left). The scrub floor drops from half to a third of a viewport — still a watchable wave, and small enough that the floor can never push completion past the first-line exit for this placement. Verified at stepped scrollY: mid-scrub keeps the per-word gradient (first word at 1, last at 0); with the first line 62px from the top all 185 words read opacity 1. |


#### Years-in-the-craft card stuck at 0 — two count-up trigger bugs

| | |
|:--|:--|
| **Ref** | — (regression report: card read "0+ years" with the API healthy at "4+ years") |
| **Files** | `src/hooks/useReliableInView.js`, `src/hooks/useViewportCountUp.js` |
| **Details** | Two independent faults kept the card's counters at 0 while its `aria-label` (same variable, no animation) correctly said "4+ years". **(1) Entrance/visibility deadlock**: the card's entrance variants are driven by the very visibility ratio `useReliableInView` measures on the SAME element — and the entrance's hidden pose (`y: 56`, scale .97) shifts the card down far enough that a card resting just above the 0.5 threshold measures ~0.24 while hidden. The trigger never fires, so the pose never lifts: a self-sustaining lock (measured live: 11 s at ratio 0.24 / opacity 0) broken only by a real scroll. The hook now un-applies the element's OWN transform (via its computed `DOMMatrixReadOnly`) before computing visibility — the entrance can no longer feed back into its own trigger — while ancestor transforms are deliberately kept, so the intro loader's scale-0 outer wrapper still gates entrances from playing unseen. **(2) StrictMode tween kill**: the years Counter is data-gated, so it mounts LATE — at a moment `inView` is already true — and its first effect pass starts the tween immediately. Dev StrictMode's simulated unmount then runs the cleanup that stops the tween at ~frame 0, and the second pass reads `armedRef=false, lastToRef===to` ("already played") and declines to restart — digit frozen at 0 until a full scroll-away re-arms (the sibling Projects-shipped counter escaped by mounting early with `inView` false and animating on a later prop flip). The unmount cleanup now RE-ARMS the latch — free on a real unmount (refs die with the instance), and exactly what makes the StrictMode re-mount replay. Verified on a fresh load with zero interaction: 4+ years / Personal 69% / Employment 31% count up at scrollY 0, Projects-shipped 11 unaffected. |


#### Resume parser taught the 2026 CV layout (employment side restored)

| | |
|:--|:--|
| **Ref** | — (the [#17](https://github.com/MA1002643/theabdullahfolio/issues/17) employment source; the CV redesign broke extraction) |
| **Files** | `src/utils/experience/pdfExperienceParser.js` |
| **Details** | The redesigned CV sets section headings in ALL CAPS and stacks each role across two lines ("DevOps Engineer FEB 2026 – MAY 2026" over "C365Cloud • Wakefield, UK"), so the old single-line "\<title\> – \<company\>, \<location\> (\<range\>)" matcher found nothing and the employment side silently read 0 months. The Experience block anchor now accepts EXPERIENCE/Experience (the required leading newline keeps "ADDITIONAL EXPERIENCE" from matching), every section terminator carries both casings (matching stays case-SENSITIVE so mid-prose words on wrapped lines can't end the block early), and a new stacked two-line matcher reads title + date range + company — requiring line 1 to END with the range, which also rejects the page-footer artifacts the PDF's text layer leaves mid-block. The legacy single-line matcher stays as an either/or fallback so re-exporting from the old template degrades to the previous behaviour instead of blanking employment. Date tokens needed no change — `parseResumeDateToken` lowercases, so "FEB 2026" / "PRESENT" already parse. Verified end-to-end via `/api/experience-summary`: DevOps Engineer @ C365Cloud (3 mo) + Software Engineer (Industrial Placement) @ Unisys (15 mo) = 18 months employment, the years card's total re-deriving to "4+ years". |

| | |
|:--|:--|
| **Ref** | — (no tracking issue; sibling of the `/qualifications` water scene, [#52](https://github.com/MA1002643/theabdullahfolio/issues/52)) |
| **Files** | `src/app/(sub pages)/projects/page.js`, `src/components/projects/SceneVideo.jsx`, `src/components/projects/SceneEmbers.jsx`, `src/app/globals.css`, `public/background/project-bg.webp`, `public/background/projects-flames.mp4` |
| **Details** | **Cinematic workshop scene** (`src/components/projects/SceneVideo.jsx`). The `/projects` backdrop is rebuilt on the `/qualifications` scene architecture ([#52](https://github.com/MA1002643/theabdullahfolio/issues/52)). **The still**: `project-bg.webp`, a native 2560×1440 WebP (529 KB) of the enchanted-forest workshop, replaces `project-bg.png` — a 1.36 MB 1024×576 upscale whose softness the old `blur-[0.4px]` existed to hide; the blur crutch is gone, `alt=""` marks the image decorative for assistive tech, and `sizes="max(100vw, 178vh)"` declares the real object-cover painted width in both crop regimes (the qualifications backdrop's srcset fix). **The layers**: the still (−z-50), the scene video (−z-[45]) and the black/70 dimmer (−z-40) now share one `.projects-backdrop` rule — `globals.css` extends the `.qualifications-backdrop` selector rather than duplicating it — `100lvh`-pinned with a `100vh` fallback so the mobile URL bar collapsing can never resize the layers and re-zoom the cover crop. **The video** (`SceneVideo`): the frame comes alive with the real thing — `projects-flames.mp4` (**2560×1440** @ 24 fps, 1.88 s seamless loop, H.264 High yuv420p CRF 20 preset-slow `+faststart`, silent, 5.7 MB), image-to-video by `minimax/minimax-h3` through the AI Gateway **from the still itself**, prompted locked-camera so the only motion is the lantern/candle flames and drifting motes. **Resolution is the whole game**: a first pass at 1080p (`bytedance/seedance-v1.5-pro`) read as blur against the native-1440p poster — a browser upscale on top of the model's own softening of exactly the detail the scene is made of (lantern filigree, glass panes, chandelier crystals). Generating AT the still's resolution fixed it at effectively the same weight (3.8 MB vs 3.4 MB for 1.78× the pixels — flame grain, not sharpness, is what costs bitrate here). Two candidates were raced: the Gateway does **not** support the `resolution` option for KlingAI (asked 4k, returned 1280×720), so MiniMax H3's true 2K won. **Three corrections make it usable**, all measured rather than eyeballed. (i) *Exposure drift*: the model ramps the whole frame's brightness over the clip (YAVG 52.9 → 70.7, +34%), which would pulse once per cycle and drift off the poster — cancelled with a time-ramped gamma (`eq=gamma='1-0.0357*t':eval=frame`; gamma, not a brightness offset, so the forest shadows can't crush), leaving a seam continuous to ~1%. (ii) *Dead flames*: a 2K-capable model buys its sharpness with motion — minimax flickers at roughly a third of the 1080p pass's amplitude (candle-region inter-frame delta 0.418 vs 0.552/1.168), enough that the fire stops reading as fire. Prompting could not close it: an over-tight stillness lock ("nothing brightens or dims", written to stop the rug-rune) froze the flames outright at 0.162, and rebalancing to constrain **position only, never light** recovered just 0.418. Nor could a different model — `google/veo-3.1` renders true 4K with abundant motion (8.66) but dollies the camera in regardless of how the lock is phrased, which also breaks the poster match. So the flicker that *is* there gets amplified: a **temporal unsharp mask** (subtract a 7-frame moving average, add the difference back at 2.2×) restores the old feel — static pixels have `A≈B` and are untouched, so no motion is invented and the camera cannot drift. Verified in-page from a canvas sample of the playing element, not just on disk. (iii) *Depth and spill*: a bloom pass thresholds the highlights, blurs them and screens them back, so every flame throws light onto the wood, brass and moss around it — and because the mask follows the flames, the spill flickers with them. It must be done in RGB: masking luma while leaving chroma alone lights every dark pixel with its own colour and turns the whole scene magenta. The encode holds CRF 20, having learned that CRF 26 quietly smooths the flicker back out (candle-region motion 1.03 → 0.63); at a 1.88 s loop that still fits in 5.7 MB. And the **poster is exported from the video master itself** (`project-bg.webp`, frame 0 of the pre-encode clip): an i2v pass re-renders fine detail — 27 dB PSNR against the image it was fed — so any independently-authored still visibly pops at the swap. **The loop is searched, not assumed** (`scripts/scene/find-loop-point.mjs`, verified by `scripts/scene/seam-check.mjs`). The qualifications treatment — crossfade the clip's own tail into its own head — bridges two moments five seconds apart, and over five seconds the model quietly morphs candle geometry, so the dissolve shows the candles doubling and reassembling on every cycle: the scene visibly rebuilds itself and announces that a video is looping. Instead the finish script searches every in/out pair for the two moments that already match, scoring both appearance (mean squared luma) and motion direction (a matching still frame whose flames are travelling the other way still snaps), and mildly preferring longer loops. That found a pair scoring **93 against 648 for the clip's own ends — 7× closer** — and close enough in time that only the flames differ, never the candles. Two counter-intuitive details finished the job: a **longer** crossfade is smoother, not more dissolve-y (during a fade each frame moves 1/F of the way across the mismatch, so per-frame error falls as F² — at 16 frames it lands under the clip's own natural frame-to-frame motion), and the output needs **one extra frame** past the fade, because xfade's last in-range frame is only (F−1)/F across and cutting there leaves a slice of the outgoing shot in the final frame. That single frame took the wrap-around from 8× a normal frame step to **2.6 against a 2.9 maximum — the seam is now smaller than the clip's own largest natural step**, and a browser canvas sampled across a full cycle finds zero motion spikes. Forward-only throughout: no palindrome, the flames always burn forward. Recipe hardening: this ffmpeg build's `xfade` wedges near-idle whenever its second input EOFs before the transition window (every single-pass graph stalled at output frame 30, ~0.006× realtime, regardless of encoder), so `scripts/scene/finish-projects-scene.sh` splits head/body into near-lossless intermediates, `tpad`-clone-pads the head past the transition end and `-t`-caps the output at 4 s. Mount gates mirror the qualifications sibling: never under `prefers-reduced-motion` or Save-Data, the fetch deferred past the intro-loader reveal (`preload="metadata"`), decode/network error unmounting back to the still.

**The scrim** (`.projects-scrim`): the flat `bg-black/70` dimmer is replaced by an art-directed one. A flat wash has to be dark enough for the worst case — text over the brightest part of the art — and then spends that darkness everywhere, including the wide margins where nothing but the scene lives; stacked under a 70%-opacity backdrop it left ~21% of the artwork's light, which is legible but murky, and the detail the 1440p pass was generated for never reached the eye. The replacement is a percentage-radii ellipse — opaque behind the centre column, falling to 42% at the edges — so it re-aims itself per viewport: on a phone it covers essentially the whole screen (the reading column **is** the screen), while on a wide desktop the outer lanterns and canopy stay vivid. With the backdrop opacity lifted 0.70 → 0.88 the centre still reads at ~23%, the level the copy's contrast was checked at, while the periphery more than doubles to ~50%. **The embers** (`SceneEmbers`, built first for this slot and retained in-tree unmounted as the zero-network alternative): a fixed `<canvas>` in that sandwich's video slot (−z-[45], the still's own `opacity-70`) repaints the artwork's ~30 light sources as additive radial glows. Enclosed hanging lanterns breathe slowly, their intensity riding two-octave seeded value noise (a slow breath plus a 3.1× shimmer — a plain sine reads as mechanical pulsing within seconds); naked table candles flicker faster and deeper, alpha shaped `n^1.3` so their troughs land on the **untouched** still (the flicker stays anchored to the artwork's own light, never net-brightening it); broad low-alpha pools swell over the three tables and the rug; and 16 dust motes drift up the central light shaft on sine-swayed paths under sinusoidal fade envelopes. Every source is authored in the image's normalised 2560×1440 space and projected each frame through re-derived `object-fit: cover` + center math, so the glows stay glued to their lanterns in both crop regimes (width-bound landscape, height-bound portrait) and across mobile URL-bar states. Cost control: dpr-1 buffer, ~30 fps throttle, ~30 gradients per frame. Gates: never mounts under `prefers-reduced-motion` (the still **is** the page) and starts only past the intro-loader reveal; there is deliberately no Save-Data gate — that flag guards network spend, and this layer costs none. |


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
| **Details** | **Completed Projects category breakdown** ([#16](https://github.com/MA1002643/theabdullahfolio/issues/16), `ProjectsSplitBar` in `src/components/about/index.jsx`). A two-segment proportional bar (Web / System, grouped from each project's `category`) with an `aria-hidden` animated fill that re-fires on viewport entry, a responsive count legend (stacked below `sm`; PAIRED side-by-side rows from `sm` up — the `#ff6d05` `\|` divider renders only inside a pair and a `basis-full` break forces each pair boundary onto a new line, so four categories read "Web \| System" over "AI \| Mobile" instead of wrapping wherever accumulated width breaks; an odd trailing category falls back to a lone full-width row), and raw per-category counts driven by the card's count-up. The grouping is computed once at module scope as `PROJECT_CATEGORY_BREAKDOWN` from the static `projectsData`, so adding a project to a category (or a brand-new category) updates the count, colour, legend, and a new `\|`-separated entry automatically. |

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

#### Homepage hero re-framed for portrait phones — the crop was the cause, not the rendering

| | |
|:--|:--|
| **Ref** | — (owner report: on an iPhone 16 Pro Max the background "renders noticeably brighter and flatter than it does on desktop", so "the navigation buttons and the laptop read as separate elements pasted on top of a bright backdrop") |
| **Files** | `src/app/globals.css`, `src/app/page.js` |
| **Details** | **It is the aspect ratio, and one measurement proves it**: the same iPhone in LANDSCAPE composites to mean luminance 16.6 against the desktop's 17.0 — a 2.8% difference, i.e. identical. Same device, same Safari, same DPR, same assets. Rotate to portrait and it is 25.8, **+51%**. Nothing about the device is at fault. The plate is 16:9 and `object-fit: cover`, so a portrait phone scales it to fill the HEIGHT — ~1700px wide inside a 440px viewport — and shows **25% of the photograph's width** where a 1440x900 desktop shows 86%. The discarded 75% is precisely the dark framing: the tree canopy, the shadowed banks, the unlit water and the two foreground lanterns the vignette was written to dim. What survives is the brightest column in the picture. That is also why "flatter" is a SEPARATE symptom from "brighter": the shadows lift far more than the highlights (p10 3.0 -> 7.9, p90 42.3 -> 52.7), so dynamic range more than halves, **14.1x -> 6.6x**. Measured band by band, the laptop was silhouetted against a strip 52% brighter than intended (34.5 -> 52.5) and stood on foreground stone 2.4x too bright (10.5 -> 24.8). **Ruled out by checking, not assuming**: `background-attachment: fixed` is not used anywhere in the codebase; `.custom-bg`'s backdrop blur survives on iOS (it is declared unprefixed, but autoprefixer is in the PostCSS pipeline and emits `-webkit-backdrop-filter` — the live computed value on a nav button is `blur(6px) saturate(0.75)`); the resolution ladder picks the 1080p clip, not the 720p one (`paintedWidth()` computes 3398 at 440x956/DPR3); the low-power tier needs <= 4 cores and the device reports 6; the plate is untagged sRGB, which WebKit colour-manages as sRGB, so there is no P3 over-saturation; and the scrim is not falling off screen — its radii are percentages so it re-aims itself, mean alpha 0.646 on desktop against 0.630 on the phone. It was doing the same work on 51% brighter material. **The fix corrects the CROP**, which is one dial: all four backdrop layers share `.home-backdrop`, and the two canvases derive their transform from `coverProjection(clientW, clientH)` at paint time, so shrinking that box re-frames the plate, the ambient video, the lantern glow rig and the arrival ignite coherently — no new assets, and nothing for the canvases to de-sync from. At 440px wide the visible share of the photograph is `247.5 / boxHeight`: full-height gives 26%, a **65% band** gives 42%, which brings both foreground lanterns and both banks back into frame. That alone takes mean luminance to 17.6 against the desktop's 17.0 — brightness parity before a single gradient is retuned, which is why **the scrim is not touched at all**. What the band cannot recover is dynamic range, and darkening further cannot either: the scrim is a MULTIPLY and p90/p10 is invariant under one, so a heavier scrim yields a dimmer picture that is just as flat (tried — pulling the vignette onto the band took the mean 34% below desktop and bought 0.7x of range). A tone curve is the right tool, and one `filter: contrast(1.25) brightness(1.16)` on the two PHOTOGRAPHIC layers lands it; the glow and ignite canvases are deliberately excluded, because running a contrast curve over an additive light source pulls its low end toward black, which is the one thing a light may not do. **Verified on rendered page pixels** at 440x956: mean 35.0 -> 27.2 (from +51% to +17% of desktop, the residual being that the neon UI occupies a far larger share of a 440x956 frame), p10 8.1 -> 3.7, p90 66.5 -> 60.9 (highlights preserved), and **dynamic range 8.2x -> 16.4x against the desktop's 15.7x**. Two supporting fixes travel with it. The shell was `h-screen`, and on iOS `100vh` is the LARGE viewport — the toolbar-hidden one — so the bottom ~9% of the composition, including the darkest end of the base gradient, sat permanently below the fold; `100svh` pins it to what is actually on screen, and as a side effect `scrollHeight === clientHeight`, so the page can no longer be scrolled at all. And the contact shadow was fixed a RATIO: the laptop is sized in percentages and the shadow in fixed px, so they diverge as the viewport narrows — 0.91x the laptop's width at 1440 but only **0.61x at 440**, i.e. the laptop stood on a shadow two-thirds its width, which is much of why it read as hovering. In `vw` the ratio holds across 440, 390 and 360 (0.877, 0.90, 0.90). **Accessibility improved rather than regressed**, which was worth checking: measured against the true background with the neon glow excluded, SOFTWARE ENGINEER (16px `#fc83ff`, needs 4.5:1) was **FAILING at 2.98:1** against the brightest mist behind it and now passes at 5.26:1; the hero name (41.6px `#ff6d05`, large text, needs 3:1) goes 3.98:1 -> 6.35:1. **Scope**: every change is inside `@media (max-width: 639.98px) and (orientation: portrait)` — 639.98 being the exact complement of Tailwind's `sm`, so no viewport can match both — or the equivalent `max-sm:portrait:` variants. Portrait-only and not width-only, because landscape phones already matched desktop and a width-only query would darken a viewport that was never broken. The four values it overrides are tokenised on `.home-backdrop` with defaults that are exactly what the rule shipped with (`100%`, `0`, `none`, `none`, the latter two being the CSS initial values, so no stacking context and no compositing layer is created), and desktop was proved untouched by re-asserting the original declarations at higher precedence and re-reading every computed style: **0 differences across 200 comparisons on 10 hero elements at 1440x900**. Landscape 956x440 confirmed unmatched by the query. 60.5 fps at 440x866 with the tone and mask live, no layout shift, no overflow in either axis. |

#### Homepage lanterns burn with filmed fire — flame windows cut back into the ambient loop

| | |
|:--|:--|
| **Ref** | — (owner report: "the flames do not loop real at all, I want the flames to look real like they do in the projects page background") |
| **Files** | `scripts/scene/bake-causeway-water.mjs`, `scripts/scene/bake-home-grade.mjs`, `src/components/home/homeSceneLights.js`, `src/components/home/homeScenePlateShader.js`, `src/components/home/HomeSceneWater.jsx`, `src/components/home/HomeSceneVideo.jsx`, `src/components/home/HomeSceneLivePlate.jsx`, `src/components/home/HomeSceneGlow.jsx`, `public/background/causeway-{720,1080}.mp4`, `public/background/home-hero.webp`, `scripts/scene/scene-verify.mjs`, `scripts/scene/swap-check.mjs` |
| **Details** | **The premise was wrong, not the tuning.** `/projects` reads as alive because it ships FILMED flames; the homepage was relighting a photograph with a WebGL warp, and a warp cannot burn however it is tuned — it moves a still flame, so the tongue leans and rises but never changes shape. That shader existed to avoid spending a second 1.8–5 MB video on the LCP-critical entry route, but this route was **already** shipping a clip for its lake: the flames were absent only because they sit inside the `POST_KEEPOUTS` rectangles that stop the model swimming the lantern housings, so the fire had been thrown out with the posts. Cutting flame-sized windows back into that same mask costs **+21 KB** (614 KB / 302 KB, from 593 / 282), not another megabyte, and no regeneration — the original 13.6 MB seedance clip was still on disk. **Two problems had to be solved first, and both were measured before any pixels moved.** (1) **The walk.** The model holds the small post lanterns still (hot-core offset 1.1–3.6 px over the clip) but walks the two foreground ones up to **51 px**, most of a lantern's own width, housing and all — composited raw that reads as the bridge's lanterns sliding sideways, exactly what the keep-outs exist to prevent. It is removable because the walk is SLOW and fire is FAST, so the two separate in time: a ±12-frame moving average of the flame's own centroid *is* the walk, and subtracting it re-registers the flame on the wick the plate photographed while leaving every bit of the flicker (mean offset **13.2 → 1.4 px** and **14.8 → 2.6 px**; the posts, already fine, go to 0.1–0.7). It fixes the glazing bars for free, since they drifted with the housing — which is why the window is cut to the rig's `FIRE_BOX` rather than to the measured flame: a narrower window would have had nothing in it to prove the registration by. The tracker has to FOLLOW the flame to see any of this; a box pinned to the plate loses the near pair halfway through and reports the walk saturating and the fire dying, both artefacts of the measurement (the first read of the contact sheets took that at face value). Energy must likewise be judged against each flame's OWN median, not the plate's — an absolute floor cut one healthy flame at frame 44 and rejected another outright, because the model simply draws the small posts at a different brightness from the photograph. (2) **The seam.** The water's 1 s crossfade closes its loop by dissolving tail into head, invisible on water (no rigid structure for a blend to smear) but on fire it is the "candles fade out and rebuild themselves" artefact `scripts/scene/find-loop-point.mjs` was written to kill. Each flame therefore gets its own loop length and an 8-frame seam. Length cannot be scored, because seam cost falls geometrically as the loop shortens — 23× a natural frame step at 4 s down to 4× at 1 s, with **no change in the clip whatsoever** — purely because a shorter loop offers the search more places to cut; a soft 8%-per-second length penalty duly collapsed every flame onto a 1 s loop. The threshold instead comes from the fade's own arithmetic (`scripts/scene/find-loop-point.mjs` §4): over F frames each frame moves 1/F of the way across the mismatch, so a seam is invisible once it is no larger than what the clip itself covers in F frames — `seam ≤ natural × F²`, both sides being mean SQUARED differences. Take the longest length that clears it: the two foreground flames land on the full **4 s** (matching the `/projects` loop's 4.17 s), the small posts on 2 s and 1.33 s, so nothing in the scene repeats all at once. A third defect surfaced here — the flame patches were carrying the clip's **42% exposure ramp**, which the water had always had normalised away, so the lanterns brightened steadily through the loop and dropped back at the wrap; the flames now take the RAMP out of that gain but not the LEVEL (the water's gain matches the dark lake, ≈0.65, and applying it whole dimmed every flame by a third, which the per-source level match then clamped against on five of eleven). **The swap.** With flames in the clip, the still and the video no longer agreed on first paint — a 15–70 RMS step against a 0.7–18 normal frame step, once per load, and a regression, since previously neither layer's flames moved. Choosing loop starts to minimise it was tried and reverted: an i2v pass re-renders fine detail everywhere (27 dB PSNR against the image it was fed), so no frame closely matches the photograph, and it bought almost nothing while pushing seams from comfortable margins to the budget edge (112.7 of 114). Answered the way `/projects` answers it — "the poster IS this clip's own first frame" — by giving the PLATE the loop's frame-0 flames, confined to the windows (0.42% of pixels; the rest of the plate is unchanged at mean 0.16 luma). The bake now grades from the pristine `home-hero-src.webp` rather than reading back the file it writes, so it cannot feed on its own output, and `scripts/scene/bake-home-grade.mjs` carries a note that running it alone drops the flames back out. Swap: **15–70 → 8.1–9.1 RMS**, below one frame of the fire's own motion (12.5–18.0). **Verified on the shipped loop** (`scripts/scene/scene-verify.mjs`): sky and trees 0.00, causeway stone 0.00, post housings 0.05–0.07, open water 0.62–1.20, flame windows **16.3–17.2**; wrap-around step **0.87×** the clip's largest natural step globally and **0.66×** inside the flames. On the running page, over 400 ms: flames 22.0–28.0, housing below the flame 0.02, stone 0.00, water 0.31. **Layering**: `HomeSceneLivePlate` sits ABOVE the video and writes opaque pixels into these same windows, so mounting both would paint the frozen flame straight over the filmed one — `HomeSceneWater` now mounts strictly one or the other, the warp becoming the fallback for a decode or network failure. `FIRE_BOX` and a shared `fireBoxAlpha` moved into the rig, since the shader, its quad sizing and the video mask all now cut to the same box and a second copy is the drift this codebase keeps designing out. |

#### Homepage lake filmed, lanterns lit — the hero's motion rebuilt twice

| | |
|:--|:--|
| **Ref** | — (owner reports: the water "does not meet my expectations… no visual effect of water moving"; then, of the procedural replacement, "I absolutely hate it… not professional") |
| **Files** | `src/components/home/HomeSceneWater.jsx`, `src/components/home/HomeSceneVideo.jsx`, `src/components/home/HomeSceneLivePlate.jsx`, `src/components/home/homeScenePlateShader.js`, `src/components/home/HomeSceneGlow.jsx`, `src/components/home/homeSceneLights.js`, `scripts/scene/bake-causeway-water.mjs`, `public/background/causeway-{720,1080}.mp4`, `scripts/scene/measure-flames.mjs`, `scripts/scene/ghost-hunt.mjs`, `scripts/scene/motion-check.mjs` |
| **Details** | **THE LAKE — filmed, not simulated.** A procedural wave field was built first and rejected, and re-tuning was never going to save it: travelling bands, crest glints and spreading rings are all STRUCTURE INVENTED AND LAID OVER a photograph, so every version read as an effect rather than as the lake. Three artefact classes were found and fixed on the way and each has an arithmetic cause worth keeping: three pure sinusoids crossing render a regular **plaid**; the domain warp that fixes it shears every crest to 34° of **diagonal brush-strokes** if its gradient rivals the wave's own; and noise sampled in the anisotropic phase space comes out **combed into streaks**. Two findings survive the deletion — displacing this smooth dark lake by 8px changed the frame by a mean of **0.77 of 255** (there is nothing there to move), and a replacing layer must pre-multiply by `PLATE_OPACITY` and composite at CSS opacity 1. The tier is now the masked ambient loop, **restored after being withdrawn**. That withdrawal rested on a finding that invented structure "covered most of the near-field water", which does not survive re-derivation: it came from a metric that could not separate "these pixels changed" — the entire point of water — from "an edge appeared where the plate has none". Scored on gradient energy the frame carries that the plate does not (`scripts/scene/ghost-hunt.mjs`), the causeway stone comes back at 11.3–16.9 and the lanterns at 11.9–12.1, while OPEN WATER sits at **0.8–2.7**, an order of magnitude lower: the invention is concentrated in exactly the structure the mask already removes. The bake is rebuilt around that. Its mask now takes geometry from the rig's own `waterGaps`, so the causeway AND the lantern posts standing in the lake are excluded by the same function every consumer asks — the posts being the specific hole through which a second lantern and pillar were drawn beside each foreground post — and whatever ghosting survives is suppressed by the **ghost map itself**, the mask multiplied down wherever the clip invents edge energy, so a hot spot hands itself back to the plate with no rectangle authored around it. Frames are graded to match the regraded plate (luminance normalisation only matches exposure, not chroma) and carry the plate's 0.9 baked in, so the still-to-video swap is invisible rather than a 10% pop. Verified on the encoded loop: causeway stone **0.00**, pillars 0.01, lanterns 0.02, trees and sky 0.00, against water at 0.62–2.11 — and the payoff, the one detail worth the tier, is the lantern reflections breaking up and re-forming on the surface. 593 KB / 282 KB for a 4.04s loop at 18.0% frame coverage. **THE FLAMES — the photograph, moved.** `/projects` buys convincing fire with a 1.8–5 MB video; the LCP-critical entry route cannot spend that twice. The previous relight drew two additive radial gradients per lantern because the only size the rig carried was `r`, a detected core RADIUS — and measured off the plate (`scripts/scene/measure-flames.mjs`, after clearing two traps: a warm-and-bright threshold swallows the lit housing and stone cap, returning 141×165px for a flame the eye reads at 40×77; and a bounding box spans the gap to the separate burner blob below) the flames are tongues of half-width 0.46r, tip 0.92r above centre, base 0.68r below, **aspect ≈1.8**. A circle is not a flame at any tuning. An fbm fire pass over the warp was tried and also rejected — at this on-screen size synthetic detail reads as noise laid over a photograph — so the shipped treatment adds nothing: one small quad per lantern warps that lantern's own photographed flame with turbulence that scrolls upward (the phase runs against height, so a disturbance is born at the wick and reaches the tip a moment later) and modulates only its warm pixels. Every lantern burns, faded out by on-screen size rather than cut. Each lantern's glow rides 34% of the same `flameFlicker` seed its flame moves on, so light and fire breathe together. Audited by `scripts/scene/motion-check.mjs` on the running page: sky, trees and causeway stone **0.00**, pillars 0.42, while flames run 1.8–4.5 and water 0.5–1.7. (Sample boxes must avoid the orbiting nav ring — sited naively, the first audit reported the lake churning at mean 46 / peak 247, which was the clock icon sweeping through the box.) |

#### `/projects` workshop scene — MA seal on the rug, two-pass regeneration, three-tier delivery

| | |
|:--|:--|
| **Ref** | — (follow-on from the workshop-scene backdrop; closes the chandelier-flames item left blocked when the AI Gateway balance ran out) |
| **Files** | `scripts/scene/bake-rug-seal.mjs`, `scripts/scene/bake-scene-frames.mjs`, `scripts/scene/close-loop.mjs`, `scripts/scene/find-loop-point.mjs`, `scripts/scene/finish-projects-scene.sh`, `scripts/scene/gen-projects-scene.mjs`, `src/components/projects/SceneVideo.jsx`, `src/components/projects/SceneParallax.jsx`, `src/components/projects/SceneSealIgnite.jsx`, `src/app/(sub pages)/projects/page.js`, `src/app/globals.css`, `public/background/project-bg.webp`, `public/background/projects-flames{,-1080,-720}.mp4` |
| **Details** | **The rug symbol.** The artwork's rug carried a generated arcane summoning-circle — two concentric glowing rings around a tree/floral medallion — baked as raster pixels into `project-bg.webp` (measured: centre 1395.5,1235.5; semi-axes 223.5 × 58.5) and identically into every video frame (still-vs-frame difference 2.61/255). Not a texture, SVG or geometry, so no code change could remove it; `scripts/scene/gen-projects-scene.mjs`'s `SHARED_LOCK` still carries the clause written to stop it re-igniting. It is now the **MA seal** (`public/background/logo.png`, also the favicon), repainted through a fitted **ground-plane homography** `x=(au+e)/(hv+1)`, `y=(fv+g)/(hv+1)`. The ellipse's b/a of 0.262 puts the camera ~15° above the floor; the perspective term `h` could NOT be fitted from the sigil's own two rings (plane radii 1.0 and 0.82 — too short a baseline; the fit returned the wrong sign at 2%, under the noise floor of a thresholded soft glow), so it comes from the rug rectangle, whose front edge is ~6.4% longer than its back, giving ~3% across the seal at `h=-0.0148`. **Replace the shape, keep the energy**: the sigil's light is split into a monotone radial POOL (kept — it is what lights the weave, the pot and the floor around it) and the ring STRUCTURE above it (removed), with the floor taken as the *minimum* of a monotone radial profile and a wide blur, because concentric rings survive both an angular average and a blur individually. The seal is then added as emissive light in `ember.neon`→`ember.halo`, modulated by the de-glowed weave's local relative brightness so threads and grooves show through it, and removal is done hue-preservingly (a per-channel subtraction left a cyan fringe wherever the sigil was blown out near white). **Two-pass regeneration.** minimax reads "already blazing" as an instruction to IGNITE: global luminance ramps 39.9→53.4 over 12 s and the rug 74.7→104.7, which is why the earlier attempt could only close a 1.88 s loop — there is no stable stretch inside a continuously brightening clip. So pass 1 `ignite` is harvested for its **settled end state** (t≈11.9 s, where the crystal-cluster fixtures have finally resolved into real candle chandeliers with visible flames — the item previously declared impossible to post-process), and pass 2 `hold` regenerates from that frame, cutting the residual global drift to +5.8. The rug is stamped from a fixed plate rather than re-composited per frame (it drifts +29 to +42, morphs into a spiral and shifts centre ~20px), so the seal is pixel-identical in every frame, the loop seam has exactly zero error inside the rug window, and poster and video agree by construction; a ±5% flame-driven breathe keeps it from reading as a decal. Remaining exposure drift is fitted as a smooth temporal trend and divided out, leaving the flicker intact: **global +5.8 → +0.16, rug +28.9 → +1.99**. Seam verified at wrap-step 1.2 against the clip's own max natural step of 1.3. **Delivery.** `SceneVideo` becomes three tiers — **full** (encoded loop), **embers** (the procedural `SceneEmbers` canvas, for Save-Data and `deviceMemory ≤ 4` / `hardwareConcurrency ≤ 4`, and now the error fallback), **still** (reduced motion) — which finally mounts `SceneEmbers`, previously built, documented and imported by nothing. A resolution ladder replaces the single 2560×1440 file shipped to every device (**602 KB / 2.3 MB / 5.0 MB**), picked in JS because `media` on `<source>` is only reliably honoured inside `<picture>`. Playback is gated by `visibilitychange` (verified: 0 s advanced while hidden, resumes on return) plus an `IntersectionObserver`. **Two artefacts that made it read as a looping video, both fixed.** *(a) Boiling fixtures.* A naked candle flame is animated convincingly, but inside a glazed lantern the model redraws the whole interior every frame — glass texture, glazing bars and inner glow reorganise instead of a flame moving behind fixed glass. Temporal std of luminance measured 4.40 at the left-hand lantern against 0.53 for static stone floor. Fixed by splitting light from structure: the still's structure is kept and driven by the video's low-frequency brightness (`out = plate × blur(frame_luma) / blur(plate_luma)`), applied only to the `k: 'lantern'` positions from SceneEmbers' own source table, so the two layers cannot disagree about where the lanterns are. Left lantern **4.25 → 2.24**, other lanterns likewise, while the chandelier (2.93) and naked candle flames (2.22) are untouched — real flame motion is preserved, only the incoherence is removed. *(b) The seam.* Judged at native resolution rather than the 240×135 grey decode `scripts/scene/seam-check.mjs` uses, the shipped loop's wrap was **7.6× a normal frame step**, and its final frame matched no master frame within 2.66 (against a 1.43 CRF floor for frame 0) — the signature of a frame still mid-blend, i.e. ffmpeg's `xfade` never completing its transition despite the "+1 frame" correction. The rug gave it away: that region is a pixel-identical plate in every master frame yet still measured a wrap of 1.25, which no content difference could explain. Loop assembly moved out of `xfade` into `scripts/scene/close-loop.mjs`, where the endpoint is exact by construction — the last frame IS `master[ts+F-1]` and the first IS `master[ts+F]`, two consecutive frames — which also sidesteps the `xfade` EOF wedge the shell pipeline needed a `tpad` clone-pad to work around. The remaining seam turned out to be the ENCODER: x264's default `ipratio=1.4` gives the loop's first frame (always an IDR) a markedly lower QP than the P-frame preceding it, so the picture visibly *sharpens* on every restart with no content behind it. `ipratio=1.0:pbratio=1.0:scenecut=0` plus CRF 20 took the blur-robust wrap from **1.55 → 1.15× the clip's own largest natural step** (0.67 for a near-lossless reference), and the flat QP plus `preset veryslow` made every file *smaller*: **413 KB / 1.8 MB / 5.1 MB**. `scripts/scene/find-loop-point.mjs` also became a two-stage search (coarse over all pairs, then re-scoring a 400-pair shortlist at 640×360), since scoring only at 240×135 smooths away the very detail that makes a wrap visible. Loop length 2.5 s → **4.17 s**. |

#### `/projects` scene camera drift and the seal's arrival ignition

| | |
|:--|:--|
| **Ref** | — (the craft layer over the workshop scene) |
| **Files** | `src/components/projects/SceneParallax.jsx`, `src/components/projects/SceneSealIgnite.jsx`, `src/app/(sub pages)/projects/page.js`, `src/app/globals.css` |
| **Details** | **Camera drift.** The backdrop is `position: fixed` and the page scrolls over it, so the scene was the one thing on the page that never moved — which is what makes a photographic background read as wallpaper. `SceneParallax` renders NOTHING and writes two custom properties on `<html>` (`--scene-dx` / `--scene-dy`); `.projects-backdrop`'s transform consumes them, so all three backdrop layers drift together and the per-frame work is two `setProperty` calls with the compositor doing the rest — no React re-render, no layout, no paint. Pointer contributes ±14px horizontally / ±10px vertically (moving AGAINST the pointer, which is what reads as depth; matching it reads as dragging the image), scroll adds ±11px across the page. The rAF loop **parks itself** once the drift settles, so a still pointer costs zero frames. A 1.045 overscan on the layer makes the translate safe — 4.5% of the viewport is comfortably more than any offset the component can produce, so no drift reaches an edge — and the scale is unconditional, since applying it only while drifting would pop the crop on first movement. Honest about what it is: a single-plane camera move, not multi-plane parallax; the still has no depth channel, and faking a split with a radial mask was rejected as a visible wobbling cutout. Gated on reduced motion (which also gets a CSS `@media` rule so the un-drifted crop holds even between a query change and the effect re-running) and on `(hover: hover) and (pointer: fine)`, with rebinding if pointer capability changes. Measured under continuous pointer drive: **164 frames, 1 over 20 ms — 0.6%**. **Seal ignition.** The seal is baked into the artwork so it cannot animate itself; `SceneSealIgnite` draws a spark that runs its outer ring like a fuse, blooms, and hands over to the baked mark. It also answers a real layout problem — the rug sits at ~86% of the backdrop height, which at common desktop viewports lands under the project cards, leaving the seal visible only in the gaps; arrival, before the cards stagger in, is the one window where nothing covers it. The ellipse is the seal's own outer ring in artwork space (centre 1393,1236, semi-axes 268 × 60), projected through the same `object-fit: cover` maths `SceneEmbers` uses, and the canvas carries `.projects-backdrop` so it inherits the identical box, overscan and drift — there is no second source of truth to fall out of sync. It sits under the scrim so the flare is dimmed by exactly the same wash as the seal it lights. Verified by in-page sampling (a screenshot cannot catch timed UI): spark visible from t≈2.84 s at a few pixels of alpha 250, ring closes and blooms at t≈4.4 s (238 sampled pixels lit), faded by t≈5.1 s, and the canvas **unmounts at t≈5.2 s** so it costs nothing for the rest of the visit. Both layers no-op entirely under `prefers-reduced-motion` — verified: no video, no canvases, `--scene-dx/dy` unset, scale-only transform, the still image alone. |

#### Homepage causeway scene — hero-composed plate, procedural living light, the path igniting inward

| | |
|:--|:--|
| **Ref** | — (the homepage brought onto the scene system the sub-pages already share) |
| **Files** | `scripts/scene/gen-home-hero.mjs`, `scripts/scene/finish-home-hero.mjs`, `scripts/scene/detect-lights.mjs`, `src/components/home/homeSceneLights.js`, `src/components/home/HomeSceneGlow.jsx`, `src/components/home/HomePathIgnite.jsx`, `src/components/home/HomeSceneDrift.jsx`, `src/hooks/useSceneGate.js`, `src/app/page.js`, `src/app/globals.css`, `public/background/home-hero.webp` |
| **Details** | **The plate.** The homepage shipped a 1536×1024 / 39 KB frame of near-empty dark-blue murk with four tiny lanterns — the lowest-resolution, lowest-detail asset on a site whose sub-pages carry 2560×1440 candlelit rooms. Regenerated via the existing Gateway pipeline (`bfl/flux-pro-1.1-ultra`, four candidates), but with the composition contract stated as **geometry rather than mood**: the previous attempt (`scripts/scene/gen-home-scene.mjs`) already asked for a "calm opening" up top and the winner still filled the entire upper third with warm canopy lanterns — precisely where an orange-stroked headline sits. The new clause names a measured band and a prohibition ("the top 40 percent must be EMPTY and DARK … absolutely NO lanterns, NO glowing lights … in the upper third"), and adds a *job* beyond framing: every candidate must contain a readable receding track of path lights, because that track is the arrival animation's rig. Candidates were scored numerically, not by eye — per-band mean luminance, **max** luminance and warm-pixel fraction (`R−B > 40`) across the real hero zones. Mean alone would have picked `avenue` (26.7 vs 35.9); it was rejected because a stroke-on-transparent glyph is destroyed by a single hot pixel, and `avenue` carried max 235 in the name band plus 4.75% warm right under the laptop. **`causeway` won on max (175, against 235/253/217) with 0.00% warm pixels across the name band on all four** — the contract held. Finished to 2560×1440 WebP via sharp (q82, **263 KB** — lighter than both siblings). Written to a NEW filename: `home-bg.webp` is still imported by `projects/[id]/page.js` and its `loading.js`, so overwriting it would have silently restyled another route. **The rig.** `SceneEmbers`' coordinates were eyeballed off the workshop art, which is fine for scattered candles but not for lanterns on a perspective line whose spacing collapses toward the vanishing point — the ignite runs a wavefront along exactly that line, so drift would show as the spark missing its lanterns. `scripts/scene/detect-lights.mjs` measures them instead: flood-filled blobs thresholded on **warmth** (`R−B`), not luminance, because the vanishing-point mist is bright but COLD and must not register as a lantern, then filtered on a near-clipped flame core (`peak ≥ 235`), which is what separates a light *source* from wet-stone specular and water smear. Result: **15 flames, zero false positives**, verified against a rendered annotated overlay before a line was written against them. They live in `homeSceneLights.js` as the one source of truth shared by both animating layers, with depth **derived** from each lantern's own `v` rather than hand-numbered, so moving or adding a lantern re-times the ignite automatically. **Living light, procedurally only.** `HomeSceneGlow` repaints the plate's own lanterns, their doubles in the water and the cold vanishing mist as additive glows riding two-octave seeded value noise, plus fireflies drifting over the water at the frame edges (kept off the causeway, where the laptop and nav sit). No ambient video ships for this route — on the site's LCP-critical entry page the procedural layer is the better trade rather than a compromise: zero bytes over the wire, seamless by construction, crisp at any viewport, unable to fail the way a decode can. Tiering is therefore **full / lite / still**, with the lite rung (Save-Data, `deviceMemory ≤ 4`, `hardwareConcurrency ≤ 4`) dropping the mist, the reflections and 9 of 14 fireflies and falling to 20fps. Reflections are authored, not detected — a reflection can never reach the flame-core clip by definition — and are drawn vertically stretched, since still water smears a point light and drawing them round is the one thing that would read as pasted-on. **The moment.** `HomePathIgnite` is the `SceneSealIgnite` verb — spark traverses a shape anchored in the artwork, blooms, hands back to the bake, self-unmounts — moved up a page and given a **direction**. The homepage is the one route that never scrolls, so it has no scroll indicator to say "there is more this way"; the background says it instead. A wavefront sweeps the wet stone from below the bottom edge to the vanishing point, its width tracking the causeway's own perspective, each lantern catching by **depth** (not index, so both rows catch in true near-to-far order) with a fast attack and an exponential settle, then a bloom into the mist plus one cold breath pushed out with it. Frame deltas are clamped at 50 ms so a backgrounded tab **pauses** the sequence rather than skipping it — someone who tabs away and back still sees the moment, not its aftermath. Verified by in-page sampling at 70 ms (a screenshot cannot catch timed UI): the emitted-light centroid rises to **0.847** as the band climbs in from off-frame, then falls monotonically **0.79 → 0.66 → 0.56 → 0.50** — the wavefront provably travelling inward — after which mean alpha swells **1.39 → 5.20** with the centroid pinned at 0.497 (the bloom), fades to zero, and the canvas **unmounts at 2592 ms** against a designed 2500. **Craft + correctness.** `HomeSceneDrift` is `SceneParallax` with the scroll term removed — the shell is `h-screen overflow-hidden`, so a scroll listener would attach and contribute a constant zero forever. Pointer only, ±16px / ±11px against the pointer, writing two custom properties on `<html>`; measured **+12.77/−11.79px** symmetric and **parked: 0 changes across 91 frames** once settled, waking on the next move. `.home-backdrop` is `absolute`, deliberately NOT `fixed` like the two sub-page backdrops: this shell is a non-scrolling viewport-sized box, and pinning to the visual viewport would re-zoom the cover crop every time a mobile URL bar collapses — the exact bug the sub-pages' `100lvh` rule exists to prevent, reintroduced by another route. `.home-scrim` replaces a bottom-up black gradient that was built backwards for this hero (black at the BOTTOM, transparent at the TOP, with the headline at the top — the old plate got away with it only by being empty). Three bands, and **the middle one is the lightest on purpose**: the vanishing mist sits directly behind the floating laptop, and leaving it open is what rim-lights the laptop against the depth instead of flattening it: darkening the centre uniformly, the obvious move, is exactly what would waste the composition. The `sizes` bug the sub-pages already fixed is fixed here too (`100vw` → `max(100vw, 178vh)`): on a 390×844 portrait phone the cover'd 16:9 paints **1500 CSS px** wide, and the browser now correctly selects `w=1920` where `100vw` would have picked 640 and stretched it. The `blur-[0.2px]` and `quality={100}` crutches are gone — both existed to hide the old plate's upscale. **`useSceneGate`** lifts the four-gate contract into one hook and corrects a drift between the existing copies: `SceneVideo` pauses on `visibilitychange`, but `SceneEmbers` and `SceneSealIgnite` never did, so a backgrounded tab kept them repainting. It splits `mounted` from `running` — unmounting a paused layer would destroy the element its `IntersectionObserver` watches, so it could never learn it had come back. **Verified.** Frame pacing under steady-state ambient: **p50 16.7 ms, p95 17.6 ms, 0 of 150 frames over 20 ms**. Hidden tab: glow signature frozen 4172 → 4172 → 4172 across 2.8 s, resuming at 4268. `prefers-reduced-motion`: **zero canvases mount**, plate remains, transform is scale-only, `--home-dx` unset, `will-change: auto`. Low-power: reduced rig still animating. Hero legibility measured on real composited frames at four points through the sequence — name contrast **3.23–3.26:1** and subtitle **3.14–3.44:1**, a 0.03 spread between the dimmest and brightest ignite frames, so the arrival cannot threaten the headline. CLS **0.0047**, attributed via `PerformanceObserver` sources to the headline block and laptop wrapper reflowing under `LiveMaintenanceHeader`'s skeleton→content swap; **no backdrop layer appears in any shift source**, which is structural — all four are out of flow. LCP A/B on production builds under Fast-3G + 4× CPU throttle, three runs each against HEAD as baseline: **1208 ms → 1168 ms median, H1 text the LCP element in every run**, the plate landing ~3000 ms, well after. Route JS +2.8 kB, First Load JS 168 → 171 kB. |

#### Homepage lake in motion — three-tier water, and the hero chrome reharmonised

| | |
|:--|:--|
| **Ref** | — (the craft layer over the causeway scene) |
| **Files** | `scripts/scene/gen-causeway-video.mjs`, `scripts/scene/bake-causeway-water.mjs`, `src/components/home/HomeSceneWater.jsx`, `src/components/home/HomeSceneVideo.jsx`, `src/components/home/HomeSceneRipple.jsx`, `src/components/home/homeSceneLights.js`, `src/app/page.js`, `src/app/globals.css`, `tailwind.config.js`, `public/background/causeway-{720,1080}.mp4`, `package.json` (+`ffmpeg-static`) |
| **Details** | **The tell.** `HomeSceneGlow` animates light, but the lake was mirror-flat, and the eye reads a frozen reflection as a photograph however nicely the flames flicker. Flame flicker cannot fix still water, so the water itself now moves — on the `/projects` "three tiers, not two" contract: **video → procedural → still**, exactly one motion tier ever mounted (they animate the same pixels; running both would shear an already-moving surface). **The video, and why it is masked.** A seedance i2v pass from the exact plate produced genuinely good water — slow ripples plus concentric drizzle rings — but would not hold the causeway rigid. Measured as per-pixel temporal std over 21 frames, the stone came back at **28.6** against **6.0/6.8** for the water it was supposed to be animating: the scene moved everywhere except where it was asked to. It is not a rigid camera drift either — vidstab's static-camera mode (`smoothing=0`) left it at **28.0** — so no stabiliser recovers it; the model is re-drawing geometry frame to frame. That only kills the clip if you use all of it: water has no rigid structure and hides drift completely, while stone advertises it instantly. So the clip is composited into the plate through a feathered lake mask (`scripts/scene/bake-causeway-water.mjs`), and the still supplies every pixel of geometry the eye can check. The mask geometry is *imported* from the component rig rather than re-typed, so the video tier and the procedural tier can never disagree about where the water is — `homeSceneLights.js` is ESM under a package with no `"type": "module"`, so it is evaluated through a `data:` URL rather than renamed or copied. Per-frame gain normalises the clip's exposure ramp (the model brightened it ~30% across 5s — gain tracked 0.937 → 0.712) to the plate's own level *inside* the mask, which does double duty: it removes the drift and guarantees the composite matches the plate exactly at the mask boundary, which is what makes the feather invisible rather than merely soft. Result, measured on the encoded loop: **causeway, sky and trees at 0.00 mean frame-to-frame difference** (max 1–2, pure codec noise) while the water runs at **5.6–6.2** with peaks of 141. Because 71% of the frame is now perfectly static the encoder gets it almost free — **2.2 MB → 899 KB** at 1080p, 426 KB at 720p — over a JS-picked ladder (`media` on `<source>` is only honoured inside `<picture>`). The loop is closed by blending the tail into the head so `out[M-1] → out[0]` are two consecutive source frames, exact by construction, and encoded at flat QP (`ipratio=1.0:pbratio=1.0:scenecut=0`) for the reason diagnosed on the `/projects` loop: x264's defaults give the loop's first frame — always an IDR — a lower QP than the frame before it, so the picture visibly sharpens on every restart with nothing behind it. **Two bugs worth recording**, both invisible to every numeric check and caught only by looking at pixels: compositing an RGBA input made sharp's raw output 4-channel while every later read assumed 3, so frames came out grey and horizontally tiled *and every measurement taken on them was meaningless rather than merely wrong*; and once that was fixed, the alpha added by `joinChannel` was not honoured by `composite` at all — against the plate, the "masked" output differed by mean **35.3 outside** the mask and only **20.2 inside**, i.e. exactly backwards. The blend is now a per-pixel lerp on raw buffers, which has no hidden channel semantics, and the bake asserts its own invariant (outside the mask the composite must equal the plate byte for byte) rather than trusting it. **The procedural tier** (`HomeSceneRipple`) is not a degraded fallback: it repaints only the lake rows from the plate's *own* pixels with a per-row horizontal shear, so reflections stretch and wobble because their pixels are being sheared, nothing is invented, and the 2560px plate stays pixel-crisp at any viewport where the video tops out at 1080p. Seams are structurally impossible rather than hidden — amplitude fades to zero at the horizon so boundary rows are drawn undisplaced, the causeway is never drawn at all (verified: **0.0% painted** over the stone and above the waterline in every sample), and a shifted row's unpainted sliver falls back to the same water undisplaced. The falloff exponent moved 2 → **1.35** after measurement: a squared ramp left the causeway lanterns' reflections at v≈0.60–0.75 with under 0.6px of movement, i.e. the ripple was happening almost entirely in the empty near water below anything worth looking at; the mid-band now paints 47–60% and varies. Shear is deliberately fractional — integer quantisation drops every row whose displacement rounds to zero, which at these amplitudes is most of the mid-distance. **Chrome, reharmonised.** Sampled off the composited frame, the ripple-ring stroke sat at **h25.5°/s72%** and the nav buttons at h25°/s71%, while the scene's own lantern flames measure **h31.9°/s38%** and the far run h29.6°/s33% — the UI ember ran at roughly double the saturation of every real light in the shot and 5–7° redder: neon signage beside fire. Over the old empty-murk plate that read as a clean sci-fi base; over photographic wet stone it read as a vector ellipse drawn on a photograph, helped by a `1px solid` border, which real light never has. The rings are now feathered bands painted with a radial-gradient — bright warm core through the ember ramp to nothing, no stop at full opacity — and the ripple keyframe's launch bloom moves off `0 0 140px #ff6d05` onto the same fire. Their geometry is deliberately untouched: the `perspective(600px) rotateX(80deg)` plane genuinely matches the causeway's, which is why the ellipse sits believably on the stone. The **nav buttons keep their hue on purpose** — they are controls, and reading as crisp UI rather than as scenery is what makes them legible as clickable. A **contact shadow** grounds the laptop, breathing in antiphase with the float (spreading and lightening as it rises, tightening and darkening as it settles) — over murk the eye never asked where the laptop met the ground, over a real surface it does. And **hover** was measured at `drop-shadow(rgba(255,109,5,.89) 0 0 1.81px)` on a ~490px-wide element — a hairline, invisible even before the brighter plate — now scaled to the element at 16px/41px radii in the scene's own warmth, with the ground shadow widening in response. Under reduced motion the contact shadow stops breathing but is still **drawn**: it is grounding, not decoration, and removing it would leave the laptop floating over stone — a worse result than the motion avoided. **Verified.** All three tiers exclusive and correct (full → `causeway-1080.mp4` playing with the ripple not mounted; low-power → ripple, no video; reduced motion → **zero canvases, no video**, plate alone, scale-only transform). Backgrounded tab advances the video **0.00s** and resumes on return. Frame pacing with the extra layer unchanged: **p50 16.7 ms, p95 17.7 ms, 0 of 150 frames over 20 ms**. LCP still the H1 text and unmoved. `ffmpeg-static` added as a devDependency for the bake (the repo had no ffmpeg on PATH; `npm i` also needs the nvm Node 22 the dev launcher uses, since the engine pin rejects the ambient Node 25). |

#### Homepage hero stilled — pointer drift removed, lantern posts frozen, chrome onto the headline orange

| | |
|:--|:--|
| **Ref** | — (owner-directed pass over the finished causeway hero: "the background moves with the cursor", "the rings and the hover shadow should be the same colour as MUHAMMAD ABDULLAH", "the bridge and its lights move as the video progresses") |
| **Files** | `scripts/scene/remask-causeway-posts.mjs`, `src/components/home/homeSceneLights.js`, `src/app/page.js`, `src/app/globals.css`, `tailwind.config.js`, `public/background/causeway-{720,1080}.mp4`, `src/components/home/HomeSceneDrift.jsx` (deleted) |
| **Details** | **The drift is gone.** `HomeSceneDrift` — the pointer-linked ±16px/±11px camera drift — is deleted, along with the `translate3d(var(--home-dx), var(--home-dy), 0)` term it fed in `.home-backdrop` and that layer's `will-change: transform` (a permanently promoted layer for a transform that can no longer change is pure memory cost). The 1.045 overscan STAYS despite existing only to keep the translate off the viewport edge: it is the crop the whole composition — scrim ellipse, lantern rig, laptop placement — was tuned against, so dropping it would silently re-frame the hero by 4.5%. Verified live: `.home-backdrop` computes `matrix(1.045, 0, 0, 1.045, 0, 0)` both before and after real `pointermove` events across all four corners of the viewport, and `--home-dx`/`--home-dy` resolve to empty. **The bridge and its lights hold still.** The water bake defines the lake as "below the horizon and off the causeway" — but the lantern posts stand *in* the lake beside the causeway, not on it, so they fell inside the mask and the model was redrawing them every frame. Measured on the shipped loop as per-pixel temporal std: causeway stone **0.00–0.02** (rigid, as designed), open water **5–10** (the motion we want), the four near posts **13–15**, the two foreground posts **39–42**, peaking at **58** in the flame cores — the posts swimming and the flames jumping, which is what reads as the bridge and its lights moving. A re-bake was not needed and the raw i2v clip was long gone anyway: the original bake asserts that outside its mask the composite IS the plate byte for byte, so the shipped mp4 already carries the plate everywhere the video was not allowed, and `out = video + (plate − video) × keepout` is exactly the operation a tighter mask would have performed. `scripts/scene/remask-causeway-posts.mjs` does that against six per-post keep-outs measured off the plate at 2560×1440 and stored as `POST_KEEPOUTS` in `homeSceneLights.js`, so the geometry lives in the same one place the mask, the glow and the ignite already share; `v1: 1` marks the two foreground pillars the frame edge cuts, which take no bottom feather. Frame order is untouched, so the closed loop stays closed. Result: the same six probes now measure **0.00–0.15**, the flames included, while the lanterns' **reflections on the water still move** — those are water, and they should. The keep-outs cover 8.11% of the frame; the boundary is measurably invisible — inside a keep-out the encoded frame sits **1.97** levels off the plate (h264 noise), the 20px band just outside it **6.20**, against **5.60** for open water elsewhere, so there is no step, only the feather. Re-encoded at the bake's own flat-QP params; 899 KB → 736 KB at 1080p, 426 KB → 369 KB at 720p, since freezing the posts made a further slice of the frame static. **The chrome is the name's colour.** The three ripple rings, their launch bloom in the `ripple-neon` keyframe, and the laptop's hover shadow all move from the scene's ember (`rgba(255,219,163)` → `rgba(224,163,92)`) onto `#ff6d05` falling through `rgba(255,106,0)` — the exact fill and halo of the `MUHAMMAD ABDULLAH` `h1`. This deliberately trades back the hue finding recorded in the entry above (this orange runs at h25.5°/s72% where the scene's real flames sit at h31.9°/s38%) for identity: the rings, the bloom and the name now read as one light source. What that fix got RIGHT is kept — the feathered radial-gradient band with no stop at full opacity, and the alpha rather than an opaque hex on the bloom — since the edge, not the hue, is what made the old ring read as a vector ellipse drawn on a photograph. Ring alphas carry ~15% higher than the gold version (0.44/0.30/0.19 → 0.50/0.34/0.22) because `#ff6d05` is a far darker colour (relative luminance ~0.31 against ~0.72) and would otherwise have read as a dimming rather than a recolour. The nav buttons and the contact shadow are untouched: the buttons are controls, and the contact shadow is an occlusion, not a glow. |

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

#### `/contact` adopted onto the unified fluid scale

| | |
|:--|:--|
| **Ref** | [#9](https://github.com/MA1002643/theabdullahfolio/issues/9) |
| **Files** | `src/app/(sub pages)/layout.js`, `src/app/(sub pages)/contact/page.js`, `src/components/contact/ContactIntro.jsx`, `src/components/contact/Form.jsx`, `src/app/globals.css` |
| **Details** | **The Contact page is the second adopter of the [#50](https://github.com/MA1002643/theabdullahfolio/issues/50) fluid scale** ([#9](https://github.com/MA1002643/theabdullahfolio/issues/9)): `/contact` joins `FLUID_SCALE_PAGES`, and every Contact-specific breakpoint jump — `space-y-6 py-2 sm:py-0`, the headline column's `sm:w-3/4` snap, the intro's `xs:text-base text-sm`, the form's `max-w-xl px-12 py-6 space-y-4`, the fields' `p-2 rounded-md`, the CTA's `px-6 py-2` — becomes one continuous `fluid()`/`fluidText()` value or a `.fluid-scale`-scoped rule. At scale 1 everything resolves to the legacy values exactly (verified: input 16px text / 8px pad / 6px radius, CTA 8px×24px ≡ `py-2 px-6`, form max-width 576px ≡ `max-w-xl`, intro 16px/24px, between-children 16px ≡ `space-y-4`) with two deliberate design changes from the issue: the form's horizontal padding base is **1.5rem, not the old `px-12`'s 3rem** (that padding was the main cause of the cramped 320px layout), and error/status text unifies on a 0.875rem base. **The floating-label field system scales as one organism**: three custom properties on `.float-field` (`--field-font` / `--field-pad` / `--field-radius`) drive the real input, the fire-gradient overlay that mirrors it (whose textarea flavour encodes padding as a transparent `calc(pad + 1px)` border), the resting label (`left` tracks the pad), the notch (`0.82 × font`, so the outline gap always fits the floated label), and the outline's half-legend top inset (`-0.41 × font`) — verified in lock-step at all of 320/375/414/768/1007/1280/1440/1920/2560px with zero horizontal overflow. The scoped rules sit **outside any `@layer`** (like all #50 rules) so they out-cascade Tailwind utilities without `!important`; the one trap that creates — an unlayered resting `top` on the textarea label would beat the *layered* floated `top: 0` — is defused by re-declaring the floated state unlayered. `space-y-4` survives as the between-children mechanism (scaled via a `.contact-form` child rule) precisely so the error spans' inline margins keep overriding it to hug their fields — a flex `gap` can't be overridden per-child. **Floors**: field/label/intro/CTA text hold 14px (0.875rem) from ~1260px down; errors, connection status, and refine text hold 12px (0.75rem); the banner text 11.2px; and — the one *spacing* floor in the system — field padding stops at 0.4rem because it is touch-target size, not layout air (inputs measure ~36px tall at 320px). The refine/draft pills never shrink below their base size, and a coarse-pointer-only invisible `::after` extends their hit area to 44px tall (vertical-only, so adjacent buttons' targets can't overlap). **`SendingLabel` re-measures on window resize**: its one-time `getBBox()` sizing meant a resize during an in-flight send left the molten overlay drawn at the old size; verified over a raw CDP metrics override 1.6s into a stubbed 4s send — button font 16px→14px, overlay re-measured 110.9px→99.4px in the same frame sample, sweep → ✅ toast → ✓ SENT → remount all intact (SliceLabel already had a `ResizeObserver`; ✓ SENT / ✦ HELD are `em`-sized and inherit for free). Full lifecycle re-verified at both ends: idle → SENDING… → ✓ SENT online, and the offline path (✦ HELD, "Saved — it will send when you reconnect." toast, 12px status line) with the draft-restore banner and refine affordance measured mid-scale at 1007px. One accepted sub-pixel note: Chrome snaps the textarea overlay's border-width to whole pixels, so at fractional scales the gradient text can sit ≤0.5px off the caret — invisible in practice, and the scale-1 value (9px) stays integer-exact. Rides along: the form wrapper's inert `gap-6` dropped (the flex row holds a single child, so the utility never rendered anything). |

#### `/qualifications` adopted onto the unified fluid scale

| | |
|:--|:--|
| **Ref** | [#53](https://github.com/MA1002643/theabdullahfolio/issues/53) |
| **Files** | `src/app/(sub pages)/layout.js`, `src/components/qualifications/Carousel.jsx`, `src/components/qualifications/certSizes.js`, `src/app/globals.css` |
| **Details** | **The Qualifications page is the third adopter of the [#50](https://github.com/MA1002643/theabdullahfolio/issues/50) fluid scale** ([#53](https://github.com/MA1002643/theabdullahfolio/issues/53)): `/qualifications` joins `FLUID_SCALE_PAGES`, which alone converts the shared surfaces — `PageTitle`, both `ScrollHijackCategories` rows (via the `.category-tab` / `.category-strip-track` scoped rules), and the layout's main padding. The page-specific work is the 3D carousel, and it needed **zero JS scale plumbing** (the issue anticipated a resize-listener hook): `calc()` is valid inside transform functions, so the coverflow step became `translateZ(calc(-absOffset × var(--card-depth)))` with `--card-depth: 200px × the factor`, and the entrance plunge scales the same way (`-400px ×` factor; its `scale(0.5)` is a ratio — resolution-independent, unchanged). `.perspective-3d` scales by the same factor in `globals.css`, keeping the depth/perspective ratio (200/1200) invariant — the wheel's recession/tilt reads identically at every width while the pixel sizes breathe. **The stage geometry is a lerp, not a multiply**: the container caps (`--cert-cap`, `--cert-w-cap`, `--slot-vh`, stage height) are vh/vw-based — already height-responsive — so multiplying by the width-derived factor would have shrunk phones (68vh × 0.6 ≈ 41vh); what the old `md:` variants encoded was a width-driven jump between two authored endpoint sets, and `--carousel-t = clamp(0, (factor − 0.6) / 0.4, 1)` re-expresses it as a smooth morph — the old mobile values at ≤864px, the old desktop values at the 1440px anchor, interpolating between and HELD at the design endpoint beyond (heights are viewport-fit caps and must not overgrow; `--card-depth` alone rides past 1 with perspective matching it). Card chrome (`py-6 text-xl`, image-frame `p-[0.3rem] rounded-lg`, banner `p-3 mt-3`, Prev/Next `px-4 py-2 rounded-lg gap-6`, strip margins `mt-10 mb-4/mb-8`, empty state `text-lg`) all convert to `fluid()`/`fluidText()` with 0.875rem text floors; the banner radius moves to `.qual-banner` so one scoped rule reaches the element AND its `::before` ring (inline styles can't). The title's `text-lg` becomes `.qual-title` (base = text-lg exactly; rem line-height deliberately kept so the fitter's per-card font shrink can't change bar height), and **`FitOneLineTitle` re-derives its base per fit** instead of caching the first value — under the scope the base itself is viewport-derived, and the cached value pinned titles at the old scale after a resize. **`certSizes` rebanded** (single shared source with the preloader, byte-identical contract intact): the old two 768px bands under-declared width for landscape certs on portrait tablets (real 90vw-bound width vs declared 70vw → soft upscale, a pre-existing defect); now ≤864.98px is the exact mobile size, the 865–1439.98px morph band declares the upper envelope `min(90vw, ar × 68vh)` (never blurry, at most one srcset bucket of over-fetch), and ≥1440px is the exact design size. Inert `gap-6`/`rounded-2xl` dropped from the card wrapper (one flex child; no surface for a radius). Verified at 320/375/414/768/1007/1280/1440/1920/2560 × 900: every metric tracks the factor exactly — 1440 is pixel-identical to the legacy `md:` render (stage 720px, perspective 1200px, slot 396px = 44vh, depth −200px, title 18px/28px), the morph interpolates (stage 639px, depth −139.9px at 1007px), phones pin at the old mobile endpoints (612/720/−120) with 14px floors, ultrawide holds heights while depth/perspective scale together (−260/1560); category-switch entrance replays through the hidden pose with byte-identical stage height (no layout shift), Prev/Next rotate the wheel, and an emulated `prefers-reduced-motion` render keeps every fluid size identical while cards land directly in the settled wheel. Zero horizontal overflow at every width. |

#### `/about` adopted onto the unified fluid scale

| | |
|:--|:--|
| **Ref** | [#25](https://github.com/MA1002643/theabdullahfolio/issues/25) |
| **Files** | `src/app/(sub pages)/layout.js`, `src/app/globals.css`, `src/components/about/index.jsx`, `src/components/about/ItemsLayout.jsx`, `src/components/about/LanguagesCard.jsx`, `src/components/about/StatsCard.jsx`, `src/components/about/StreakStatsCard.jsx`, `src/components/about/RepoStatsCard.jsx`, `src/components/about/SkillsCard.jsx`, `src/components/about/SkillIcon.jsx`, `src/components/about/UpdateBanner.jsx` |
| **Details** | **The About page is the fourth adopter of the [#50](https://github.com/MA1002643/theabdullahfolio/issues/50) fluid scale** ([#25](https://github.com/MA1002643/theabdullahfolio/issues/25)): `/about` joins `FLUID_SCALE_PAGES`, which alone converts `PageTitle` and the layout's main padding. The whole conversion uses the **PageTitle override mechanism**: the legacy breakpoint utilities STAY in the JSX as the out-of-scope base (pixel-identical off-scope / on pre-CSS-trig engines), and `(0,2,0)`-specificity scoped rules or inline styles out-rank them under the scope — the only classes physically removed are the hero card's `!py-4 sm:!py-5` (important beats scoped rules and inline styles alike; replaced by an inline `fluid(1.25)` paddingBlock). Four shared semantic classes carry the repeated treatments: `.abt-card` (ItemLayout's p-6 sm:p-8 / rounded-xl — call-site `!p-0` overrides still win, correctly, since those cards pad an inner wrapper that scales inline), `.abt-title` (the four per-card `AnimatedTitle` headings, md:text-2xl anchor with the smallest legacy base as floor; unitless `leading-tight` rides for free), and `.abt-micro` / `.abt-micro-md` (the 10px uppercase eyebrows/legends — **grow-only**: the floor equals the designed 10px, so micro-labels never shrink, only scale up to 13px on ultrawide). **The section shell's horizontal padding is a lerp, not a multiply** (the `--carousel-t` pattern, keyed off `var(--fluid-min)` so page-level knob overrides stay honoured): legacy phones had ~¼ of the desktop's 128px total inset — a range a 0.6-floored factor can't span linearly — so the inline axis morphs 2.5rem → 7rem across the floor→anchor band, × the factor beyond; at 1440 main + section = the legacy 128px exactly. Everything else is a straight ride with legibility floors: hero heading/paragraph (the line-height floor keeps the font's 1.5 ratio so rhythm can't drift as either binds), the two feature-card counters (3rem anchor, floor = the legacy mobile text-2xl), stat rows/labels/date ranges, both banners' message text, the languages bar height (the h-2 → md:h-3 jump gone) and language list (the sm→base→sm font zig-zag collapsed to one fluid size; the xl: two-column switch stays structural), and every card's padding/radius (`.abt-card` outer + each `repo-card-breathe` inner wrapper inline). **SVG rings scale by their wrapper** (all viewBox-drawn): the GitHub Stats rank ring (10rem anchor / 7.5rem floor = the legacy 120px), the streak rings (7rem / 5rem), and the repo activity ring (5rem / 4rem — its fixed `width="80" height="80"` attrs became `w-full h-full`). The SkillsCard cell dropped its bespoke `clamp(2.5rem,7vw,4rem)` for `fluidText(4, 2.5)` — same phone floor and design size, but the cell now grows past its old 914px cap and moves in lockstep with every other fluid dimension. Deliberately structural and kept: the `sm:flex-row` column↔row switches, `xl:grid-cols-2`, and `hidden sm:block` dividers — layout changes, not size jumps. Verified in-browser at 320/768/1200/1440/1920/2560 × 900: every measured value tracks the factor exactly — 1440 is pixel-identical to the legacy anchor (section 112px + main 16px = 128px, card pad 32px, headings 24px, counters 48px), floors bind at ≤864px (18 / 28.8 / 10px), ultrawide holds 1.3× (31.2 / 62.4 / 13px), and the 1200px mid-curve (card pad 26.67px) proves the old `sm:` jump is gone; all seven data cards mount (rank ring 133.33px, streak ring 93.33px, skill cell 53.33px at 1200), with zero horizontal overflow and zero console/hydration errors at every width. |

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

#### Homepage hero cohesion pass — the scene pushed back into being an environment

| | |
|:--|:--|
| **Ref** | — (owner-directed: the causeway was competing with the UI rather than hosting it) |
| **Files** | `src/app/globals.css`, `scripts/scene/bake-home-grade.mjs`, `public/background/home-hero.webp`, `assets/source/home-hero-src.webp` |
| **Details** | The production hero worked because its background was near-black and empty, so the neon-orange UI owned the frame outright. The causeway is a **co-star**: bright teal, perspective lines converging directly behind the laptop, and two foreground lanterns sitting at exactly the nav ring's height. Nothing was wrong with either half — they were competing for the same job. Four changes, each removing one specific competitor. **`.home-scrim`** gains a *stage well* (a soft dark ellipse under the laptop/nav cluster, centred at 62% because the cluster sits below the frame's middle) and an *edge vignette* (transparent across the middle 55%, closing hard into the corners). The well is an ellipse rather than a raised floor deliberately: the scrim's centre band was the LIGHTEST on purpose so the vanishing-point mist could rim-light the laptop, and darkening the centre uniformly would trade the composition's best feature for its noisiest. The vignette is also what dims the two lanterns fighting the buttons — by their POSITION in frame, so the causeway's receding lights keep their full run to the vanishing point. **`.custom-bg`** gets a real substrate: its background was `rgb(var(--background) / 0.2)`, which over the old black plate was invisible *and* harmless, but over a photograph leaves white glyphs sitting on the causeway's own lanterns and mist — the brightest, busiest part of the frame. Now a mostly-opaque dark plate with a radial falloff (densest under the glyph, easing at the rim so it still reads as a lens, not a coin) plus `saturate(0.75)` in the backdrop filter. **The plate is graded** (`scripts/scene/bake-home-grade.mjs`, baked because the shader resamples this exact file — a CSS filter would grade still and moving layers inconsistently — and because a full-viewport filter is a permanent per-frame cost on the LCP route). Saturation 0.80 with only a nudge cooler: desaturating a blue image necessarily *warms* it (chroma pulled toward luminance raises the lowest channel, here red), so "cooler" and "less saturated" pull against each other, and the first cut had to cut red 16% to win — which would have taken the lantern flames down with it. Global darkening was also dropped after it clipped highlights 255→245: the scrim's new well and vignette darken by *region*, which is the better tool anyway. The original is kept as `home-hero-src.webp` and the script always grades from it, so the bake is re-cuttable and reversible and can never compound. **`.laptop-contact`** deepens 0.62→0.86 with a tighter core and wider skirt: a real contact shadow on wet stone has near-total occlusion directly under the object, and at the old level over lantern-lit stone it read as a smudge rather than as contact. |


#### Homepage arrival ignite burns the headline's colour — the sweep and its bloom off warm yellow

| | |
|:--|:--|
| **Ref** | — (owner-directed: "the yellowish colour that sweeps the bridge and ends in a boom") |
| **Files** | `src/components/home/HomePathIgnite.jsx` |
| **Details** | `HomePathIgnite` paints three fills additively (`globalCompositeOperation = 'lighter'`), and two of them — the wavefront travelling the causeway, and the bloom that lands at the vanishing point — carried a **temperature ramp** rather than a colour: near-white core `rgba(255,246,214)` → warm yellow `rgba(252,214,140)` → amber edge `rgba(234,181,62)`. Additive stacking of a near-white hot end is exactly what makes a light read *yellow* on a dark plate, whatever the mid stop says. Both ramps now hold one hue — `rgba(255, 109, 5, α)`, the `#ff6d05` the `MUHAMMAD ABDULLAH` `h1` is stroked in — with alpha alone carrying the falloff, the same way the ripple rings, their launch bloom and the laptop's hover shadow were written in the cohesion pass above. **Nothing else changed**: every alpha coefficient, radius, easing curve and timing constant (`TRAVEL_MS` 1700, `BLOOM_MS` 800, `DECAY`, `RISE`) is byte-identical, so the gesture is the one already tuned — only its colour moved. **The lanterns catching are deliberately left alone.** Their flare is the plate's own photographed fire re-flaring, and it decays back into `HomeSceneGlow`'s ambient `rgba(255,228,186)` halo and the filmed flame loop; recolouring it would pop orange and settle yellow, which reads as a defect rather than a decision. The cold mist breath pushed out with the bloom (`rgba(150,198,236)`) also stays — it exists to be the counterpoint to the warm light, not part of it. |


#### Scene asset scripts collected into `scripts/scene/` — and made runnable again

| | |
|:--|:--|
| **Ref** | — (owner-directed working-tree audit: "check if all 94 files are needed, and what has gone wrong that some are in the main root") |
| **Files** | **moved** 24 scripts from the repo root into `scripts/scene/` (the six `.`-prefixed ones un-hidden: `.ghost-hunt` / `.hero-crop-audit` / `.measure-flames` / `.motion-check` / `.scene-verify` / `.swap-check`) · **new** `scripts/scene/workdir.mjs`, `scripts/scene/README.md` · **moved** `public/background/home-hero-src.webp` → `assets/source/home-hero-src.webp` · **removed** `.flame-strip.mjs`, `.ghost-extent.mjs`, `gen-home-video.mjs` · `.gitignore`, `package.json`, `README.md` |
| **Details** | The scene pipeline had accumulated **27 loose scripts at the repository root**, which is where they were authored (run from the root, output beside them) and where they stayed. That was untidy; the real defect underneath it was not. **19 of the 27 hard-coded an absolute path into a per-session agent scratchpad** — `/private/tmp/claude-501/…/<uuid>/scratchpad` — and every one of those directories was long gone, so a script the README cites as the provenance of a shipped asset could not be re-run by anyone, on any machine. Four more spawned an `ffmpeg` binary from inside one of those dead scratchpads, even though `ffmpeg-static` is a devDependency of this repo. **The fix is one contract, not 19 edits**: `workdir.mjs` exports `WORK = process.env.SCRATCH ?? './.scene-work'` and creates the directory on import — created rather than merely resolved, because several of these scripts write their first output minutes into a decode, and a missing directory should not be discovered there. `.scene-work/` is gitignored; the four ffmpeg call sites now import `ffmpeg-static` and keep their `FFMPEG=` override. **The two shell scripts were outside that contract in both halves, and both mattered.** `finish-projects-scene.sh` staged everything in `mktemp -d` under `TMPDIR` and deleted it on exit — but its near-lossless master is the INPUT to the loop search, the loop assembly and the poster, so re-cutting at a different `FADE` or re-checking a seam meant paying for a full re-grade of a 2560×1440 clip, and nothing was left to inspect when a result looked wrong; `bake-table-flames.sh` kept `${TMPDIR:-/tmp}/table-flames`, which additionally held **the only copy of the pre-bake asset ladder** it backs up before overwriting `public/background/`. Both now take a named subdirectory of the same `SCRATCH` work dir (`projects-scene/`, `table-flames/`) with fixed filenames, so reruns overwrite instead of accumulating and nothing survives only in a directory the OS may sweep. Both also resolved ffmpeg from `PATH` (`${FFMPEG:-ffmpeg}`, and a `command -v ffmpeg || exit 1` guard) on a machine that **has no system ffmpeg** — so `bake-table-flames.sh` could not run at all — and now resolve the `ffmpeg-static` binary themselves, keeping `FFMPEG=` as the override. Verified by evaluating each script's prelude from three working directories: both resolve the same absolute work dir and the same executable ffmpeg from the repo root, from `scripts/scene/`, and from `/tmp`, and `SCRATCH=` relocates both. **The documented `FFMPEG=` override was then made true everywhere**: five `.mjs` (`bake-causeway-water`, `ghost-hunt`, `remask-causeway-posts`, `scene-verify`, `swap-check`) imported the `ffmpeg-static` binary and passed it straight to `execFileSync`, so the override the README promised silently did nothing in 5 of the 9 scripts that run ffmpeg — aliasing it at the import (`const ffmpeg = process.env.FFMPEG ?? ffmpegStatic`) fixes all five without touching a single call site. Resolution is now identical in all 11: `FFMPEG=` if set, else the bundled binary, and **never `PATH`** — a PATH fallback sounds forgiving but its real effect is that some machines silently encode with a different ffmpeg build than the one the measured seam and QP settings were tuned against. Proved by pointing `FFMPEG=` at a decoy binary and watching both the shell and Node resolution paths pick it up, and by re-checking that no `${FFMPEG:-ffmpeg}`, `command -v ffmpeg`, or literal `'ffmpeg'` spawn survives anywhere in the directory. **One script did not survive the move untouched, and it is the interesting one.** No `.mjs` resolves anything relative to its own file (no `import.meta.url` / `__dirname` anywhere) — every path is repo-root-relative, e.g. `src/components/home/homeSceneLights.js` and `public/background/…` — so those behave identically provided they are still invoked from the root, which every usage comment and both shell scripts' internal sibling calls now say explicitly. But `finish-projects-scene.sh` derived `DIR` from `$0` and used that **one** anchor for two different jobs: locating the sibling `.mjs` files it drives (correct) *and* locating the repo's `public/background/` output (correct only while the script sat at the repo root). From `scripts/scene/` it would have written the finished loop and its poster to `scripts/scene/public/background/` — failing on the missing directory, or worse, silently producing assets the app never loads. The two anchors are now separate (`DIR` for siblings, `ROOT="${DIR}/../.."` for outputs), which as a side effect makes that script correct from **any** working directory, since the two `.mjs` it calls take explicit paths and read nothing cwd-relative. Verified by resolving all 21 repo paths referenced across all 24 scripts (0 unresolvable), `bash -n` on both shell scripts, `node --check` on all 22 `.mjs`, and re-running `detect-lights.mjs` end to end from its new home. Verified end to end: all 22 `.mjs` parse, and `node scripts/scene/detect-lights.mjs` re-runs from the new location, re-measuring the lantern rig off the shipped plate and writing its annotated preview into the new work dir. **Three scripts were deleted outright** — `.flame-strip.mjs` and `.ghost-extent.mjs` (throwaway comparison probes, pinned to dead scratchpads, cited nowhere) and `gen-home-video.mjs` (superseded by `gen-causeway-video.mjs`; the homepage ships no full-scene video). **`home-hero-src.webp` left `public/`**: it is the ungraded plate `bake-home-grade.mjs` grades *from*, deliberately kept so the bake can never compound — but a build input sitting in `public/` is uploaded, deployed and publicly served on every request path that guesses its name, for 264 KB nobody fetches. It now lives in `assets/source/`, with the three scripts that read it repointed. Also swept: `package-lock.json` was listed in `.gitignore` while being **tracked**, so the rule was a no-op that only misled anyone reading it (lockfiles belong in the repo — the rule was the wrong half); and `@eslint/js` + `globals` were dropped from devDependencies, orphaned when the inert `eslint.config.mjs` went (ESLint 8.57 does not read flat config without `ESLINT_USE_FLAT_CONFIG`, so `.eslintrc.json` was always the live config — `npm run lint` verified unchanged before and after). |


### Fixed

#### The role line's strike animation re-armed on every scene pause, hiding a heading that had already arrived

| | |
|:--|:--|
| **Ref** | — (review finding on [#146](https://github.com/MA1002643/theabdullahfolio/pull/146), against the latent-engraving entry above) |
| **Files** | `src/components/home/HomeRoleLatent.jsx` |
| **Details** | `useSceneGate` pauses a layer by flipping `running` false **without unmounting it** — the element has to survive for the `IntersectionObserver` to ever see it come back. `HomeRoleLatent`'s plate effect lists `running` in its deps, so every pause ran its teardown, and that teardown removed `is-printing` from the `<h2>`. The `struck` flag was local to the effect, so the next resume re-added the class — and `hero-role-strike` opens at **`opacity: 0` and holds it to 76% of 2960ms**. Cost: a heading that had been legible for minutes went blank for **~2.25s** and re-printed itself, on every tab switch and, more often, every time the hero scrolled out of view and back at `threshold: 0`. The removal was written to stop a client-side navigation back to the homepage finding the type already struck, but that case never reached this line: a real unmount destroys the `<h2>` and takes the class with it. So the class now stays, and `struck` is lifted to a ref that lives as long as the heading does — one strike per element, which is what `both` on the animation already assumed. Verified on the running dev server against a faked `visibilitychange`, with the canvas fingerprinted at three points to prove the gate genuinely cycled: the plate loop painted, stopped while hidden (teardown really ran), and painted again on resume, while the heading held `is-printing` throughout and its **minimum opacity over a 2.6s window — longer than the animation's own blank hold — stayed 1.000**. A hand-run of the old sequence on the same page (remove, then re-add) drops it straight to 0.000, which is the regression this replaces. Remount still re-strikes as designed: an SPA hop to `/projects` and back yields a **different** `<h2>` node that arms, dips to 0 and lands at 1. ESLint clean |

#### A lost canvas context left the plate's frame loop turning, doing nothing

| | |
|:--|:--|
| **Ref** | — (review finding on [#146](https://github.com/MA1002643/theabdullahfolio/pull/146)) |
| **Files** | `src/components/home/HomeRoleLatent.jsx` |
| **Details** | `draw` re-armed itself at the top of every frame and only then bailed on `lost`, so a lost 2D context stopped the drawing but not the loop: the callback kept being scheduled for as long as the layer was on screen. Harmless when the context comes straight back, which is the usual case — but `contextrestored` is listened for precisely because it sometimes does not, and a context that never restores left the main thread being woken for nothing indefinitely. Measured by counting the frames the plate specifically schedules, picked out of the page's own rAF traffic by the callback's source: **60/s while running, 60/s while lost** — a quarter of the page's 240/s, spent entirely on an early return. Now cancelled in `onLost` and started again by hand in `onRestored`, with `draw` also declining to re-arm if a frame was already in flight when the context went, so the cancel cannot be raced. `!R` deliberately keeps scheduling, since that bail only spans a rebuild and the loop has to be there when the plate lands. The restart goes through a `start` indirection that begins as a no-op: both handlers are attached **before** the animated path is built, and the reduced-motion path returns without ever building it, so a restore there repaints through `refresh` and correctly starts no loop. `first` resets with the restart, so a resumed frame measures `dt` from itself rather than from whenever the last frame before the loss landed. Verified across a dispatched loss and restore: plate frames go **60 → 0 → 60**, page-wide rAF drops 240 → 180 by exactly the plate's share, and the plate repaints (28,554 inked). The same probe against the previous code reads 60 → **60** → 60, so it was measuring the right thing. Reduced-motion still frame re-checked and unchanged: 80.2% inked, no NaN, bit-identical after 2.5s, no page errors. ESLint clean |

#### A `fonts.ready` callback from a torn-down run could blank the live plate

| | |
|:--|:--|
| **Ref** | — (review finding on [#146](https://github.com/MA1002643/theabdullahfolio/pull/146)) |
| **Files** | `src/components/home/HomeRoleLatent.jsx` |
| **Details** | The plate effect re-runs on every pause, resume, and pointer-capability change, and each run registers `document.fonts.ready.then(refresh)` — a promise, which unlike every listener and timer this effect owns has **no unsubscribe**. So a `.then` registered by a run that has since been torn down still fires, and it lands on the live canvas, because this layer pauses *without* unmounting and the element is shared between runs. `rebuild` reassigns `canvas.width`, which clears the bitmap, then rewrites the inline geometry from measurements taken for a run that no longer owns the plate. Reproduced rather than argued: holding `document.fonts.ready` pending behind a gate installed before app code runs, letting the layer mount and print, tearing the run down with no successor, then releasing the gate — the stale callback **blanked the plate from 28,720 inked pixels to 0**, and nothing repaints it while paused, so it stays blank until the next resume. Fixed with a `disposed` flag set in `teardown` and read at the top of `refresh` — the single door every rebuild comes through, so it also covers any future async caller. Verified in the same harness with the guard in place: the stale callback leaves bitmap, geometry and all 28,778 inked pixels untouched, while a hand-run `canvas.width = canvas.width` still zeroes it, proving the probe stays sensitive. Live refreshes are unaffected — resizing 1440→700→1440 re-cuts the plate each time (770×185 → 617×140 → 770×185, inked throughout). Two of the three paths named in review were already safe and are left alone: `contextrestored` is removed from the canvas in `teardown`, and the coalescing timer is cleared there. ESLint clean |

#### The reduced-motion still frame locked two of its three inks and left the third where the plate's size happened to put it

| | |
|:--|:--|
| **Ref** | — (review finding on [#146](https://github.com/MA1002643/theabdullahfolio/pull/146)) |
| **Files** | `src/components/home/homeRoleEngraving.js`, `src/components/home/HomeRoleLatent.jsx` |
| **Details** | `alignAtCentre` exists so the one frame a `prefers-reduced-motion` reader gets is the frame where the latent word is at maximum contrast, and it did that by measuring separation 1's beat against the reference and returning the phase that cancels it. `paintStill` then applied that single number to separations **1 and 2**. Each ink is cut at its own `REST_TILT` and `REST_PITCH`, so each arrives at the plate's centre with its own beat: the shared lock zeroed ink 1 exactly and moved ink 2 to an arbitrary place. Measured on the real module rather than a model of it — the residual is **0.75 of a cycle on a 720×300 plate, 0.54 on 430×190, 0.12 on 1180×470**: near the worst case, near the worst case again, and near the best, entirely by accident of geometry. The cost lands on the **ground**, not the word: three inks stacked on one line print a cleaner field than three spread across three, while the word's own light barely moves, so what the residual takes is the contrast the word is read against. Fixed by returning one lock per separation, index-aligned with `seps` and zero for the reference, with the caller applying `locks[i]`. Word-to-ground luminance at the plate centre rises **1.0–3.7%** across five geometries (720×300, 1180×470, 430×190, 900×360, 512×220) and every separation's residual beat goes to zero to six decimals. Verified end-to-end in Chrome under CDP-emulated `prefers-reduced-motion: reduce`, since that is the only path that reaches this code: the plate paints 80.2% inked at mean alpha 15.2 with **no NaN pixels** — the failure an undefined lock would have produced — and is bit-identical after 2.5s, which is the still frame's own contract. Sole caller; no other consumer of the changed return type. ESLint clean |

#### The homepage glow layer's "no ambient video ships for this route" claim outlived the video's restoration

| | |
|:--|:--|
| **Ref** | — (review finding on [#146](https://github.com/MA1002643/theabdullahfolio/pull/146)) |
| **Files** | `README.md` |
| **Details** | The "Homepage causeway scene" row claimed **"Procedural only — no ambient video ships for this route"** and rested an LCP argument on it, while the two rows immediately below it document an ambient lake loop and filmed lantern flames on that same route. Checked against what renders rather than against the prose, because the water row describes itself as *restored after being withdrawn* and a withdrawn layer would have made the claim true: `page.js` mounts `HomeSceneWater`, which renders `HomeSceneVideo` on the primary path and only swaps to the `HomeSceneLivePlate` WebGL warp when the clip fails, and both rungs it sources — `causeway-720.mp4` and `causeway-1080.mp4` — are present in `public/background/`. So the route does ship ambient video and the claim was false, not merely loose. It was also load-bearing in the wrong direction: it is the premise the flames row explicitly overturns ("the premise was right and the conclusion wrong, because this route was **already** shipping a clip for its lake"), so a reader budgeting assets from the glow row would have reached the conclusion the next row exists to correct. Narrowed to what is actually true and actually `HomeSceneGlow`'s to claim — that **this layer** is procedural and zero-byte, which is what earns a glow canvas its place on an LCP-critical page — and pointed at the two rows that own the video's cost and its fallback chain, rather than restating either. Documentation-only; the fallback pointer was checked against `HomeSceneWater.jsx`, whose video-or-warp-never-both behaviour the flames row already describes |

#### Both restatements of the iris ramp's floor were wrong, each in a different half

| | |
|:--|:--|
| **Ref** | — (review findings on [#146](https://github.com/MA1002643/theabdullahfolio/pull/146), against the latent-engraving entry above) |
| **Files** | `src/app/globals.css`, `README.md` |
| **Details** | The ramp's floor is recorded in three places, and the two that restate it had each drifted — in opposite halves, which is why neither looked wrong beside the other. The comment on the iris gradient in `globals.css` named the right kind of claim about the **wrong stop** ("the orchid stop is the floor of the ramp and the one to check first if these are ever retuned"); the README palette table named the **right stop with the wrong number** ("floor stop is periwinkle at 5.74:1" — 5.74 is orchid's desktop figure). The source of truth, the contrast block in `globals.css`, was correct throughout: recomputing every stop's relative luminance against the backdrops it documents (0.0733 desktop / 0.0751 phone) reproduces it exactly — aqua 5.98/5.89, orchid 5.74/5.66, rose 5.72/5.64, periwinkle **5.60/5.52** — as does the README's own "between 5.52:1 and 5.98:1" further down. Left alone, the CSS comment aimed the next retune at the stop with the *third* most headroom and away from the one with the least, and the README understated the floor's tightness by 0.14. Both now name periwinkle and carry **5.60 desktop / 5.52 phone**, so a wrong copy can be caught where it is made rather than only by cross-reading; the CSS comment additionally says where orchid actually sits, and both defer to the contrast block as the single place the four stops are ranked. Documentation-only — no declaration, token or hex changed, verified on the running page: the gradient still resolves to all four original stops with `background-clip: text` intact |

#### The WebGL flame layer had no texture-size guard, and its give-up path was wired to nothing

| | |
|:--|:--|
| **Ref** | — (review finding on [#144](https://github.com/MA1002643/theabdullahfolio/pull/144)) |
| **Files** | `src/components/home/HomeSceneLivePlate.jsx`, `src/components/home/HomeSceneWater.jsx` |
| **Details** | `HomeSceneLivePlate` uploaded the plate — up to **2560×1440**, the source cap on every srcset rung — without ever asking the GPU whether it fits. Oversizing does not throw: `texImage2D` raises `INVALID_VALUE`, the sampler stays INCOMPLETE, and `texture2D` then returns `(0,0,0,1)`. Traced through this layer's own blend that is not a subtle degradation — the fragment shader emits `vec4(col * uPlateAlpha * box, box)`, so a black sample keeps full coverage in alpha, and premultiplied `ONE / ONE_MINUS_SRC_ALPHA` resolves to `dst * (1 - box)`: the eleven flame boxes get punched to **black over the lit lanterns**, which is worse than not mounting at all. `MAX_TEXTURE_SIZE` is now read before a buffer, texture or program exists, and the layer declines rather than allocating for an upload that cannot land. **The bigger half was that declining did nothing.** `onUnsupported` was documented as the way this tier hands back to the still plate and was called on both existing failures (no WebGL, shader build failure) — but `HomeSceneWater` mounted `<HomeSceneLivePlate />` with no prop, so every give-up path left a mounted canvas that would never draw. The parent now carries a `plateUnsupported` state and renders `null`, which IS the still tier its own header comment already described ("still → nothing mounted; the plate alone"). Both callbacks are `useCallback`-stable because the child lists them in an effect's deps — a fresh identity per render would drop and rebuild a WebGL context every render. Also released what was previously leaked: a failed `link()` deleted neither shaders' program, and an abandoned context was never lost, which matters because browsers cap live WebGL contexts and evict the oldest. **Scope, honestly stated:** this needs a GPU whose `MAX_TEXTURE_SIZE` is under 2560 (essentially all current hardware reports ≥4096) *and* a video decode failure, since the warp only mounts as the video's fallback. Rare — but the failure it produces is the visible kind, and the guard costs one `getParameter`. |

#### The Node-version launchers reported SUCCESS for a signal-killed build

| | |
|:--|:--|
| **Ref** | — (review finding on [#144](https://github.com/MA1002643/theabdullahfolio/pull/144)) |
| **Files** | `scripts/next-cmd.mjs`, `scripts/dev.mjs` |
| **Details** | Node sets `code` to `null` and `signal` to the signal name when a child dies from a signal, so `process.exit(code ?? 0)` exited **zero** — and both launchers had exactly that line. The failure class it silently passed is the one the wrapper exists to guard: a `next build` killed by the OOM killer (`SIGKILL`) or by a CI runner's `SIGTERM` leaves a half-written `.next`, and `npm run build` would report success over it. Reproduced against the real wrapper before changing anything — `SIGTERM` mid-`next lint` measured `exit code=0`. Signals now map to **128+n**, the shell convention, so the status also says which signal: measured 143 for `SIGTERM` and 130 for `SIGINT`, with a clean run still exiting 0. The normal path is `code ?? 1` rather than `?? 0`, since a null code with no signal is not a success anyone can vouch for. **The finding's second half did not survive checking.** It reported that a missing `next` binary surfaces as an unhandled `error` event; it does not — the child Node spawns fine, fails `MODULE_NOT_FOUND`, and that status propagates correctly (measured: exit 1). The `error` event fires when the **runtime** cannot be spawned, i.e. `resolveSupportedNodeBin` returning an nvm path whose version has since been uninstalled. That case did already exit non-zero, so it was never a false success — but it surfaced as a stack trace into `internal/child_process`, and now reads `[build] could not start <path>: spawn … ENOENT`. Both files were fixed, not just the one the finding named: `dev.mjs` is where the pattern the other launchers copied came from. |

| | |
|:--|:--|
| **Ref** | — (found while diagnosing an unrelated VS Code nvm error; the same gap had already forced a manual `PATH` override to build during that session) |
| **Files** | **new** `scripts/supported-node.mjs`, `scripts/next-cmd.mjs` · `scripts/dev.mjs`, `package.json`, `README.md` |
| **Details** | **The guard chain had a hole in the middle of it.** `.npmrc` sets `engine-strict=true`, so a mismatched Node fails `npm ci` — but that is **install** time only, which `dev.mjs` already says in its own header: *"nothing stops an already-installed repo from being launched with v25."* `dev.mjs` closed that for `next dev`. `build`, `start` and `lint` were left as bare `next …` calls that ran on whatever Node invoked npm. **That is worse for `build` than for `dev`**, because the failure mode being guarded against is a V8 bug in **webpack's cache serialization**, and a production build leans on that path harder than the dev server does. **Not theoretical.** In an interactive shell the lazy nvm wrapper in `~/.zshrc` resolves `npm` to Node 22, which is why this never showed up by hand. Anything invoking npm *without* that shell — an agent, an editor task, a bare `sh -c` — gets Homebrew's v25 instead; measured directly, a `PATH` with the nvm entry stripped runs `next build` on **v25.2.1**. It had already bitten once in the session this was found in, where building required manually prepending the Node 22 bin dir. **The fix moves the range check out of `dev.mjs` and shares it.** `scripts/supported-node.mjs` now owns `isSupportedNode` (majors 22/24, floor 22.3.0 — the `engines` range) and the nvm resolution, and `scripts/next-cmd.mjs` is a thin launcher so `build`/`start`/`lint` get the same treatment `dev` has had. Deduplicating also removes the risk of the two definitions drifting apart. **The one deliberate asymmetry is failure behaviour.** `dev` keeps its original fail-closed exit — refusing to start beats corrupting the shared dist dir. `build`/`start`/`lint` pass `required: false`: when the runtime is unsupported *and* no nvm build exists, they warn and continue on the current Node rather than hard-failing. That keeps the change strictly additive — a fresh clone or a CI image with no nvm still behaves exactly as it did before, instead of hitting a failure this launcher newly invented. On Vercel the platform honours `engines`, so the check returns `process.execPath` untouched, reads no filesystem, and re-execs nothing; `spawn` inherits the environment, so `next.config.mjs`'s `distDir: process.env.VERCEL ? ".next" : ".next.nosync"` resolves exactly as before. **Verified** from a shell with the nvm `PATH` entry stripped (so `node -v` reports v25.2.1): `npm run lint` and `npm run build` both print `node 25.2.1 is unsupported here — running Next with v22.14.0 from nvm` and then succeed — the build compiling cleanly and generating 26/26 static pages into `.next.nosync` — and `npm run dev`, started from that same v25 shell, re-execs identically, reports `Ready in 1330ms`, serves `/`, `/api/spotify` and `/api/work-status` at 200, and still leaves exactly one `next-server` running, confirming the port gate survived the refactor. |


#### Maintenance header lost its project-board signal on most refreshes — one aliased Projects v2 query had outgrown its own timeout

| | |
|:--|:--|
| **Ref** | — (owner report: `Project board unavailable, using fallback signal: This operation was aborted` in the dev terminal, alongside `work-status rateLimit: cost=4 remaining=4964`) |
| **Files** | `src/app/api/work-status/route.js` |
| **Details** | **The rate-limit line in the same log was a red herring, and the cost accounting is why.** `remaining=4964` of 5,000 is a healthy budget, and the board query measured `cost=1` — so nothing was being throttled. GraphQL cost scales with the `first:` caps, which is exactly what this route was tuned for; **latency** scales with how many items have to have their `content` resolved, which nothing was watching. The single aliased query asked for eleven boards × `first: 100` in one round-trip — 725 item subtrees, each resolving an Issue/PullRequest plus its repository — and measured **4.8 s, 5.9 s and 8.7 s** across three runs against this route's flat `GITHUB_TIMEOUT_MS` of 5,000 ms. So it aborted more often than it completed, and because all eleven boards shared one request, every board vanished from the signal together and the header silently fell back to the repo-wide open-issues logic. `AbortError`'s message is literally `This operation was aborted`, which is what surfaced. **A second defect was hiding inside the successful runs.** `items(first: 100)` is a single page, Projects v2 returns items in **board order rather than status order**, and two boards are past that cap — ma.codes at 141 items and AfaaqX at 169. Even when the query did come back, 141 of 866 items were never looked at, so an "In Progress" card sitting past position 100 was invisible to the header with nothing logged. **The fix splits the query rather than raising the ceiling on it.** Each board is now its own query, paginated to completion, run through a small worker pool — measured at **1.85–2.37 s wall for all eleven boards and 835/835 items**, against 4.8–8.7 s and 725/866 before. That costs 13 rate-limit points per refresh instead of 1, which is the deliberate trade: worst case ~2,040 points/hour against the 5,000 budget, and the guard floors sit at 200/50. Splitting also buys **failure isolation** — a board that fails now degrades to "no items from that board" and is logged by number, where before one slow board took the whole signal down; and a board number that no longer resolves is treated as empty rather than fatal, so a stale `projectNumber` in the allow-list can't sink the rest. **Two follow-on findings from measuring rather than assuming.** First, firing all eleven boards at once measurably starved the portfolio query sharing the same origin, which pushed *it* past 5 s — visible as `work-status error: DOMException [AbortError]` in `fetchPortfolioActivity` — so the fan-out is bounded at five in flight. Second, the portfolio query alone measures **2.7–3.2 s**, meaning the old 5 s cap left it under 2 s of headroom on a query GitHub routinely varies by seconds; it was always the next thing to tip over. The single shared constant is therefore replaced by two sized from measured cost — 10,000 ms for the portfolio query, 6,000 ms for a board page (~1 s each) — and board spend is now fed into `recordRateLimit` via the tighter of the two reads, where previously the boards drew the budget down invisibly and the guard only ever saw the portfolio's `cost=4`. **Verified on the running dev server**: seventeen consecutive `/api/work-status` responses with **0 aborts, 0 board failures, 0 fallbacks and 0 errors**, cold refreshes at 3.2–4.4 s and cache hits at ~10 ms, the recorded budget stepping down by exactly **17 points per refresh** (4 portfolio + 13 board) to confirm the accounting, and the Focus line resolving to the live in-progress board item. |


#### Now Playing returned 502 until its cached token expired, and never said why

| | |
|:--|:--|
| **Ref** | — (owner report: `GET /api/spotify 502` in the dev terminal) |
| **Files** | `src/app/api/spotify/route.js`, `src/app/api/_utils/spotify.js` |
| **Details** | **The route could not be debugged, by construction.** Every failure path ended in a bare `catch { }` with no logging at all, so a 502 carried no information about which of the four things that can go wrong actually did — the reason the report was a status code and nothing else. **The reproducible bug behind it is a cached token with no way to invalidate it.** `getAccessToken()` returns the access token cached in KV without validating it, and nothing in the route ever refreshes it in response to a rejection. Spotify answers a token it no longer accepts with **401 on both player endpoints** (confirmed directly: `{"status":401,"message":"Missing/invalid/expired access token"}`), the route maps any non-200/204 to `upstreamError`, and `upstreamError` returns 502 — so once a cached token stops being honoured mid-life (the app's access revoked, the secret rotated, Spotify invalidating it early), **every single poll 502s until the KV key ages out**, which for the key as observed meant **52 more minutes** of a dark widget. Note this is not the `!accessToken` branch, which honours demo mode and returns 200 in development; a rejected token skips it entirely. **The fix gives the token a way to be replaced and every failure a voice.** `getAccessToken()` takes a `forceRefresh` option that bypasses the KV read and overwrites the cached value, the player sequence is factored into a `readPlayer(token)` that reports `{ payload }` / `{ failure }` / `{ empty }`, and a 401 now triggers exactly one refresh-and-replay — bounded to 401, and only when the newly minted token actually differs, so a genuinely dead refresh token cannot become a request loop. A 400 `invalid_grant` from the token endpoint, which means `SPOTIFY_REFRESH_TOKEN` itself needs re-issuing, now says so by name; the 502 path names the endpoint and status that caused it; and the outer catch reports the error name, so an `AbortError` (a player call passing its 5 s budget) is distinguishable from an upstream status at a glance. Statuses and Spotify's `error` code only are logged — never a response body or a token. The existing contract is deliberately unchanged: a genuine empty state stays a cacheable 200, an upstream failure stays an uncached 502 so the client keeps the track it was showing, and a track recovered from recently-played still returns 200 even if currently-playing errored. **Verified end to end** by planting a token Spotify would reject into the live KV key with a 55-minute TTL — the exact wedge described above — and polling the running route: it returned **200 in 933 ms with the real track**, not the demo, logged `cached access token was rejected (401) — refreshed and retrying`, and left a valid 256-char token in KV with a fresh 3,539 s TTL. Ten further mixed polls of `/api/spotify` and `/api/work-status` returned 200 across the board with no 502s and no warnings. |


#### Footer wordmark strings rendered dotted on every viewport wider than 1200px

| | |
|:--|:--|
| **Ref** | — (owner report: "broken lanes in the guitar in the footer section", persisting after the frozen-string fix below) |
| **Files** | `src/components/footer/FooterWordmark.jsx` |
| **Details** | **Two correct-looking attributes that measure length in different coordinate spaces.** Each of the 456 strings carried `vector-effect="non-scaling-stroke"` (so the hairline stays a constant `STROKE_W` at every viewport) together with the entrance draw-in's `pathLength="1"` + `stroke-dasharray: 1`, the pair that made "one dash covers the whole string" independent of the string's real length. But `non-scaling-stroke` strokes a path in the **outermost viewport's** coordinates, while `pathLength` normalises in the path's **own user space** — so the dash was being sized in one space and consumed in the other. The two coincide only where the SVG's scale is exactly 1, i.e. at a viewport exactly `VIEW_W` = 1200px wide. Anywhere wider, every string was painted for just `1/scale` of its length: **79% at 1512px, 67% at 1800px, 47% at 2560px**. Because a scanline wordmark is built from hundreds of short runs, clipping the tail off each one does not read as "shorter lines", it reads as the letters disintegrating into dots — and it got worse the wider the window, while vanishing entirely at 1200px, which is why it looked intermittent and why the previous investigation (run at 1200px, and asserting on the DOM, where `d`, `stroke-dashoffset` and `getTotalLength()` are all perfectly correct) came back clean. **Measured before the fix at 1800px**: a row whose strings should span 894px of the raster painted 65.8% of it — against 66.7% predicted by `1/scale` — with the longest continuous run 58px instead of 88px. **The fix removes the dash rather than the `non-scaling-stroke`.** Dropping `non-scaling-stroke` would also have made the dash sound, but `STROKE_W` is in viewBox units, so the hairline would then collapse to **0.4px on a 390px phone** (where the 1200-unit viewBox is squeezed to a third) and swell to 2.6px on a 2560px display — trading a desktop defect for a mobile one. The draw-in is now a `scaleX` grow with `transform-box: fill-box; transform-origin: left center`, so each string still writes itself on from its own left end with the same x-keyed stagger and the same `REVEAL_DRAW_S` easing, but as **plain geometry**, which no stroke-space rule can rescale. `opacity` rides along on a 0s transition at the same delay because `scaleX(0)` still paints a round linecap **dot**, and 456 of those would stipple the name before the sweep reached it. `pathLength` is gone with the dash, and a new `drawnIn` flag drops the per-string inline style outright once the entrance is over — the draw-in was the only reason those 456 elements carried a style at all, and leaving transforms and transitions live under a loop that rewrites `d` every frame is pure cost. **Verified on the running dev server** across five widths, comparing painted pixels against the strings' own summed geometry: coverage goes to **100% at 2400px, 102.3% at 1800px, 105.1% at 1512px and 102.9% at 1200px** (the few points over are the round caps' antialiasing, which extends half a stroke past each end), the 1800px scanline is now **byte-identical to a dash-free control render**, and 430px is unchanged. The entrance is intact: **456/456 strings hidden before the reveal** (no linecap dots), then drawn 0 → 178 → 323 → 456 with the front crossing x=389 → 775 → 1160 and landing at t+1200ms = `REVEAL_SWEEP_MS`, settling to 0 curved paths and **0 remaining inline styles**. The frozen-string guarantees below still hold under the change — strumming leaves 36 strings ringing and 0 after ring-down, and scrolling away mid-ring, returning, and resizing mid-ring all read 0. |


#### Footer wordmark returned mis-shapen — plucked strings frozen mid-oscillation

| | |
|:--|:--|
| **Ref** | — (owner report: "sometimes for some reason the lines that form the guitar are miss stuctured") |
| **Files** | `src/components/footer/FooterWordmark.jsx` |
| **Details** | **A wave is a transient, but the code could stop halfway through erasing one.** A string's resting shape is a straight `M x1 y H x2`; a pluck replaces it with a 20-point standing wave that only the rAF loop walks back to flat, frame by frame. The `IntersectionObserver` that pauses the loop off-screen cancelled the animation frame and nothing more — and its re-entry branch only refreshed the cached rect, so the loop was **never restarted**. Whatever `d` the last frame happened to write was therefore frozen into the DOM permanently, and since the strings sit `ROW_STEP` = 7.5 units apart, a string left bent by a few units lands halfway into its neighbour's row and the letterforms visibly break. **Measured on the running dev server**, strumming the wordmark and scrolling away mid-ring left **30 strings frozen off-axis, 11 bent by more than half a unit, the worst by 4.29** — and they were unchanged after three further seconds back in view. Interrupting the *entrance* strum was worse: **278 of 456 paths** left curved. The bug needed no unusual input, only the ordinary gesture of strumming the name and scrolling up, which is why it appeared at random. **The fix makes "the loop is stopped" and "the strings are at rest" the same state.** A `settleAll()` flushes every string to its straight path and zeroes its physics; `stopLoop(settle)` pairs cancellation with it, and every stop the component initiates now settles — off-screen, tab backgrounded (rAF stops there too, the same freeze by another route), and effect teardown (the `<path>` nodes outlive the effect, so a bare cancel handed the next run half-bent strings it had no reason to touch). `settleAll()` also drops the entrance sweep, which is anchored to a wall-clock start and would otherwise put its front past every remaining string and slam them all in one frame on resume. A `resumeLoop()` on re-entry restarts the loop if anything still holds energy — with the settle in place that is a no-op, and it is deliberately kept as the second line of defence so that any future stop which *does* leave a string ringing is driven back to rest instead of freezing there. The per-string reset in the tick also re-resolves a missing node before writing, since dropping that write while zeroing the physics is exactly how a string gets stranded with nothing left to straighten it. **Verified** against the same repro: the frozen counts go to **0 curved paths, max deviation 0**, sustained over six seconds of sampling, for both the scroll-away and tab-hidden interruptions — while the entrance strum still runs its full ripple (0 → 77 → 178 → 269 → 338 strings curved as the front crosses the name) and settles to 0, with all 456 paths completing their draw-in. |


#### `/projects` opened on a stale category tab — one card click pinned the filter forever

| | |
|:--|:--|
| **Ref** | — (owner report: "by default it is in the System category when it should be in All"; scoped to a first visit and to leaving the page and coming back) |
| **Files** | `src/lib/projectFilterHandoff.js`, `src/components/projects/ProjectFilterHandoffGuard.jsx`, `src/components/projects/index.jsx`, `src/components/projects/ProjectLayout.jsx`, `src/app/layout.js` |
| **Details** | **The filter was being persisted as a preference when it is view state.** `ProjectLayout`'s card click wrote the card's category to `localStorage["projects-category"]` and `ProjectList` restored it on mount, which is right for the one journey it was built for — open a project, come back, keep your place — and wrong for every other way onto the page. `localStorage` is permanent and origin-wide, so a single click on a System project set the System tab for **every future visit**: a fresh arrival, a reload, a second tab, tomorrow, with the reset only reachable by clicking "All". The correct scope for "survive exactly one navigation" is a **one-hop handoff**, and it needs two independent conditions to be true, because each one alone leaks. `sessionStorage` (minted by the card click, so a token can never outlive the tab that minted it) covers the new-tab and next-day cases but not `/projects/6 → / → /projects` within one tab; **spending the token on read** (one-shot: a reload is a fresh arrival and must find nothing) covers the reload but not the same detour. So a null-rendering `ProjectFilterHandoffGuard` voids the token on any route outside the projects area, and it is mounted in the **root** layout rather than `(sub pages)` — the homepage is outside that layout and "detail → home → projects" is precisely one of the journeys that must land on "All". It cannot be an unmount cleanup in `ProjectList` either: that fires on the way to the detail page too, the one journey the token exists to survive. Because the guard only ever clears on a non-projects route and the list only ever reads on `/projects`, the two can never collide in one commit — the fix does not depend on the order React runs parent and child effects in. The stored-filter fallback toast is kept (a deploy landing mid-hop can serve the returning page a `data.js` in which the token's category no longer has a tab), but its storage-healing writes are gone — the token is spent either way. The legacy `localStorage` key is deleted on every read or clear, so browsers already carrying a pinned value heal themselves on the next visit rather than keeping it forever. **Verified against the dev server on six paths**, reading the pressed tab and the rendered card count: a stale `localStorage["projects-category"]="System"` now opens **All / 11 cards** with the legacy key purged (the reported bug); a live handoff opens **System / 3 cards** and comes back `null`; reloading that same page falls to **All / 11** (one-shot); seeding a handoff, loading `/`, and returning gives **All / 11** with the token already voided on the homepage; and the full real flow — click a System card, ride the Stone Passage to `/projects/6`, browser-back — restores **System / 3** and spends the token, while the same click followed by `/ → /projects` gives **All / 11**. |


#### `/projects` table candles read as unlit — the ambient loop's flames barely move

| | |
|:--|:--|
| **Ref** | — (owner report: "at a glance the candles look static"; then, on the first attempt, "very unprofessional … I just want the flames moving a bit more") |
| **Files** | `public/background/projects-flames.mp4`, `public/background/projects-flames-1080.mp4`, `public/background/projects-flames-720.mp4`, `scripts/scene/detect-table-flames.mjs`, `scripts/scene/bake-table-flames.mjs`, `scripts/scene/bake-table-flames.sh` |
| **Details** | **The clip was the problem, and it is measurable.** Sampled across a full 4.17 s loop, the delivered video's candle cores vary by a temporal std of **1.9 of 255** against **0.2** at a no-flame control point — barely above codec dither, and that is *before* the layer's `opacity-[0.88]` and the `.projects-scrim` take their cut. Fixed in the asset rather than the front end, and without regenerating (which repaints the whole room, chandelier included). Each table flame's own filmed pixels are warped a touch per frame: scaled about its wick, leaning a whisper with height, and changing brightness across its body. **Amplitude is the whole design, and the first attempt got it wrong.** It ran ~6× hotter (lean 0.40 × flame height, ±30% height, ±42% emission) and was rejected on sight — at that size 89 flames slide sideways like flags, balloon and throb in unison, which reads as an effect applied to a photograph. A real candle in still interior air barely translates; it holds station and changes shape. Final values: lateral travel **~1.5 px**, height **±10%**, brightness **±11%**, each scaled per flame off its own seed (0.5–1.0) so some sit near still — uniform animation was itself part of what read as mechanical — and the harmonics dropped from a 5.5 Hz top to 1.9 Hz, the pace of movement the eye actually reads on a candle. **The technique was simplified, not just detuned.** Three background/emission decompositions each failed visibly first: an erosion background ate the candle bodies and banded every candle; a morphological opening fixed that but strips any structure finer than its element, so the carved gold filigree behind the candles got dragged around as scenery; gating emission on brightness excluded the carving but also excluded the flame's own soft halo, so the clipped core moved while the halo stayed and the flame read as a thin ragged spike; growing the core back out over the halo restored the body but pulled so much surrounding glow through the round-trip that the flame went hazy. At ~1.5 px the decomposition is unnecessary: resample the image itself, weighting the displacement by a **flame alpha** — the bright pixels tight around each flame's own core — rather than by a geometric mask, and **tapering it to zero just past the flame tip**. The alpha weighting is what keeps the room still: weighting by the mask alone displaced everything inside it, so the carved column and shelf rail behind these candles travelled with the fire (363,595 background pixels moved); weighting by flame alpha drops that to **529 pixels, a 687x reduction**, while flame motion holds (3.57 → 3.30) and the loop wrap returns to the source's own 3.016 (a pure scale about the wick displaces in proportion to distance from it, which visibly bent the shelf rail and carved column behind these candles), and cross-fade to untouched pixels at the mask edge — which makes bands, spikes and haze structurally impossible rather than merely tuned away. **89 flames** across the three tables, located by hot-core blob detection filtered on size, upright aspect and ring contrast (brightness alone cannot separate flame from lit wax — flames peak at 240-245 and wax already sits at 230+), classified by table region and reviewed on a debug overlay before a frame was encoded. **The hanging fixtures are untouched, by construction and by measurement**: the crystal chandelier and every lantern on a chain fall outside the table regions, and a raw frame diff (codec noise excluded) finds **zero** changed pixels above the canopy line (v < 0.35), with every out-of-region change within 20 px of a table edge. **The loop stays seamless without a re-cut**: every time signal is a sum of INTEGER harmonics of the loop length, so the animation is exactly periodic; measured wrap moves 3.017 → 2.994 against a natural inter-frame step of ~0.57. **Result**: flame temporal std **1.88 → 3.57** median (max 2.5 → 7.6) — roughly double, against the 5× that was rejected. Verified playing at 1024/1440 desktop, an 820×1180 tablet, and 375/390/430/440 × DPR 3 phones in WebKit, with `prefers-reduced-motion` still resolving to the still plate. Geometry, duration, frame count and fps identical across all three rungs, and every rung is at or below the size it replaces (5.05 MB vs 5.18, 1.67 MB vs 1.85, 423 KB vs 423 KB). Pipeline shipped as `scripts/scene/bake-table-flames.sh`. |


#### `--fluid-scale` collapsed to its MAXIMUM on iOS — every fluid page rendered 2.17× oversized on phones

| | |
|:--|:--|
| **Ref** | — (owner report: cards, subtitles and list items oversized on two iPhone 17 Pro Max devices in iOS Chrome; `/about` right-shifted; the homepage orbit ring appearing on mobile) |
| **Files** | `src/app/globals.css` |
| **Details** | **One root cause, six symptoms, and none of them were breakpoints.** Ruled out first, each against the deployed bundle: the viewport meta is present and correct on all five routes (`width=device-width, initial-scale=1`); Preflight's `-webkit-text-size-adjust:100%` ships, so this is not Safari text autosizing; `tailwind.config.js` declares no custom `screens`, and no media query in `globals.css` sits below 440px, so nothing falls through to desktop; and the `.fluid-scale` rules, their `@supports` guard included, are all present in the production CSS — nothing was purged. Against **production** on WebKit at a true 440×956/DPR-3/touch profile every page measured *correct* (`scrollWidth == clientWidth == 440` on all five, title 28.8px, subtitle 15.36px, `main` at `left:0`), which is what moved the search off the stylesheet and onto the engine. **The defect is `atan2()` mis-resolving viewport units in WebKit.** Measured on a real iPhone 17 Pro Max (iOS 26.2 Safari, `innerWidth` 440) with a probe replicating the shipped rules verbatim: `tan(atan2(1, 1))` → 1.000 ✓, `tan(atan2(1px, 1px))` → 1.000 ✓, `tan(atan2(440px, 1440px))` → **0.3055 ✓** — but `tan(atan2(100vw, 1440px))` → **3.3764**, where the correct answer is the 0.3056 the *absolute-length* form of the identical ratio returns. Numbers work, lengths work, only the viewport unit is wrong. Because the bogus ratio overshoots `--fluid-max`, `clamp()` did not fall back — it **pinned the factor to its maximum, 1.3, the widest-desktop scale, on a phone**: measured effective `--fluid-scale` **1.300 against a required 0.600**, i.e. every size on `/about`, `/projects`, `/contact` and `/qualifications` rendered **2.17× too large**. That single factor is why six symptoms had one cause: the four affected routes are exactly `FLUID_SCALE_PAGES`, and `.page-title-subtitle` ("subtitle far too large") exists only under that scope. The homepage's orbit ring is the same bug downstream — the oversized pages overflow far enough sideways that iOS shrink-to-fit widens the visual viewport, and `window.innerWidth` (which reports the *visual* viewport on iOS, and which `Navigation` reads to pick its `<480` mobile columns) then reads desktop-wide. **Desktop was never affected** because Blink and Gecko compute the `vw` form correctly, and at the 1440px anchor the answer is 1 either way — which is also why this looked like a production-only regression when it is engine-only: it reproduces identically in dev, in a local production build and on the deployed site, and on none of them on a desktop browser. **The `@supports (width: calc(1px * tan(atan2(1px, 1px))))` guard cannot catch it** — verified PASSING on the very build that computes the answer wrong, because the guard tests absolute lengths, the one form WebKit gets right. **Fix**: an intermediate `@property --fluid-vw { syntax: '<length>'; inherits: true }` holding `100vw`, so registration computes the viewport unit to an absolute px length *before* `atan2()` sees it — the form already proven correct on the device. Four candidates were measured on the real engine before one was chosen: registering the intermediate length → **60.00 against a 60.00 target ✓**; registering only the `<number>` output → 130.00 ✗ (substitution still hands raw `100vw` to the trig); a no-trig `clamp(0.6rem, 100vw/90, 1.3rem)` scaled-rem → correct, but rejected because it makes the factor a *length*, which would mean rewriting 56 scoped rules and 116 `fluid()`/`fluidText()` call sites and would break the two components (`about/index.jsx`, `qualifications/Carousel.jsx`) that arithmetically normalise the unitless factor against `--fluid-min`. The chosen fix keeps `--fluid-scale` unitless, so **every consumer is untouched**. `inherits: true` is load-bearing, not decoration: `--fluid-scale` is itself unregistered and therefore inherits as an unresolved token list, so each descendant re-substitutes `var(--fluid-vw)` against its own computed value — the probe confirms it by measuring a *child* of the scoped element. On an engine with trig but no `@property` (Safari 16.0–16.3 only) the declaration degrades to an ordinary custom property, i.e. exactly the previous behaviour — never worse. |

#### Hero ripple rings read as empty space on phones and laptop screens

| | |
|:--|:--|
| **Ref** | — (owner report: "too sparse and too faint at ~375–430px and ~1280–1440px") |
| **Files** | `src/app/globals.css` |
| **Details** | Measured before touching anything, ring-by-ring, each ring shot ALONE against a rings-hidden frame so nested ring boxes cannot be credited to each other and the laptop's occlusion counts as the zero it is. Peak delta out of 255 at the rings' resting pose — `.borderline` / `.borderline2` / `.borderline3`: **3 / 75 / 55** at 375×812, **114 / 86 / 56** at 768×1024, **7 / 85 / 56** at 1440×900. Two separate findings live in that table and only one of them is alpha. **(1) The inner ring is not faint, it is occluded.** `perspective(600px) rotateX(80deg)` magnifies the near edge, so the 340px ring projects to **472px** on screen beneath a **480px** laptop; at 375 it is 171px against a 263px laptop. At 768 the same ring projects *wider* than the laptop (364 vs 352) and duly measures 114 — which is precisely why the two widths reported as broken are the two where the laptop swallows it. No alpha fixes an occlusion, and the laptop's size and position were out of scope, so this is recorded rather than "fixed". **(2) Rings 2 and 3 hold the same peak at every width (85/86, 55/56) but not the same presence**, because presence is coverage and the frame grows around them: the outer ring lights 5.5% of a 768×1024 frame, 3.2% of 1440×900 and 2.2% of 375×812 — the two ENDS of the range are thin and the middle, which nobody complained about, is fine. So the lift is scoped to the ends, through two tokens whose defaults are exactly the values the rule shipped with: **`--ring-gain`** multiplies every alpha (preserving the inner→outer hierarchy the three rings are built on) and **`--ring-band`** widens the stroke by moving its INNER edge inward only — the outward ramp (95/96/97% → nothing at 100%) is what keeps the ring from reading as a decal, so the fade toward the outer edge is left exactly as it was. `1.55` / `8%` below 640px (the smallest rings in the smallest frame, and a 220px ring has only ~30px of radius to spend on a stroke), `1.5` / `7%` at 1280px+ (where the rings stop growing at `lg` while the viewport does not), `1` / `0%` in between. Stepping at breakpoints rather than `clamp()`ing is deliberate: the ring diameters already step at these breakpoints, so an alpha step lands on a frame where the whole ring is resizing anyway. **Verified** at the same three widths: 375 → `.borderline2` peak 75→**116**, `.borderline3` 55→**86**, mean over lit pixels 21.0→**33.1**; 1440 → 85→**128** and 56→**83**, mean 23.6→**36.2**; **768 byte-identical** (5346 / 14651 / 43282 lit px before and after), which is the token defaults proving themselves. **The harness needed four controls before its numbers meant anything**, each added after it silently corrupted a run: the intro loader (`fixed inset-0 z-[9999]`) is still covering the page at 2.6s and reveals around ~5s, so a "settled" frame is 7s (this alone produced a 271k-pixel phantom delta); the nav orbit and its buttons are framer-motion/rAF driven and cannot be paused through the Web Animations API, so they are hidden, not paused; scene layers must be hidden by an injected `!important` stylesheet rather than inline styles, because `HomeSceneWater` mounts late and an inline hide lets a whole new background paint into later shots; and Playwright restores animations after every screenshot, so the ripple is stopped in CSS. `animation-delay` was tried as a phase pin and rejected on evidence — it OFFSETS an already-running timeline instead of resetting it, so each session froze at an arbitrary phase. The resting pose is used instead: deterministic (null test: 124 differing pixels in 1.3M), and the exact frame `prefers-reduced-motion` users see. Because gain multiplies the band's alpha and the ripple's envelope multiplies the whole element's opacity, the two commute — the measured ratio holds at every phase of the loop. |

#### Hero ripple rings still hard to find on phones — the outer edge given its own dial

| | |
|:--|:--|
| **Ref** | — (owner report: rings much harder to see on mobile; desktop intensity to stay exactly as shipped) |
| **Files** | `src/app/globals.css` |
| **Details** | Follow-up to the two-dial pass above, and the reason a third dial was needed: **`--ring-gain` lifts the core and the outward ramp together, which brightens the band without making it easier to FIND.** The eye locates a ring by its outer boundary against the scene, and that boundary is the 95/96/97% stop — the faintest part of the gradient. Measured on composited pixels in WebKit at DPR 3, each ring shot against a rings-hidden frame so the causeway behind cannot be credited to the ring, mean delta out of 255 across the outer decile of the radius (0.90–1.00): **25.8 / 16.7 / 7.9 / 8.1** at 375 / 390 / 430 / 440 against **28.1 / 25.4 / 36.1** at 768 / 1024 / 1440 — every phone width at or below the smallest desktop reading, the two widest phones 3–4× under it. **`--ring-outer-gain`** multiplies only the outward ramp's alpha and the `box-shadow` that continues it past the element edge; the core stop (88/89/90%) is untouched, so the band still falls from a bright core to a faint rim and reads as a ring rather than a disc. The shadow is scaled *with* the stop rather than as an extra: the gradient terminates hard at 100% and the shadow is the only light continuing outward from there, so lifting the 95% stop alone would steepen that final drop into the visible band the feather exists to prevent. **The value was picked by where the falloff breaks, not by eye.** Radial delta profile at 375, sampled along the ripple's radius axis: at **1.35** the curve descends 35.5 → 32.5 → 29.5 → 26.5 (a clean −3.0 per step); at **1.45** it descends 35.5 → 33.5 → 30.5 → 29.0 (−1.5, flattening); at **1.60** it reads 36 → 34.5 → **32 → 32** — a plateau, then a cliff, i.e. exactly the decal edge. `1.35` is therefore the last value with real slope to spare, and holds the outer stop at ~70% of its own core on all three rings; the ×5-amplified ring-only frame confirms 1.60 terminating in a crisp line where 1.35 still reads as spreading light. **Lift delivered**: outer decile 25.8→**29.3** (375), 16.7→**20.0** (390), 7.9→**9.8** (430), 8.1→**10.2** (440), +13% to +26%, with the inner bucket flat (0.48→0.49, and 0 at the other three). The two widest phones remain the dimmest, and alpha cannot close that: at 430+ the laptop is `w-[70%]` and grows with the viewport while the ring stays 320px, so it occludes all but two thin crescents — the same occlusion finding recorded above, not a tuning failure. **Scoping proof**: the defaults are `1`, and `calc(0.26 * var(--ring-gain) * var(--ring-outer-gain))` with both at 1 resolves to the identical double the rule already computed, so the resolved `background-image` strings are byte-identical above the breakpoint — verified as strings (`rgba(255, 106, 0, 0.39)` at 1440 before and after, 0 of 3 rings repainted at every control width) and as pixels: **640, 768, 1024, 1279 and 1440 all produced identical SHA-256 frames** between the neutralised and shipped states, both breakpoint boundaries included. **Accessibility**: no text intersects the ring band at any phone width even measured at the ripple's maximum extent (scale 1.2); the six orbital nav buttons do overlap it, but their discs are opaque enough that the rings shift them by ≤17/255 and icon-vs-disc contrast holds at **19.4–20.3:1** against the 3:1 non-text requirement. **Harness notes, all four learned the hard way**: WebKit honours `upgrade-insecure-requests` on localhost where Chromium exempts it, so every subresource is rewritten to `https://` and the page renders *completely unstyled* — the directive has to be stripped from the document response or the measurement is of a blank page; Playwright's `animations:'disabled'` and `Animation.currentTime = 0` both rewind `ripple-neon` to its **`scale(0)`** first frame, so the "ring" being screenshotted is 1.6px wide — every frame here is pinned to a fixed mid-phase (1500ms) instead; a running CSS animation overrides inline style, so `el.style.transform = 'none'` cannot read the base box (it returns the *transformed* 828px for a 600px ring) and `offsetWidth` must be used; and the nav orbit's angle is React state on a timer, so it lands differently per run and contaminates any frame comparison — the control test subtracts a rings-hidden frame to cancel it entirely. |

#### Homepage plate over-declared its `sizes` on portrait phones — a srcset rung bought for a box the band no longer paints

| | |
|:--|:--|
| **Ref** | — (follow-up to the portrait re-frame, raised while reviewing it) |
| **Files** | `src/app/page.js`, `src/components/home/HomeSceneVideo.jsx` (comment only) |
| **Details** | `sizes="max(100vw, 178vh)"` is the painted width of an `object-cover`'d 16:9 plate in a FULL-HEIGHT box — which is what this backdrop was until the portrait re-frame turned it into a 65% band of a `100svh` shell. Since then the declaration has described a box the plate no longer paints: measured live, **1701 declared against 1104 painted at 440×956**, and 1699 against 1001 on a phone whose small viewport is 866 — a 1.7× over-declaration. `sizes` is what the browser buys srcset rungs against, and Next's ladder is coarse enough that the gap costs a whole rung. Cold-loaded at 1×: a 440×956 portrait viewport took `w=1920` (**190 KB**) for a band `w=1200` (**86 KB**) covers, 430×932 took 1920 where 1080 covers, 360×640 took 1200 where 750 does. On the same selection rule (smallest rung ≥ `sizes` × DPR, confirmed against the live picks at 1×, 2× and 3×), a 2× phone of that height took the top rung — which the optimiser serves capped at the 2560px source, **307 KB** — where 1001 × 2 fits `w=2048` (**206 KB**). The fix is one portrait-phone entry ahead of the unchanged desktop rule: `(max-width: 639.98px) and (orientation: portrait) max(100vw, 115.6svh)`, since 65% × 16/9 = 115.6. **`svh`, not `vh`**, because the band is a percentage of a shell that same CSS block pins to `100svh`; `vh` is the toolbar-hidden height and would over-declare by the toolbar (~10%) all over again. The media condition is byte-identical to the CSS block's, so the declaration and the band cannot disagree about where they flip — verified at the boundary: **639×956 declares 1105 for a 1104px paint, 640×956 declares 1701 for a 1700px paint**. Nothing else moves — desktop 1440×900 (1602/1600, `w=1920`), iPad portrait (2100/2098), landscape phone 844×390 (844/844) and a 3× phone (1010/1010) all pick exactly what they picked before, and no viewport tested UNDER-declares (worst case +1px, rounding). The 3× phone stays on the top rung, but honestly rather than by over-declaration: 1001 × 3 = 3003 device px, and the only rung above 2048 is the 2560px source itself. Engines that cannot parse `svh` inside `sizes` drop that entry and fall through to the desktop rule — the old behaviour, never worse, the same degradation argument the `max()` already carried. `HomeSceneVideo`'s resolution ladder is deliberately NOT rebanded, only its comment corrected: it has a single 1440 threshold that the band does not cross on any real phone (an 866px small viewport bands to 1001 CSS px → 2002 after the DPR clamp → still 1080p, exactly as 178vh's 3082 was), so only a 1×, sub-640px-wide portrait window — a narrowed desktop, not a phone — would change rung there. |

#### Direct `eslint` runs crashed before linting anything (ESLint 9 config on ESLint 8)

| | |
|:--|:--|
| **Ref** | — (regression report: `npx eslint` died on startup; editor ESLint integrations showed nothing) |
| **Files** | `eslint.config.mjs` (removed) |
| **Details** | `eslint.config.mjs` arrived with an unrelated commit as an `npm init @eslint/config` scaffold and imported `defineConfig` from `"eslint/config"` — ESLint **9** syntax. This project pins `eslint@8.57.1` (the last v8, required by `eslint-config-next@14`), where that subpath does not exist, so every direct run aborted with `Package subpath './config' is not defined by "exports" in node_modules/eslint/package.json`. It never linted a file. **`npm run lint` was unaffected** and stayed green throughout — `next lint` on Next 14 uses the eslintrc system and reads `.eslintrc.json`, ignoring flat config entirely — so the breakage was invisible to CI and to `npm run lint`, and only bit direct CLI runs and editor integrations. Repairing the file in place was attempted first (rewriting it against `FlatCompat` from `@eslint/eslintrc` so both config systems resolved the same `next/core-web-vitals` rules) and **abandoned as unworkable**: `eslint-config-next@14` loads `@rushstack/eslint-patch`, which monkey-patches ESLint's eslintrc module resolution and hard-throws under any other pipeline (`Failed to patch ESLint because the calling module was not recognized`); the translated config also silently ignore-matched every source file. Real flat-config support needs `eslint-config-next@15`, hence Next 15 — a migration, not a lint fix. So the scaffold is removed and `.eslintrc.json` (`next/core-web-vitals`) is the single source of truth for `next lint`, `eslint` and editors alike. Verified: direct `eslint` now runs clean on the tree, a probe file correctly raised `@next/next/no-img-element` and `jsx-a11y/alt-text` (proving the Next rule set is actually loaded, not merely silent), and a full `npm run lint` reports **0 errors** with 8 pre-existing warnings. Leaves `@eslint/js`, `globals` and `eslint-plugin-react` orphaned in `devDependencies` — harmless, and `eslint-plugin-react` is still supplied transitively by `eslint-config-next`, so all three can be pruned whenever the lockfile is next touched. |

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

#### Homepage water layer's travelling pale bands (a compositing bug, not a water bug)

| | |
|:--|:--|
| **Ref** | — (owner report: "there is white shade that moves against the water") |
| **Files** | `src/components/home/homeSceneLights.js`, `src/components/home/HomeSceneRipple.jsx`, `src/components/home/HomeSceneLivePlate.jsx` |
| **Details** | The ripple canvas sat at `opacity-90` **on top of** a plate also at `opacity-90`, so every pixel it painted composited to `0.99 x plate` while every pixel it declined to paint stayed at `0.90 x plate`. It skipped every row whose displacement rounded near zero — and those rows form bands that TRAVEL with the wave. Probed on the running page: **80 of 387 water rows unpainted, in runs of 5–10px**, a hard-edged 5–7 unit teal step at each boundary, sliding down the lake. That artefact, not the ±1.5–2px of horizontal shear underneath it, was the only thing clearly visible in the layer. The general rule is now stated once, on `PLATE_OPACITY` in the rig: **a layer that REPLACES plate pixels must pre-multiply by the plate's opacity and composite at CSS opacity 1**, never stack its own on top. Additive layers (the glow canvas, at the same opacity, always fine) are exempt because they add to the plate rather than standing in for it. The shader applies it in the fragment; the 2D fallback bakes it into its source buffer, which also makes the rows it skips harmless rather than a step. |


### Removed

#### The homepage's arrival ignite — the light that swept the causeway and bloomed at the vanishing point

| | |
|:--|:--|
| **Ref** | — (owner-directed: "remove that animation totally") |
| **Files** | **deleted** `src/components/home/HomePathIgnite.jsx` · `src/app/page.js` · `README.md` |
| **Details** | The arrival moment is withdrawn: on entering the homepage, a wavefront no longer runs the wet stone from below the bottom edge to the vanishing point, the lanterns no longer catch in near-to-far depth order behind it, and there is no bloom into the mist at the end of it. The component is deleted rather than gated, and its render and import removed from `src/app/page.js`, so nothing about it ships — the layer was already self-unmounting after ~2.5 s, so this changes the arrival only, never the resting scene. **The scene is otherwise untouched**, because the lanterns were never drawn by this layer in the first place: they are baked into `home-hero.webp` and kept alive by `HomeSceneGlow` + the filmed flame loop, both of which are unchanged, as are the plate, the water, the scrim and the portrait 65% band. Verified on a real browser at 1440×900 — steady state paints the same two canvases (`HomeSceneGlow`, `HomeRoleLatent`) with no third layer appearing anywhere in the first 3.8 s of a fresh load, first sample at 809 ms (inside what had been the 1700 ms travel phase), no console errors, `next build` and ESLint clean. The shared light rig `home/homeSceneLights.js` is deliberately left as it is — `HomeSceneGlow` still reads it — so its ignite-only helpers (`depthOf`, `bandV`, `bandHalfWidth`, `BAND_V_END`) survive as unused exports rather than being pulled out in the same change. |

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
