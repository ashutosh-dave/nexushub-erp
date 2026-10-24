# NexusHub ERP — Architecture

This document explains **why** the system is shaped the way it is. Requirements authority remains [`NEXUSHUB_SPEC.md`](NEXUSHUB_SPEC.md). If anything here conflicts with the SPEC, the SPEC wins.

## 1. Goals and constraints

- Hit every SPEC requirement in a **4-hour** build window, including deploy and README.
- Prefer a **demonstrable** product over polish.
- Locked core: **Node.js + Express.js + MySQL + React** (plain JavaScript only).
- No Redis, queues, GraphQL, microservices, WebSockets, TypeScript, or alternative frameworks.

## 2. Monorepo layout

```
nexushub-erp/
  database/     # schema.sql (mandatory) + optional seed SQL notes
  backend/      # Express API
  frontend/     # Vite React SPA
  NEXUSHUB_SPEC.md
  ARCHITECTURE.md
  README.md
```

**Why one repo:** Single PR/review surface for assessment; shared schema next to API; simpler clone/setup instructions. Frontend and backend still deploy as separate Render/Vercel projects with root directories set per app.

## 3. Backend layering

```
routes → controllers → services → mysql2 (raw SQL)
                ↘ utils (proration, overlap, status, audit)
```

| Layer | Responsibility |
|-------|----------------|
| **Routes** | Path mounting, authn/authz middleware, zod validation entry |
| **Controllers** | Parse request, call one service method, shape `{ data, meta? }` |
| **Services** | Business rules, transactions, audit writes |
| **Utils** | Pure helpers testable without HTTP (proration, overlap, status machines, rank) |

**Why services own rules:** The SPEC requires backend enforcement. Putting lifecycle, overlap, proration, and rank logic in services keeps controllers thin and allows unit tests without Express.

**Why raw `mysql2` SQL (no ORM):** SPEC forbids ORMs that hide MySQL. Parameterised queries keep injection risk low while making joins and `FOR UPDATE` locking explicit for schedule conflict handling.

### Transactions + audit

Any write that touches more than one table (including `audit_logs`) runs inside `withTransaction`. The shared `auditLog(conn, …)` helper uses the **same connection** so a failed business write never leaves orphan audit rows (or vice versa).

### Auth / RBAC

- JWT access tokens (8h), `bcryptjs` password hashes.
- `authenticate` loads the user; `authorize(...roles)` gates every protected route.
- Buyers are linked via `users.subscriber_id` so marketplace mutations can scope to “own” connections.

## 4. Database design (MySQL 8)

InnoDB + utf8mb4. Logical groups:

1. **Reference:** `pops`, `plans`, `subscribers`, `users`
2. **Core:** `connections`, `plan_changes`, `billing_logs`, `technician_shifts`
3. **Workflow:** `tickets`, `ticket_tasks`
4. **Audit:** `audit_logs` (append-only)

**Why separate `plan_changes` and `billing_logs`:** Marketplace needs a durable change record plus two proration ledger rows (credit + charge) for demo clarity and history views.

**Why `technician_shifts` as date + TIME (no midnight cross):** Keeps containment checks simple (`window` date must match `shift_date` and times within range). Documented limitation in README.

**Why CHECK on task windows:** Service still validates; DB CHECK is a last line of defence on MySQL 8.0.16+.

### Rank model (Decision Log)

Both `tickets.rank_index` and `ticket_tasks.rank_index` use **per-status global contiguous indexes starting at 0**.

- Status move → append to destination column, recompact source column (same transaction).
- Pure in-column reorder → no `RANK_CHANGED` audit (avoids noise). Status changes emit `RANK_CHANGED`.

## 5. Core domain rules

### Connection lifecycle

Strict transition matrix (Pending/Active/Suspended/Terminated). Illegal transitions → **422** with allowed next states. Termination releases `static_ip` and audits the release. Duplicate IPv4 → **409**.

### Proration

Effective immediately. Cycle length `N` = days in the calendar month of `billing_cycle_start`. Credits/charges computed in integer cents with **round half up** once per row. One transaction writes: `plan_changes`, two `billing_logs` (`proration`), connection `plan_id` update, audit `PLAN_CHANGED`.

### Tickets / tasks

Shared workflow: `Open → In-Progress → Field Visit → Resolved`. Backward one step only for `support_lead`/`admin`. Ticket cannot resolve while sub-tasks remain open. Tasks cannot leave `Open` without technician + window (UI surfaces as unassigned validation).

### Overlap validation

On assign/reassign/reschedule:

1. `SELECT … FROM users WHERE id = ? FOR UPDATE` (serialise concurrent assigns).
2. Reject window overlaps with other non-Resolved tasks (**409**, list conflicts). Touching endpoints allowed.
3. Reject windows not fully inside a shift that day (**409**).
4. Invalid/past windows → **422**.

## 6. API contract

- Base `/api`, JSON only.
- Success: `{ data, meta? }`; Error: `{ error: { code, message, details } }`.
- 409 for conflicts (IP, schedule); 422 for business/validation rules.

## 7. Frontend architecture

Plain **React 18 SPA** (Vite build tool only — no Next/SSR).

| Concern | Choice | Why |
|---------|--------|-----|
| Styling | Tailwind + shadcn-style primitives | SPEC; fast consistent UI without inventing a design system |
| Server state | TanStack Query v5 | Caching, mutation invalidation, **10s polling** for “live” dashboard/dispatch without WebSockets |
| Tables | TanStack Table v8 | Multi-column sort/filter/pagination required for subscribers |
| Kanban | `@dnd-kit` | Drag status + rank with optimistic UI and rollback |
| Forms | RHF + zod | Aligns with backend zod validation messages |
| HTTP | axios interceptor | Central JWT + 401 → logout |

Role-aware navigation hides routes the JWT role cannot use; API still enforces RBAC.

## 8. Hosting

| Piece | Target | Why |
|-------|--------|-----|
| MySQL | Aiven free or Railway MySQL | SPEC; SSL via `DB_SSL=true` |
| API | Render Web Service (`node src/server.js`) | Long-running Node; health `/api/health` |
| Web | Vercel static Vite + SPA rewrite | Fits SPA; `VITE_API_BASE_URL` points at Render |

CORS is locked to `CORS_ORIGIN` (deployed frontend URL).

## 9. Testing strategy

Vitest unit tests cover pure helpers: overlap, proration, status transitions, rank compaction. These are the highest-risk business rules and do not require a live DB. Supertest can wrap the Express app for route smoke tests when a DB is available.

## 10. Explicit non-goals

Payment gateways, email/SMS, file uploads, WebSockets, multi-tenant, i18n, password reset, refresh tokens, Docker/K8s, custom CI beyond platform auto-deploy.

## 11. Decision Log mirrors

Copied from SPEC for convenience:

- Rank: per-status global contiguous `rank_index` from 0; `RANK_CHANGED` only on status change.
- Language: plain JavaScript (ES modules) for both apps; no TypeScript.
