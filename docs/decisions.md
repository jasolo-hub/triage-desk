# Architecture decision log

Short entries, numbered. Code comments refer to these numbers (`D4`, `D16`, …). Each one says what was chosen, why here, and what was given up.

## D1 — Monorepo with two independent `package.json`, no workspaces
Backend and frontend share no code: form metadata crosses the wire via `GET /tickets/fields`, API shapes are mirrored by hand in `frontend/src/types.ts`. Render and Vercel each take a root directory, so two plain folders deploy with zero workspace tooling. Given up: a shared types package (a build step and a workspace tool for ~5 interfaces).

## D2 — Bearer access + refresh tokens in `localStorage`, not cookies
Frontend (Vercel) and API (Render) are different sites. httpOnly cookies cross-site need `SameSite=None`, CSRF tokens and a proxy or custom domain. Bearer tokens carry no ambient credential, so CSRF does not apply; CORS is locked to the frontend origin. Trade-off: `localStorage` is readable by XSS. Mitigations: 15-minute access token, refresh rotation with replay detection, React/Ant Design escaping, no raw HTML rendering, `helmet` headers.

## D3 — Refresh token stored as a SHA-256 hash, one session per user
The refresh token is 256 random bits, not a password: nothing to brute-force, so argon2's slow hashing adds nothing and SHA-256 allows a direct lookup. One active session keeps revocation a nullable column; a new login replaces the old session. Given up: multi-device sessions (a `RefreshToken` table).

## D4 — Casbin with the policy as a TypeScript constant (string adapter, no DB)
Two static roles. The policy is code: reviewed in git, type-checked, no runtime editing, no extra table or sync step. Subject = role string (`ADMIN`/`AGENT`). Record-level rules ("an agent edits only tickets assigned to them") need the record, so they live in the services; Casbin answers "may this role do this action on this resource".

## D5 — Stock `@refinedev/simple-rest` on the frontend; the API speaks its convention
Matching simple-rest (`_start/_end`, `_sort/_order`, `field_like`, `x-total-count`) means zero data-provider code on the frontend and one small, unit-tested query parser on the backend with a per-resource whitelist. Given up: a richer filter language (OR groups) nobody needed.

## D6 — Uploads go through the API (multer in memory → S3 `PutObject`), not browser-direct presigned PUT
The bucket stays private, the server validates on the real bytes, no bucket CORS to configure. Files exist only in memory (5 MB cap) and never touch disk. Downloads are 5-minute presigned GET URLs. Given up: large-file throughput, irrelevant at 5 MB.

## D7 — No Passport; a small JWT guard on `@nestjs/jwt`
Passport + passport-jwt + @nestjs/passport are three packages to run one `verifyAsync`. A guard that reads the Bearer header and verifies it is shorter than configuring a strategy.

## D8 — class-validator DTOs (Nest default) instead of zod
Nest's `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` is the framework's own input-sanitisation story and feeds Swagger from the same classes. One library fewer.

## D9 — The resolution comment is part of the transition request, stored in one transaction
`POST /tickets/:id/transition { status: 'RESOLVED', comment }` creates the comment (`isResolution: true`) and updates the status atomically. Requiring a previously posted comment would make the rule depend on UI state and be racy.

## D10 — `status` is not editable through `PATCH /tickets/:id`
Otherwise the transition rules could be bypassed by the generic edit form. The DTO has no `status` field; `forbidNonWhitelisted` rejects it with 400.

## D11 — `isOverdue` is computed, not stored
It depends on "now"; storing it would need a scheduler. Computed in the mapper from `createdAt + SLA(priority)`. The `isOverdue=true` list filter is a real `WHERE` (an OR of four `createdAt` ranges, one per priority, served by the `(priority, createdAt)` index) so pagination stays correct. The SLA clock does not restart on reopen: SLA measures time to the first *working* resolution, and a reopen means the first fix did not hold.

## D12 — Local development on docker-compose (Postgres + S3Mock); production on Neon + Backblaze B2
Same protocols (Postgres wire, S3 API), so the code is identical and the app runs locally without cloud accounts. Nothing falls back silently: every URL and key comes from env and boot fails fast with a clear message when a required one is missing. B2 over R2 because its free tier needs no payment method; any S3-compatible store works by changing env values.

## D13 — Versions pinned by peer dependencies, not "latest"
`@refinedev/antd@6` requires antd ^5 (antd 6 exists but is unsupported); `@refinedev/react-router@2` requires react-router ^7 (v8 exists). Nest 12 ships TypeScript 6; Prisma 7 with the `pg` driver adapter.

## D14 — Swagger enabled in all environments
Documentation, not debug output; it contains no secrets and makes the API explorable.

## D15 — `agents` is a separate read-only resource (not `users`)
The AGENT role must not see user management, but assignee selects need names. A dedicated `GET /agents` with its own permission keeps the `users` resource (and its menu item) admin-only while both roles can populate the select.

## D16 — AI helper: plain `fetch` to any OpenAI-compatible endpoint, free-tier provider by default
Groq / Gemini / OpenRouter / Mistral (and Anthropic) all expose the OpenAI `chat/completions` format. One ~40-line `fetch` with `AI_BASE_URL + AI_API_KEY + AI_MODEL`: no SDK, provider is configuration, 10 s `AbortSignal.timeout`, any failure → 503 so the admin keeps working. Given up: vendor-specific features (tools, caching) a single grounded Q&A call does not need.

## D17 — Keep Nest 12's generated defaults: ES modules + Vitest (not CommonJS + Jest)
`nest new` v12 generates an ES-module project with Vitest and oxlint, and Prisma 7 is ESM-first (`moduleFormat = "esm"`). Retrofitting CommonJS + Jest means fighting the scaffold and running Jest in experimental ESM mode. Vitest has the same `describe/it/expect` API. Two scaffold tweaks forced by an npm peer-resolver bug: `vitest@^5` and no `vite-tsconfig-paths` (no path aliases here).

## D18 — Refresh token format `<userId>.<256 random bits>`; rotation is a compare-and-swap
If the token were only random bits, a stale (already rotated) token would match no row and we could not tell whose session to revoke. The id prefix is not secret; the random part is. Rotation uses `updateMany where { id, refreshTokenHash: old }` and checks `count === 1`, so two concurrent refreshes cannot both win. Hash comparison uses `timingSafeEqual`. Logins for unknown emails verify against a dummy argon2 hash so response time does not reveal which emails exist.

## D19 — Frontend: one `/auth/me` per session, single-flight refresh, own `QueryClient` wiped on logout/login
`getIdentity`, `getPermissions` and every `can()` share one cached `/auth/me` promise; the 401 interceptor shares one `/auth/refresh` promise for all concurrent 401s. The second is a correctness requirement: with replay detection a second concurrent refresh with the same token would revoke the session. The app owns its `QueryClient` so login/logout can `clear()` it — otherwise a cached `can: false` from a failed request, or the previous user's answers, would hide menu items for the stale time. Given up: live role changes (a role edit applies at next login; the role is inside the 15-minute JWT anyway).

## D20 — Container ships the Prisma CLI (migrate on start) but not the seed
`prisma migrate deploy` runs before `node dist/main.js`, so code and schema can never deploy out of step; a failed migration stops the deploy instead of serving errors. Cost: ~150–200 MB of CLI extras in the image. The seed is excluded: it truncates every table and would need `tsx` + faker at runtime; production seeding is a deliberate one-off from a checkout.

## D21 — Uploads checked on extension, declared type and file signature; attachment metadata from `HeadObject`
Extension and `Content-Type` both come from the client, so both are checked against one allowlist and must agree, and binary types must start with their magic bytes — a renamed `.exe` sent as `image/png` fails. Four small predicates, no `file-type` dependency. The 5 MB limit sits in multer `limits`, so an oversized body is aborted while streaming. When a comment references an upload, one `HeadObject` proves the object exists and returns its server-side type, size and original name, so nothing is trusted from the client twice. The unique `attachmentKey` column turns "already attached" into a 409.

## D22 — Rate limiting runs after authentication and counts per user
Nest's `ThrottlerGuard` tracks by IP and would run before `req.user` exists. Guard order is JWT → throttle → Casbin; the tracker is `user:<id>` when logged in, the client IP otherwise (login, refresh). Office NAT no longer makes colleagues share one budget.

## D23 — Pages: inferencer output committed verbatim, then customised; record rules mirrored only to hide controls
Each resource's first commit is the `@refinedev/inferencer` output rendered against the live API; the next commit is the customisation, so the diff shows exactly what was hand-written. No route renders an inferencer (devDependency). Record rules the policy cannot express (assigned/unassigned tickets, own comments) are mirrored in `domain/tickets.ts` purely to hide Edit / Change status; an agent can still type `/tickets/edit/<not mine>` and gets the API's 403 on save.

## D24 — React 19 + antd 5 via antd's official compatibility patch
The Refine 5 scaffold installs React 19; `@refinedev/antd@6` requires antd 5, which targets React 16–18. antd documents `@ant-design/v5-patch-for-react-19` for exactly this combination; imported first in `index.tsx`. Alternative was downgrading React against the scaffold's choice.

## D25 — Agents may create tickets; unassigned tickets are a claimable queue
The original role list omitted "create", but real support intake is agents logging tickets from calls. New tickets start OPEN and unassigned (queue-style); an unassigned ticket may be edited by any agent and claimed by setting themselves as assignee; once assigned, only the assignee or an admin may change it. Delete, bulk actions, customer/tag mutation and user management stay admin-only and visibly so.

## D26 — List batches run at REPEATABLE READ
`$transaction([findMany, count])` on one connection does not by itself give one snapshot: Postgres' default READ COMMITTED snapshots per statement, so an insert between the two SELECTs could make `x-total-count` disagree with the page. `LIST_TX` sets `isolationLevel: RepeatableRead` for those read-only batches — one snapshot, no serialization failures possible for reads, negligible cost.

## D27 — Replay detection keyed on the *previous* refresh token, not on "any mismatch"
Revoking on every hash mismatch let anyone log a user out by posting `"<id>.junk"` (ids are sequential), and a device whose session had been replaced by a newer login revoked the *new* session on its next refresh. The user row now keeps the current and the previous hash: presented == current → rotate (compare-and-swap kept); presented == previous → the token we just rotated came back → genuine replay → revoke; anything else → plain 401 and no write. Login clears the previous hash. `/auth/refresh` is rate-limited per IP. Given up: detection reaches one rotation back (an older token is useless anyway, only the alarm is lost). Still open: a stale tab presenting a token after another tab rotated it looks exactly like a replay; the proper fix is a cross-tab lock in the frontend on top of the single-flight refresh.

## D28 — Ticket writes re-assert what was validated; starting work claims the ticket
`update()` ran an ownership check and then a write as two statements, so two agents could both pass the "unassigned" check and the last write won silently. It now runs in one transaction with an `updateMany` whose WHERE repeats the ownership (AGENT: `assigneeId IS NULL OR assigneeId = me`; ADMIN: id only); zero rows affected → 409 "changed by someone else, reload". Tags are written afterwards in the same transaction (relations cannot go through `updateMany`). Why a conditional UPDATE rather than `SELECT … FOR UPDATE`: Prisma has no row-lock API, and a single `UPDATE … WHERE` is atomic — at READ COMMITTED Postgres re-checks the WHERE after a blocking transaction commits, so the loser matches 0 rows (verified against the real database). The status transition's compare-and-swap now includes the assignee it read, so a concurrent claim is never overwritten. Moving an unassigned ticket to IN_PROGRESS assigns the actor: whoever starts work owns it; reassigning afterwards stays possible. The rule is written once in `ticket-fields.ts`, so tooltips and the AI prompt follow. Given up: two admins editing the same ticket is still last-write-wins (optimistic locking with a version would be next).

## D29 — Length limits in the database too; explicit connection pool size
DTO limits only guard the API; the seed, scripts or a future worker bypass them. Short columns are now `@db.VarChar(n)` with the DTO numbers (title 200; user/customer names and company 200; emails 320; tag name 50, colour 7; attachment name 255, content type 100) in a generated migration — no hand-written SQL. `description` and comment bodies stay TEXT. Two follow-ups: uploaded file names are now capped at 255 at upload time, and "value too long" from the database maps to 400 instead of 500. An existing value longer than the new limit makes the migration fail rather than truncate, which stops the deploy (D20). Pool: `DB_POOL_MAX` sets the `pg` pool size explicitly (default 10) because *instances × pool size* must fit the managed Postgres connection budget — the first number to reason about at 10× traffic; the plan there is more instances with a modest pool on Neon's pooled endpoint, with a separate direct URL for migrations (not needed yet).

## D30 — Emails are `citext`: case-insensitive uniqueness in the database, not only in the API
The API lowercases emails before writing and looking them up, but a seed, a script or a second service could still insert `Bob@x.io` next to `bob@x.io`. `User.email` and `Customer.email` are now `@db.Citext` with `extensions = [citext]` (Prisma's `postgresqlExtensions` preview feature — stable in practice since 2022; the alternative was a hand-written `CREATE EXTENSION`). The unique indexes therefore compare case-insensitively inside Postgres. One migration (`citext_emails`) has two hand-adjusted statements: Prisma's generator knows no varchar→citext cast and would drop and re-create the columns, so the generated `DROP/ADD` was replaced by `ALTER COLUMN … TYPE citext USING email::citext`, which keeps rows and indexes; the migration file says so. Given up: the 320-character cap moves back to the DTOs only (citext has no length).
