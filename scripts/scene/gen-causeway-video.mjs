// Ambient scene-video generation for the homepage causeway (run from repo root):
//   node --env-file=.env.local scripts/scene/gen-causeway-video.mjs
//
// Image-to-video via the Vercel AI Gateway (bytedance/seedance-v1.5-pro),
// starting from the EXACT shipped plate so the still poster and the video's
// first frame match by construction — the projects-flames pipeline.
//
// The brief is written around the one thing that gives the still away: the
// lake is mirror-flat, and no amount of flame flicker fixes frozen water. So
// water is named first and everything else is explicitly pinned STILL — i2v
// models will happily drift the camera and swim the geometry if you let them,
// and on a scene built entirely from converging perspective lines any camera
// move destroys the composition the hero is placed against.
import { experimental_generateVideo as generateVideo } from "ai";
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { WORK } from './workdir.mjs';

const SP =
  WORK;

// The model takes 1080p input; the plate is 2560x1440 of the same 16:9, so this
// is a straight downscale with no crop — frame 0 stays registered to the plate.
const input = await sharp("public/background/home-hero.webp")
  .resize(1920, 1080, { fit: "cover", position: "centre" })
  .jpeg({ quality: 95 })
  .toBuffer();
writeFileSync(`${SP}/causeway-video-input.jpg`, input);
console.log(`input prepared: ${(input.length / 1024).toFixed(0)} KB`);

const prompt = {
  image: input,
  text:
    "Completely static locked-off camera. No camera movement, no zoom, no pan, no dolly. " +
    "A stone causeway lined with lanterns crossing a still lake at night. " +
    "THE MAIN MOTION IS THE WATER: gentle slow ripples move across the lake surface on " +
    "both sides of the causeway, and the warm lantern reflections in the water stretch, " +
    "wobble and shimmer with those ripples. Secondary motion: each lantern flame flickers " +
    "gently inside its glass, its warm glow pulsing softly on the nearby stone; the " +
    "blue-teal mist over the far water drifts very slowly. " +
    "The stone causeway, the lantern posts, the trees and the shoreline remain PERFECTLY " +
    "STILL and rigid — no warping, no morphing, no swaying branches. " +
    "Calm, subtle, seamless ambient loop, cinematic lighting, photorealistic, night.",
};

const { videos, providerMetadata } = await generateVideo({
  model: "bytedance/seedance-v1.5-pro",
  prompt,
  duration: 5,
  resolution: "1920x1080",
  aspectRatio: "16:9",
  generateAudio: false,
});

const video = videos[0];
const out = `${SP}/causeway-raw.mp4`;
writeFileSync(out, video.uint8Array);
console.log(
  `saved: ${out} (${(video.uint8Array.length / 1024 / 1024).toFixed(2)} MB, ${video.mediaType})`,
);
console.log("providerMetadata:", JSON.stringify(providerMetadata ?? {}).slice(0, 400));
