# AGENTS.md: Side Piece

You are working on **Side Piece**: a mobile-first, web-based, **semi-realistic 3D adult (18+) social world set in
Lagos nightlife**. Players build a character, enter the city, meet compatible people (players + NPCs), chat
(free-text, scored), agree on dates and private experiences (always consent-gated), and progress
(₦, XP, reputation, relationships, body count). Tagline: *Same People. New Options.*

## Read before you build (anti-drift)

The client's material is the source of truth, not your assumptions. Before designing a feature or changing
anything user-facing:

1. `docs/product/vision.md`: what the game is, pillars, content rules, non-goals.
2. `docs/product/screen-map.md`: every spec screen, its status, and where its code lives.
3. `docs/roadmap.md`: what's next. **Work the current milestone; don't jump ahead.**
4. `docs/references/README.md`: client mockups and reference images. **Look at the relevant images**
   (read the files) before visual work.
5. `docs/product/source-analysis.md` + `docs/decisions/`: why things are the way they are, and the
   resolved conflicts. Don't silently reverse a decision; write a new record.

Verbatim client sources: `docs/product/sources/` (two ChatGPT chats) and `docs/references/whatsapp/`
(highest authority: poster, 4-panel creator mockup, gameplay screenshot, creator videos).

Project skills in `.agents/skills/` load on demand:
- `sidepiece-product`: product-truth check before features
- `sidepiece-feature`: end-to-end feature workflow
- `sidepiece-ui-verify`: screenshot verification against references
- `sidepiece-3d-scene`: Babylon conventions and gotchas
- `sidepiece-npc`: NPC authoring and chat
- `sidepiece-deploy`: Dokploy production

## Non-negotiables

- **18+ only. Consent is a mechanic.** Every escalation needs the other side's explicit agreement and must have
  decline, cancel and leave paths. Block hides both ways; report is always reachable. (ADR 0003)
- **Non-graphic** intimate content (fade-to-black). Language-model output stays non-explicit.
- **Server is authoritative** for money, XP, needs, relationships, body count, consent state and room access.
- **Semi-realistic 3D**, not photoreal (ADR 0012, supersedes 0004). Same avatar everywhere. Every 3D canvas goes
  through `web/src/render.ts` (`createEngine` + `applyCinematicLook`) and respects the `low`/`high` quality tiers.
- **Design system tokens only** (`docs/product/design-system.md`). No ad-hoc colours or spacing.
- Never ship or bundle anything from `docs/references/` (third-party, reference-only).

## Repo map

```
apps/api/            Axum HTTP API: auth.rs, chat.rs (NPC LLM chat), life.rs (needs/₦/XP/clock),
                     npcs.rs (NPC catalog), matching.rs, messages.rs (DMs), invites.rs (activity invitations),
                     dates.rs (date scenes), main.rs (rooms, discovery, social, moderation, routes)
apps/room-server/    WebSocket rooms: join tickets, roster, movement, room chat, Redis presence
apps/event-worker/   NATS events.> → Postgres game_event_audit
crates/common/       Shared wire types (AvatarLook, ClientEvent/ServerEvent, tiers…). Mirror them in TS.
migrations/          sqlx migrations (run automatically by api/event-worker on start)
web/src/             main.tsx (app flow), Creator.tsx (4-panel creator), SceneView.tsx (3D world + realtime),
                     venue.ts (venues + humanoid), look.ts (appearance model/catalogs), Hud.tsx (HUD + NPC chat), api.ts
                     Messages.tsx (inbox + DM thread), Invites.tsx (suggest sheet + invitation cards), DateScene.tsx
scripts/             smoke.mjs (API two-player flow; Node built-ins only)
web/scripts/         ui-check.mjs (headless browser walkthrough + screenshots; puppeteer-core is a web devDependency)
docs/                product truth, references, decisions, roadmap
deploy/dokploy.md    production deploy guide
```

## Run & verify

```bash
docker compose -f docker-compose.dev.yml up --build   # hot reload: web :4001, api :4002, rooms :4003, postgres :4004, redis :4005
cargo fmt && cargo check && cargo test                 # 0 warnings expected
cd web && pnpm build                                   # type-check + bundle
node scripts/smoke.mjs                                 # end-to-end API flow (dev stack running)
cd web && CHROME_PATH=… SHOTS_DIR=/tmp/shots pnpm ui-check   # phone + desktop; then LOOK at the screenshots
```

**Definition of done** for any change:
1. Rust is clean (fmt, check with 0 warnings, tests pass).
2. Web builds.
3. Smoke test passes.
4. For UI changes, screenshots are captured and **visually compared to `docs/references/`**.
5. `screen-map.md` and `roadmap.md` are updated.

## Conventions & gotchas

- **axum 0.8 path params are `{id}`**, not `:id`; `:id` panics at startup.
- 5xx responses never leak internals (`AppError` masks them). Use `AppError::{bad_request, forbidden, not_found, conflict, too_many_requests}` for 4xx.
- New JSON fields on stored configs use `#[serde(default)]` so old rows still deserialize (there's a test for this).
- Wire types change in `crates/common` **and** the TS mirrors (`web/src/look.ts`, `SceneView.tsx`, `main.tsx` types).
- Babylon: `StandardMaterial` point lights have no physical falloff. Keep intensity around 1 with a `range`. Set `camera.minZ` small for close-ups. Avatars face +Z.
- Production refuses to boot without secrets; dev login exists only with `ALLOW_DEV_LOGIN=true` outside production.
- Ask the user before decisions that the docs list as **needing client input** (art pipeline, language-model provider, age verification, email provider).
