# 0001: Rust backend, Babylon.js + React web client

**Context.** The game is web-first with a possible native client later. It needs realtime presence, and the client wanted to start on one VPS and scale.

**Decision.**
- Backend in **Rust**:
  - `apps/api`: Axum, sqlx/Postgres, Redis, NATS.
  - `apps/room-server`: WebSocket rooms, in-memory roster, Redis presence.
  - `apps/event-worker`: NATS to Postgres audit.
  - Shared protocol and types in `crates/common`.
- Client is **React + Babylon.js** (TypeScript, Vite).

We considered Go and preferred Rust for performance and type safety, at some cost to velocity.
We considered Unity WebGL and Rust/WASM. We preferred Babylon for web-native UX, fast iteration and easy UI integration.

**Consequences.** We assemble our own game systems (avatars, animation, interaction). Shared wire types live in `crates/common` and are mirrored by hand in TypeScript (`web/src/look.ts`, `SceneView.tsx`). Keep them in sync.

**Revisit when.** Native apps become a priority, or avatar/animation fidelity needs an engine-grade pipeline (Unity / Unreal with a web build).
