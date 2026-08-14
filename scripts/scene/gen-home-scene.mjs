// Hero establishing-scene generation for the homepage (run from repo root):
//   node --env-file=.env.local scripts/scene/gen-home-scene.mjs
// Same Gateway pipeline as the projects/qualifications scenes. Three
// candidates in parallel; pick the winner by eye, then finish it to
// 2560x1440 webp (sharp) like the other two backdrops.
import { generateImage } from "ai";
import { writeFileSync } from "node:fs";
import { WORK } from './workdir.mjs';

const SP =
  WORK;

// Shared style clause — the exact mood of project-bg.webp / qualifications-bg.webp:
// warm amber lantern light against cold blue-teal night fog, photoreal fantasy.
const STYLE =
  "Photorealistic, cinematic lighting, volumetric fog, deep shadows, rich blacks, " +
  "ultra detailed. Warm amber lantern flames against cold blue-teal moonlit mist — " +
  "the only two color families. No people, no animals, no text, no watermark.";

// Composition contract with the homepage layout:
//  - top-center calm and dark (the name headline sits there)
//  - center opens into misty depth (the floating laptop + nav orbit sit there)
//  - framing trees/structure pushed to the left/right edges
const PROMPTS = [
  {
    name: "valley",
    text:
      "Breathtaking wide establishing shot of an enchanted forest realm at night, " +
      "seen from the edge of a dark moss-covered stone terrace. Colossal ancient " +
      "trees hung with vines and dozens of glowing amber lanterns frame the far left " +
      "and right edges like a proscenium. Between them a vast misty valley opens: a " +
      "winding path of tiny warm lantern lights descends and disappears into blue fog " +
      "toward one faint distant golden glow deep in the forest heart. Tiny fireflies " +
      "drift in the middle distance. The upper center is a calm opening of dark night " +
      "sky above the canopy, nearly empty, with the faintest stars. " + STYLE,
  },
  {
    name: "gate",
    text:
      "Breathtaking wide establishing shot at night: the ancient stone threshold of an " +
      "enchanted forest kingdom. Two weathered basalt pillars with hanging iron lanterns " +
      "stand at the far left and right edges, half swallowed by moss and colossal tree " +
      "roots. Between them, wide worn stone steps descend into a sea of blue-teal mist, " +
      "where a long avenue of amber lantern flames recedes to a single distant golden " +
      "glow. Fireflies drift low over the steps. The upper center is calm, dark canopy " +
      "opening to deep night sky, uncluttered. " + STYLE,
  },
  {
    name: "aurora",
    text:
      "Breathtaking wide establishing shot of an enchanted forest valley at night from a " +
      "high mossy stone ledge. Giant ancient trees with amber hanging lanterns frame only " +
      "the extreme left and right edges. The center is open: layered blue misty forest " +
      "ridges descend toward a tiny distant lantern-lit sanctuary glowing gold in the fog. " +
      "High in the dark sky above, one very faint, restrained ribbon of violet-teal aurora " +
      "— barely there, elegant, not flashy. A few fireflies in the middle distance. " + STYLE,
  },
];

const results = await Promise.allSettled(
  PROMPTS.map((p) =>
    generateImage({
      model: "bfl/flux-pro-1.1-ultra",
      prompt: p.text,
      aspectRatio: "16:9",
    }).then(({ image }) => {
      const file = `${SP}/home-scene-${p.name}.png`;
      writeFileSync(file, image.uint8Array);
      return `${file} (${image.uint8Array.length} bytes, ${image.mediaType})`;
    }),
  ),
);

for (let i = 0; i < results.length; i += 1) {
  const r = results[i];
  console.log(
    PROMPTS[i].name,
    "→",
    r.status === "fulfilled" ? r.value : String(r.reason).slice(0, 300),
  );
}
