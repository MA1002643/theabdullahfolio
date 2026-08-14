// Locate the plate's own light sources, so the procedural glow layer is
// authored FROM the artwork instead of guessed over it (run from repo root):
//   node scripts/scene/detect-lights.mjs
//
// SceneEmbers' coordinates were eyeballed off the workshop art. That works for
// a scene with a few dozen scattered candles, but the causeway's lanterns sit
// on a perspective line where spacing collapses toward the vanishing point —
// eyeballing would drift exactly where the ignite needs to be most accurate.
//
// Method: threshold on warmth (R-B) rather than luminance, because the misty
// vanishing glow is bright but COLD and must not be picked up as a lantern.
// Flood-fill 8-connected blobs, keep only those with a genuine flame core
// (a near-clipped peak), then split them into the two structures the scene
// actually has: FLAMES (the lantern posts, above the waterline) and their
// REFLECTIONS (the same lights smeared in the water below).
//
// Writes an annotated preview so the rig can be eyeballed before any component
// is written against it.
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { WORK } from './workdir.mjs';

const SRC = "public/background/home-hero.webp";
const S =
  WORK;

const AW = 1280;
const AH = 720;

const { data, info } = await sharp(SRC).resize(AW, AH).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
const at = (x, y) => {
  const i = (y * info.width + x) * ch;
  return [data[i], data[i + 1], data[i + 2]];
};
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const WARM = 28;
const BRIGHT = 90;
// A real flame clips its core. Wet-stone specular and water smear are warm and
// bright but never reach this, so it is the one threshold that separates a
// light SOURCE from light REFLECTED off something.
const CORE = 235;

const seen = new Uint8Array(info.width * info.height);
const blobs = [];

for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    const idx = y * info.width + x;
    if (seen[idx]) continue;
    const [r0, g0, b0] = at(x, y);
    if (r0 - b0 < WARM || lumOf(r0, g0, b0) < BRIGHT) continue;

    let sx = 0;
    let sy = 0;
    let n = 0;
    let peak = 0;
    let minX = x;
    let maxX = x;
    let minY = y;
    let maxY = y;
    const stack = [idx];
    seen[idx] = 1;

    while (stack.length) {
      const cur = stack.pop();
      const cx = cur % info.width;
      const cy = (cur - cx) / info.width;
      const [pr, pg, pb] = at(cx, cy);
      const lum = lumOf(pr, pg, pb);
      sx += cx;
      sy += cy;
      n += 1;
      if (lum > peak) peak = lum;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
          const nidx = ny * info.width + nx;
          if (seen[nidx]) continue;
          const [qr, qg, qb] = at(nx, ny);
          if (qr - qb < WARM || lumOf(qr, qg, qb) < BRIGHT) continue;
          seen[nidx] = 1;
          stack.push(nidx);
        }
      }
    }

    if (n < 6 || peak < CORE) continue;
    const w = maxX - minX;
    const h = maxY - minY;
    blobs.push({
      u: sx / n / info.width,
      v: sy / n / info.height,
      r: Math.max(2, Math.max(w, h) / 2),
      n,
      peak: Math.round(peak),
      // A lantern flame is roughly as tall as it is wide; a reflection in
      // rippled water is smeared vertically. Aspect is the second separator.
      aspect: h / Math.max(1, w),
    });
  }
}

// The waterline: the causeway's vanishing point sits at the horizon, and every
// flame lives above the deepest flame. Reflections fall below their source, so
// classify by position relative to the lowest true post plus the smear test.
const flames = blobs.filter((b) => b.aspect < 2.2 && b.v < 0.78);
const reflections = blobs.filter((b) => !(b.aspect < 2.2 && b.v < 0.78));

flames.sort((a, b) => b.v - a.v);

console.log(`${blobs.length} cored blobs → ${flames.length} flames, ${reflections.length} reflections\n`);
console.log("FLAMES (near → far)");
console.log("   u       v      r    px   peak  aspect");
for (const b of flames) {
  console.log(
    `  ${b.u.toFixed(4)}  ${b.v.toFixed(4)}  ${String(Math.round(b.r)).padStart(3)}  ` +
      `${String(b.n).padStart(4)}  ${String(b.peak).padStart(4)}  ${b.aspect.toFixed(2)}`,
  );
}
console.log("\nREFLECTIONS");
for (const b of reflections) {
  console.log(
    `  ${b.u.toFixed(4)}  ${b.v.toFixed(4)}  ${String(Math.round(b.r)).padStart(3)}  ` +
      `${String(b.n).padStart(4)}  ${String(b.peak).padStart(4)}  ${b.aspect.toFixed(2)}`,
  );
}

// ── annotated preview ───────────────────────────────────────────────────────
const PW = 1280;
const PH = 720;
const marks = [
  ...flames.map(
    (b, i) =>
      `<circle cx="${(b.u * PW).toFixed(1)}" cy="${(b.v * PH).toFixed(1)}" r="${Math.max(6, b.r).toFixed(1)}" fill="none" stroke="#00ff88" stroke-width="2"/>` +
      `<text x="${(b.u * PW + 9).toFixed(1)}" y="${(b.v * PH - 7).toFixed(1)}" fill="#00ff88" font-size="13" font-family="monospace">${i}</text>`,
  ),
  ...reflections.map(
    (b) =>
      `<circle cx="${(b.u * PW).toFixed(1)}" cy="${(b.v * PH).toFixed(1)}" r="${Math.max(5, b.r).toFixed(1)}" fill="none" stroke="#ff3366" stroke-width="1.5" stroke-dasharray="3 3"/>`,
  ),
];
const svg = `<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg">${marks.join("")}</svg>`;
await sharp(SRC)
  .resize(PW, PH)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile(`${S}/rig-preview.png`);
console.log(`\nannotated → ${S}/rig-preview.png`);

writeFileSync(`${S}/rig.json`, JSON.stringify({ flames, reflections }, null, 2));
