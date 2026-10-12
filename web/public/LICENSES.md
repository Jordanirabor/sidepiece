# Third-party assets shipped with the web client

| Path | Source | Licence |
|---|---|---|
| `characters/male.glb`, `characters/female.glb` | [Quaternius](https://quaternius.com) Ultimate Modular Men (Feb 2022) and Ultimate Modular Women (Apr 2022), trimmed and compressed (`scripts/characters/`) | CC0 1.0 |
| `world/kit.glb` | [Kenney](https://kenney.nl) City Kit Commercial 2.1, City Kit Suburban 2.0, City Kit Roads 2.2 and Car Kit, merged (`scripts/world/`) | CC0 1.0 |
| `world/lagos.glb`, `world/venues.glb` | Generated in Blender by `scripts/blender/build_city.py` (buildings, streets, palms, rooms are our own code) with [Poly Haven](https://polyhaven.com) textures and models (street lamp, generator, bin, monobloc chair, barrier, sofa, bar stool, lounge chair, pendant lamp, potted plant, bistro set) | CC0 1.0 |
| `world/sky.hdr` | [Poly Haven](https://polyhaven.com) HDRI | CC0 1.0 |

CC0 needs no attribution; we credit Quaternius, Kenney and Poly Haven anyway. The Link Bridge, hair volumes and the
sky gradient are made in code (`src/city.ts`, `src/avatar3d.ts`, `src/render.ts`). Nothing from
`docs/references/` ships.

## Bundled from npm (via Vite)

| Package | What | Licence |
|---|---|---|
| `@fontsource-variable/bricolage-grotesque` | Bricolage Grotesque (display font) | SIL OFL 1.1 |
| `@fontsource-variable/plus-jakarta-sans` | Plus Jakarta Sans (body font) | SIL OFL 1.1 |
| `@fontsource-variable/caveat` | Caveat (hand-written accents) | SIL OFL 1.1 |
| `lucide-react` | UI icons | ISC |
