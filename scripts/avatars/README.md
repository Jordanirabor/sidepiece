# Avatar pipeline (ADR 0012)

Converts Microsoft Rocketbox avatars (MIT, see `web/public/avatars/LICENSE-rocketbox.md`) into the
compressed glTF files in `web/public/avatars/`. Run it only when adding or changing a base model; the
outputs are committed. macOS only as written (`sips` reads the TGA textures; FBX2glTF's Darwin binary is
x86_64 and runs under Rosetta).

```bash
TOOLS=$(mktemp -d) && (cd $TOOLS && npm init -y >/dev/null && \
  npm i fbx2gltf@0.9.7-p1 @gltf-transform/cli@4.5.1 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1)
TOOLS=$TOOLS scripts/avatars/build-avatars.sh web/public/avatars \
  Professions/Business_Female_01 Adults/Female_Party_02 Adults/Female_Adult_03 Adults/Female_Party_01 \
  Adults/Male_Adult_18 Adults/Male_Adult_12 Professions/Business_Male_05 Adults/Male_Adult_04 Adults/Male_Adult_06
```

Per avatar: FBX → GLB, textures to 1k PNG, attached by material name (`*_body`, `*_head`, `*_opacity` hair
cards as alpha-masked), then resize/WebP/quantize/dedup. **Don't use `gltf-transform optimize`**: it flattens
the hierarchy and drops the `Bip01` root bone that the animations drive. A `512/` copy is made for phones and
portraits. New bases also need an entry in `BASE_MODELS` (`web/src/avatar3d.ts`).

Animations (`web/public/avatars/anims/`) come from `Assets/Animations/all_animations_max_motextr_static`
(idles) and `..._xy` (in-place walks): FBX2glTF, then `gltf-transform resample --tolerance 0.0005`.
Current: `f/m_idle_neutral_01`, `f/m_walk_cool_01`.

Never use anything from Rocketbox's `Children` folder.
