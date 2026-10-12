# 0017: Stylized open city and modular characters (supersedes 0012)

**Context.** On 2026-10-12 the owner reviewed the world and judged it "completely off" and "all too small". They
pointed at [MyAbujaLife](https://myabujalife.com) as the bar, and asked for characters people can modify. We looked
at how MyAbujaLife is built:
- It's three.js (r128) loading one Blender-authored, Draco-compressed city GLB.
- The look is a **clean, stylized diorama**, not realism: soft daylight, ACES tone mapping, soft shadows and fog.
- Residents use one shared 52-bone rig, one GLB per body and outfit, a tint mask for skin and clothing colour, and
  hair as mesh parts. Customisation covers body, outfit, hair style, skin tone and clothing colour.

Our world at the time was one 17 m × 40 m street of primitives. Rocketbox (ADR 0012) gave semi-realistic people,
but most creator controls changed nothing visible.

The owner chose three things that day:
- **Stylized like MyAbujaLife**, which reverses 0012's semi-realistic target.
- **CC0 kits now, Blender later.**
- **MyAbujaLife-level customisation where every option is visible.**

**Decision.**
- **Look.** Stylized low-poly, cohesive palette, soft directional sun plus sky fill, ACES and light bloom.
  Every 3D canvas still goes through `render.ts` and its `low`/`high` tiers.
- **The city** (`web/src/city.ts`) is one open map, 48 × 32 tiles of 11 m, about 530 m × 350 m.
  - Victoria Island (towers and shops) and Ikoyi (leafy houses) lie west of the lagoon.
  - Lekki Phase 1 (Admiralty Way shops and estates around the spawn plaza) lies east of it.
  - The Lekki–Ikoyi Link Bridge joins them, with colour-cycling deck lights at night.
  - The Atlantic beach runs along the south edge.
  - Streets are auto-tiled from a street plan, buildings face their street, and parks get trees and procedural palms.
  - Traffic includes yellow danfo buses.
  - The Ikoyi Lounge and VI Rooftop doors sit on the bridge road, so they're a straight walk from spawn.
- **Assets.**
  - **Kenney City Kits** (commercial, suburban, roads, cars; CC0) are merged by `scripts/world/build.mjs` into
    `public/world/kit.glb` (2.6 MB, 0.7 MB gzipped).
  - Every repeated model is a **thin instance**, about one draw call per kit mesh for the whole city.
  - The road and building orientations measured on the kit are recorded in `city.ts::roadPiece` / `FACE`.
- **Collision and movement.** Building footprints and water are boxes bucketed per tile, and the player slides along
  them. The bridge deck has railings.
  - **Pace.** A dock button cycles Walk 3.2 / Run 7.5 / Sprint 14 m/s and is remembered on the device (default Run).
    Shift, or the joystick pushed to its rim, adds one step.
  - **Tap/click to move.** Tap the ground, a building (you walk to its door), a person, or a venue door. You walk
    along a tile A* route that is straightened by line of sight. People and doors open when you arrive.
  - Turning is smoothed.
- **Camera.** Orbit and zoom only (no pan; panning fought the follow). It follows the player rigidly by moving
  the target *in place*: assigning `camera.target` re-aims an ArcRotateCamera from where it stands, which swung the
  view and walked strafing players in circles. An automatic pull-in near buildings made the zoom pulse and was
  removed. Zoom goes out to 32 m.
- **Performance.** Thin instances are committed in 12-tile chunks, so frustum and shadow-cascade culling work. Each
  chunk owns its geometry, because Babylon keeps thin-instance buffers on the geometry, and sharing it produced
  `glDrawElementsInstanced` overruns. SSAO runs on the high tier only.
- **No pop-in.** The world canvas stays veiled ("Loading Lagos…") until the kit is in and the scene is ready. The
  character and kit GLBs are prefetched at app start. The primitive placeholder person only appears if a model fails
  to load; it used to flash first in the wrong outfit.
- **Time of day** follows the game clock (`life.clock`): sunrise at 06:00, sunset at 19:00.
  - Night stays readable on purpose: moonlit fill, lamp pools, glowing venue signs.
  - Only neon is in the glow layer.
  - `?hour=21` pins the time for QA.
- **Lagos after dark** (owner, 2026-10-12: "it has lost its night club vibe"). The city always renders at 22:00;
  the game clock still runs in the HUD, and `?hour=` overrides it for QA. The night is a purple-magenta grade.
  - Pulsing neon on about a third of shop fronts and some VI towers.
  - Searchlights from the venue roofs, venue-coloured light on the street, and party lights round the plaza edge.
  - The owner then said "too much lights", so glow is restrained.
- **Finding the clubs** (owner: "I can't find any clubs around").
  - You arrive facing west over the bridge towards them.
  - Each club has a floating neon name above it.
  - A **Go out** sheet in the dock lists the clubs, and "Take me there" walks you to the door by street route, then
    enters.
- **Characters** (`web/src/avatar3d.ts`) use **Quaternius Ultimate Modular Men/Women** (CC0).
  - Every part is skinned to one 62-bone rig.
  - `scripts/characters/build.mjs` keeps the social outfit sets (no uniforms, sci-fi, fantasy or weapons) and the
    Idle, Walk, Run, Wave and Interact animations, then writes `public/characters/{male,female}.glb` (≈3 MB each,
    loaded once per scene and shared by every character).
  - A character is one head, top, bottom and shoes. Skin, hair, top and bottom are recoloured per character on
    cloned materials.
  - Styles the kit doesn't model (afro, puffs, locs) are low-poly volumes on the head bone.
  - Idle, walk and run blend by weight.
- **`AvatarLook`** gains `hair_style`, `shoes`, `top_color` and `bottom_color` (`#[serde(default)]`).
  - Old ids keep working: every legacy `top`/`bottom` id maps to a modular part, and an empty `hair_style` derives
    from `hair_length`.
  - The server checks ids are slugs and colours are `#rrggbb` (`AvatarLook::validate`).
  - Non-binary players pick a masculine or feminine build.
- **Rocketbox is removed** (`public/avatars/`, `scripts/avatars/`). It's in git history if we ever need it.

**Consequences.**
- `vision.md`'s "semi-realistic" wording is replaced by "stylized"; photoreal stays a non-goal.
- The client's poster and creator videos are semi-realistic. This record deliberately departs from them on the
  owner's instruction (MyAbujaLife is the bar now). Raise it with the client if they push back.
- Venue interiors (lounge, rooftop, private room, date scenes) are still the old neon primitives. They need the same
  treatment (Kenney furniture kit, Quaternius interiors), and that's the next art task.
- Kenney's suburban roofs are a saturated green. A Lagos palette pass (terracotta roofs, warmer walls) needs a
  recoloured colormap, a Blender-phase job.
- Asset budget: about 2.6 MB city plus about 3 MB per character frame in use, all compressed. Phones get no shadow
  map (contact shadows only).
- New third-party assets go in `web/public/LICENSES.md`.

**Revisit when.**
- Phones can't hold 30 fps in the city.
- The owner wants landmark-accurate Lagos (Blender phase: Lekki Toll Gate, Eko Atlantic towers, the National Theatre).
- The client insists on semi-realism.
