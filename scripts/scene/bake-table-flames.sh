#!/usr/bin/env bash
# Re-bake the /projects workshop clip so the TABLE candles actually burn.
#
# The generated ambient loop lights the room beautifully but its flames barely
# move: measured across a full 4.17s cycle, the candle cores vary by a temporal
# std of ~1.8 of 255 against ~0.24 at a no-flame control point — near the
# codec's own dither, and sub-perceptual once the layer's 0.88 opacity and the
# scrim have taken their cut. No amount of front-end tuning reaches a baked
# clip, so the fire is re-animated in the asset itself.
#
# Each table flame's OWN filmed pixels are warped — scaled about its wick,
# leaning with height, brightening and guttering — so nothing is repainted and
# the plate's colour, grain and lighting survive. Everything hanging from the
# canopy (the crystal chandelier and every lantern on a chain) is outside the
# table regions and comes through untouched; that is verified, not assumed.
#
# Every time signal is a sum of INTEGER harmonics of the loop length, so the
# animation closes exactly on itself and the existing seamless loop needs no
# re-cut (measured wrap 3.017 -> 3.067 against a natural step of ~0.6).
#
# Run from the repo root. `sharp` and `ffmpeg-static` are both devDependencies,
# so nothing needs installing system-wide.
#
#   scripts/scene/bake-table-flames.sh
#
# Env: SCRATCH — work dir for intermediates (default ./.scene-work)
#      FFMPEG  — ffmpeg binary (defaults to the `ffmpeg-static` devDependency)
set -euo pipefail

BG="public/background"
MASTER="$BG/projects-flames.mp4"
# Shared scene work dir (scripts/scene/README.md → Contract), not TMPDIR: the
# decoded rgb24 stream is tens of GB and the backed-up original ladder is the
# only copy of the pre-bake assets, neither of which belongs in a directory the
# OS is free to sweep between the bake and the review of its output.
WORK="${SCRATCH:-./.scene-work}/table-flames"
W=2560
H=1440

FF="${FFMPEG:-$(node -p "require('ffmpeg-static')" 2>/dev/null || true)}"
[ -x "$FF" ] || { echo "ffmpeg not found — run npm install, or set FFMPEG=/path/to/ffmpeg"; exit 1; }

mkdir -p "$WORK"
echo "==> backing up the current ladder (these assets are not in git)"
for f in projects-flames.mp4 projects-flames-1080.mp4 projects-flames-720.mp4; do
  [ -f "$BG/$f" ] && cp -n "$BG/$f" "$WORK/orig-$f"
done

echo "==> extracting frame 0 and locating table flames"
"$FF" -v error -i "$MASTER" -vf "select=eq(n\,0)" -vframes 1 "$WORK/frame0.png" -y
node scripts/scene/detect-table-flames.mjs "$WORK/frame0.png" "$WORK/detect.png"
echo "    review $WORK/detect.png — green = animated, red = left as filmed"

echo "==> decoding to raw rgb24"
"$FF" -v error -i "$MASTER" -f rawvideo -pix_fmt rgb24 "$WORK/in.raw" -y

echo "==> baking flame motion"
node scripts/scene/bake-table-flames.mjs "$WORK/in.raw" "$WORK/out.raw" "$WORK/detect.json" "$W" "$H"

# Flat QP on purpose: x264's default ipratio gives the loop's IDR a lower QP
# than the frame before it, which reads as a periodic "refresh" with nothing
# behind it — the artefact this scene was already re-encoded once to remove.
X264="ipratio=1.0:pbratio=1.0:scenecut=0:keyint=100:min-keyint=100"
enc () { # width height crf outfile
  "$FF" -v error -f rawvideo -pix_fmt rgb24 -s "${W}x${H}" -r 24 -i "$WORK/out.raw" \
    -vf "scale=${1}:${2}:flags=lanczos" -c:v libx264 -profile:v high -pix_fmt yuv420p \
    -crf "${3}" -x264-params "$X264" -movflags +faststart "${4}" -y
  echo "    $(basename "${4}"): $(wc -c < "${4}") bytes"
}

echo "==> encoding the ladder"
enc "$W"  "$H"  21 "$BG/projects-flames.mp4"
enc 1920  1080  24 "$BG/projects-flames-1080.mp4"
enc 1280  720   26 "$BG/projects-flames-720.mp4"

echo "==> done. originals kept in $WORK/orig-*.mp4"
