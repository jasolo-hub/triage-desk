# Triage Desk — frontend

Refine 5 + Ant Design 5 admin for the Triage Desk API. Vite SPA, deployed on Vercel.

## Setup

```bash
cp .env.example .env      # VITE_API_URL=http://localhost:3000/api
npm install
npm run dev -- --port 5173  # the API's CORS_ORIGIN allows http://localhost:5173
```

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | API base URL including the `/api` prefix. Inlined at build time; the app refuses to start without it. On Vercel set it in the project settings. |

Scripts: `dev` (Vite through `refine dev`), `build` (`tsc` + Vite build), `start` (preview the build), `lint` (ESLint).

`vercel.json` rewrites every path to `index.html`, so deep links such as `/tickets/show/42` work after a reload.

## How the pages were built

Every page started as **Refine inferencer** output (`AntdListInferencer`, `AntdCreateInferencer`, …) rendered against the live API, committed verbatim (`feat(<resource>): inferencer-generated …`), then customised in the next commit(s), so `git log -p` shows generated → customised for each resource. No route renders an inferencer any more; `@refinedev/inferencer` is a devDependency only.

| Resource | Inferencer output | Customised |
|---|---|---|
| Tickets | [`689015d`](https://github.com/jasolo-hub/triage-desk/commit/689015d) | [`cf6737c`](https://github.com/jasolo-hub/triage-desk/commit/cf6737c) list, [`131bbf2`](https://github.com/jasolo-hub/triage-desk/commit/131bbf2) create/edit/show |
| Customers | [`c724b29`](https://github.com/jasolo-hub/triage-desk/commit/c724b29) | [`116f85e`](https://github.com/jasolo-hub/triage-desk/commit/116f85e) |
| Tags | [`da1a00c`](https://github.com/jasolo-hub/triage-desk/commit/da1a00c) | [`80c7938`](https://github.com/jasolo-hub/triage-desk/commit/80c7938) |
| Users | [`8ea1ea2`](https://github.com/jasolo-hub/triage-desk/commit/8ea1ea2) | [`57ddb8b`](https://github.com/jasolo-hub/triage-desk/commit/57ddb8b) |

Open the diff of a "Customised" commit to see what was changed by hand on top of the generated pages; `git log -p -- frontend/src/pages/<resource>` (from the repo root) shows each resource's full evolution, later changes included.

What was customised, in short:

- **Tickets list**: status/priority colour tags, overdue badge, column filters (status, priority, overdue, assignee, customer with server search), search box (`q`), server-side sort, ADMIN bulk actions (assign, change status) with a per-ticket result summary.
- **Ticket create/edit**: only the fields the API accepts (no `status`); labels, tooltips and priority options come from `GET /tickets/fields` (`useTicketFields`), the same metadata the AI assistant uses.
- **Ticket show**: "Change status" offers only the allowed next statuses (`domain/tickets.ts`); RESOLVED asks for a resolution comment. Comments are an inline-editable table with attachments (upload validated in the browser and again by the API).
- **Customers**: search, contains-filters, ticket list per customer; duplicate email (409) appears under the Email field.
- **Tags**: one inline-editable table with a colour picker and an add row.
- **Users**: role select, password required on create and optional on edit.
- **AI assistant**: floating button on ticket pages; if the API answers 503 the drawer says so and the form keeps working.

## Data, auth and access control

- `src/providers/api.ts` — the only axios instance: Bearer token from localStorage, one shared refresh request when several calls get 401 at once (the API revokes the session when a rotated refresh token is reused), then retry. Errors are mapped to Refine's `HttpError`.
- `src/providers/dataProvider.ts` — stock `@refinedev/simple-rest` over that instance (no custom code; the API follows its conventions).
- `src/providers/authProvider.ts` — login/logout/check, identity and permissions from one cached `GET /auth/me` per session. 401 logs out; 403 stays logged in and shows the API's message.
- `src/providers/accessControlProvider.ts` — `can(resource, action)` is a lookup in the `permissions` map from `/auth/me`, which the API derives from its Casbin policy. Buttons the role cannot use are hidden; `<CanAccess>` in `App.tsx` shows a 403 page for routes the role cannot open.
- Record-level rules (an AGENT edits/moves only tickets assigned to them or unassigned, and edits only their own comments) are mirrored in `domain/tickets.ts` / the comments table purely to hide controls.

**All of this is cosmetic.** The API checks every request (Casbin + record rules) and answers 403 whatever the UI shows.

### What each role sees

| | ADMIN | AGENT |
|---|---|---|
| Menu | Tickets, Customers, Tags, Users | Tickets, Customers, Tags |
| Tickets | create, edit, delete, change status, bulk assign / bulk status | create (starts unassigned); edit and change status only on tickets assigned to them or unassigned (claim by self-assigning); no delete or bulk toolbar |
| Comments | add, edit any, delete | add, edit own |
| Customers | full CRUD | read only |
| Tags | add, edit inline, delete | read only |
| Users | full CRUD | 403 page |

## E2E smoke

`e2e/roles.spec.ts` (Playwright, Chromium only) has two tests:

- **agent**: after logging in as `agent@triage.dev` the menu is exactly Tickets / Customers / Tags; the tickets list has a Create button but no row checkboxes (no bulk actions) and no Delete buttons; `/users` shows the "Not allowed" page. Then, with a token from the API: `POST /tickets` succeeds (the ticket starts OPEN and unassigned), the agent can claim it with `PATCH` (assignee = self), but `DELETE /tickets/:id`, `POST /tickets/bulk-assign` and `GET /users` return 403 — the hidden UI is backed by the API. The ticket is deleted with an admin token at the end.
- **admin**: creates a ticket in the UI and moves it Open → In progress → Resolved → Closed. Resolving is refused without a comment, the resolution comment appears in the comments table, and once Closed there is no "Change status" left. The ticket is deleted through the API afterwards (even if the test failed), so runs leave no data behind.

How to run (nothing is started for you — there is no `webServer` in the config):

```bash
# API on http://localhost:3000/api with the seeded DB, and:
npm run dev -- --port 5173
npm run test:e2e            # E2E_BASE_URL / E2E_API_URL override the defaults
```

`/auth/login` is rate-limited to 10 requests per minute per IP and one run logs in 3 times, so more than three runs within a minute fail with 429 at login.

Why only these two flows: they cover what a unit test cannot see and what would hurt most if it broke silently — role gating that must hold in the browser *and* on the API, and the ticket workflow end to end through the real UI, API and database. Filters, forms and the other pages are built from Refine/antd parts and were checked by hand; the business rules themselves are unit-tested in the backend.

## Known advisories

`npm audit --omit=dev` reports 6 vulnerabilities (3 high, 3 moderate). npm counts every package on a vulnerable path, so this is two vulnerable packages, both reached through Refine:

- **High:** `path-to-regexp` 8.2.0 — "Denial of Service via sequential optional groups" ([GHSA-j3q9-mxjg-w52f](https://github.com/advisories/GHSA-j3q9-mxjg-w52f)) and "Regular Expression Denial of Service via multiple wildcards" ([GHSA-27v5-c462-wpq7](https://github.com/advisories/GHSA-27v5-c462-wpq7)); path: `@refinedev/antd` → `@ant-design/pro-layout` (pins exactly 8.2.0) → `path-to-regexp`. It is a route matcher used only by pro-layout's ProLayout title/breadcrumb helpers; Refine imports only pro-layout's `PageHeader`, so `path-to-regexp` is not in the built bundle at all. npm's only offered fix is going back to `@refinedev/antd` 6.0.0, which it flags as breaking.
- **Moderate:** `decode-uri-component` 0.2.2 — "Denial of service via exponential decoding of malformed percent-encoded input" ([GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)); path: `@refinedev/simple-rest` (the data provider) → `query-string` 7.1.3 → `decode-uri-component`. It is bundled, but simple-rest only calls `query-string`'s `stringify`, which encodes and never reaches the vulnerable decoder. npm reports no fix available.

The risk is accepted and this section is where it is tracked: re-run `npm audit --omit=dev` on each Refine upgrade and remove an entry once upstream ships a fix. A plain `npm audit` lists 15 more, all under `@refinedev/cli`, a devDependency that is never shipped.
