# City kit pipeline (ADR 0017)

Builds `web/public/world/kit.glb` from Kenney's **City Kit Commercial**, **City Kit Suburban**, **City Kit Roads** and
**Car Kit**. All are CC0, free from kenney.nl. Unzip them side by side, then:

```bash
TOOLS=$(mktemp -d) && (cd $TOOLS && npm init -y >/dev/null && \
  npm i @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1)
TOOLS=$TOOLS node scripts/world/build.mjs <dir with the unzipped kits> web/public/world/kit.glb
```

Each chosen model becomes a top-level node named after its file, already scaled to metres: ×11 for the city kits
(one tile = an 11 m street), ×1.8 for cars. The palette textures are shared. `web/src/city.ts` places models by
those names, so renaming one means updating the city. To add a model, put it in `KITS` and rebuild.
