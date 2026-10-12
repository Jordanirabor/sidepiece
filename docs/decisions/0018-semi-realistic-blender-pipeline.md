# 0018: Semi-realistic art through a scripted Blender pipeline (amends 0017)

**Context.** After 0017 shipped (Kenney city, Quaternius characters), the owner reviewed it on 2026-10-12. Their
verdict: the graphics are "still very basic", faces and city need far more detail, and "we don't want to limit it
to the graphic of the reference" (MyAbujaLife). Free low-poly kits can't go further. Faces are flat material
patches, and buildings are palette-coloured boxes. The owner chose:
- a **semi-realistic** target (Sims 4 / the client's own poster), still running in a phone browser;
- **free art built in Blender**, which the owner installs and Claude scripts.

**Decision.**
- **Keep everything 0017 built that isn't art:**
  - the 530 × 350 m Lagos map and street plan, collision, A* tap-to-move, pace control and camera;
  - the clock-driven light, chunked thin instances, the loading veil and prefetch;
  - the `AvatarLook` part model and creator flow.
  The new art slots into those seams (`public/world/*.glb` model names, `public/characters/*.glb` parts).
- **Characters:** MakeHuman via **MPFB2** (CC0 output), scripted in Blender (headless `blender -b -P`).
  - One base body per frame with **face and body shape keys** exported as glTF morph targets, driving real face
    sliders (jaw, cheeks, nose, eyes, lips) and body sliders.
  - Textured skin with a tone parameter, MPFB hair and clothing assets as separate skinned parts.
  - LODs, and a Mixamo-compatible rig retargeted to the existing animation set.
  - Target ≤ 4 MB per frame on high, with a lighter phone variant.
- **City:** Poly Haven CC0 PBR textures (plaster, concrete, asphalt, roof tiles, glass) baked onto building
  shells generated in Blender from the same street plan, with real window and balcony geometry.
  - Poly Haven CC0 props (benches, plants, street furniture).
  - The HDRI sky already in `public/world/sky.hdr` lights everything (IBL).
  - Lagos landmarks come later in the same pipeline.
- **Until then** the 0017 art stays live, so the game is never broken mid-transition.

**Consequences.**
- Blender is now a build dependency, scripted and reproducible (`scripts/blender/`). Outputs are committed, like
  the other asset builds.
- Download size and GPU cost rise. The `low` tier keeps lighter LODs and no SSAO; check performance on a real phone.
- `vision.md` returns to "semi-realistic" once the first characters land.

**Progress (2026-10-12, ADR 0019).** Blender is installed. The city half is built:
`scripts/blender/build_city.py` makes `world/lagos.glb` (Lagos typologies, streets, palms, props) and
`world/venues.glb` (club interiors) from Poly Haven textures. The building shells are generated in code, not
from the street plan. MPFB2 characters are next.

**Revisit when.** Phones can't hold 30 fps, or the owner funds commissioned or bought art.
