# 0004: Stylized 3D art direction (not photoreal)

> **Superseded by [0012](0012-semi-realistic-art-direction.md)** (2026-10-10): semi-realistic, open-licence assets.

**Context.** The client's creator videos show realistic humans, and the spec's creator references are inZOI (photoreal). But the spec explicitly and repeatedly asks for **"stylized 3D"**, and its venue and avatar references are Synty POLYGON, Paralives, Thirsty Suitors and Sims-style art.

**Decision.** Target **stylized 3D**: fashionable adults, a Black/African-forward cast, neon nightlife.
- inZOI references tell us how the creator **works**, not how it looks.
- The current primitive avatars (`web/src/venue.ts::makeHumanoid`) are placeholders. Every creator control must map to something visible, but fidelity comes later.
- Candidate pipeline: a stylized asset pack (e.g. **Synty POLYGON Nightclubs/City/Characters**) or commissioned art, exported as glTF for Babylon.

**Consequences.**
- Avatar data (`AvatarLook`) is parametric and engine-agnostic, so it can drive real rigged models later.
- **Licence check needed** before buying packs for a web game, because browser-delivered assets can be extracted.

**Revisit when.** The client explicitly asks for photoreal, or an art budget and pipeline decision is made.
