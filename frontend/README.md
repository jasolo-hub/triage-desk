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

Every page started as **Refine inferencer** output (`AntdListInferencer`, `AntdCreateInferencer`, …) rendered against the live API, committed verbatim (`feat(<resource>): inferencer-generated …`), then customised in the next commit, so `git log -p` shows generated → customised for each resource. No route renders an inferencer any more; `@refinedev/inferencer` is a devDependency only.

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
- Record-level rules (an AGENT edits/moves only tickets assigned to them and edits only their own comments) are mirrored in `domain/tickets.ts` / the comments table purely to hide controls.

**All of this is cosmetic.** The API checks every request (Casbin + record rules) and answers 403 whatever the UI shows.

### What each role sees

| | ADMIN | AGENT |
|---|---|---|
| Menu | Tickets, Customers, Tags, Users | Tickets, Customers, Tags |
| Tickets | create, edit, delete, change status, bulk assign / bulk status | edit and change status only on tickets assigned to them; no create, delete or bulk toolbar |
| Comments | add, edit any, delete | add, edit own |
| Customers | full CRUD | read only |
| Tags | add, edit inline, delete | read only |
| Users | full CRUD | 403 page |
