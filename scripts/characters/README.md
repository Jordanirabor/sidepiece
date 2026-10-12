# Character pipeline (ADR 0017)

Builds `web/public/characters/{male,female}.glb` from Quaternius **Ultimate Modular Men** (Feb 2022) and **Ultimate
Modular Women** (Apr 2022). Both are CC0, free from quaternius.com (Google Drive links on each pack page). Run it only
when adding or changing outfit sets; the outputs are committed.

```bash
TOOLS=$(mktemp -d) && (cd $TOOLS && npm init -y >/dev/null && \
  npm i fbx2gltf@0.9.7-p1 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1)
FBX=$TOOLS/node_modules/fbx2gltf/bin/$(uname -s)/FBX2glTF   # macOS: x86_64, runs under Rosetta
$FBX --binary -i "Ultimate Modular Men/All together/FBX/Humans_Master.fbx" -o /tmp/men_all
$FBX --binary -i "Ultimate Modular Women/All together/FBX/All together.fbx" -o /tmp/women_all
TOOLS=$TOOLS node scripts/characters/build.mjs /tmp/men_all.glb web/public/characters/male.glb male
TOOLS=$TOOLS node scripts/characters/build.mjs /tmp/women_all.glb web/public/characters/female.glb female
```

`build.mjs` does the following:
- Keeps the outfit sets in `KEEP` (each `<Set>_Head|Body|Legs|Feet`) and drops costumes and weapons.
- Keeps the animations in `ANIMS`.
- Fixes the women's `Formad_Head` typo.
- Dedups, welds, resamples and quantizes.

It doesn't flatten the hierarchy, because the client finds parts and the `Head` bone by name. To offer a new part,
add it to `TOPS`/`BOTTOMS`/`SHOES`/`HAIR_STYLES` in `web/src/look.ts` with the material that takes the colour. Check
material names with any glTF viewer.
