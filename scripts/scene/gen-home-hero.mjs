// Hero-composed establishing plate for the homepage (run from repo root):
//   node --env-file=.env.local scripts/scene/gen-home-hero.mjs
//
// Supersedes gen-home-scene.mjs. That script already carried a composition
// contract ("top-center calm and dark"), but the winning candidate still put
// warm canopy lanterns across the entire upper third — exactly where the hero
// name sits. An orange-stroked headline over orange lanterns is the single
// biggest threat to legibility, and no scrim fixes it without also killing the
// art it is protecting. So the contract here is enforced far more bluntly:
// the negative space is described as an explicit, measured band with an
// explicit prohibition, repeated in both the per-scene text and the shared
// clause, because a soft "calm opening" reads to the model as a suggestion.
//
// The other change is that the composition now has a JOB beyond framing. The
// arrival moment (HomePathIgnite) runs a spark along a receding line of path
// lights, so every candidate must contain one: a clearly readable track of
// small warm lights starting wide at the bottom edge and converging to a
// single distant glow near the horizon. That track is the animation's rig.
import { generateImage } from "ai";
import { writeFileSync } from "node:fs";
import { WORK } from './workdir.mjs';

const SP =
  WORK;

// Palette lock — the exact two-family mood of project-bg.webp and
// qualifications-bg.webp: ember warmth (#b16612 → #eab53e → #fcf699) against
// night cold (#01050b → #030c18 → #141e39). Naming only two colour families
// is what keeps the three scenes reading as one place.
const STYLE =
  "Photorealistic cinematic matte painting, volumetric fog, deep shadows, rich " +
  "inky blacks, ultra detailed, 16:9 establishing shot. Strictly two colour " +
  "families only: warm amber lantern flame (deep gold to pale yellow) against " +
  "cold blue-teal moonlit night mist. No people, no animals, no text, no " +
  "watermark, no signature, no lens flare, no sun.";

// The hero contract, stated as geometry rather than mood. Repeated verbatim in
// every prompt because this is the constraint the previous generation lost.
const NEGATIVE_SPACE =
  "CRITICAL COMPOSITION RULE: the top 40 percent of the frame must be almost " +
  "completely EMPTY and DARK — plain deep-blue night sky and unlit black " +
  "silhouetted canopy only. Absolutely NO lanterns, NO glowing lights, NO " +
  "bright objects and NO fine detail anywhere in the upper third of the image. " +
  "All lanterns and light sources sit in the LOWER HALF of the frame. The " +
  "horizon sits low, around 55 percent down the frame. Keep the dead centre of " +
  "the frame soft, deep and uncluttered so it recedes.";

// The ignite track, also stated as geometry — this is the rig HomePathIgnite
// animates along, so "a path with lights" is not specific enough.
const PATH =
  "A clearly readable line of small warm lantern lights runs from the bottom " +
  "centre edge of the frame INTO the depth: widely spaced and large in the " +
  "foreground, converging and shrinking with distance, ending in one single " +
  "faint golden glow at the vanishing point near the horizon.";

const PROMPTS = [
  {
    name: "causeway",
    text:
      "Night. A low stone causeway crosses black still water toward a distant " +
      "forest sanctuary. Weathered lantern posts line both sides of the " +
      "causeway, their amber flames doubled in perfect reflections on the " +
      "glassy water. Colossal moss-covered trees stand as dark unlit " +
      "silhouettes at the extreme far left and far right edges only. Blue-teal " +
      "mist lies over the water. " + PATH + " " + NEGATIVE_SPACE + " " + STYLE,
  },
  {
    name: "avenue",
    text:
      "Night. Worn flagstone steps descend from the foreground between the " +
      "colossal buttressed roots of ancient trees, opening into a long avenue " +
      "sunk in blue-teal fog. Small amber lanterns rest on the ground along " +
      "both edges of the avenue, receding into the mist. The great trees are " +
      "unlit black silhouettes confined to the extreme left and right edges. " +
      PATH + " " + NEGATIVE_SPACE + " " + STYLE,
  },
  {
    name: "valley",
    text:
      "Night. A view from a low mossy stone ledge over a vast misty forest " +
      "valley. A narrow trail of tiny warm lantern lights winds down the " +
      "hillside from the foreground and disappears into layered blue-teal fog " +
      "toward one faint golden glow deep in the valley floor. Dark unlit " +
      "ridgelines and silhouetted canopy fill the edges. A few fireflies drift " +
      "low in the middle distance. " + PATH + " " + NEGATIVE_SPACE + " " + STYLE,
  },
  {
    name: "bridge",
    text:
      "Night. An ancient moss-covered stone footbridge arcs low across a " +
      "fog-filled ravine toward a distant lantern-lit grove. Iron lanterns hang " +
      "from the bridge's low parapet at intervals, receding across it. Below " +
      "and around, blue-teal mist fills the ravine. Enormous dark unlit trees " +
      "frame only the extreme left and right edges. " +
      PATH + " " + NEGATIVE_SPACE + " " + STYLE,
  },
];

const results = await Promise.allSettled(
  PROMPTS.map((p) =>
    generateImage({
      model: "bfl/flux-pro-1.1-ultra",
      prompt: p.text,
      aspectRatio: "16:9",
    }).then(({ image }) => {
      const file = `${SP}/hero-${p.name}.png`;
      writeFileSync(file, image.uint8Array);
      return `${file} (${(image.uint8Array.length / 1024).toFixed(0)} KB, ${image.mediaType})`;
    }),
  ),
);

for (let i = 0; i < results.length; i += 1) {
  const r = results[i];
  console.log(
    PROMPTS[i].name.padEnd(10),
    "→",
    r.status === "fulfilled" ? r.value : String(r.reason).slice(0, 300),
  );
}
