# Third-party assets shipped with the web client

| Path | Source | Licence |
|---|---|---|
| `avatars/*.glb`, `avatars/512/*.glb`, `avatars/anims/*.glb` | [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), converted to glTF (`scripts/avatars/`) | MIT, `avatars/LICENSE-rocketbox.md` |

Venue surfaces are painted procedurally in `src/render.ts` (no third-party files). Nothing from
`docs/references/` ships.

## Bundled from npm (via Vite)

| Package | What | Licence |
|---|---|---|
| `@fontsource-variable/bricolage-grotesque` | Bricolage Grotesque (display font) | SIL OFL 1.1 |
| `@fontsource-variable/plus-jakarta-sans` | Plus Jakarta Sans (body font) | SIL OFL 1.1 |
| `@fontsource-variable/caveat` | Caveat (hand-written accents) | SIL OFL 1.1 |
| `lucide-react` | UI icons | ISC |
