# Lagos kits: Blender pipeline (ADR 0018, 0019)

Builds `web/public/world/lagos.glb` (the open city) and `web/public/world/venues.glb` (club interiors) from code and
[Poly Haven](https://polyhaven.com) CC0 textures and models. Nothing is hand-modelled, so every asset is reproducible.

```bash
brew install --cask blender                       # Blender 5.2 LTS used for the committed build
node scripts/blender/fetch.mjs                    # Poly Haven textures + props → scripts/blender/.cache (not committed)
OUT=$(mktemp -d)
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/blender/build_city.py -- $OUT
TOOLS=$(mktemp -d) && (cd $TOOLS && npm init -y >/dev/null && \
  npm i @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1)
for f in lagos venues; do TOOLS=$TOOLS node scripts/blender/pack.mjs $OUT/$f.glb web/public/world/$f.glb; done
```

The build takes about 10 minutes; decimating the Poly Haven props takes most of it.

**What's in the kits.**
- **City buildings**, each fitting an 11 m lot with its front facing the street:
  - `house-a…f`: Lekki duplexes behind compound walls with gates;
  - `apartment-a…f`: blocks with balconies, AC units and rooftop water tanks;
  - `shop-a…d`: shophouses with roller shutters;
  - `tower-a…f`: VI curtain-wall towers.
- **Club fronts:** `club-box`, `club-two`, `club-tower` and `club-beach`.
- **Streets:** `road-*` pieces with the same connection rules as Kenney's (see `roadPiece` in `web/src/city.ts`).
- **Ground and greenery:** `ground-*` tiles, `palm-a…d` and `shrub`/`shrub-b`.
- **Props:** `street-lamp`, `generator`, `trash-bin`, `monobloc` and `barrier`.
- **Rooms:** `lounge-room` (club and lounge), `rooftop-room` and `beach-room`.

**Conventions.**
- **Coordinates:** geometry is written in game space (Babylon, metres: +X east, +Y up, +Z north, fronts facing -Z),
  then converted to Blender space by `g2b`.
- **UVs:** world-scale, so a texture keeps its real size on any wall.
- **Paint colours:** a material name like `plaster.peach` means the plaster texture tinted peach. The tints live in
  `TINTS` in `web/src/city.ts`.
- **Accents:** `neon`, `neon2` and `dancefloor` are tinted per club at runtime. `win-lit` and `win-dim` are lit rooms
  from a generated atlas.
- **Ids:** `web/src/city.ts` and `web/src/venue.ts` look models up by their top-level node name. Renaming one means
  updating them.

**Size.** Albedo maps stay at 1k, normal and roughness maps go to 512, all as WebP. `pack.mjs` welds and quantizes
the geometry. Props are decimated to a few hundred to 2,500 triangles.
