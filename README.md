# NexusHub ERP

Distributed broadband marketplace and field-operations platform for ISP administrators: subscriber/connection lifecycle, bandwidth marketplace with prorated billing, hierarchical complaint dispatch with shift/overlap validation, live operations analytics, and a full audit trail.

**Source of truth:** [`NEXUSHUB_SPEC.md`](NEXUSHUB_SPEC.md)  
**Design rationale:** [`ARCHITECTURE.md`](ARCHITECTURE.md)

## Features

- Admin connection lifecycle (Pending → Active → Suspended → Terminated) with static IP + POP assignment
- B2B/B2C marketplace upgrades/downgrades with proration preview and billing logs
- Master tickets split into field sub-tasks; Kanban dispatch with drag-and-drop ranking
- Strict technician window overlap + shift containment checks (HTTP 409)
- Operations dashboard (Recharts) with SLA breach / at-risk panels and 10s polling
- Append-only audit log for status, plan, IP, and technician assignment changes

## Architecture overview

```
React (Vite SPA)  --JWT/REST-->  Express API (Render)  -->  MySQL 8 (Aiven/Railway)
                                      |
                      controllers → services (+ transactions)
                                      |
                                 audit_logs (same TX)
```

Layering and transaction/audit flow are detailed in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20+ |
| API | Express.js 4 |
| Database | MySQL 8 (InnoDB, utf8mb4) via `mysql2/promise` (raw SQL) |
| Validation | zod |
| Auth | JWT + bcryptjs |
| Frontend | React 18 + Vite (JavaScript/JSX) |
| UI | Tailwind CSS + shadcn-style components |
| Data UI | TanStack Query v5, TanStack Table v8, Recharts, @dnd-kit |
| Deploy | MySQL host + Render (API) + Vercel (SPA) |

## Local setup

### Prerequisites

- Node.js 20+
- MySQL 8 reachable locally or remotely

### 1. Clone and install

```bash
git clone <repo-url> nexushub-erp
cd nexushub-erp
cd backend && npm install
cd ../frontend && npm install
```

### 2. Environment

Copy examples and fill values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 3. Database

```bash
cd backend
npm run db:migrate   # runs database/schema.sql
npm run db:seed      # demo users + 40+ subscribers, tickets, shifts
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
| `DB_SSL` | `true` when the host requires SSL (Aiven/Railway) |
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
- `users` (roles) ; buyers link via `subscriber_id`
- `tickets` 1—* `ticket_tasks` (optional `technician_id` + dispatch window)
- `technician_shifts` per technician/date
- `audit_logs` append-only

## Business rules (summary)

- **Connection statuses:** only allowed transitions; Terminated is final; terminate releases static IP.
- **Proration:** immediate effect; credit old + charge new for remaining days in cycle; two `billing_logs` rows + `plan_changes` + audit in one transaction.
- **Workflow:** Open → In-Progress → Field Visit → Resolved (one step); lead/admin may step back; ticket resolve blocked by open tasks.
- **Overlap:** non-Resolved task windows must not overlap; window must sit inside a shift; touching boundaries OK → else 409.
- **Rank:** per-status global contiguous `rank_index` from 0; status move recompacts; in-column reorder is not audited.
- **Audit:** status, plan, tech assign/reassign/unassign, connection create/status/IP.

## API reference

Base path: `/api`. Auth: `Authorization: Bearer <token>` except `/health` and `/auth/login`.

Envelope: `{ "data": ... }` or list `{ "data": ..., "meta": { "page", "pageSize", "total" } }`  
Errors: `{ "error": { "code", "message", "details" } }`

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | any auth | current user |
| GET | `/health` | public | liveness + DB ping |
| GET/POST/PATCH | `/pops` | read any; write admin | utilisation on list |
| GET/POST/PATCH | `/plans` | buyers see active only | filters segment/speed |
| GET/POST/PATCH | `/subscribers` | read support+; write admin | multi-column sort |
| GET/POST/PATCH | `/connections` | admin writes; status PATCH | IP 409; illegal status 422 |
| GET | `/connections/:id/history` | support+ | audit+billing+plan changes |
| GET/POST | `/marketplace/*` | buyer/admin | packages, change-plan, preview, billing |
| GET/POST/PATCH | `/tickets`, `/tasks` | support roles; tech own tasks | reorder, assign, status |
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

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | _pending deploy — set after Vercel_ |
| Backend | _pending deploy — set after Render_ |
| Health | `{BACKEND}/api/health` |

### Deployment notes

1. Provision MySQL (Aiven or Railway). Enable SSL if required (`DB_SSL=true`).
2. From a machine with DB access: set `backend/.env`, run `npm run db:migrate` then `npm run db:seed`.
3. **Render:** Web Service, root `backend`, start `node src/server.js`, health `/api/health`, set env vars including `CORS_ORIGIN` = Vercel URL.
4. **Vercel:** root `frontend`, framework Vite, env `VITE_API_BASE_URL` = `https://<render-host>/api`. SPA rewrite in `frontend/vercel.json`.

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
