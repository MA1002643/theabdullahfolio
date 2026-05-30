// Shared page-title block. Single source of truth for sub-page
// headings so every page reads with the same visual weight, font
// sizes, neon stroke, and pink subtitle halo as the qualifications
// page (the reference style for issue #104).
//
// Why this lives here, not as ad-hoc per-page markup:
//   - Several pages had drifted to their own sizes (3rem/3.5rem on
//     about + projects, 2xl/5xl on contact) which made the header
//     rhythm shift as the user navigated. Centralising the classes
//     means a future tweak to spacing or font-weight propagates
//     everywhere automatically.
//   - The pink neon subtitle palette (#fc83ff fill + matching pink
//     text-shadow halo) was repeated inline as a style object on
//     every page. Inlining it here removes the duplication and
//     guarantees the halo intensity stays in sync.
//
// Props:
//   - `title`    — primary heading text. Required.
//   - `subtitle` — optional secondary text. Omit to render only h1.
//   - `id`       — optional DOM id forwarded to the wrapping div
//                  so existing anchor links (e.g. about/projects'
//                  pre-existing `id="about"` jump target) keep
//                  working without per-page divergence.
//
// Plain React component (no "use client" directive). No hooks, no
// browser-only APIs, so it can be imported by both server pages
// (contact, projects, qualifications) and client trees (about's
// "use client" page, the projects ProjectList client component).
//
// Subtitle treatment is the single "flanked pink-neon pill" form
// across every page — the earlier opt-in `flankSubtitle` prop was
// dropped because every consumer ended up needing the same look, so
// the conditional was dead weight that risked future drift.
//
// Shared subtitle palette — extracted so flank pills and the h2
// itself reference exactly the same pink fill + halo without
// reallocating the literal on every render.
const SUBTITLE_STYLE = {
  color: 'rgb(252 131 255 / var(--tw-text-opacity, 1))',
  textShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7',
  '--tw-text-opacity': '1',
};

// Style of each flank pill — solid #fc83ff fill + the same pink-neon
// box-shadow halo as the subtitle text.
const FLANK_PILL_STYLE = {
  backgroundColor: '#fc83ff',
  boxShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7',
};

export default function PageTitle({ title, subtitle, id }) {
  return (
    <div id={id} className="z-50 pt-8 text-center">
      {/* No `text-transparent` here — the parent .text-glow-stroke-neon
          utility now paints a solid #ff6d05 fill so each letter
          renders as a filled orange glyph (closing the M / W hollow
          gap reported on CONTACT ME / ABOUT ME). Keeping
          `text-transparent` would let Tailwind's utility override the
          class colour and reintroduce the outline-only look. */}
      <h1 className="text-[2rem] font-extrabold uppercase leading-tight md:text-[3rem] text-glow-stroke-neon">
        {title}
      </h1>
      {subtitle ? (
        <div
          className="flex items-center justify-center gap-4 mt-1 text-[1rem] uppercase leading-snug md:text-[1.6rem]"
          style={SUBTITLE_STYLE}
        >
          <span
            aria-hidden="true"
            className="w-6 h-[2px] rounded-full"
            style={FLANK_PILL_STYLE}
          />
          <h2>{subtitle}</h2>
          <span
            aria-hidden="true"
            className="w-6 h-[2px] rounded-full"
            style={FLANK_PILL_STYLE}
          />
        </div>
      ) : null}
    </div>
  );
}
