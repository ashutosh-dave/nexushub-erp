# NexusHub ERP — Source of Truth
This file is the single authority for the whole build. If anything (a library default, a "nicer" idea, a shortcut) conflicts with this file, this file wins. If this file is silent, pick the simplest option that satisfies the requirements and record the decision under "Decision Log" at the bottom.
**Time budget: 4 hours total, including deployment and README.** Optimise for a working, deployed, demonstrable product that hits every requirement. Do not gold-plate.
---
## 0. Agent Operating Rules
1. Build in the order given in Section 14. Never start a later phase while an earlier one is broken.
2. Every requirement in Sections 3–8 is mandatory. Nothing outside this file is allowed unless it is needed to make a mandatory item work.
3. Do not swap the stack (Section 1). Do not add extra services (no Redis, no queues, no Docker requirement for deployment, no GraphQL, no microservices).
4. Business rules live in the **service layer** on the backend, never only in the frontend. The frontend validates for UX; the backend enforces.
5. Every state-changing operation that touches more than one table runs in a **single DB transaction**, including its audit log row.
6. Commit small and often with clear messages. The repo must be public and must never contain real secrets (`.env` is gitignored, `.env.example` is committed).
7. After each phase: run the app, hit the endpoints, fix errors, then move on. Deploy early (end of Phase 3), not at the end.
8. Never claim a feature is done unless it was exercised end to end (API call or UI click).
---
## 1. Fixed Technology Stack
**LOCKED CORE STACK (strict, no substitutions, no additions at this level):**
- **Backend runtime:** Node.js
- **Backend framework:** Express.js
- **Database:** MySQL
- **Frontend:** React
Nothing else may fill any of these four roles: no other backend framework (NestJS, Fastify, Koa), no other database (Postgres, MongoDB, SQLite), no ORM that hides MySQL, no other frontend framework (Next.js, Vue, Angular, etc.), and no TypeScript. Both apps are written in plain JavaScript. The libraries below are supporting utilities *inside* these four, and are the only extras permitted. If a task seems to need anything beyond them, solve it with the core stack and log the decision.
| Layer | Choice |
|---|---|
| Runtime | Node.js 20 LTS |
| API | Express.js 4 |
| Database | MySQL 8 (InnoDB, utf8mb4) |
| DB access | `mysql2/promise` with a connection pool, **raw parameterised SQL** (no ORM). Never concatenate user input into SQL |
| Validation | `zod` (request body, query, params) |
| Auth | JWT (access token, 8h expiry) + `bcryptjs` password hashing |
| Security middleware | `helmet`, `cors` (origin from env), `express-rate-limit` on `/auth/login` |
| Logging | `morgan` (dev/combined) |
| Backend tests | `vitest` + `supertest` (minimum: the overlap validator, proration calc, status transitions, rank reordering) |
| Frontend | React 18 + Vite (JavaScript, JSX; Vite is only the build tool) |
| Styling | Tailwind CSS + shadcn/ui components |
| Server state / caching | TanStack Query (React Query) v5 |
| Forms | `react-hook-form` + `zod` resolver |
| Charts | Recharts |
| Tables | TanStack Table v8 (sorting, filtering, pagination) |
| Kanban drag and drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Routing | `react-router-dom` v6 |
| HTTP client | `axios` with an interceptor for auth header and 401 handling |
| Language (both apps) | JavaScript (ES modules), JSDoc where helpful. No TypeScript |
**Frontend constraint (strict):** the frontend is a plain **React 18 single-page app built with Vite**. No Next.js, Remix, Gatsby, Angular, Vue, Svelte or any other framework or meta-framework, and no server-side rendering. All UI is React function components with hooks. Every library listed in the frontend rows above is a React library or framework-agnostic; do not add anything that replaces React's role.
Real-time ("live") behaviour is implemented with **TanStack Query polling** (`refetchInterval`: 10s on dashboard and dispatch board, paused when the tab is hidden). No WebSockets.
### Deployment targets (fixed)
- **Database:** hosted MySQL (Aiven free MySQL or Railway MySQL). SSL on if the provider requires it (support `DB_SSL=true`).
- **Backend:** Render (Web Service), start command `node src/server.js`, health check `GET /api/health`.
- **Frontend:** Vercel (static Vite build) with `VITE_API_BASE_URL` pointing at the live backend, plus SPA rewrite to `index.html`.
- CORS on the backend must allow the deployed frontend origin via `CORS_ORIGIN` env.
---
## 2. Repository Layout (monorepo)
```
nexushub-erp/
├── README.md
├── NEXUSHUB_SPEC.md
├── .gitignore
├── database/
│   ├── schema.sql          # structured, commented, re-runnable (DROP/CREATE or IF NOT EXISTS)
│   └── seed.sql            # demo data (or seed script in backend, but the SQL schema file is mandatory)
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js
│       ├── app.js
│       ├── config/         # env, db pool
│       ├── middleware/     # auth, rbac, validate, errorHandler, notFound
│       ├── routes/         # one router per module
│       ├── controllers/    # thin: parse, call service, respond
│       ├── services/       # business logic + transactions
│       ├── utils/          # ApiError, asyncHandler, audit helper, proration, overlap
│       └── scripts/        # migrate.js, seed.js
│   └── tests/
└── frontend/
    ├── package.json
    ├── .env.example
    └── src/
        ├── main.jsx, App.jsx
        ├── api/            # axios instance + per-module hooks (useQuery/useMutation)
        ├── components/     # ui/ (shadcn), layout/, shared/ (StatusBadge, DataTable, ErrorState, Loader)
        ├── pages/          # Login, Dashboard, Subscribers, SubscriberDetail, Marketplace, Dispatch, Technicians, AuditLog
        ├── lib/            # auth context, utils, zod schemas
        └── hooks/              # shared custom hooks
```
---
## 3. Roles & Access Control (RBAC)
| Role | Purpose | Allowed |
|---|---|---|
| `admin` | ISP administrator | Everything |
| `support_lead` | Support lead | Tickets/tasks full control, assign technicians, view subscribers, view audit log, dashboard |
| `support_agent` | Support staff | Log master tickets, view tickets/subscribers, view dashboard |
| `technician` | Field tech | View own tasks and shifts, update status of **own** tasks |
| `buyer` | B2B/B2C marketplace customer | Marketplace: view packages, upgrade/downgrade **own** connection, view **own** billing logs |
Enforced by an `authorize(...roles)` middleware on every route. Buyers are linked to a `subscriber` row via `users.subscriber_id`.
Seeded test logins (document in README; password for all: `Password@123`):
- `admin@nexushub.test` (admin)
- `lead@nexushub.test` (support_lead)
- `agent@nexushub.test` (support_agent)
- `tech1@nexushub.test`, `tech2@nexushub.test`, `tech3@nexushub.test` (technician)
- `buyer@nexushub.test` (buyer, linked to a seeded B2C subscriber)
- `buyer.b2b@nexushub.test` (buyer, linked to a seeded B2B subscriber)
---
## 4. Data Model (MySQL)
All tables: `id BIGINT UNSIGNED AUTO_INCREMENT PK`, `created_at`, `updated_at` (timestamps) unless noted. Use foreign keys with sensible `ON DELETE` (RESTRICT by default). Add indexes on every FK and on commonly filtered columns (`status`, `pop_id`, `technician_id`, time ranges).
**users**: `name`, `email` (unique), `password_hash`, `role` ENUM(admin, support_lead, support_agent, technician, buyer), `subscriber_id` NULL FK, `is_active`.
**pops** (node / Point of Presence): `code` (unique), `name`, `city`, `capacity_mbps`.
**plans** (bandwidth packages): `name`, `segment` ENUM(B2C, B2B), `speed_mbps`, `data_cap_gb` NULL (NULL = unlimited), `monthly_price` DECIMAL(10,2), `is_active`.
**subscribers**: `name`, `type` ENUM(B2C, B2B), `email`, `phone`, `address`, `company_name` NULL.
**connections**: `subscriber_id` FK, `plan_id` FK, `pop_id` FK, `status` ENUM(Pending, Active, Suspended, Terminated), `static_ip` VARCHAR(15) NULL **UNIQUE**, `connection_code` (unique, e.g. `NX-000123`), `activated_at` NULL, `terminated_at` NULL, `billing_cycle_start` DATE.
**plan_changes**: `connection_id` FK, `from_plan_id`, `to_plan_id`, `change_type` ENUM(upgrade, downgrade), `effective_date` DATE, `requested_by` FK users.
**billing_logs**: `connection_id` FK, `plan_change_id` NULL FK, `entry_type` ENUM(charge, credit, proration), `description`, `amount` DECIMAL(10,2) (credits negative), `period_start` DATE, `period_end` DATE, `days_used`, `days_in_cycle`.
**technician_shifts**: `technician_id` FK users, `shift_date` DATE, `start_time` TIME, `end_time` TIME. Shifts do not cross midnight in this scope (document this).
**tickets** (master complaints): `ticket_no` (unique, e.g. `TK-000045`), `connection_id` FK, `title`, `description`, `priority` ENUM(Low, Medium, High, Critical), `status` ENUM(Open, In-Progress, Field Visit, Resolved), `rank_index` INT, `created_by` FK, `sla_due_at` DATETIME, `resolved_at` NULL.
**ticket_tasks** (sub-tasks): `ticket_id` FK, `title`, `task_type` ENUM(Feeder Line Audit, ONU Configuration, Splicing, Fiber Repair, Router Replacement, Other), `description`, `status` ENUM(Open, In-Progress, Field Visit, Resolved), `rank_index` INT, `technician_id` NULL FK, `window_start` DATETIME NULL, `window_end` DATETIME NULL, `resolved_at` NULL. Constraint: `window_end > window_start` (check in service; add CHECK if MySQL 8.0.16+).
**audit_logs** (append only, never updated or deleted): `entity_type` ENUM(connection, plan_change, ticket, ticket_task, subscriber), `entity_id`, `action` (e.g. `STATUS_CHANGED`, `PLAN_CHANGED`, `TECH_ASSIGNED`, `TECH_REASSIGNED`, `TECH_UNASSIGNED`, `CONNECTION_CREATED`, `IP_ALLOCATED`, `TASK_RESCHEDULED`, `RANK_CHANGED`), `old_value` JSON NULL, `new_value` JSON NULL, `actor_id` FK users, `created_at`. Index on `(entity_type, entity_id)` and `created_at`.
`schema.sql` must be organised in this order with section comments: database creation, reference tables, core tables, workflow tables, audit, indexes. It must run cleanly on a fresh database.
---
## 5. Backend Business Rules (non-negotiable)
### 5.1 Connection lifecycle
- Allowed status transitions only:
  - `Pending → Active`, `Pending → Terminated`
  - `Active → Suspended`, `Active → Terminated`
  - `Suspended → Active`, `Suspended → Terminated`
  - `Terminated` is final. Any other transition returns **422** with the allowed next states.
- Setting `Active` for the first time stamps `activated_at`. Setting `Terminated` stamps `terminated_at` and **releases the static IP** (sets it to NULL, with an `IP_ALLOCATED`-family audit entry showing release).
- Static IP: valid IPv4 only, globally unique, returns **409** on duplicate. May be NULL.
- A connection must reference an existing subscriber, an active plan, and an existing POP. Optional guard: warn (not block) when POP allocated bandwidth would exceed `capacity_mbps`; expose utilisation in the POP list.
### 5.2 Marketplace & prorated billing
- Buyers see only `is_active` plans, filterable by `segment` and speed. Buyers can change plan only on their **own Active** connection.
- Classification: `upgrade` if new `monthly_price` > old, `downgrade` if lower. Same plan → **422**.
- **Proration formula (fixed):** for a change effective on date D within a cycle of N days starting at `billing_cycle_start` (cycle length = actual days of that cycle), with `days_remaining = cycle_end - D + 1`:
  - credit for old plan = `old_price × days_remaining / N`
  - charge for new plan = `new_price × days_remaining / N`
  - net = new charge − old credit.
- Write **two** `billing_logs` rows (a negative credit row and a positive charge row, `entry_type = proration`) plus one `plan_changes` row, update `connections.plan_id`, and write one audit row. All in one transaction. Round to 2 decimals (banker-safe: compute in integer paise/cents, round half up once at the end of each row).
- Downgrade/upgrade takes effect immediately (effective date = today). Document this.
### 5.3 Tickets, sub-tasks & workflow
- Support staff create a master ticket against a connection (must not be Terminated). `sla_due_at` derives from priority: Critical 4h, High 8h, Medium 24h, Low 72h from creation.
- A master ticket can be split into **many** sub-tasks. Sub-tasks can be created unassigned.
- **Status machine** (same for tickets and tasks): `Open → In-Progress → Field Visit → Resolved`. Moving forward one step at a time is allowed; moving backward one step is allowed for `support_lead`/`admin` only; skipping steps or leaving `Resolved` returns **422**.
- A master ticket **cannot** move to `Resolved` while any sub-task is not `Resolved` (422 listing blockers). When all sub-tasks are `Resolved`, do **not** auto-resolve the ticket (the lead resolves it explicitly), but the API returns a flag `all_tasks_resolved: true`.
- Moving a ticket to `In-Progress` the first time is allowed even with zero sub-tasks.
- A task cannot move beyond `Open` unless it has an assigned technician and a window (422 with clear message, which the UI surfaces as "unassigned task" validation).
- Technicians can only change status of tasks assigned to them.
### 5.4 Shift & schedule overlap validation (critical)
Run inside a transaction that first locks the technician row (`SELECT ... FROM users WHERE id = ? FOR UPDATE`) to prevent race conditions on concurrent assignments.
On assign, reassign, or reschedule a task, reject with **409** and a structured body when:
1. **Window overlap:** the technician has another non-Resolved task where `new.start < existing.end AND new.end > existing.start` (touching boundaries are allowed). The 409 payload lists the conflicting tasks (`task_id`, `ticket_no`, `window_start`, `window_end`).
2. **Shift violation:** the whole window is not contained in one of that technician's `technician_shifts` for that date (no shift that day, or window outside shift hours). Payload explains which.
3. **Invalid window:** `end <= start`, or window in the past (422).
Resolved tasks do not block new assignments. Reassigning to the same technician with the same window is a no-op (200, no audit row). Excluding the task being edited from its own conflict check is mandatory.
Also provide `GET /technicians/available?start=&end=` returning technicians free and on-shift for a window (used by the UI to pre-filter assignees).
### 5.5 Rank / index handling
- `tickets.rank_index` and `ticket_tasks.rank_index` are ordering indexes **within a status column** (tickets: per status; tasks: per status within the same ticket scope for the ticket detail view, and per status globally for the dispatch board; **pick one and document**: use per-status global ordering for both, with `rank_index` unique-ish per status column and contiguous, starting at 0).
- When an item changes status, it is appended at the end of the destination column and the source column is re-compacted (no gaps), in the same transaction.
- `PATCH .../reorder` accepts `{ status, ordered_ids: [...] }` or `{ id, to_status, to_index }` for drag-drop; the service shifts neighbours so indexes stay contiguous. Emits a `RANK_CHANGED` audit row only for status changes, not for pure in-column reordering (decision: avoid audit noise; document it).
### 5.6 Audit trail
Automatic, written through one helper (`auditLog(conn, {...})`) called from services **inside the same transaction** as the change. Must cover:
- every ticket/task status change (old → new),
- every plan change (old plan → new plan, prorated amount),
- every technician assignment, reassignment and unassignment (old tech → new tech, window),
- connection creation, status change, static IP allocation/change/release.
`audit_logs` is append-only: no update/delete endpoints exist. `GET /audit-logs` supports filters (`entity_type`, `entity_id`, `actor_id`, date range) and pagination.
---
## 6. API Contract
Base path: `/api`. JSON only. Auth via `Authorization: Bearer <jwt>` on everything except `/api/health` and `/api/auth/login`.
**Response envelope**
- Success: `{ "data": ..., "meta": { "page", "pageSize", "total" } }` (`meta` only on lists).
- Error: `{ "error": { "code": "STRING_CODE", "message": "human readable", "details": ... } }`
- Status codes: 200/201 success, 400 malformed, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict (IP duplicate, schedule overlap), 422 business-rule/validation failure, 500 unexpected (never leak stack traces in production).
**Pagination / sort / filter convention for list endpoints:** `?page=1&pageSize=20&sortBy=created_at&sortDir=desc&search=...&<filter>=...`. `sortBy` must be whitelisted per endpoint. Multi-column sort via `sortBy=status,created_at&sortDir=asc,desc` is supported on `/subscribers` (required by the UI).
### Endpoints
**Auth**
- `POST /auth/login` → `{ token, user }`
- `GET /auth/me`
**Health**
- `GET /health`
**POPs & Plans (reference)**
- `GET /pops` (with utilisation), `POST /pops`, `PATCH /pops/:id` (admin)
- `GET /plans?segment=&minSpeed=&maxSpeed=` (all roles; buyers see active only)
- `POST /plans`, `PATCH /plans/:id` (admin)
**Subscribers & Connections (admin, support_lead, support_agent read)**
- `GET /subscribers` (filters: `status`, `type`, `popId`, `planId`, `search`; multi-column sort; returns connection summary per row: plan, POP, status, static IP)
- `POST /subscribers` (admin)
- `GET /subscribers/:id` (with connections)
- `PATCH /subscribers/:id` (admin)
- `GET /connections`, `POST /connections` (admin), `GET /connections/:id`
- `PATCH /connections/:id` (admin: pop, static IP, plan fix)
- `PATCH /connections/:id/status` (admin) body `{ status }`
- `GET /connections/:id/history` (audit + billing + plan changes merged chronologically)
**Marketplace (buyer, plus admin read)**
- `GET /marketplace/packages`
- `GET /marketplace/my-connections` (buyer)
- `POST /marketplace/connections/:id/change-plan` body `{ plan_id }` (buyer own / admin)
- `GET /marketplace/connections/:id/billing-logs`
- `GET /marketplace/proration-preview?connectionId=&planId=` (shows the exact numbers before confirming)
**Tickets & Tasks**
- `GET /tickets` (filters: `status`, `priority`, `connectionId`, `slaBreached=true`; includes task counts and SLA state)
- `POST /tickets` (support_agent, support_lead, admin)
- `GET /tickets/:id` (with tasks)
- `PATCH /tickets/:id` (title, description, priority)
- `PATCH /tickets/:id/status` body `{ status }`
- `PATCH /tickets/reorder` body as in 5.5
- `POST /tickets/:id/tasks` (support_lead, admin) create sub-task(s); accepts a single object or an array
- `GET /tasks` (filters: `status`, `technicianId`, `ticketId`, date range; used by board and technician view)
- `PATCH /tasks/:id` (title, type, description)
- `PATCH /tasks/:id/assign` body `{ technician_id | null, window_start, window_end }` (conflict validation, 5.4)
- `PATCH /tasks/:id/status` body `{ status }`
- `PATCH /tasks/reorder`
- `GET /technicians` (with current load), `GET /technicians/available?start=&end=`
- `GET /technicians/:id/schedule?from=&to=` (shifts + assigned windows)
- `POST /technicians/:id/shifts`, `DELETE /technician-shifts/:id` (admin, support_lead); deleting a shift that would orphan an assigned task returns 409.
**Analytics & Audit**
- `GET /analytics/overview` returns: connection counts by status, total/active subscribers, bandwidth distribution (sum of Mbps by plan and by POP), tickets by status, open ticket count, SLA breached count, SLA at-risk count (due within 1h), technician utilisation (assigned hours today).
- `GET /analytics/connections-trend?days=30` (new connections per day, derived from `created_at`/`activated_at`)
- `GET /analytics/tickets-trend?days=14` (opened vs resolved per day)
- `GET /audit-logs`
All of the above must have zod validation and RBAC. The README must document each endpoint (method, path, auth/role, body, example response).
---
## 7. Frontend Requirements
Layout: sidebar + top bar, responsive down to mobile (sidebar collapses to a sheet). Dark mode optional, not required.
**Auth & routing:** login page, token in memory + `localStorage`, protected routes, role-aware navigation (menu items hidden by role), automatic logout on 401.
**Pages**
1. **Operations Dashboard** (admin, support_lead, support_agent)
   - KPI cards: active connections, suspended, open tickets, SLA breached (red), technician utilisation.
   - Charts (Recharts): connection status donut, bandwidth distribution by plan (bar) and by POP (bar), tickets-by-status, 30-day connections trend (line), opened vs resolved tickets (line/area).
   - SLA warnings panel: list of breached and at-risk tickets with time remaining, linking to the ticket.
   - Polls every 10s; shows "last updated" and a manual refresh.
2. **Subscribers** (data table)
   - TanStack Table: **multi-column sorting** (shift-click headers), column filters, global search, status filter, pagination, **status badges** (Pending=amber, Active=green, Suspended=orange, Terminated=gray/red).
   - Row click opens detail with connections, static IP, POP, history (audit + billing).
   - Admin-only actions: create subscriber/connection, change status, set static IP and POP (forms with validation, 409 shown inline on IP duplicate).
3. **Marketplace** (buyer view; admin can view)
   - Package cards with speed/price/segment filter, current plan highlighted, upgrade/downgrade buttons, **proration preview dialog** before confirm, billing log table for own connection.
4. **Dispatch Board** (support_lead, admin; support_agent read + create ticket)
   - **Kanban** with four columns (Open, In-Progress, Field Visit, Resolved) for master tickets, drag-and-drop between columns (status change) and within columns (rank), optimistic update with rollback on error.
   - Toggle to a **task view** (sub-tasks kanban) and a **timeline view** (per technician rows × time axis showing windows, conflicts visible; read-only rendering is acceptable, built with plain CSS grid).
   - Create-ticket dialog; ticket drawer with sub-task list; **split into sub-tasks** form (add multiple rows: title, type).
   - Assign dialog: technician select (filtered by `/technicians/available` for the window), datetime pickers. **Instant visual feedback:** client-side checks (end > start, required fields, unassigned warning badge on tasks without technician) and server 409 conflict rendered inline listing the conflicting tasks with their windows.
   - Disallowed drags (illegal transition, unassigned task) snap back and show a toast with the server message.
5. **Technician view** (technician role): my tasks, my shifts, update status of own tasks.
6. **Audit Log** (admin, support_lead): filterable, paginated table with old → new values.
**State & UX standards**
- All server data via TanStack Query with sensible `staleTime`, cache invalidation after mutations, and query keys centralised.
- Every list/page has: loading skeleton or spinner, empty state, and error state with retry.
- Mutations show toast on success/failure; buttons disabled while pending.
- API response shapes are documented with JSDoc `@typedef` and validated where useful with zod schemas in `src/lib`.
- Accessible: labels on inputs, keyboard-usable dialogs (shadcn defaults).
---
## 8. Seed Data (must exist for the demo)
- 4 POPs with capacities.
- 8 plans (4 B2C, 4 B2B) spanning 50 Mbps – 1 Gbps.
- 40+ subscribers (mix B2C/B2B) with connections across all four statuses, ≥ 10 with static IPs.
- 3 technicians with shifts for today and the next 7 days (e.g. 09:00–17:00, 12:00–20:00, 08:00–16:00).
- 20+ tickets across all statuses and priorities, at least 3 SLA-breached and 2 at-risk, several with 2–4 sub-tasks, some assigned with non-overlapping windows today/tomorrow.
- A few historical plan changes with billing logs and audit entries so the history views and dashboard are not empty.
- Seeding is idempotent or clearly documented as "run once on empty DB".
---
## 9. Environment Variables
`backend/.env.example`
```
NODE_ENV=development
PORT=5000
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=nexushub
DB_SSL=false
JWT_SECRET=change-me
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173
```
`frontend/.env.example`
```
VITE_API_BASE_URL=http://localhost:5000/api
```
Backend scripts: `npm run dev`, `npm start`, `npm run db:migrate` (runs `database/schema.sql`), `npm run db:seed`, `npm test`.
---
## 10. Quality Bar
- Consistent error handling: one `errorHandler` middleware, `ApiError` class, `asyncHandler` wrapper, zod errors mapped to 422 with field-level `details`.
- No SQL injection (parameterised only), no password hashes ever returned, no stack traces in production responses.
- Timestamps stored in UTC; frontend renders in local time.
- Lint/format: ESLint + Prettier configs present; `npm run build` for the frontend must pass with no errors.
- Tests (must pass): overlap detection (adjacent allowed, overlapping rejected, self-exclusion, resolved ignored, shift containment), proration math (upgrade, downgrade, leap-year February, last day of cycle), status transition matrix, rank compaction after status moves.
---
## 11. README.md Must Contain
1. Project overview and feature list.
2. Architecture overview (diagram or ASCII diagram: React → Express → MySQL; layering controllers/services/utils; transaction + audit flow).
3. Tech stack table.
4. Local setup (clone, install, env, create DB, migrate, seed, run both apps).
5. Environment variable templates (as in Section 9) with explanations.
6. Database section: ER summary and link to `database/schema.sql`.
7. Business rules summary (status machines, overlap validation, proration formula, rank handling, audit coverage).
8. Full API endpoint reference (Section 6 format with roles and examples).
9. Test login credentials table (Section 3).
10. Live URLs (frontend, backend, health check) and deployment notes.
11. How to run tests.
12. Known limitations / assumptions (shifts do not cross midnight, polling instead of websockets, immediate plan-change effectiveness, single currency).
---
## 12. Definition of Done (final checklist)
- [ ] Public GitHub repo with `database/schema.sql`, seed, backend, frontend, README.
- [ ] Backend deployed, hosted DB connected, `/api/health` returns 200, seeded.
- [ ] Frontend deployed, connected to live API, all test logins work.
- [ ] Admin can create subscriber + connection, set static IP/POP, change status; duplicate IP gives 409; illegal transitions give 422.
- [ ] Buyer can preview and execute upgrade and downgrade; billing logs show two proration rows; audit row exists.
- [ ] Support can log a master ticket, split into sub-tasks, assign technicians; overlapping and out-of-shift assignments are rejected with a clear conflict message in the UI.
- [ ] Status changes update `rank_index` cleanly with no gaps; drag-and-drop works with rollback on failure.
- [ ] Audit log records status changes, plan changes, and technician (re)assignments.
- [ ] Dashboard charts show live data, SLA breach warnings visible, polling works.
- [ ] Subscriber table: multi-column sort, filters, status badges.
- [ ] Loading, empty and error states present everywhere; UI usable on mobile width.
- [ ] Backend tests pass; frontend builds clean.
---
## 13. Explicitly Out of Scope
Real payment gateways, email/SMS sending, file uploads, WebSockets, multi-tenant support, i18n, password reset flows, refresh tokens, Docker/Kubernetes, CI/CD pipelines beyond platform auto-deploy.
---
## 14. Build Order (time-boxed)
| Phase | Work | Target |
|---|---|---|
| 1 | Repo scaffold, `schema.sql`, seed, DB pool, auth + RBAC, error handling, health | 0:00–0:35 |
| 2 | Subscribers, connections, POPs, plans, audit helper, status machine, static IP | 0:35–1:10 |
| 3 | Deploy skeleton early: hosted DB + Render + Vercel with login working | 1:10–1:30 |
| 4 | Tickets/tasks, status machine, rank handling, overlap validator, technician endpoints | 1:30–2:10 |
| 5 | Marketplace, proration, billing logs, analytics endpoints, backend tests | 2:10–2:40 |
| 6 | Frontend: auth, layout, dashboard, subscribers table | 2:40–3:10 |
| 7 | Frontend: dispatch board (kanban, assign dialog, conflicts), marketplace, audit log | 3:10–3:45 |
| 8 | README, final deploy checks, checklist in Section 12 | 3:45–4:00 |
If time runs short, cut in this order: technician timeline view → dark mode/polish → extra chart variants. **Never cut:** overlap validation, audit trail, rank updates, proration, deployments, README.
---
## 15. Decision Log
Append one line per decision made where this file was silent.
- Rank ordering: per-status global contiguous `rank_index` starting at 0 for both tickets and ticket_tasks; RANK_CHANGED audit only on status change, not pure in-column reorder.
- Language: plain JavaScript (ES modules) for both apps; no TypeScript.
