# 0012: Semi-realistic art direction (supersedes 0004)

**Context.** ADR 0004 chose stylized 3D because the spec says "stylized" and cites Synty/Sims/Paralives art. The
client's own gameplay screenshot (`references/whatsapp/03`, `06`) and creator videos show skinned, realistic-ish
humans in a furnished, softly lit venue. Our primitive avatars and flat-shaded venues were reviewed on 2026-10-10
and judged "not lifelike". The project owner chose **semi-realistic** on that date, using **openly licensed
assets** and doing **lighting first, then characters**.

**Decision.**
- **Look:** semi-realistic, matching the client's gameplay screenshot and the Sims 4 references: real human
  proportions, skinned characters, physically plausible night lighting. **Not photoreal** (inZOI-level is too heavy
  for mobile web). Content stays non-graphic (ADR 0003).
- **Phase 1, rendering (done):** `web/src/render.ts`.
  - Filmic post-processing on every 3D canvas: ACES tone mapping, bloom tuned for neon, FXAA and a vignette.
  - Soft key-light shadows, plus a contact shadow under every character.
  - Fresnel wet-floor reflections.
  - Procedural surface textures (asphalt, concrete, wood, tile, fabric, plaster) with normal maps, painted in
    code, so no third-party files are involved.
- **Quality tiers:** `high` (desktop) adds shadow maps, reflections, normal maps, MSAA and grain. `low` (touch
  devices or screens under 500 px on the short side) keeps tone mapping, bloom and FXAA. Override with
  `?quality=low|high`.
- **Phase 2, characters (next):** Microsoft Rocketbox avatars (**MIT licence**, 40 rigged adults with a shared
  skeleton and animations).
  - Convert FBX → glTF with FBX2glTF, shrink the textures to 1k WebP, and compress with gltf-transform.
  - Ship from `web/public/avatars/` with the MIT notice.
  - `AvatarLook` picks the closest base model (gender, skin tone, outfit style), then tints hair and clothing and
    scales by body type.
  - The primitive humanoid stays as the loading and fallback avatar.
- **Phase 3, props:** CC0 furniture, plants and bar dressing (e.g. Poly Haven glTF) for venues, with the same
  compression pipeline.

**Consequences.**
- `vision.md`'s "Photoreal avatars" non-goal still holds: semi-realistic ≠ photoreal.
- The "stylized" wording in `vision.md` and `source-analysis.md` is now out of date. This record wins.
- Asset weight becomes a budget item. Target ≤ 2.5 MB per avatar (compressed), avatars loaded lazily, and
  instancing for repeated NPCs.
- Every shipped asset needs its licence recorded in `web/public/LICENSES.md`. Nothing from `docs/references/` ships.
- Creator controls must keep mapping to something visible (from 0004), so the base-model choice plus
  tints/scales must cover every control.

**Revisit when.** Phones can't hold 30 fps with Phase 2 avatars, the client wants a different art source, or
budget appears for commissioned characters.
