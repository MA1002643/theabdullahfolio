// Ambient scene-video generation for /projects (run from repo root):
//   node --env-file=.env.local scripts/scene/gen-projects-scene.mjs
// Image-to-video via the Vercel AI Gateway, starting from the exact
// project-bg still so the page's poster and the video's first frame match.
//
// ── RESOLUTION ──────────────────────────────────────────────────────────
// Generate at or above the still's own 2560×1440: a 1080p clip under a
// 1440p poster reads as blur (browser upscale on top of the model's own
// softening of lantern filigree and chandelier crystal). Provider support
// for the `resolution` option is uneven — minimax honours 2k; the Gateway
// does NOT support it for KlingAI (asked 4k, got 1280×720).
//
// ── MOTION ──────────────────────────────────────────────────────────────
// Constrain POSITION, never LIGHT. Blanket stillness wording ("nothing
// brightens or dims", written to stop a rune igniting on the rug) froze the
// flames outright — a flame IS brightness changing. minimax stays timid even
// when asked for dancing fire, so finish-projects-scene.sh amplifies the
// flicker it does produce; veo 3.1 moves beautifully but dollies the camera
// no matter how the lock is phrased, which also breaks the poster match.
//
// ── LOOPABILITY ─────────────────────────────────────────────────────────
// The clip is generated LONG (12 s) and the finish script cuts the loop at
// the best-matching frame pair it can find. A short clip forces a long
// crossfade, and a long crossfade is a one-second dissolve between two
// different moments of the scene — which is exactly what "the candles
// rebuild themselves" looks like. Length buys the search room to find two
// frames that already match, so the seam can be short and invisible.
// Every clause about candle geometry below exists for the same reason:
// what the model morphs over 12 s, no loop point can hide.
import { experimental_generateVideo as generateVideo } from "ai";
import { readFileSync, writeFileSync } from "node:fs";
import { WORK } from './workdir.mjs';

// Working directory for the raw clips. Defaults to the checked-in staging dir
// so the script survives the session scratchpad it was first written against
// being cleaned; override with SCRATCH=/some/path when running.
const SP = WORK;

// PASS=ignite (default) reads the ORIGINAL artwork still; PASS=hold reads the
// settled frame harvested from the ignite pass. See the two-pass note below.
//
// NOTE: neither input has the MA seal baked in. The seal is NOT composited
// before generation: diffusion video models reliably mangle small lettering,
// and "MUHAMMAD ABDULLAH" arced at this scale would smear within a second. The
// camera is locked, so the seal goes into every output frame afterwards through
// one fixed homography instead — pixel-exact lettering in all of them.
const PASS = process.env.PASS ?? "ignite";
const image = readFileSync(
  PASS === "hold" ? `${SP}/settled.jpg` : `${SP}/video-input-1440.jpg`,
);

const SHARED_LOCK =
  "Completely static locked-off camera — no camera movement, no zoom, no pan, no parallax, " +
  "no shake. Nothing changes position or shape: the trees, branches, tables, bottles, books, " +
  "barrels, the rug and the floor all hold exactly where they are, and the hanging lanterns " +
  "and chandeliers neither sway nor rotate nor swing. Every candle keeps exactly the same " +
  "shape, height, thickness and position from the first frame to the last — wax never grows, " +
  "melts, appears or disappears, and no candle is ever added or removed. Nothing in the scene " +
  "fades in or out, dissolves, morphs, rebuilds or reassembles. No new light sources appear " +
  "anywhere, and no glowing pattern, rune or circle lights up on the rug or the floor. " +
  "Ultra sharp, crisp fine detail — every lantern's metal filigree, glass pane and hanging " +
  "crystal in sharp focus. Photorealistic, cinematic, highly detailed.";

// ── TWO PASSES: IGNITE, THEN HOLD ───────────────────────────────────────
// minimax reads "every flame is already lit and blazes continuously" as an
// INSTRUCTION TO IGNITE. Measured over a 12 s clip, global mean luminance
// ramps 39.9 → 53.4 and only plateaus in the last ~2 s; the rug sigil ramps
// 74.7 → 104.7 over the same window. That ramp is why the previous attempt
// could only close a 1.88 s loop — there is no stable stretch to loop inside
// a clip that is continuously brightening, so the frame-pair search is forced
// into a tiny window near the end.
//
// The fix is not a better prompt for one pass, it is two passes:
//
//   PASS 1 `ignite` — from the original artwork still. Its VALUE is not the
//     clip, it is the SETTLED END STATE: by t≈11.9 s the crystal-cluster
//     fixtures have resolved into real candle chandeliers with visible
//     flames (the one item the previous session correctly called impossible
//     to post-process), and every candle is taller and properly lit.
//     Extract that frame; it becomes the new base still AND the new poster.
//
//   PASS 2 `hold` — from that settled frame. A scene already at full
//     brightness has nothing left to ignite, so the model has no ramp to
//     climb and spends the 12 s flickering in place. That is what loops.
//
// Extra lock clauses that only make sense once the scene is already lit.
const HOLD_LOCK =
  "The room is ALREADY at full brightness in the very first frame and STAYS at " +
  "exactly that brightness for the entire clip. The overall exposure and light " +
  "level never rise and never fall — nothing brightens, ignites, kindles, grows, " +
  "intensifies, builds or blooms over time, and nothing dims or fades. This is a " +
  "steady state, not a build-up. The glowing circular pattern on the rug holds " +
  "exactly its current shape, size, ring count and brightness — it does not grow, " +
  "spread, rotate, spiral, add rings, sharpen or intensify. The chandeliers keep " +
  "exactly the shape they already have, with the same number of candles in the " +
  "same places, already burning. ";

const CANDIDATES_HOLD = [
  {
    key: "hold-a",
    model: "minimax/minimax-h3",
    resolution: "2k",
    duration: 12,
    text:
      "A locked-off cinemagraph of an enchanted forest workshop at night that is " +
      "already fully ablaze with candlelight and stays exactly that way. The ONLY " +
      "thing that moves is the fire itself: each flame wavers, leans, trembles and " +
      "settles on its own independent rhythm, staying the same average size and " +
      "brightness throughout. Fine dust motes drift slowly through the warm light. " +
      HOLD_LOCK + SHARED_LOCK,
  },
  {
    key: "hold-b",
    model: "minimax/minimax-h3",
    resolution: "2k",
    duration: 12,
    text:
      "An enchanted forest workshop at night, filmed as one continuous locked-off " +
      "shot in a steady state. Hundreds of candle flames, lantern flames and " +
      "chandelier flames are all already burning at full strength and simply keep " +
      "burning — flames waver and flicker in place with rich natural variation, " +
      "their tips trembling, but the room's overall light stays perfectly constant " +
      "from the first frame to the last. Slow dust motes drift through the glow. " +
      HOLD_LOCK + SHARED_LOCK,
  },
];

const CANDIDATES_IGNITE = [
  {
    key: "blaze",
    model: "minimax/minimax-h3",
    resolution: "2k",
    duration: 12,
    text:
      "A cinemagraph of an enchanted forest workshop at night, lit entirely by live fire. " +
      "Every single candle on the tables, every flame inside the glass lanterns, and every " +
      "flame on the hanging chandeliers overhead is ALREADY LIT in the very first frame and " +
      "burns continuously, without interruption, for the entire clip — no flame ever goes " +
      "out, gutters to nothing, or has to reignite. Each flame is a tall, bright, clearly " +
      "visible tongue of fire with a luminous core and a warm halo, wavering and leaning as " +
      "it burns, flaring brighter then settling with rich natural variation, each flame " +
      "moving independently on its own rhythm. The hanging chandeliers overhead blaze " +
      "unmistakably, their flames bright and plainly visible through the glass. The warm " +
      "light spills and breathes across the wood grain, brass, moss and glass around each " +
      "flame, shifting soft highlights and gentle shadows as the fire moves. Slow dust motes " +
      "drift through the warm light. " + SHARED_LOCK,
  },
  {
    key: "hearth",
    model: "minimax/minimax-h3",
    resolution: "2k",
    duration: 12,
    text:
      "An enchanted forest workshop at night, filmed as a single continuous locked-off shot " +
      "of a room full of burning candles. The room is already fully alight when the shot " +
      "begins: hundreds of candle flames, lantern flames and chandelier flames all burning " +
      "steadily and continuously, never extinguishing and never relighting. The fire is " +
      "alive — flames waver, lean, flare and settle, their tips trembling, each with its own " +
      "independent rhythm, and the flames hanging overhead in the chandeliers and lanterns " +
      "burn brightly and are clearly visible. Their combined glow ripples across the room: " +
      "warm light spilling over the tabletops, brass fittings, glass panes, moss and bark, " +
      "with soft moving highlights, deep shadows and a real sense of depth. Fine dust motes " +
      "drift slowly through the light. " + SHARED_LOCK,
  },
];

const CANDIDATES = PASS === "hold" ? CANDIDATES_HOLD : CANDIDATES_IGNITE;
console.log(`pass=${PASS}  candidates=${CANDIDATES.map((c) => c.key).join(", ")}`);

const runs = CANDIDATES.map(async ({ key, model, resolution, text, duration }) => {
  const started = Date.now();
  try {
    const { videos } = await generateVideo({
      model,
      prompt: { image, text },
      duration: duration ?? 5,
      resolution,
      aspectRatio: "16:9",
      generateAudio: false,
    });
    const out = `${SP}/raw-${key}.mp4`;
    writeFileSync(out, videos[0].uint8Array);
    console.log(
      `✓ ${key} (${model} @ ${resolution}, ${duration}s) → ${out}`,
      `${(videos[0].uint8Array.length / 1e6).toFixed(1)} MB`,
      `in ${Math.round((Date.now() - started) / 1000)}s`,
    );
  } catch (error) {
    console.log(`✗ ${key} (${model} @ ${resolution}):`, String(error).slice(0, 300));
  }
});

await Promise.all(runs);
