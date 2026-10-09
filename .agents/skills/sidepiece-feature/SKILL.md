---
name: sidepiece-feature
description: End-to-end workflow for implementing a Side Piece feature across Rust backend (common types, migrations, API, room server), the React/Babylon web client, tests, smoke test, UI screenshots and docs. Use when adding or changing any gameplay, social, economy or onboarding feature.
---

# Side Piece feature workflow

Load `sidepiece-product` first if the feature's scope isn't already confirmed.

## Order of work
1. **Shared types** in `crates/common/src/lib.rs`.
   - New fields on stored or wire structs get `#[serde(default)]`. Old Postgres rows and old clients must still deserialize.
   - Mirror every wire-type change in TypeScript (`web/src/look.ts`, `web/src/SceneView.tsx`, types at the top of `web/src/main.tsx`).
2. **Migration**: new file `migrations/NNNN_name.sql` (next number, idempotent `create … if not exists`). It runs automatically when the api/event-worker starts.
3. **API** (`apps/api/src/`):
   - Put cohesive features in their own module (see `auth.rs`, `chat.rs`, `life.rs`).
   - Routes go in `main.rs`, using axum 0.8 `{param}` syntax (**never `:param`**; it panics at startup).
   - Every player-scoped endpoint calls `require_player(&state, &headers, player_id)`.
   - Errors use `AppError::{bad_request, forbidden, not_found, conflict, too_many_requests}`. Never return internal error text.
   - Money, XP, needs, stats and consent state are computed **server-side only**. Make reward grants idempotent.
   - Publish a NATS event (`publish_event`) for anything the Feed, analytics or moderation might need.
   - Consent flows need decline, cancel and leave paths, and authorization checks (who may accept what).
4. **Room server** (`apps/room-server/`) only if realtime state changes. Keep the protocol in `crates/common`.
5. **Web**:
   - Use design-system tokens (`docs/product/design-system.md`) and reusable components.
   - Handle loading, empty, error and disabled states.
   - Route all calls through `web/src/api.ts` (`api.get/post`, which throw `ApiError`). Wrap user actions in `guard()` so errors show as toasts.
6. **Tests**:
   - Unit tests next to the logic (pure functions: scoring, tiers, economy, picking).
   - Extend `scripts/smoke.mjs` with the API flow, including **negative cases** (forbidden, wrong state, blocked).
7. **Verify** (all must pass):
   ```bash
   cargo fmt && cargo check   # expect 0 warnings
   cargo test
   (cd web && pnpm build)
   node scripts/smoke.mjs      # dev stack running; cargo-watch reloads api/room-server
   ```
   For UI work, run the `sidepiece-ui-verify` skill and look at the screenshots.
8. **Docs**: update `docs/product/screen-map.md` and `docs/roadmap.md`; add an ADR for notable decisions; update `AGENTS.md` if conventions changed.

## Gotchas learned the hard way
- Dev stack env changes (compose `environment:`) need `docker compose -f docker-compose.dev.yml up -d <service>`. cargo-watch alone won't pick them up.
- Least-populated matchmaking splits players up. It is **fill-first** on purpose (`pick_instance`).
- `max_by_key` returns the *last* max; reverse the iterator to prefer lower indices.
- Redis keys in use:
  - `room:players:{room}`, `room:names:{room}`
  - `player:room:{id}`
  - `room_ticket:{t}`
  - `auth_attempts:*`, `npc_chat_rate:{id}`
