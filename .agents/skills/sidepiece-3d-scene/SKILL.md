---
name: sidepiece-3d-scene
description: Conventions and gotchas for Side Piece's Babylon.js 3D world, avatars and venues (web/src/venue.ts, SceneView.tsx, Creator.tsx previews). Use when building or changing venues, the city hub, lighting, cameras, avatars/humanoids, portals, NPC placement, movement or interaction prompts.
---

# Side Piece 3D scene conventions

## Art direction
Semi-realistic 3D, Lagos nightlife, neon violet/pink/cyan with warm amber practicals (ADR 0012, `docs/references/README.md` → *Distilled art direction*).
The current humanoid is a **placeholder built from primitives**. Every `AvatarLook` field must stay visibly mapped until Rocketbox glTF models replace it (ADR 0012 phase 2).

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
- A new venue also needs an API room kind (`room_capacity`, `room_display_name` in `apps/api/src/main.rs`), NPCs in `npcs.rs`, and life actions in `life.rs` `ACTIONS[].venues`.

## Interaction
- `SceneView` picks the nearest NPC (≤ 2.2) or portal (≤ 2.64) as the target. E or a click on the prompt activates it.
- The prompt is hidden while the NPC chat is open (CSS `:has`).
- Keyboard input is ignored while an input is focused. Keys clear on window blur.
- `window.__sp` is a read-only test hook (`pos()`, `portals`, `venue`) used by `web/scripts/ui-check.mjs`. Keep it working.

## Performance
- The scene rebuilds on venue, look or NPC-set change. Dispose engines in effect cleanup.
- The creator can mount up to 3 small preview engines. Mind WebGL context limits if you add more.
- Remote avatars interpolate toward the server position (lerp `dt*10`). Movement is sent at most every 80 ms.

Always finish with the `sidepiece-ui-verify` skill.
