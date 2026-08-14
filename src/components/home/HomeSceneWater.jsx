'use client';
import { useCallback, useState } from 'react';
import { useSceneGate } from '@/hooks/useSceneGate';
import HomeSceneVideo from './HomeSceneVideo';
import HomeSceneLivePlate from './HomeSceneLivePlate';

// What makes the causeway move, and where each part comes from.
//
// ONE LAYER CARRIES BOTH NOW. The clip's mask used to stop at the lake, and the
// flames were left to a WebGL pass over the plate's own frozen fire. That was
// always the weaker half — /projects reads as alive because it ships FILMED
// flames, and a warp of a photograph cannot burn however it is tuned — and it
// was weak for an accidental reason: the flames were thrown out with the posts.
// The post keep-outs exist because the model swims the housings, and the fire
// happened to live inside them.
//
// So the bake cuts the flames back in as their own windows (bake-causeway-
// water.mjs § 5-6). Two things had to be true first, and both were measured:
//   • the model WALKS the near lanterns, up to 51 px, most of a lantern's own
//     width. But the walk is slow and fire is fast, so a moving average of the
//     flame's own centroid IS the walk: subtracting it re-registers the flame
//     on the wick the plate photographed and leaves every bit of the flicker.
//     Mean offset falls 13.2 -> 1.4 px and 14.8 -> 2.6 px.
//   • the water's 1s crossfade is the wrong way to close a fire loop — a full
//     second of double exposure is the "candles rebuild themselves" artefact —
//     so each flame gets its own loop length and an 8-frame seam instead.
//
// Measured on the shipped loop: causeway stone 0.01 temporal std, post housings
// 0.05-0.08, open water 0.60-1.20, flame windows 17.3. Everything the eye can
// check is still nailed down, the lake moves as it did, and the fire burns.
//
//   the lake + the flames → HomeSceneVideo, one masked ambient loop
//   the flames alone      → HomeSceneLivePlate, only if that clip cannot play
//
// ── WHY THE VIDEO CAME BACK ─────────────────────────────────────────────────
// It was withdrawn once, on the finding that invented structure covered most of
// the near-field water. Re-derived, that does not hold: it came from a metric
// that could not separate "these pixels changed" — which is the entire point of
// water — from "an edge appeared where the plate has none", which is the only
// change that matters. Scored on gradient energy the frame carries that the
// plate does not, the causeway stone and the lanterns come back at 11-17 while
// OPEN WATER sits at 0.8-2.7, an order of magnitude lower. The invention is
// concentrated in exactly the structure the mask already removes.
//
// What replaced it in the meantime — a procedural wave field — was rejected on
// sight, and re-tuning was never going to fix it: travelling bands, crest
// glints and spreading rings are all STRUCTURE INVENTED AND LAID OVER a
// photograph, which is why every version read as an effect rather than as the
// lake. The clip carries the water's real character instead, including the one
// detail worth the whole tier: the lantern reflections breaking up and
// re-forming on the surface.
//
//   video  → the masked loop (307 KB / 641 KB): the lake AND the flames
//   plate  → HomeSceneLivePlate, the WebGL flame warp, if that clip cannot play
//   still  → nothing mounted; the plate alone (reduced motion)
const HomeSceneWater = () => {
  // No element to observe at this level; the children bring their own gate.
  const { mounted } = useSceneGate(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [plateUnsupported, setPlateUnsupported] = useState(false);
  // Stable: both are props on a child whose effect lists them as deps, so a
  // fresh identity each render would tear that effect down and rebuild it —
  // for the plate that means dropping and re-creating a WebGL context per
  // render.
  const onVideoFail = useCallback(() => setVideoFailed(true), []);
  const onPlateUnsupported = useCallback(() => setPlateUnsupported(true), []);

  if (!mounted) return null;

  // Strictly one or the other. The flame layer sits ABOVE the video (-z-[46]
  // over -z-[47]) and writes opaque pixels inside its quads, so mounting both
  // paints the plate's FROZEN flame straight over the filmed one — the video's
  // fire would be there and simply never visible. On a decode or network
  // failure the lake drops back to the still and the flames to the warp, which
  // needs no network and cannot fail the same way.
  // The third tier is real and reachable, not just documented above: the warp
  // gives up when there is no WebGL, when its shader will not build, or when
  // the plate is larger than the GPU can hold. `onUnsupported` had never been
  // passed, so every one of those paths left a mounted canvas that would never
  // draw — and the size case would have drawn something worse than nothing.
  // Rendering null IS the still tier: the plate `<img>` is always underneath.
  if (plateUnsupported) return null;

  return videoFailed ? (
    <HomeSceneLivePlate onUnsupported={onPlateUnsupported} />
  ) : (
    <HomeSceneVideo onFail={onVideoFail} />
  );
};

export default HomeSceneWater;
