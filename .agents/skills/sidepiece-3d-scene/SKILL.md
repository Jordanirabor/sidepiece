---
name: sidepiece-3d-scene
description: Conventions and gotchas for Side Piece's Babylon.js 3D world, avatars and venues (web/src/venue.ts, SceneView.tsx, Creator.tsx previews). Use when building or changing venues, the city hub, lighting, cameras, avatars/humanoids, portals, NPC placement, movement or interaction prompts.
---

# Side Piece 3D scene conventions

## Art direction
Stylized 3D, Lagos nightlife, neon violet/pink/cyan with warm amber practicals (ADR 0004, `docs/references/README.md` → *Distilled art direction*).
The current humanoid is a **placeholder built from primitives**. Every `AvatarLook` field must stay visibly mapped until real glTF models replace it.

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
- Use a `HemisphericLight` ambient at 0.45–0.85 with a `groundColor`.
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
- `window.__sp` is a read-only test hook (`pos()`, `portals`, `venue`) used by `scripts/ui-check.mjs`. Keep it working.

## Performance
- The scene rebuilds on venue, look or NPC-set change. Dispose engines in effect cleanup.
- The creator can mount up to 3 small preview engines. Mind WebGL context limits if you add more.
- Remote avatars interpolate toward the server position (lerp `dt*10`). Movement is sent at most every 80 ms.

Always finish with the `sidepiece-ui-verify` skill.
