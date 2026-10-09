#!/usr/bin/env bash
# Side-by-side comparison image: compare.sh <screenshot> <reference> <output.jpg> [height]
set -euo pipefail
shot="$1"; ref="$2"; out="$3"; h="${4:-720}"
ffmpeg -loglevel error -y -i "$shot" -i "$ref" -filter_complex \
  "[0]scale=-2:${h}[a];[1]scale=-2:${h}[b];[a][b]hstack=inputs=2" -frames:v 1 -q:v 3 "$out"
echo "wrote $out (left: build, right: reference)"
