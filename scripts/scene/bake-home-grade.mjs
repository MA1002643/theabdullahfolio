// Grade the homepage plate: cooler, darker, less saturated.
//
// The cohesion problem this solves is not that the photograph is bad — it is
// that it is a CO-STAR. It is bright teal at a saturation that competes with
// the neon-orange UI for the same attention, and the scrim alone cannot fix
// that: a scrim can only subtract light uniformly, and the issue is chroma, not
// level. Pulling saturation down and the midtones with it turns the plate into
// an environment the UI sits inside.
//
// BAKED rather than done at runtime, for two reasons:
//   • the shader RESAMPLES this exact file, so a CSS filter over the top would
//     be applied to the still and the moving layer inconsistently — the water
//     would be a different colour from the lake it sits in;
//   • it is free. A filter on a full-viewport image is a per-frame GPU cost on
//     the LCP-critical route, forever, for something that never changes.
//
// The original is NOT overwritten. It stays as home-hero-src.webp so the grade
// can be re-cut or reverted without regenerating the artwork.
//
// ── RUN bake-causeway-water.mjs AFTER THIS ──────────────────────────────────
// This script writes the graded plate and stops. The shipped plate is that plus
// one more thing: the ambient loop's own frame-0 flames, composited into the
// lantern windows so the still-to-video swap has nothing to show (§ 9 there,
// and the same reason /projects rebuilds its poster from its loop). It grades
// from home-hero-src.webp itself, so the two agree — but running THIS script on
// its own afterwards drops the flames back to the frozen photograph and the
// swap comes back. Re-run the bake after any re-grade.
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';

const LIVE = 'public/background/home-hero.webp';
const SRC = 'assets/source/home-hero-src.webp';

// Keep a pristine copy the first time this runs, and always grade FROM it —
// otherwise a second run grades an already-graded file and the scene walks
// steadily toward grey.
if (!existsSync(SRC)) {
  await copyFile(LIVE, SRC);
  console.log(`kept original as ${SRC}`);
}

const before = await sharp(SRC).stats();
const chan = (i) => before.channels[i];
console.log('BEFORE  mean rgb:', [0, 1, 2].map((i) => chan(i).mean.toFixed(1)).join(', '));

await sharp(SRC)
  .modulate({
    // Saturation is the main lever: the plate's teal is what competes.
    saturation: 0.8,
    // No global darkening. It was tried at 0.93 and it clipped the frame's
    // highlights from 255 down to 245 — which is the lantern flames, the best
    // detail in the picture and the thing this whole round is trying to make
    // more alive. Darkening is left entirely to the scrim's new stage well and
    // edge vignette, which is the better tool for it regardless: they darken
    // the specific regions that compete (the ground under the cluster, the two
    // foreground lanterns in the corners) instead of flattening everything
    // including the parts that should stay bright.
    brightness: 1.0,
  })
  // Only a NUDGE cooler, and deliberately not more. Desaturating a blue image
  // necessarily warms it — pulling chroma toward luminance raises whichever
  // channel is lowest, and here that is red — so "cooler" and "less saturated"
  // are pulling against each other. The first cut chased both and had to cut
  // red 16% to win, which would have taken the lantern flames (near-saturated
  // red, and the best detail in the frame) down with it. Desaturation is the
  // lever that actually stops the plate competing; coolness was only ever a
  // means to the same end, so it yields.
  .linear([0.97, 1.0, 1.03], [0, 0, 0])
  .webp({ quality: 86, effort: 5 })
  .toFile(`${LIVE}.tmp`);

await copyFile(`${LIVE}.tmp`, LIVE);
const after = await sharp(LIVE).stats();
console.log(
  'AFTER   mean rgb:',
  [0, 1, 2].map((i) => after.channels[i].mean.toFixed(1)).join(', '),
);
console.log('wrote', LIVE);
