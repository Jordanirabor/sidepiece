# Deploying to Dokploy

The repo-root `docker-compose.yml` is the production stack. It refuses to start without its secrets.

## 1. Create the compose app

In Dokploy: **Create Service → Compose**, point it at this repo, compose path `docker-compose.yml`.

## 2. Environment

Paste into the app's **Environment** tab (generate secrets with `openssl rand -base64 48`):

```env
PUBLIC_API_URL=https://api.yourdomain.com
ROOM_WS_PUBLIC_URL=wss://ws.yourdomain.com/ws
CORS_ORIGINS=https://play.yourdomain.com
JWT_SECRET=<48+ random chars>
POSTGRES_PASSWORD=<random>
REDIS_PASSWORD=<random>
RUST_LOG=info
```

`PUBLIC_API_URL` is baked into the web bundle at build time, so changing it requires a redeploy.

## 3. Domains (Dokploy → Domains, HTTPS on)

| Domain | Service | Container port |
|---|---|---|
| `play.yourdomain.com` | `web` | 80 |
| `api.yourdomain.com` | `api` | 4000 |
| `ws.yourdomain.com` | `room-server` | 4001 (WebSockets work through Traefik by default) |

Do **not** add domains for postgres, redis, nats, or the event worker. They have no published
ports and are only reachable on the internal compose network.

## Production safety switches

- `APP_ENV=production` is set by the compose file. In production the API:
  - refuses to boot if `JWT_SECRET` is missing, the dev default, or under 32 characters
  - refuses to boot without `CORS_ORIGINS`, and only allows those origins
  - disables `/v1/auth/dev-login`, regardless of `ALLOW_DEV_LOGIN`
- Redis requires a password. Postgres and Redis use persistent volumes.
- 5xx responses never expose internal error details.

## Optional: object storage

```bash
docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d
```

Requires `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`. Keep the MinIO console (9001) private.

## Verifying a deploy

```bash
API_URL=https://api.yourdomain.com node scripts/smoke.mjs
```

This creates throwaway `@smoke.test` accounts and runs the full two-player flow.

## Scaling later

Move Postgres to a managed instance first (change `DATABASE_URL`), then run more `api` replicas
behind Traefik. Room servers scale by instance. See `docs/decisions/0002-deploy-and-scale.md` and `docs/roadmap.md`.
