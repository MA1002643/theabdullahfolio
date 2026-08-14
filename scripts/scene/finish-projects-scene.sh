#!/usr/bin/env bash
# Turn the raw i2v clip into the seamless ambient loop for /projects, and
# export the matching still poster. Companion to gen-projects-scene.mjs (run
# that first) and find-loop-point.mjs (called here to choose the loop).
#
# Usage:  scripts/scene/finish-projects-scene.sh <raw-clip.mp4>
# Env:    SCRATCH — work dir for intermediates (default <repo>/.scene-work)
#         FFMPEG — ffmpeg binary (defaults to the `ffmpeg-static` devDependency)
#         DRIFT  — per-second gamma slope cancelling the model's exposure
#                  ramp (default 0.0357, measured on the shipped clip; 0=off)
#         BOOST  — temporal-unsharp gain on the flicker (default 2.2; 0=off)
#         BLOOM  — glow opacity screened back over the frame (default 0.30)
#         FADE   — crossfade length in frames at the loop seam (default 16)
#         CRF    — final encode quality (default 20)
#
# ── WHY EACH STAGE EXISTS ───────────────────────────────────────────────
#
# 0. DRIFT. i2v models ramp the whole frame's exposure as the clip runs
#    (measured 52.9 → 70.7 YAVG over 5 s). A loop built from that pulses
#    once per cycle and drifts away from the poster. Gamma, not a
#    brightness offset: gamma pins pure black and white, so the forest
#    shadows can't crush.
#
# 1. BOOST. Resolution is bought with motion — the 2K model renders every
#    filigree crisply but flickers at ~1/3 the amplitude of the 1080p one,
#    and the fire stops reading as fire. Neither prompting nor model choice
#    fixes it (veo moves beautifully but dollies the camera). So amplify
#    the flicker that IS there: subtract a 7-frame moving average and add
#    the difference back. Static pixels have A≈B and are untouched, so no
#    motion is invented and the camera cannot drift. Frame 0 comes out
#    un-boosted (tmix has no history yet), which is what the poster wants.
#
# 2. BLOOM. Threshold the highlights, blur them, screen them back: the
#    flames throw light onto the wood, brass and moss around them, and
#    because the mask follows the flames the spill flickers with them.
#    MUST be done in RGB — masking luma while leaving chroma alone lights
#    every dark pixel with its own colour and turns the scene magenta.
#
# 3. LOOP POINT. This is what stops the scene "rebuilding itself" every
#    cycle. Crossfading the clip's own tail into its own head means a long
#    dissolve between two moments ~5 s apart — and over 5 s the model
#    quietly morphs candle geometry, so the dissolve shows candles
#    doubling and reassembling. find-loop-point.mjs instead searches for
#    the two moments that already match (appearance + motion direction):
#    seam error 93 vs 648 for the clip's own ends, ~7× better, and the
#    matched pair is close enough in time that only the flames differ.
#
# 4. FADE LENGTH is counter-intuitive: LONGER is smoother. During a fade
#    each frame moves 1/F of the way across the mismatch, so per-frame
#    error falls as F² — 16 frames puts it under the clip's own natural
#    frame-to-frame motion. Short fades trade a dissolve for a snap.
#
# 5. THE +1 FRAME. xfade's last in-range frame is only (F-1)/F across, so
#    cutting there leaves a fraction of the outgoing shot in the final
#    frame and the wrap-around jumps. One extra frame lands on the
#    completed fade, making the loop point two CONSECUTIVE master frames.
#    This one line took the seam from 8× a normal frame step to below it.
#
# Verify after building — the seam is judged by ratio, not absolute error:
#   node scripts/scene/seam-check.mjs public/background/projects-flames.mp4
# Target: wrapAroundStep <= the clip's own max normal step.
set -euo pipefail

RAW="${1:?usage: scripts/scene/finish-projects-scene.sh <raw-clip.mp4>}"
# Two different anchors, and conflating them is a real bug: DIR locates the
# SIBLING scripts this one drives, ROOT locates the repo the assets belong to.
# While this script lived at the repo root the two were the same directory, so
# `${DIR}/public/background/...` happened to be correct; from scripts/scene it
# would write the finished loop and poster to scripts/scene/public/background/,
# where the app would never load them. Both are derived from $0, so the script
# is correct from any working directory (the two .mjs it calls take explicit
# paths and read nothing cwd-relative).
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${DIR}/../.." && pwd)"
OUT="${ROOT}/public/background/projects-flames.mp4"
POSTER="${ROOT}/public/background/project-bg.webp"
# ffmpeg comes from the `ffmpeg-static` devDependency, not from PATH — there is
# no system ffmpeg on the machine this scene was built on, and a script that
# aborts on a missing binary it could have resolved itself is a trap. Resolved
# from ROOT so this stays correct from any cwd. FFMPEG= still overrides.
FF="${FFMPEG:-$(cd "$ROOT" && node -p "require('ffmpeg-static')" 2>/dev/null || true)}"
[ -x "$FF" ] || { echo "ffmpeg not found — run npm install, or set FFMPEG=/path/to/ffmpeg"; exit 1; }
DRIFT="${DRIFT:-0.0357}"
BOOST="${BOOST:-2.2}"
BLOOM="${BLOOM:-0.30}"
FADE="${FADE:-16}"
CRF="${CRF:-20}"
FPS=24
# Intermediates live in the shared scene work dir (scripts/scene/README.md →
# Contract), not a mktemp scratch that is deleted on exit. The near-lossless
# master is the INPUT to every stage after it, so discarding it means paying a
# full regrade to re-cut the loop at a different fade, re-check a seam, or look
# at what the grade actually did. Filenames are fixed, so a rerun overwrites
# rather than accumulating.
WORK="${SCRATCH:-${ROOT}/.scene-work}/projects-scene"
mkdir -p "$WORK"

# ── Stage 0-2: one grade pass → near-lossless master ────────────────────
CHAIN="[0:v]"
[ "$DRIFT" = "0" ] || CHAIN="${CHAIN}eq=gamma='max(0.78,1-${DRIFT}*t)':eval=frame,"
if [ "$BOOST" = "0" ]; then
  CHAIN="${CHAIN}null[lit]"
else
  CHAIN="${CHAIN}split=2[a][b];[b]tmix=frames=7[sm];\
[a][sm]blend=all_expr='clip(A+${BOOST}*(A-B),0,255)'[lit]"
fi
if [ "$BLOOM" = "0" ]; then
  GRAPH="${CHAIN};[lit]format=yuv420p[v]"
else
  GRAPH="${CHAIN};[lit]format=gbrp,split=2[base][hi];\
[hi]lutrgb=r='clip((val-180)*2.2,0,255)':g='clip((val-180)*2.2,0,255)':b='clip((val-180)*2.2,0,255)',\
gblur=sigma=22[glow];[base][glow]blend=all_mode=screen:all_opacity=${BLOOM},format=yuv420p[v]"
fi
"$FF" -nostats -loglevel error -y -i "$RAW" -filter_complex "$GRAPH" \
  -map "[v]" -an -c:v libx264 -crf 8 -preset veryfast "$WORK/master.mp4"

# ── Stage 3: where should the loop start and end? ───────────────────────
read -r TS TE < <(
  FFMPEG="$FF" node "${DIR}/find-loop-point.mjs" "$WORK/master.mp4" "$FADE" "${MINLOOP:-2.5}" |
    python3 -c 'import sys,json; b=json.load(sys.stdin)["best"]; print(b["startSeconds"], b["endSeconds"])'
)
echo "loop points: ${TS}s → ${TE}s (fade ${FADE} frames)"

# ── Stage 4: assemble the loop ──────────────────────────────────────────
# Done in close-loop.mjs, NOT with ffmpeg's xfade. Measured at native
# resolution, the old xfade + "+1 frame" assembly left the final frame still
# mid-blend (it matched no master frame within 2.66, against a 1.43 CRF floor
# for frame 0), producing a wrap 7.6x a normal frame step — the "you can tell
# it's a repeating video" tell. close-loop.mjs makes the endpoint exact by
# construction: its last frame IS master[ts+F-1] and its first IS
# master[ts+F], two consecutive frames. It also sidesteps the xfade EOF wedge
# that previously needed a tpad clone-pad to work around.
TSF=$(awk "BEGIN{printf \"%d\", ${TS}*${FPS}+0.5}")
TEF=$(awk "BEGIN{printf \"%d\", ${TE}*${FPS}+0.5}")
FFMPEG="$FF" node "${DIR}/close-loop.mjs" "$WORK/master.mp4" "$OUT" "$TSF" "$TEF" "$FADE" "$CRF"

# The poster is the loop's OWN first frame. An i2v pass re-renders fine
# detail (27 dB PSNR against the image it was fed), so a poster from any
# other source visibly pops the moment the video mounts.
#
# Encoded via sharp, NOT ffmpeg's libwebp. ffmpeg writes a WebP that decodes
# fine everywhere (sharp and browsers both read it as 2560x1440) but that
# Next's STATIC IMPORT rejects outright — `Image import "…project-bg.webp" is
# not a valid image file`, which fails the build, not just the request. sharp
# is already a dependency and its output imports cleanly.
"$FF" -nostats -loglevel error -y -i "$OUT" -frames:v 1 "$WORK/poster.png"
node -e '
  const sharp = require("sharp");
  sharp(process.argv[1]).webp({ quality: 88, effort: 6 }).toFile(process.argv[2])
    .then((i) => console.log(`poster ${i.width}x${i.height} ${(i.size/1024).toFixed(0)}KB`));
' "$WORK/poster.png" "$POSTER"

ls -la "$OUT" "$POSTER"
