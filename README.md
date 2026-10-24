# NexusHub ERP

ISP-flavoured demo app: subscriber/connection lifecycle, bandwidth marketplace with prorated billing, hierarchical ticket dispatch with shift/overlap checks, ops analytics, and an append-only audit trail.

Built against [`NEXUSHUB_SPEC.md`](NEXUSHUB_SPEC.md). Design decisions (and the ones we rejected) are in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## What it does

- Admin connection lifecycle (Pending → Active → Suspended → Terminated) with static IP + POP
- B2B/B2C marketplace upgrades/downgrades with proration preview and billing logs
- Master tickets split into field sub-tasks; Kanban dispatch with drag-and-drop ranking
- Technician window overlap + shift containment (HTTP 409 when it conflicts)
- Ops dashboard (Recharts) with SLA breach / at-risk panels; 10s polling, no sockets
- Append-only audit log for status, plan, IP, and tech assignment changes
- Buyer self-signup (creates subscriber + Active starter connection)
- Ticket notes timeline in the dispatch drawer; dismissible per-role tips in the shell

## Architecture overview

```
React (Vite SPA / Vercel)  --JWT/REST-->  Express (Render)  -->  MySQL 8 (Aiven)
                                              |
                              routes → controllers → services
                                              |
                                    mysql2 raw SQL + audit_logs
                                    (same DB transaction as the write)
```

“Live” boards poll every 10s via TanStack Query. Details and trade-offs: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20+ |
| API | Express.js 4 |
| Database | MySQL 8 (InnoDB, utf8mb4) via `mysql2/promise` (raw SQL, no ORM) |
| Validation | zod |
| Auth | JWT (8h) + bcryptjs |
| Frontend | React 18 + Vite (JavaScript/JSX) |
| UI | Tailwind CSS + shadcn-style components |
| Data UI | TanStack Query v5, TanStack Table v8, Recharts, @dnd-kit |
| Deploy | Aiven MySQL + Render (API) + Vercel (SPA) |

## Local setup

### Prerequisites

- Node.js 20+
- MySQL 8 (local or remote)

### 1. Clone and install

```bash
git clone https://github.com/ashutosh-dave/nexushub-erp.git
cd nexushub-erp
cd backend && npm install
cd ../frontend && npm install
```

### 2. Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill DB credentials and `JWT_SECRET`. Frontend needs `VITE_API_BASE_URL` (local default is usually `http://localhost:5000/api`).

### 3. Database

```bash
cd backend
npm run db:migrate   # runs database/schema.sql (destructive on existing tables)
npm run db:seed      # demo users + subscribers, tickets, shifts
```

Additive patches on an already-seeded hosted DB (e.g. `ticket_notes`):

```bash
npm run db:migrate:up
```

### 4. Run

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

- API: http://localhost:5000  
- Health: http://localhost:5000/api/health  
- Web: http://localhost:5173  

## Environment variables

### Backend (`backend/.env`)

| Variable | Meaning |
|----------|---------|
| `NODE_ENV` | `development` / `production` |
| `PORT` | HTTP port (default `5000`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL connection |
| `DB_SSL` | `true` when the host requires SSL (Aiven) |
| `JWT_SECRET` | Signing secret for access tokens |
| `JWT_EXPIRES_IN` | e.g. `8h` |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated |

### Frontend (`frontend/.env`)

| Variable | Meaning |
|----------|---------|
| `VITE_API_BASE_URL` | API base including `/api`, e.g. `http://localhost:5000/api` |

## Database

Schema: [`database/schema.sql`](database/schema.sql)

**ER summary**

- `subscribers` 1—* `connections` → `plans`, `pops`
- `connections` 1—* `plan_changes` / `billing_logs`
- `users` (roles); buyers link via `subscriber_id`
- `tickets` 1—* `ticket_tasks` (optional `technician_id` + dispatch window)
- `tickets` 1—* `ticket_notes` (append-only timeline)
- `technician_shifts` per technician/date
- `audit_logs` append-only

## Business rules (summary)

- **Connection statuses:** only allowed transitions; Terminated is final; terminate releases static IP. Illegal transition → 422; duplicate IPv4 → 409.
- **Proration:** immediate effect; credit old + charge new for remaining days in cycle; two `billing_logs` rows + `plan_changes` + audit in one transaction. Math in integer cents, round half up per row.
- **Workflow:** Open → In-Progress → Field Visit → Resolved (one step). Lead/admin may step back one. Ticket resolve blocked while sub-tasks remain open. Tasks cannot leave Open without technician + window.
- **Overlap:** lock technician with `FOR UPDATE`; non-Resolved windows must not overlap; window must sit inside a shift; touching boundaries OK → else 409.
- **Rank:** per-status global contiguous `rank_index` from 0; status move recompacts; in-column reorder is not audited.
- **Audit:** status, plan, tech assign/reassign/unassign, connection create/status/IP, ticket `NOTE_ADDED`.

## API reference

Base path: `/api`. Auth: `Authorization: Bearer <token>` except `/health`, `/auth/login`, and `/auth/register`.

Envelope: `{ "data": ... }` or list `{ "data": ..., "meta": { "page", "pageSize", "total" } }`  
Errors: `{ "error": { "code", "message", "details" } }`

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }` (rate-limited) |
| POST | `/auth/register` | public | buyer self-serve: `{ name, email, password, segment: B2C\|B2B }` → `{ token, user }`; creates subscriber + Active starter connection; 409 on duplicate email; cannot register as admin/support/tech |
| GET | `/auth/me` | any auth | current user |
| GET | `/health` | public | liveness + DB ping |
| GET/POST/PATCH | `/pops` | read any; write admin | utilisation on list |
| GET/POST/PATCH | `/plans` | buyers see active only | filters segment/speed |
| GET/POST/PATCH | `/subscribers` | read support+; write admin | multi-column sort |
| GET/POST/PATCH | `/connections` | admin writes; status PATCH | IP 409; illegal status 422 |
| GET | `/connections/:id/history` | support+ | audit+billing+plan changes |
| GET/POST | `/marketplace/*` | buyer/admin | packages, change-plan, preview, billing |
| GET/POST/PATCH | `/tickets`, `/tasks` | support roles; tech own tasks | reorder, assign, status |
| GET/POST | `/tickets/:id/notes` | support+admin; tech if assigned | append-only notes |
| GET/POST/DELETE | `/technicians`, `/technician-shifts` | lead/admin manage shifts | available?start&end |
| GET | `/analytics/overview` | support+ | KPIs + distributions |
| GET | `/analytics/connections-trend` | support+ | `?days=` |
| GET | `/analytics/tickets-trend` | support+ | `?days=` |
| GET | `/audit-logs` | admin, support_lead | filters + pagination |

Example login response:

```json
{
  "data": {
    "token": "<jwt>",
    "user": { "id": 1, "email": "admin@nexushub.test", "role": "admin", "name": "Admin User" }
  }
}
```

## Test logins

Password for all: **`Password@123`**

| Email | Role |
|-------|------|
| `admin@nexushub.test` | admin |
| `lead@nexushub.test` | support_lead |
| `agent@nexushub.test` | support_agent |
| `tech1@nexushub.test` | technician |
| `tech2@nexushub.test` | technician |
| `tech3@nexushub.test` | technician |
| `buyer@nexushub.test` | buyer (B2C) |
| `buyer.b2b@nexushub.test` | buyer (B2B) |

## Repository

https://github.com/ashutosh-dave/nexushub-erp

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://nexushub-erp.vercel.app |
| Backend | https://nexushub-erp.onrender.com |
| Health | https://nexushub-erp.onrender.com/api/health |

Free Render may cold-start slowly (~30–60s) on the first request after idle. Test login: `admin@nexushub.test` / `Password@123`.

### Deployment notes

Step-by-step: [`DEPLOY.md`](DEPLOY.md). Short version:

1. Provision MySQL on **Aiven** (Railway MySQL was dropped as unreliable for this build). Enable SSL (`DB_SSL=true`).
2. From a machine with DB access: set `backend/.env`, run `npm run db:migrate` then `npm run db:seed`. Later schema adds: `npm run db:migrate:up`.
3. **Render:** Web Service, root `backend`, start `node src/server.js`, health `/api/health`, set env vars including `CORS_ORIGIN` = Vercel URL.
4. **Vercel:** root `frontend`, framework Vite, env `VITE_API_BASE_URL` = `https://nexushub-erp.onrender.com/api`. SPA rewrite in `frontend/vercel.json`.

## Tests

```bash
cd backend && npm test
```

Covers overlap detection, proration math, status transition matrix, and rank compaction.

Frontend production build:

```bash
cd frontend && npm run build
```

## Known limitations / assumptions

- Technician shifts do **not** cross midnight.
- “Live” updates use TanStack Query polling (10s), not WebSockets.
- Plan changes take effect **immediately** (effective date = today UTC date).
- Single currency amounts (decimal as stored; no FX).
- Seed is safe to re-run only on empty `users` table (skips if data present).
- Full `db:migrate` drops/recreates tables — use `db:migrate:up` on hosted DBs that already have data.
