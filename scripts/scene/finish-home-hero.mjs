// Finish the chosen hero candidate into the shipping plate (run from repo root):
//   node scripts/scene/finish-home-hero.mjs
//
// Writes public/background/home-hero.webp at 2560x1440, matching
// project-bg.webp and qualifications-bg.webp exactly in size and encoder.
//
// NOT home-bg.webp: that file is still imported by the project-detail route
// (projects/[id]/page.js and its loading.js), so overwriting it would silently
// restyle another page. The homepage moves to its own plate and leaves the old
// one exactly where it is.
//
// Encoded with sharp rather than ffmpeg's libwebp — the same call
// finish-projects-scene.sh documents for the other two backdrops.
import sharp from "sharp";
import { WORK } from './workdir.mjs';

const S =
  WORK;
const SRC = `${S}/hero-causeway.png`;
const OUT = "public/background/home-hero.webp";

// The system's plate size. The source is 2752x1536 (very slightly wider than
// 16:9), so `cover` trims a few px off the sides rather than squashing —
// the causeway is centred and symmetric, so a symmetric trim costs nothing.
const W = 2560;
const H = 1440;

const info = await sharp(SRC)
  .resize(W, H, { fit: "cover", position: "centre" })
  // quality 82 lands this in the same band as project-bg.webp (844 KB) for a
  // comparably detailed frame; effort 6 is sharp's practical ceiling before
  // encode time stops buying bytes.
  .webp({ quality: 82, effort: 6 })
  .toFile(OUT);

console.log(`${OUT} → ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
