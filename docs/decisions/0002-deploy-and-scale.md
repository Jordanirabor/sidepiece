# 0002: Single-VPS Dokploy deploy, designed to scale out

**Context.** The MVP runs on one Dokploy VPS but must be able to scale without a rewrite.

**Decision.**
- All infrastructure is configured through environment variables; nothing assumes localhost.
- Rooms are **instanced** (`neon_lounge-001…`), never one global world.
- Matchmaking is **fill-first**: the busiest instance under 80% capacity, so players actually meet.
- Room joins use short-lived, one-time **Redis tickets**.
- Events go to NATS; the worker persists them to `game_event_audit`.
- Production compose (`docker-compose.yml`) refuses to start without its secrets. It also has: an `APP_ENV=production` hardening flag, a CORS allowlist, a password-protected Redis, and no public ports for data services.

**Consequences.** Moving to multiple nodes later means:
1. Managed Postgres.
2. Multiple `api` replicas behind Traefik.
3. A room-server node registry in Redis.

See `deploy/dokploy.md`.

**Revisit when.** Concurrent players exceed what one room-server process can hold, or a region split is needed.
