#!/bin/bash
# Rocketbox (MIT) → web-ready GLB: FBX2glTF, 1k PNG textures (sips), attach by material, resize/webp/quantize/dedup.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
S=${WORK:-$(mktemp -d)}
TOOLS=${TOOLS:?set TOOLS to a dir with fbx2gltf + @gltf-transform installed (see README)}
OUT=$1; shift
GT=$TOOLS/node_modules/.bin/gltf-transform
FBX=$TOOLS/node_modules/fbx2gltf/bin/$(uname -s)/FBX2glTF
RAW=https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master
mkdir -p "$OUT"
for spec in "$@"; do
  cat=${spec%%/*}; name=${spec##*/}; id=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  W=$S/rocketbox/raw/$name; mkdir -p "$W/Textures" "$W/out"
  P=Assets/Avatars/$cat/$name
  [ -f "$W/$name.fbx" ] || curl -sfL -o "$W/$name.fbx" "$RAW/$P/Export/$name.fbx"
  for t in $(gh api "repos/microsoft/Microsoft-Rocketbox/contents/$P/Textures" --jq '.[].name' | grep -E '_(color|normal)\.tga$'); do
    [ -f "$W/Textures/$t" ] || curl -sfL -o "$W/Textures/$t" "$RAW/$P/Textures/$t" &
  done; wait
  for f in "$W"/Textures/*.tga; do p="${f%.tga}.png"; [ -f "$p" ] || sips -s format png --resampleHeightWidthMax 1024 "$f" --out "$p" >/dev/null 2>&1; done
  "$FBX" --binary --input "$W/$name.fbx" --output "$W/out/raw" >/dev/null 2>&1
  cp "$HERE/attach.mjs" "$TOOLS/attach.mjs" && node "$TOOLS/attach.mjs" "$W/out/raw.glb" "$W/Textures" "$W/out/attached.glb" >/dev/null
  $GT resize "$W/out/attached.glb" "$W/out/s1.glb" --width 1024 --height 1024 >/dev/null
  $GT webp "$W/out/s1.glb" "$W/out/s2.glb" --quality 82 >/dev/null
  $GT quantize "$W/out/s2.glb" "$W/out/s3.glb" >/dev/null
  $GT dedup "$W/out/s3.glb" "$OUT/$id.glb" >/dev/null
  echo "$id $(stat -f %z "$OUT/$id.glb")"
done
# Low-memory variants for phones and portrait canvases.
mkdir -p "$OUT/512"
for f in "$OUT"/*.glb; do $GT resize "$f" "$OUT/512/$(basename "$f")" --width 512 --height 512 >/dev/null; done
