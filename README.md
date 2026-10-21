# Triage Desk

A small support-ticket tracker with a role-aware admin UI.

- **Live admin:** _TBD after deploy_ (frontend on Vercel, API on Railway)
- **Demo logins:** `admin@triage.dev` (Admin) · `agent@triage.dev` (Agent) · password `Password123!`

```
backend/    NestJS 12 API · Prisma 7 + PostgreSQL (Neon) · Casbin RBAC · S3 storage (Cloudflare R2) · AI field helper
frontend/   Refine 5 admin (Ant Design) · Vite · stock simple-rest data provider
docker-compose.yml   local Postgres + S3Mock for development only
```

Each folder has its own README with env tables, scripts and a code map: [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md).

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
| **Bearer JWT + rotating refresh tokens** | Frontend (Vercel) and API (Railway) are different origins, so cookie sessions would need `SameSite=None` plus CSRF tokens plus a proxy. Bearer tokens are never attached automatically by the browser, so there is no CSRF surface; CORS is locked to the frontend origin. | httpOnly cookies are XSS-safer for the token itself; see *Security* for the mitigations I chose instead. |
| **Object storage via the API** (multer in memory → S3 `PutObject`) | The bucket stays private, the server validates extension + declared type + magic bytes on the real bytes, no bucket CORS to configure. Nothing ever touches local disk. Downloads are 5-minute presigned URLs. | Browser-direct presigned PUT scales better for big files; irrelevant at a 5 MB cap. |
| **AI helper = one `fetch`** to any OpenAI-compatible endpoint | Grounded on the ticket form's real field definitions; provider is three env vars (Groq free tier by default); no SDK; 10 s timeout; any failure is a 503 and the admin keeps working. | A vendor SDK or an agent framework — more code for a single grounded Q&A call. |

## Architecture

```
Browser ── Refine admin (Vercel) ──HTTPS/JSON──▶ NestJS API (Railway) ──▶ PostgreSQL (Neon)
                                                      │
                                                      ├──▶ S3-compatible bucket (Cloudflare R2), private
                                                      └──▶ OpenAI-compatible chat endpoint (optional)
```

**Request pipeline (backend):** `helmet` → CORS → `ValidationPipe` (whitelist + forbid unknown fields + transform) → `JwtAuthGuard` → per-user throttle → `CasbinGuard` (fails closed: a route without an `@Access(resource, action)` rule is denied) → controller → service → Prisma. Prisma unique/FK violations are mapped to 409, missing rows to 404, business-rule violations to 422.

**Domain model:** `User` (ADMIN | AGENT) · `Customer` (unique email) · `Ticket` (status, priority, FK customer, nullable FK assignee, tags m:n) · `Comment` (FK ticket, FK author, optional attachment in object storage, `isResolution` flag) · `Tag`.

**Business rules** live in [`backend/src/tickets/ticket-workflow.ts`](backend/src/tickets/ticket-workflow.ts) as pure functions (no framework imports), applied by `TicketsService` inside one transaction:

- Status flow `OPEN → IN_PROGRESS → RESOLVED → CLOSED`; `RESOLVED → REOPENED` only within 7 days of resolution; `REOPENED → IN_PROGRESS`. Everything else is a 422.
- Moving to `RESOLVED` requires a resolution comment; it is stored with the status change in the same transaction.
- `status` cannot be edited through the generic update endpoint; only the transition endpoint can change it.
- `isOverdue` is computed from `createdAt + SLA(priority)` (urgent 4 h, high 24 h, normal 72 h, low 7 d) and ignored once a ticket is resolved or closed. The list filter `isOverdue=true` is a real SQL `WHERE`, so pagination stays correct.
- Bulk status change and bulk assign (Admin) run the same rule per ticket and report partial failures instead of aborting the batch.

**Frontend ⇄ API contract:** the API speaks the convention of Refine's stock `@refinedev/simple-rest` provider (`_start/_end`, `_sort/_order`, `field_like`, `x-total-count`), so the frontend has zero custom data-provider code and the backend has one small, unit-tested query parser with a per-resource field whitelist (unknown filters are a 400, never silently ignored).

**Form metadata as a single source of truth:** `GET /api/tickets/fields` returns the ticket form's labels, help texts, options and rules from one file. The admin renders its tooltips from it, and the AI helper's system prompt is built from the same data — so the assistant can only explain fields that actually exist.

## Roles

| | Admin | Agent |
|---|---|---|
| Tickets | full CRUD, transition any, bulk assign / bulk status | read all; create (new tickets start unassigned, queue-style); edit + transition **only tickets assigned to them**; no delete |
| Comments | create, edit any, delete | create; edit own only |
| Customers | full CRUD | read |
| Tags | full CRUD | read |
| Users | full CRUD (cannot delete self or drop own admin role) | no access — menu item absent, route denied |
| AI helper / uploads | yes | yes |

The sidebar, Create/Edit/Delete buttons and the bulk toolbar are hidden for Agents by Refine's access-control provider, which reads the permissions map the API derives from the same Casbin policy. Hiding is cosmetic; the API returns 403 regardless of what the browser shows. Record-level rules (own tickets, own comments) are enforced in the services because Casbin answers "may this role do this action", not "on this row".

## Security notes

- Passwords: argon2id. Login throttled per IP.
- Access token: HS256 JWT, 15 min. Refresh token: 256 random bits, stored only as a SHA-256 hash, rotated on every use; presenting an already-rotated token is treated as replay and revokes the session.
- No cookies → no CSRF surface; CORS allows only the configured frontend origin. Trade-off: tokens sit in `localStorage`, readable by XSS. Mitigations: short access-token life, rotation with replay detection, React/Ant Design escaping, no raw HTML rendering, `helmet` headers.
- Input: every body is a class-validator DTO with unknown fields rejected; list filters/sorts are whitelisted per resource; the AI question is length-capped and the model has no tools or data access.
- Uploads: extension + MIME + magic-byte check, 5 MB cap enforced before buffering, private bucket, presigned 5-minute download URLs, keys are server-generated UUIDs.
- Config: validated at boot; a missing required variable stops the app with a clear message instead of a silent fallback. No secrets in the repo (`.env.example` only). Swagger is on in all environments because it contains no secrets and is useful for review.

## Deployment

- **API:** Railway, from `backend/Dockerfile` (multi-stage, non-root, runs `prisma migrate deploy` then `node dist/main.js`). Health check `GET /api/health`. Env vars set in the service; `CORS_ORIGIN` = the Vercel URL.
- **DB:** Neon Postgres (`DATABASE_URL` with `sslmode=require`).
- **Storage:** Cloudflare R2 bucket + API token (`S3_*` vars, `S3_REGION=auto`).
- **Frontend:** Vercel, root directory `frontend`, `VITE_API_URL` pointing at the Railway URL; `vercel.json` rewrites deep links to `index.html`.
- **AI:** any OpenAI-compatible provider; Groq free tier by default (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`). Unset = the helper reports itself unavailable, nothing else changes.

## Deliberately skipped (and why)

- **OAuth login** (bonus): would need a role-assignment story for first-time OAuth users (auto-assigning Agent is the safe default, auto-assigning Admin never is). Local auth already demonstrates hashing, rotation and revocation; OAuth adds a provider dependency without exercising new judgment.
- **Multi-device sessions:** one refresh token per user keeps revocation a single nullable column. An admin tool rarely needs concurrent sessions.
- **Redis / queues / GraphQL / microservices:** no concrete need at this size; every one of them is a second runtime to operate.
- **Frontend unit tests:** tests are concentrated where bugs cost trust — the backend business rules (88 unit tests, < 1 s, no DB) — plus one Playwright smoke (`frontend/e2e`) that proves the role gating end to end (agent sees a restricted admin *and* the API refuses the same actions) and walks a ticket through its whole lifecycle. Component-level UI tests would mostly re-test Refine and Ant Design.
- **Full-text search index:** `ILIKE` on title/description is fine at 5 000 rows; a `pg_trgm` index is a one-migration change when it isn't.
- **Orphan upload cleanup / virus scanning:** uploads not attached to a comment stay in the bucket; a scheduled sweep is the obvious next step.

## With more time

1. Route-level code splitting of the admin bundle (currently one ~540 kB gzipped chunk; antd + Refine dominate).
2. A `RefreshToken` table for multi-device sessions and a visible "active sessions" page.
3. Slimmer production image: run `prisma migrate deploy` as a Railway pre-deploy step so the Prisma CLI can leave the runtime image (~150 MB saved).
4. Typed query DTOs for list endpoints so Swagger documents every filter.
5. Audit trail of ticket status changes as its own table instead of inferring it from resolution comments.
6. Run the Playwright smoke in CI against a seeded throwaway database.
