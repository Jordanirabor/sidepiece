---
name: sidepiece-deploy
description: Build, verify and deploy Side Piece to Dokploy (production docker-compose.yml) and validate production hardening. Use when changing Dockerfiles, compose files, environment variables, secrets, CORS, domains, or preparing or checking a deployment.
---

# Production deploy (Dokploy)

The guide is `deploy/dokploy.md`. The production stack is the repo-root `docker-compose.yml`. Dev stack: `docker-compose.dev.yml`.

## Invariants (don't break)
- Compose fails fast with `${VAR:?message}` when a secret is missing.
- `APP_ENV=production` makes the API:
  - refuse to boot if `JWT_SECRET` is missing, the dev default, or under 32 characters
  - require `CORS_ORIGINS` and allow only those origins
  - disable dev login
- Postgres, Redis and NATS have **no published ports**. Redis needs a password. Data lives on named volumes.
- Only `web` (:80), `api` (:4000) and `room-server` (:4001, WebSockets) get Dokploy domains.
- `PUBLIC_API_URL` is baked into the web bundle at build time. Changing it means redeploying `web`.
- nginx security headers live in `web/security-headers.conf`, included **per location**. Server-level `add_header` is dropped inside a location that defines its own.
- Language-model env vars (`LLM_*`) are optional. Leave them empty for the offline fallback.

## Verify a production build locally (without touching the dev stack)
```bash
# env with random secrets + localhost URLs, and a port overlay so nothing collides
cat > /tmp/sp/prod.env <<EOV
PUBLIC_API_URL=http://localhost:14000
ROOM_WS_PUBLIC_URL=ws://localhost:14001/ws
CORS_ORIGINS=http://localhost:13001
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
EOV
printf 'services:\n  web: { ports: ["13001:80"] }\n  api: { ports: ["14000:4000"] }\n  room-server: { ports: ["14001:4001"] }\n' > /tmp/sp/ports.yml
docker compose -p sidepiece-prodtest --env-file /tmp/sp/prod.env -f docker-compose.yml -f /tmp/sp/ports.yml up -d --build
API_URL=http://localhost:14000 node scripts/smoke.mjs
docker compose -p sidepiece-prodtest down -v
```

Check:
- `/v1/auth/dev-login` returns 404 "disabled"
- an under-18 registration is refused
- a foreign `Origin` gets no CORS header
- 11 bad logins → 429
- `curl -I` on web shows `X-Frame-Options` and `Cache-Control`
- `run --rm -e JWT_SECRET=short api` refuses to boot

## After deploying
`API_URL=https://api.<domain> node scripts/smoke.mjs`. It creates throwaway `@smoke.test` accounts.
