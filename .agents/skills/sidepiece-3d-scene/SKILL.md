---
name: sidepiece-3d-scene
description: Conventions and gotchas for Side Piece's Babylon.js 3D world, avatars and venues (web/src/venue.ts, SceneView.tsx, Creator.tsx previews). Use when building or changing venues, the city hub, lighting, cameras, avatars/humanoids, portals, NPC placement, movement or interaction prompts.
---

# Side Piece 3D scene conventions

## Art direction
Stylized low-poly diorama like MyAbujaLife (ADR 0017, `docs/references/README.md` → *Distilled art direction*), with
neon violet/pink/cyan for nightlife accents.

## City (`web/src/city.ts`)
- One open map: 48 × 32 tiles of `TILE` = 11 m. `cellPos(c, r)` gives a tile centre (+X east, +Z north). The street
  plan is `STREETS_EW` / `STREETS_NS`; roads auto-tile in `roadPiece`. Kenney orientations at rotation 0: straight
  runs along X, bend joins N+E, T-junction is missing S, end-round is open to W, `road-bridge` runs along Z, and
  buildings face −Z (`FACE`).
- Realistic art (ADR 0018/0019) comes from `public/world/lagos.glb` (city) and `public/world/venues.glb` (rooms), built
  by `scripts/blender/build_city.py` from Poly Haven textures (see its README). They're loaded after `kit.glb`, so their
  `road-*` pieces replace Kenney's. Their materials stay PBR: `tuneLagosMaterial` tints `plaster.peach`-style names from
  `TINTS`. `neon`, `neon2` and `dancefloor` take each club's colours. In venues, `usePhysicalLightFalloff = false` keeps
  point lights range-based. Kenney still supplies cars, traffic lights and parasols.
- Kit models come from `public/world/kit.glb` (`scripts/world/build.mjs`). They're baked to world space at load and
  drawn as **thin instances** (`place(model, x, z, rot, scale)`). Don't add per-object meshes for repeated props.
- Every Kenney kit's material is named `colormap`, so key materials by `uniqueId`. Keying by name gave every kit
  the commercial palette (orange roads, red trunks).
- Water and ground: the water planes sit just *above* the ground plane, or the ground hides them.
- Only neon belongs in the city's glow layer (`glowing(mesh)`). Glowing whole buildings turned the night into a haze.
- Collision: `addBox` footprints per tile; `venue.collide(from, to)` slides. Portals sit on the street in front of
  venue doors. `?hour=H` pins the time of day.

## Characters (`web/src/avatar3d.ts`, `look.ts`)
- Quaternius modular rigs: `public/characters/{male,female}.glb` (`scripts/characters/build.mjs`). A look picks one
  `<Set>_Head|Body|Legs|Feet` per frame from `TOPS`/`BOTTOMS`/`SHOES`/`HAIR_STYLES` (`parts[frame] = [set,
  material]`). The other parts are disposed.
- Parts share materials (a dress and its skirt are both `LimeGreen`), so **clone before recolouring**. glTF colours
  are linear: use `toLinearSpace()`.
- Head bone is `Head`. Extra hair volumes (afro, puffs, locs) are placed in world space at rest, then `setParent(head)`.
- Every creator control must change something visible. Add an item only when a part exists for that frame.

## Rendering (`web/src/render.ts`)
- Every 3D canvas uses `createEngine()` (capped pixel ratio) and `applyCinematicLook(scene, [camera], opts)`:
  ACES tone mapping, bloom (threshold 0.9), FXAA and a vignette. Pass `compact: true` for small portrait canvases.
- Quality tiers: `quality()` is `low` on touch devices or screens under 500 px on the short side, otherwise `high`.
  Force it with `?quality=low|high`. Only `high` gets shadow maps, mirrors, normal maps, MSAA and grain.
- Venues get a shadow-casting key light from `KEY_LIGHTS` in `venue.ts`. Register characters with
  `venue.castShadow(mesh)`; `makeHumanoid` returns `meshes` for that. Every humanoid gets a `contactShadow`.
- Surfaces: `applySurface(mat, 'asphalt'|'concrete'|'wood'|'tile'|'fabric'|'plaster', [u, v])`. The textures are
  painted in code, so no third-party files are involved.
- Wet floors: `addFloorReflection(scene, floor, mat, level)` (Fresnel mirror on high; brighter base colour on low).

## Rendering gotchas (learned the hard way)
- **Never `clone()` a `DynamicTexture`.** The clone never becomes ready, so Babylon silently skips the mesh (the
  street turned into background colour). Use a data URL plus `new Texture(url)`, which Babylon caches by URL.
- Name tags must stay **below the bloom threshold** (emissive ≈ 0.82) and out of the `GlowLayer`, or they become
  white blobs. Neon signs (`bg: 'none'`) should glow.
- `StandardMaterial.maxSimultaneousLights` defaults to 4. The `material()` helper raises it (12 high / 6 low), and
  big floors need it, otherwise door lights silently don't light the street.
- Headless Chrome reports an 800×600 screen and renders with SwiftShader at about 3 fps on `high`. Capture scripts
  must wait for `__sp.scene.isReady()` plus a few seconds, and walking needs a large step budget. A blank frame
  in a capture usually means "not compiled yet", not a scene bug. Re-probe before "fixing" it.
- Low fps numbers from headless runs are meaningless. Judge performance on a real phone.

## Coordinate & camera rules
- Avatars **face +Z**. Name tags sit at y ≈ 2.35. The NPC typing bubble is at y ≈ 2.75.
- World camera: `ArcRotateCamera` behind the player (alpha −π/2), beta ≈ π/2.55, radius ≈ 7.5, beta clamped to [π/5, π/2.1].
  The player spawns facing +Z, and movement is **camera-relative**.
- Creator preview camera sits on +Z looking at the origin, so the avatar needs **no rotation**.
- Close-ups need `camera.minZ = 0.05`. The default near plane (1) clipped the whole face.
- Never put geometry between the spawn point and the camera. Exit doors go on **side walls** (`exitDoor(scene, wallX, z)`).

## Lighting (most common failure)
- `StandardMaterial` + `PointLight` has **no physical falloff**. Intensities above ~2 blow the scene out to white.
  Use intensity **0.8–1.5 with a `range`**.
- Use a `HemisphericLight` ambient at 0.4–0.6 with a `groundColor` (tone mapping lifts it; more ambient looks milky).
- Readability comes from emissive accents (neon strips, windows, door markers) plus a `GlowLayer` at about 0.4–0.6.
- The city uses light EXP2 fog (density ~0.018) for depth. Check that it stays legible: the first build was nearly black.

## Venues (`buildVenue(scene, kind)` → `VenueHandles`)
- Return `bounds {x,z}`, `playerSpawn`, `portals[]` (`{kind, label, position}`) and `animate(t)`.
- Kinds: `city`, `neon_lounge`, `rooftop_party`, `private_room`. Portals use the `matchmaking/join` room kind.
  Every venue except the private room has a portal back to `city`.
- City doors: glowing door, neon sign label (`makeLabel`), floor marker disc, coloured point light.
- A new club is one entry in `crates/common/src/venues.rs` (kind without `-`, name, area, street, style, capacity), its
  mirror in `web/src/venues.ts` (colours, vibe) and a lot in `VENUE_LOTS` in `city.ts`. Life actions reach it via
  `NIGHTLIFE`, and the API validates joins against the catalog. Interiors come from the style (`lounge-room`, `rooftop-room`,
  `beach-room`). NPCs in `npcs.rs` are optional.

## Interaction
- `SceneView` picks the nearest NPC (≤ 2.2) or portal (≤ 2.64) as the target. E or a click on the prompt activates it.
- The prompt is hidden while the NPC chat is open (CSS `:has`).
- Keyboard input is ignored while an input is focused. Keys clear on window blur.
- `window.__sp` is a test hook (`pos()`, `portals`, `venue`, `teleport(x, z, rot)` for screenshots) used by `web/scripts/ui-check.mjs`. Keep it working.

## Performance
- The scene rebuilds on venue, look or NPC-set change. Dispose engines in effect cleanup.
- The creator can mount up to 3 small preview engines. Mind WebGL context limits if you add more.
- Remote avatars interpolate toward the server position (lerp `dt*10`). Movement is sent at most every 80 ms.

Always finish with the `sidepiece-ui-verify` skill.
