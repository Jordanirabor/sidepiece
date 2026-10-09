---
name: sidepiece-ui-verify
description: Visually verify the Side Piece web client by driving it in headless Chrome, capturing screenshots of onboarding, city, venues and NPC chat, and comparing them side by side with the client's reference images. Use after any UI, 3D scene, layout or styling change, and before claiming visual work is done.
---

# Visual verification against references

Builds passing does not mean it looks right. This session found back-facing previews, clipped faces, blown-out
lighting, a camera blocked by a door, and overlapping panels, and **only screenshots caught them**.

## Prerequisites
- Dev stack running: `docker compose -f docker-compose.dev.yml up` (web :3001, api :4000 with `ALLOW_DEV_LOGIN=true`).
- A Chromium binary. Prefer Playwright's headless shell when it exists (a desktop Chrome that's already running can block launch):
  `ls ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell`
- `puppeteer-core`: install it in a scratch dir, e.g. `mkdir -p /tmp/sp && cd /tmp/sp && npm i puppeteer-core@23`.

## Run the walkthrough
```bash
cd /tmp/sp && cp <repo>/scripts/ui-check.mjs . && \
CHROME_PATH=<chromium> SHOTS_DIR=/tmp/sp/shots node ui-check.mjs
```
It registers via dev login, walks the 4 creator panels, enters the city, steers to the Neon Lounge door using
the `window.__sp` debug hook (`pos()`, `portals`, `venue`), presses E, opens NPC chat, sends a message, returns
to the city and enters the Rooftop. It prints console errors at the end. **Expect `errors: none`.**

Extend the script when you add screens. For mobile work, add `page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })`.

## Compare with references (actually look)
1. Read the screenshots with the read tool.
2. Build side-by-side comparisons:
   ```bash
   bash .agents/skills/sidepiece-ui-verify/scripts/compare.sh /tmp/sp/shots/10-chat-reply.png docs/references/whatsapp/06-gameplay-zoom.jpg /tmp/sp/cmp-chat.jpg
   ```
   Then read the output image.
3. Check:
   - **Layout and hierarchy** match the reference.
   - **Design tokens** are used (`docs/product/design-system.md`).
   - **Legibility**: lighting and contrast are right; nothing is blown out or too dark.
   - **No overlaps or clipping.**
   - **The same avatar** appears across creator, world and cards.
   - **Empty states** have a next step.
4. Report concrete differences, fix them, and re-shoot. Don't describe a screen you haven't looked at.

Useful reference pairs:
- Creator → `docs/references/whatsapp/02-character-creator-4-panels.jpg`
- NPC chat + HUD → `whatsapp/06-gameplay-zoom.jpg` (the cropped version; `03` is mostly phone bars), `07-…hud-zoom`, `08-…chat-zoom`
- Venues → `ui-spec-chat/24-…`, `43-…`, Lagos refs
- Dating UI → `ui-spec-chat/14`, `16`, `17`
