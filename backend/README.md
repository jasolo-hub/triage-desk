# Triage Desk — backend

NestJS 12 API (ES modules) · Prisma 7 + PostgreSQL · Casbin RBAC · S3-compatible storage · optional AI helper.
Interactive API docs: `http://localhost:3000/api/docs` (Swagger, all environments).

## Run locally

Needs Node 24 and Docker. Postgres and S3Mock come from `docker-compose.yml` at the repo root.

```bash
docker compose up -d            # from the repo root: postgres :5432, s3mock :9090
cd backend
cp .env.example .env            # then set JWT_SECRET: openssl rand -base64 48
npm install                     # also generates the Prisma client (postinstall)
npx prisma migrate dev          # apply migrations
npm run db:seed                 # demo data, ~5 s (wipes the database! non-local hosts need SEED_CONFIRM=yes)
npm run start:dev               # http://localhost:3000/api
```

Demo logins (after seeding), password `SEED_PASSWORD` or `Password123!`:

| Login | Role | For |
|---|---|---|
| `admin@triage.dev` (Alex Admin) | ADMIN | the author |
| `agent@triage.dev` (Sam Agent) | AGENT | the author |
| `reviewer-admin@triage.dev` (Riley Reviewer) | ADMIN | reviewers |
| `reviewer-agent@triage.dev` (Reese Reviewer) | AGENT | reviewers |

There is one session per user (a new login ends the previous one), so reviewers use their own accounts instead of the author's.

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | Dev server with watch mode |
| `npm run build` | `prisma generate` + `nest build` → `dist/` |
| `npm run start:prod` | Run the compiled app (`node dist/main`) |
| `npm test` | Vitest unit tests (`src/**/*.spec.ts`) |
| `npm run test:cov` | Tests with coverage |
| `npm run lint` / `npm run format` | oxlint / prettier |
| `npm run db:migrate` | `prisma migrate dev` — create/apply migrations in development |
| `npm run db:deploy` | `prisma migrate deploy` — apply committed migrations (production) |
| `npm run db:seed` | Deterministic demo data: 26 users (2 admins, 24 agents), 800 customers, 15 tags, 5 000 tickets, ~12 000 comments. Refuses a non-local database unless `SEED_CONFIRM=yes` |

## Environment

Validated at boot (`src/config/env.validation.ts`): a missing or malformed required value stops the app with a list of every problem.

| Name | Required | Example | Purpose |
|---|---|---|---|
| `NODE_ENV` | no (`development`) | `production` | Runtime mode |
| `PORT` | no (`3000`) | `3000` | HTTP port (the hosting platform injects it) |
| `DATABASE_URL` | **yes** | `postgresql://triage:triage@localhost:5432/triage` | Postgres connection for the app (Neon **pooled** endpoint in production, `?sslmode=verify-full`) |
| `DATABASE_URL_DIRECT` | no | Neon host without `-pooler` | Used only by the Prisma CLI (`migrate deploy` at container start, `db:seed`): migrations take a session-level advisory lock that poolers in transaction mode cannot hold. Unset → CLI uses `DATABASE_URL` (fine for local Docker). |
| `DB_POOL_MAX` | no (`10`) | `10` | Max DB connections per API instance; instances × this must fit the database's connection limit |
| `JWT_SECRET` | **yes**, ≥ 32 chars | output of `openssl rand -base64 48` | HS256 signing key for access tokens |
| `JWT_ACCESS_TTL` | no (`15m`) | `15m` | Access-token lifetime |
| `JWT_REFRESH_TTL_DAYS` | no (`7`) | `7` | Refresh-token lifetime in days |
| `CORS_ORIGIN` | **yes** | `http://localhost:5173,https://triage.vercel.app` | Allowed frontend origins, comma-separated |
| `S3_ENDPOINT` | **yes** | `http://localhost:9090` / `https://s3.us-east-005.backblazeb2.com` | S3 API endpoint (S3Mock / Backblaze B2 / any S3) |
| `S3_REGION` | **yes** | `us-east-005` | Region from the bucket endpoint (`auto` for R2; ignored by S3Mock) |
| `S3_BUCKET` | **yes** | `triage-attachments` | Private bucket for attachments |
| `S3_ACCESS_KEY_ID` | **yes** | `local` | Storage credentials (any value for S3Mock) |
| `S3_SECRET_ACCESS_KEY` | **yes** | `local` | Storage credentials |
| `S3_FORCE_PATH_STYLE` | no (`false`) | `true` | Path-style URLs; `true` for S3Mock |
| `AI_BASE_URL` | no | `https://api.groq.com/openai/v1` | Any OpenAI-compatible endpoint |
| `AI_API_KEY` | no | `gsk_…` | Provider key; empty → `/api/ai/ask` answers 503, app still runs |
| `AI_MODEL` | no | `qwen/qwen3.8-27b` | Model id at that provider (check its current model list) |
| `REOPEN_WINDOW_DAYS` | no (`7`) | `7` | How long a RESOLVED ticket can be reopened |
| `SEED_PASSWORD` | no (`Password123!`) | — | Password for all seeded users (seed only) |
| `SEED_CONFIRM` | no | `yes` | Required to seed a database whose host is not `localhost`/`127.0.0.1` (seed only; the seed wipes every table) |

## Production

`Dockerfile` (multi-stage, `node:24-slim`): the build stage installs everything, generates the Prisma client, compiles and prunes dev dependencies; the runtime stage holds only production `node_modules`, `dist/`, `prisma/` and `prisma.config.ts`, and runs as the unprivileged `node` user. On start it runs `prisma migrate deploy`, then `exec node dist/main.js`, so migrations always match the deployed code.

```bash
docker build -t triage-api backend/
docker run -p 3000:3000 --env-file backend/.env triage-api   # use host.docker.internal for local services
```

Render (current): Web Service, Root Directory `backend`, runtime Docker, health check `/api/health`, free plan (sleeps after idle; first request after that takes 30–60 s). `render.yaml` documents the same settings. Railway alternative: Root Directory `backend`, config path `/backend/railway.json`. In both cases set the env vars above in the dashboard.

Seeding production is a one-off from a checkout (the seed is intentionally not in the image because it wipes all tables): `SEED_CONFIRM=yes DATABASE_URL=<prod url> npm run db:seed` (or `SEED_CONFIRM=yes railway run npm run db:seed`). Without `SEED_CONFIRM=yes` the seed refuses any host other than `localhost`/`127.0.0.1`.

## Where things live

| What | Where |
|---|---|
| Ticket business rules (transitions, reopen window, SLA, overdue) | `src/tickets/ticket-workflow.ts` — pure functions, no Nest/Prisma |
| Applying them (transaction, compare-and-swap writes, resolution comment, ownership, bulk) | `src/tickets/tickets.service.ts` |
| Ticket form metadata (labels, help text, options, rules) | `src/tickets/ticket-fields.ts` → `GET /api/tickets/fields` and the AI prompt |
| Casbin model + policy (role → resource → actions) | `src/casbin/casbin.policy.ts` |
| Guards: JWT → per-user throttle → Casbin (fails closed) | `src/app.module.ts`, `src/auth/jwt-auth.guard.ts`, `src/casbin/casbin.guard.ts` |
| Record-level rules (agent edits own or unassigned tickets, own comments) | `TicketsService.loadForChange`, `CommentsService.update` |
| Refresh-token rotation and replay detection | `src/auth/auth.service.ts` |
| Refine simple-rest list parsing (filters, sort, pagination) | `src/common/list-query.ts` |
| List response shape (array body + `x-total-count`), one interceptor for all list endpoints | `src/common/list-response.interceptor.ts` (`@ListResponse()`) |
| Upload allowlist, signature and file-name length check | `src/uploads/upload-rules.ts` |
| AI system prompt | `src/ai/ai.prompt.ts` |
| Prisma error → HTTP mapping (400/409/404) | `src/common/prisma-exception.filter.ts` |
| Schema, migrations, seed | `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` |

## Ticket ownership

- Unassigned tickets are the shared queue. An agent claims one by assigning themselves, or by starting work on it: moving an unassigned ticket to `IN_PROGRESS` assigns it to whoever starts the work (agent or admin). It can still be reassigned afterwards.
- Once a ticket is assigned, only the assignee or an admin can edit or move it.
- Ticket writes re-check what was validated (compare-and-swap). If two agents claim the same ticket at once, one wins. The other gets `409 Ticket was changed by someone else, reload it`, or a 403 if the winning claim had already landed when its request read the ticket.

## Sessions

There is one session per user. Each refresh rotates the refresh token. Presenting the token that was just rotated away counts as replay: the session is revoked and the response is a 401. Any other unknown token gets a plain 401 and leaves the session alone, so a guessed or garbage token cannot log anyone out. `/auth/refresh` is limited to 20 requests a minute per IP and `/uploads` to 20 a minute per user.

## Tests

`npm test` runs 100 Vitest tests in under a second, no database needed. They cover the full transition matrix, the reopen-window boundary and SLA/overdue per priority. `TicketsService` rules run against an in-memory Prisma fake: ownership 403, claim race 409, start-work ownership, resolution comment and bulk partial failure. `AuthService.refresh` covers rotation, replay versus garbage tokens, concurrent refresh and expiry. Also tested: the list-query parser, the upload allowlist and the AI prompt content.
