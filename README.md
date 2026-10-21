# Triage Desk

A small support-ticket tracker with a role-aware admin UI.

- **Live admin:** https://triage-desk-mu.vercel.app · API: https://triage-desk-bz79.onrender.com/api (Swagger at `/api/docs`)
- Free tiers: the API sleeps after ~15 min idle, so the first request can take 30–60 s (cold start); the DB may add a second.
- **Demo logins** (password `Password123!`): `reviewer-admin@triage.dev` (Admin) · `reviewer-agent@triage.dev` (Agent). The seed also has `admin@triage.dev` / `agent@triage.dev`; sessions are one-per-user, so use the reviewer pair to avoid logging someone else out.

```
backend/    NestJS 12 API · Prisma 7 + PostgreSQL (Neon) · Casbin RBAC · S3-compatible storage (Backblaze B2) · AI field helper
frontend/   Refine 5 admin (Ant Design) · Vite · stock simple-rest data provider
docker-compose.yml   local Postgres + S3Mock for development only
```

Each folder has its own README with env tables, scripts and a code map: [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md). Every non-obvious choice is written up in [docs/decisions.md](docs/decisions.md); code comments cite them by number (`D4`, `D16`, …).

## Quick start (local)

Needs Node 24 and Docker.

```bash
docker compose up -d                         # Postgres :5432, S3Mock :9090 (bucket pre-created)

cd backend
cp .env.example .env                         # set JWT_SECRET: openssl rand -base64 48
npm install && npx prisma migrate dev && npm run db:seed
npm run start:dev                            # http://localhost:3000/api  (Swagger: /api/docs)

cd ../frontend
cp .env.example .env                         # VITE_API_URL=http://localhost:3000/api
npm install && npm run dev                   # http://localhost:5173
```

The seed is deterministic and re-runnable (it truncates first): 25 users, 800 customers, 15 tags, 5 000 tickets, ~12 000 comments, spread over 180 days so filters, search, pagination and the overdue badge have something to chew on.

## Why this stack

The brief leaves the stack open and grades the reasoning. I picked what I can build fastest *and* defend line by line:

| Choice | Why here | What I'd lose with the alternative |
|---|---|---|
| **NestJS** (modular monolith) | Module-per-domain structure, DI, guards and pipes give auth, validation and authorization a natural home without a framework fight. One deployable. | Django admin would give a generated admin for free, but the role model here (record-level rules for agents, custom transitions, bulk actions) ends up as custom admin code either way, and TypeScript end-to-end keeps one language. |
| **Prisma 7 + PostgreSQL on Neon** | Schema is the source of truth, migrations are generated and committed, enums and constraints live in the DB (unique emails, FK `Restrict`/`SetNull`/`Cascade` chosen per relation). | Raw SQL/Knex: more control, far more boilerplate for CRUD at this size. |
| **Casbin** (policy as code) | Two static roles → the policy is a 20-line TypeScript constant loaded with a string adapter. Reviewed in git, no policy table, no sync. | A DB-backed policy adapter would allow runtime editing nobody asked for. |
| **Refine 5 + Ant Design** | A real admin framework: generated resources, inferencer-scaffolded pages, built-in list/filter/sort/pagination, forms, auth and access-control providers. The task explicitly wants generated admin tooling that is then customised, not a bespoke UI. | A hand-rolled React admin — exactly what the brief warns against. |
| **Bearer JWT + rotating refresh tokens** | Frontend (Vercel) and API (Render) are different origins, so cookie sessions would need `SameSite=None` plus CSRF tokens plus a proxy. Bearer tokens are never attached automatically by the browser, so there is no CSRF surface; CORS is locked to the frontend origin. | httpOnly cookies are XSS-safer for the token itself; see *Security* for the mitigations I chose instead. |
| **Object storage via the API** (multer in memory → S3 `PutObject`, Backblaze B2) | The bucket stays private, the server validates extension + declared type + magic bytes on the real bytes, no bucket CORS to configure. Nothing ever touches local disk. Downloads are 5-minute presigned URLs. | Browser-direct presigned PUT scales better for big files; irrelevant at a 5 MB cap. |
| **AI helper = one `fetch`** to any OpenAI-compatible endpoint | Grounded on the ticket form's real field definitions; provider is three env vars (Groq free tier by default); no SDK; 10 s timeout; any failure is a 503 and the admin keeps working. | A vendor SDK or an agent framework — more code for a single grounded Q&A call. |

## Architecture

The brief allows "API layer only if you expose something beyond the admin". Here the admin is a Refine single-page app, so the API *is* the admin's backend: every list, form and button in the UI is a call to it, and the same endpoints are what the live review can poke with Swagger or curl.

```
Browser ── Refine admin (Vercel) ──HTTPS/JSON──▶ NestJS API (Render) ───▶ PostgreSQL (Neon)
                                                      │
                                                      ├──▶ S3-compatible bucket (Backblaze B2), private
                                                      └──▶ OpenAI-compatible chat endpoint (optional)
```

**Request pipeline (backend):** `helmet` → CORS → `ValidationPipe` (whitelist + forbid unknown fields + transform) → `JwtAuthGuard` → per-user throttle → `CasbinGuard` (fails closed: a route without an `@Access(resource, action)` rule is denied) → controller → service → Prisma. Prisma unique/FK violations are mapped to 409, missing rows to 404, business-rule violations to 422.

**Domain model:** `User` (ADMIN | AGENT) · `Customer` (unique, case-insensitive email — `citext`, so the rule holds for any writer, not just the API; D30) · `Ticket` (status, priority, FK customer, nullable FK assignee, tags m:n) · `Comment` (FK ticket, FK author, optional attachment in object storage, `isResolution` flag) · `Tag`.

**Business rules** live in [`backend/src/tickets/ticket-workflow.ts`](backend/src/tickets/ticket-workflow.ts) as pure functions (no framework imports), applied by `TicketsService` inside one transaction:

- Status flow `OPEN → IN_PROGRESS → RESOLVED → CLOSED`; `RESOLVED → REOPENED` only within 7 days of resolution; `REOPENED → IN_PROGRESS`. Everything else is a 422.
- Moving to `RESOLVED` requires a resolution comment; it is stored with the status change in the same transaction.
- `status` cannot be edited through the generic update endpoint; only the transition endpoint can change it.
- `isOverdue` is computed from `createdAt + SLA(priority)` (urgent 4 h, high 24 h, normal 72 h, low 7 d) and ignored once a ticket is resolved or closed. The list filter `isOverdue=true` is a real SQL `WHERE`, so pagination stays correct. The clock does not restart on reopen: SLA measures time to the first fix that holds, so a reopened ticket is overdue if its original window has passed (D11).
- Starting work takes ownership: moving a single unassigned ticket to `IN_PROGRESS` assigns the actor; bulk status changes never touch the assignee (D28). Claiming a queue ticket and changing status are both compare-and-swap writes, so two agents acting at once get a 409 instead of a silent last-write-wins.
- Bulk status change and bulk assign (Admin) run the same rule per ticket and report partial failures instead of aborting the batch.

**Frontend ⇄ API contract:** the API speaks the convention of Refine's stock `@refinedev/simple-rest` provider (`_start/_end`, `_sort/_order`, `field_like`, `x-total-count`), so the frontend has zero custom data-provider code and the backend has one small, unit-tested query parser with a per-resource field whitelist (unknown filters are a 400, never silently ignored).

**Form metadata as a single source of truth:** `GET /api/tickets/fields` returns the ticket form's labels, help texts, options and rules from one file. The admin renders its tooltips from it, and the AI helper's system prompt is built from the same data — so the assistant can only explain fields that actually exist.

## Roles

| | Admin | Agent |
|---|---|---|
| Tickets | full CRUD, transition any, bulk assign / bulk status | read all; create (new tickets start unassigned); edit + transition **only tickets assigned to them or still unassigned** (claim from the queue by self-assigning); no delete |
| Comments | create, edit any, delete | create; edit own only |
| Customers | full CRUD | read |
| Tags | full CRUD | read |
| Users | full CRUD (cannot delete self or drop own admin role) | no access — menu item absent, route denied |
| AI helper / uploads | yes | yes |

The sidebar, Create/Edit/Delete buttons and the bulk toolbar are hidden for Agents by Refine's access-control provider, which reads the permissions map the API derives from the same Casbin policy. Hiding is cosmetic; the API returns 403 regardless of what the browser shows. Record-level rules (own or unassigned tickets, own comments) are enforced in the services because Casbin answers "may this role do this action", not "on this row".

## Security notes

- Passwords: argon2id. Login throttled per IP.
- Access token: HS256 JWT, 15 min — stateless, so it stays valid up to 15 min after logout or a role change (the refresh token is revoked immediately, so nothing outlives that window). Refresh token: 256 random bits, stored only as a SHA-256 hash, rotated on every use; presenting the *previous* token is treated as replay and revokes the session, while an unknown token is a plain 401 so nobody can log someone else out by guessing (D27).
- No cookies → no CSRF surface; CORS allows only the configured frontend origin. Trade-off: tokens sit in `localStorage`, readable by XSS. Mitigations: short access-token life, rotation with replay detection, React/Ant Design escaping, no raw HTML rendering, `helmet` headers.
- Input: every body is a class-validator DTO with unknown fields rejected; list filters/sorts are whitelisted per resource; the AI question is length-capped and the model has no tools or data access.
- Uploads: extension + MIME + magic-byte check, 5 MB cap enforced before buffering, private bucket, presigned 5-minute download URLs, keys are server-generated UUIDs.
- Config: validated at boot; a missing required variable stops the app with a clear message instead of a silent fallback. No secrets in the repo (`.env.example` only). Swagger is on in all environments because it contains no secrets and is useful for review.

## Deployment

- **API:** Render free web service (Frankfurt), from `backend/Dockerfile` (multi-stage, non-root, runs `prisma migrate deploy` then `node dist/main.js`). Health check `GET /api/health`. Env vars set in the dashboard (`backend/render.yaml` lists them; `railway.json` is the equivalent for Railway); `CORS_ORIGIN` = the Vercel URL.
- **DB:** Neon Postgres, Frankfurt (`DATABASE_URL` with `sslmode=verify-full`). Seeded once from a developer machine with `DATABASE_URL=<neon> npm run db:seed`.
- **Storage:** Backblaze B2 private bucket + application key (`S3_*` vars; any S3-compatible store works — R2/S3/MinIO need only different env values).
- **Frontend:** Vercel, root directory `frontend`, `VITE_API_URL` pointing at the Render URL; `vercel.json` rewrites deep links to `index.html`.
- **AI:** any OpenAI-compatible provider; Groq free tier by default (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`). Unset = the helper reports itself unavailable, nothing else changes.

## Deliberately skipped (and why)

- **OAuth login** (bonus): would need a role-assignment story for first-time OAuth users (auto-assigning Agent is the safe default, auto-assigning Admin never is). Local auth already demonstrates hashing, rotation and revocation; OAuth adds a provider dependency without exercising new judgment.
- **Multi-device sessions:** one refresh token per user keeps revocation a single nullable column. An admin tool rarely needs concurrent sessions.
- **Redis / queues / GraphQL / microservices:** no concrete need at this size; every one of them is a second runtime to operate.
- **One hand-adjusted migration:** `citext_emails` replaces Prisma's generated drop-and-recreate of the email columns with an in-place `ALTER COLUMN … TYPE citext` (Prisma has no cast for citext). Documented in the migration file and D30; every other migration is untouched generator output.
- **Jest:** the tests use Vitest, not Jest. Nest 12's scaffold generates an ES-module project with Vitest; forcing Jest back in meant fighting the module format for no gain in what is tested.
- **Frontend unit tests:** tests are concentrated where bugs cost trust — the backend business rules (88 unit tests, < 1 s, no DB) — plus one Playwright smoke (`frontend/e2e`) that proves the role gating end to end (agent sees a restricted admin *and* the API refuses the same actions) and walks a ticket through its whole lifecycle. Component-level UI tests would mostly re-test Refine and Ant Design.
- **Full-text search index:** `ILIKE` on title/description is fine at 5 000 rows; a `pg_trgm` index is a one-migration change when it isn't.
- **Orphan upload cleanup / virus scanning:** uploads not attached to a comment stay in the bucket; a scheduled sweep is the obvious next step.

## With more time

1. Shrink the first paint: routes are lazy and vendors are split into cacheable chunks, but the login → tickets path still downloads ~600 kB gzipped of antd + Refine; the next step is dropping the unused antd modules from the vendor chunk.
2. A `RefreshToken` table for multi-device sessions and a visible "active sessions" page.
3. Slimmer production image: run `prisma migrate deploy` as a platform pre-deploy step so the Prisma CLI can leave the runtime image (~150 MB saved).
4. Typed query DTOs for list endpoints so Swagger documents every filter.
5. Audit trail of ticket status changes as its own table instead of inferring it from resolution comments.
6. Run the Playwright smoke in CI against a seeded throwaway database.
7. Shared rate-limit counters: `@nestjs/throttler` keeps its counters in each process, so with N API replicas the 10/min AI and login limits become 10×N. A Redis-backed throttler store fixes that, and it would be the first concrete reason to add Redis.
