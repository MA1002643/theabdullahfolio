import Image from 'next/image';
import BackdropPools from './BackdropPools';

// The project page's ground (issue #31, owner review 2026-11-15). Until the
// review the route shared the home page's photograph under a near-opaque
// scrim, which read as no background at all. This is a fixed stack of its
// own, and unique to each project:
//
//   1. a deep slate ground (`.cs-backdrop`), the About cards' interior
//      colour, so the gold frames sit on the surface they were drawn for;
//   2. an ambient BLOOM: the project's own hero image, blurred far past
//      recognition, composited with `screen`. The page takes its light from
//      the thing it is about, so every case study is lit differently. The
//      <Image> repeats the hero's exact `width`/`height`/`sizes`, so the
//      browser picks the same candidate HeroMedia already loads: one
//      download, not two;
//   3. a drafting grid in two orders (`.cs-backdrop__grid`): the 56px
//      cadence plus a major line every four cells, held faintly down the
//      whole page so the reading sits on a sheet rather than in a void;
//   4. the sheet's margin rails (`.cs-backdrop__rails`): two gold hairlines
//      bracketing the reading column, with station ticks on the major
//      grid's cadence — the structure the whole read hangs on;
//   5. two ember pools that drift with scroll (BackdropPools, the one client
//      island here) and breathe slowly in CSS;
//   6. a vignette that deepens the ground under the reading, so every text
//      colour keeps its contrast floor;
//   7. film grain (`.cs-backdrop__grain`, an inline SVG tile): dithers the
//      dark ramps so they cannot band, and gives the slate a material
//      surface. Static, no request, nothing to stop under reduced motion.
//
// Decorative throughout (`aria-hidden`, no pointer events). The bloom image
// is above the fold but never the LCP: `eager` + `fetchPriority="low"`
// (CLAUDE.md §5). Under reduced motion the pools stand still and nothing
// breathes; what remains is a static picture.
export default function Backdrop({ media }) {
  return (
    <div aria-hidden="true" className="cs-backdrop">
      {media ? (
        <div className="cs-backdrop__bloom">
          <Image
            src={media.src}
            alt=""
            width={media.width}
            height={media.height}
            sizes={media.sizesHint ?? '100vw'}
            loading="eager"
            fetchPriority="low"
            className="cs-backdrop__bloom-img"
          />
        </div>
      ) : null}
      <div className="cs-backdrop__grid" />
      <div className="cs-backdrop__rails" />
      <BackdropPools />
      <div className="cs-backdrop__vignette" />
      <div className="cs-backdrop__grain" />
    </div>
  );
}
