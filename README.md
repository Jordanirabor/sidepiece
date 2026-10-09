# Side Piece

Mobile-first, web-based, stylized 3D adult (18+) social world set in Lagos nightlife.
*Same People. New Options.*

**Start here:** [`AGENTS.md`](AGENTS.md) · [vision](docs/product/vision.md) · [screen map](docs/product/screen-map.md) ·
[roadmap](docs/roadmap.md) · [references](docs/references/README.md) · [decisions](docs/decisions/README.md)

## Shape

- Rust modular backend API (`apps/api`)
- Rust realtime room server (`apps/room-server`)
- Rust event worker (`apps/event-worker`) for NATS audit persistence
- React + Babylon.js web client (`web`)
- Postgres durable state
- Redis temporary state/presence later
- MinIO object storage later (optional compose overlay for now)
- NATS event backbone with audit persistence

## Run full stack

Production / Dokploy build (requires secrets, see `deploy/dokploy.md`):

```bash
cp .env.example .env   # fill in the values
docker compose up --build
```

Hot-reload development stack:

```bash
docker compose -f docker-compose.dev.yml up --build
```

The dev stack uses Vite HMR for the web client and `cargo-watch` for Rust services.

MinIO is optional at this stage because the MVP does not load assets from object storage yet. If your Docker registry can pull MinIO, run it with:

```bash
docker compose -f docker-compose.yml -f docker-compose.minio.yml up --build
```

Open the web client:

```txt
http://localhost:3001
```

If you want a different web port:

```bash
WEB_PORT=3010 docker compose up --build
# or for hot reload
WEB_PORT=3010 docker compose -f docker-compose.dev.yml up --build
```

Health checks:

```bash
curl http://localhost:4000/health
curl http://localhost:4001/health
```

## MVP flow

1. Dev-login a player.
2. Save avatar preferences/intent.
3. Join an instanced room such as `neon_lounge-001`.
4. Receive and verify a JWT dev auth token.
5. Connect to room server over WebSocket.
6. Move with WASD/arrow keys and broadcast movement/chat events.

## Future scaling notes

The MVP runs on one Dokploy VPS, but avoids localhost coupling. API, room servers, Postgres, Redis, MinIO, and NATS are all env-configured so they can be split onto separate hosts later. Rooms are instanced from day one instead of one global world.

## NPC conversations

NPCs use any OpenAI-compatible chat API. Set these (dev: in your shell before `docker compose`, prod: Dokploy env):

```env
LLM_BASE_URL=https://api.openai.com/v1   # or OpenRouter / Ollama / vLLM
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

Without them the game uses a built-in offline scorer so it stays playable.

## Smoke test

With the stack running, exercise the two-player flow end to end (auth, room roster, discovery,
NPC dialogue, consent-gated private rooms, blocking):

```bash
node scripts/smoke.mjs                          # dev stack
API_URL=https://api.example.com node scripts/smoke.mjs   # a deployment
```
