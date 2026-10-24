# NexusHub ERP — Architecture

This is the “why” document: product requirements drove the stack and domain rules; this file records what we chose, what we rejected, and the trade-offs.

---

## Shape of the system

```
React SPA (Vite / Vercel)
        │  JWT + REST, 10s polling where “live” matters
        ▼
Express API (Render)     routes → controllers → services → mysql2
        │                      ↘ utils (proration, overlap, status, rank)
        ▼
MySQL 8 (Aiven)          schema.sql + additive migrations/
```

Three deployable pieces, one git repo. Frontend never talks to MySQL; business rules never live only in React.

---

## Monorepo

**What we did.** One repo: `database/`, `backend/`, `frontend/`, plus README / this file / deploy notes.

**Why.** One clone for the full stack. Schema sits next to the API that depends on it. Deploy still splits cleanly (Render root = `backend`, Vercel root = `frontend`).

**What else we considered.** Separate repos for API and UI; a npm/pnpm workspace with shared packages.

**Why we rejected that.** Split repos mean two PRs and duplicated env docs for a project this size. Workspaces buy little when there is no shared TypeScript package to publish — both sides are plain JS with different runtimes.

**Trade-offs.** You cannot version API and UI independently. A bad frontend commit still sits next to a good backend one. For this size of project that is fine.

---

## Express layering (controllers / services / utils)

**What we did.**

```
routes  →  mount path, authn/authz, zod via validate middleware
controllers  →  parse request, call one service, return { data, meta? }
services  →  rules, transactions, audit writes
utils  →  pure helpers (proration, overlap, status machines, rank math)
```

**Why.** Connection lifecycle, proration, and dispatch rules belong on the backend service layer, not only in the UI. Thin controllers keep HTTP concerns out of the domain. Pure utils are what Vitest covers without spinning up Express or MySQL.

**What else we considered.** Fat controllers; a “use case” / hexagonal folder tree; Nest-style modules.

**Why we rejected that.** Fat controllers make overlap/proration hard to unit-test. Hexagonal layout is ceremony for ~a dozen modules. Nest would pull in a heavier framework and DI model we did not need for this API surface.

**Trade-offs.** Services can get long (`taskService`, `ticketService`). We accept that over inventing more layers mid-build. Controllers stay boring on purpose.

Any write that touches more than one table — including `audit_logs` — goes through `withTransaction`. `auditLog(conn, …)` always uses the **same** connection so a rolled-back business write cannot leave a lone audit row (or the reverse).

---

## Raw mysql2 vs ORM

**What we did.** `mysql2/promise` pool, parameterised SQL only. No Prisma / Sequelize / Knex query builder as the primary SQL layer.

**Why.** Schedule conflict handling needs an explicit `SELECT … FOR UPDATE` on the technician row; we wanted that visible in the service, not buried in an ORM API. Parameterised SQL keeps MySQL semantics obvious for locking and multi-table transactions.

**What else we considered.** Prisma (or Sequelize) for migrations and typed models; Knex for query building only.

**Why we rejected that.** ORMs would hide the locking path we care about most. Knex still obscures locking semantics and adds a dependency for little gain once you are writing multi-table transactions by hand.

**Trade-offs.** More SQL strings to maintain; no automatic schema sync from models. Migrations are SQL files we run deliberately (`db:migrate` for full schema, `db:migrate:up` for additive patches). Injection risk stays low because every bind goes through `?` placeholders.

---

## MySQL (not Postgres) — and how we host it

**What we did.** MySQL 8, InnoDB, utf8mb4. Hosted on **Aiven** free MySQL with `DB_SSL=true`. API on **Render**, SPA on **Vercel**.

**Why.** Product target was MySQL (not Postgres, Mongo, or SQLite) for a familiar ISP-ops schema and InnoDB transactions. Split hosting matches how we wanted to ship: Render for a long-running Node process with `/api/health`, Vercel for a static Vite build + SPA rewrite, hosted MySQL with SSL when the provider requires it.

**What else we considered.**

- **Postgres** — common default for Node apps, nicer JSON/CHECK story in some shops.
- **Railway MySQL** — we tried the free-tier path early.
- **One platform for everything** (e.g. all on Railway or all on Render).

**Why we rejected that.** Postgres would mean reworking ENUM/CHECK habits and departing from the MySQL-first product choice. Railway MySQL was abandoned as unreliable for this build (see `DEPLOY.md`); Aiven held a stable connection. Collapsing API + DB + SPA onto one vendor would still leave CORS/`VITE_API_BASE_URL` work and did not outweigh a stable Aiven + Render + Vercel split.

**Trade-offs.** Three vendors, three dashboards, cold starts on free Render (~30–60s after idle). CORS must be set to the Vercel origin. Schema changes on a live Aiven DB must be additive (`migrate:up`) because full `schema.sql` drops tables.

---

## Auth: JWT + roles

**What we did.** Access JWT (8h), `bcryptjs` hashes, `authenticate` then `authorize(...roles)` on every protected route. Buyers carry `users.subscriber_id` so marketplace mutations can scope to “own” connections. Login is rate-limited.

**Why.** Matches the product RBAC matrix (admin, support_lead, support_agent, technician, buyer). Stateless tokens fit a SPA on a different origin without session cookies / CSRF theatre.

**What else we considered.** Session cookies + server sessions; refresh tokens; role checks only in the frontend nav.

**Why we rejected that.** Sessions need shared sticky storage or a session table we did not want. Refresh tokens are out of scope for this release. Frontend-only RBAC is insufficient — the API must reject forbidden roles.

**Trade-offs.** Stolen JWT works until expiry (no revoke list). Role changes need a new login. Nav hides routes the role cannot use; that is UX only — enforcement is middleware.

---

## No WebSockets (polling)

**What we did.** TanStack Query `refetchInterval: 10s` on the dashboard and dispatch board, paused when the tab is hidden.

**Why.** “Live” ops boards are polling-based by design — no WebSocket infra. Ten seconds is enough to see SLA / board movement without building a socket layer.

**What else we considered.** Socket.io / native WebSockets; SSE; shorter intervals (2–3s).

**Why we rejected that.** Sockets need sticky sessions or a pub/sub we do not have. Aggressive polling burns free-tier CPU for little operational benefit.

**Trade-offs.** Two operators editing the same board can briefly diverge until the next poll. Optimistic UI on drag-and-drop covers the interactive path; polling covers “someone else changed something.”

---

## Plain JavaScript, not TypeScript

**What we did.** ES modules + JSX on both apps. JSDoc on the hotter helpers. No `tsc`.

**Why.** Keep the stack small and ship without a compile step. Zod at the HTTP boundary and Vitest on the math cover the failure modes that matter for billing and schedules.

**What else we considered.** TypeScript everywhere; JSDoc-as-types with `checkJs`.

**Why we rejected that.** Full TypeScript would add config and build friction without changing runtime behaviour for this codebase. Full `checkJs` would burn time fighting `mysql2` row shapes.

**Trade-offs.** Refactors are greppier than compiler-guided. Zod + Vitest catch the sharp edges; we accept looser static typing on React props and service returns.

---

## Frontend: shadcn / TanStack vs bare React

**What we did.** React 18 + Vite SPA. Tailwind + shadcn-style primitives. TanStack Query v5 for server state. TanStack Table v8 for subscribers. `@dnd-kit` for kanban. RHF + zod for forms. Axios interceptor for JWT / 401 → logout.

**Why.** Subscribers need multi-column sort/filter/pagination; Query gives cache invalidation and the 10s poll in one place; shadcn-style primitives get accessible dialogs without inventing a design system from scratch.

**What else we considered.** Bare React + `fetch` + hand-rolled tables; Next.js / Remix for routing and SSR.

**Why we rejected that.** Bare React would mean rebuilding table state, cache invalidation, and dialog a11y. Meta-frameworks would change the deploy model (we want a plain SPA on Vercel).

**Trade-offs.** Bundle is heavier than a minimal CRA-style app. shadcn here is “copied primitives,” not a full shadcn CLI project — enough UI consistency, not a component marketplace.

---

## Ticket notes (additive)

**What we did.** `ticket_notes` table (`ticket_id`, `author_id`, `body`, `created_at`). `GET/POST /tickets/:id/notes`. Notes show in the ticket drawer timeline. Support + admin always; technicians only if assigned to a sub-task on that ticket. Audited as `NOTE_ADDED`. Hosted DBs get the table via `npm run db:migrate:up` (`database/migrations/001_ticket_notes.sql`) without wiping data.

**Why.** Dispatch needs a place for “what we tried on-site” without abusing ticket description edits. Append-only keeps a simple timeline.

**What else we considered.** Stuffing notes into `tickets.description`; a generic comments table across entities; editing/deleting notes.

**Why we rejected that.** Description edits destroy history and fight “who said what.” Cross-entity comments were out of scope. Edits/deletes would break the append-only story and need extra RBAC.

**Trade-offs.** No edit/delete. Technicians without an assignment cannot note — intentional, so the board does not fill with drive-by comments.

---

## Rank model

**What we did.** Both `tickets.rank_index` and `ticket_tasks.rank_index` are **per-status global contiguous indexes starting at 0**. Status move → append to destination column, recompact source (same transaction). Pure in-column reorder → no `RANK_CHANGED` audit. Status changes emit `RANK_CHANGED`.

**Why.** Ticket-scoped vs global task ordering was ambiguous; we picked one. Global-per-status matches the dispatch board (one column = one status across tickets) and keeps one code path in `rankService`.

**What else we considered.** Per-ticket task ranks only; fractional ranks (0.5 inserts); auditing every drag.

**Why we rejected that.** Per-ticket ranks make the global dispatch board an awkward secondary sort. Fractional ranks avoid recompaction but complicate “contiguous from 0” and demos. Auditing every reorder floods `audit_logs`.

**Trade-offs.** Two clients reordering the same column can last-write-win; we rely on refetch after mutation. Compaction is O(n) updates per column — fine at seed scale, not a million-card board.

---

## Overlap validation + `FOR UPDATE`

**What we did.** On assign / reassign / reschedule, inside a transaction:

1. `SELECT … FROM users WHERE id = ? FOR UPDATE` (serialise concurrent assigns to that tech).
2. Reject overlapping non-Resolved windows (**409**, list conflicts). Touching endpoints allowed.
3. Reject windows not fully inside a shift that day (**409**).
4. Invalid / past windows → **422**.

Resolved tasks do not block. Self-exclusion on the task being edited is mandatory. Same tech + same window reassign is a no-op (no audit).

**Why.** Two leads assigning the same tech in the same second is a real race in dispatch. Row lock + overlap math is the critical path for schedule integrity.

**What else we considered.** Application-level mutex / Redis lock; unique constraints on time ranges; optimistic “check then write” without locking.

**Why we rejected that.** No Redis in stack. MySQL range exclusion constraints are awkward for “touching OK, overlap bad, ignore Resolved.” Check-then-write without `FOR UPDATE` loses under concurrency.

**Trade-offs.** Locks the technician’s `users` row for the transaction duration — good for correctness, slightly coarse. Shifts do not cross midnight (documented); overnight windows are out of scope.

---

## Proration

**What we did.** Plan changes take effect **immediately** (effective date = today UTC date). Cycle length `N` = days in the calendar month of `billing_cycle_start`. Credit old + charge new for `days_remaining`; compute in integer cents, **round half up** once per row. One transaction: `plan_changes`, two `billing_logs` (`entry_type = proration`), update `connections.plan_id`, audit `PLAN_CHANGED`. Preview endpoint returns the same numbers before confirm.

**Why.** Product billing rule is immediate mid-cycle change with explicit credit + charge lines. Two ledger rows make the change obvious in the billing table. Preview stops “surprise charge” in the UI.

**What else we considered.** End-of-cycle deferred changes; a single net `billing_logs` row; floating-point only.

**Why we rejected that.** Deferred effective dates need a scheduler we do not have. A single net row hides credit vs charge. Float-only math fails leap-February / last-day cases we test explicitly.

**Trade-offs.** Immediate effect is harsh for real ISPs (no “scheduled downgrade”). Cycle tied to calendar month of `billing_cycle_start` is a simplification of real billing calendars.

---

## Signup extension

**What we did.** Public `POST /auth/register` for **buyers only**: name, email, password, segment (`B2C` | `B2B`). Creates subscriber + Active starter connection (cheapest active plan for segment, first POP), returns JWT like login. Duplicate email → **409**. Cannot self-register as admin / support / tech. Login page has a Sign up tab.

**Why.** Seeded buyers work for demos, but operators often want to click through marketplace as a fresh user. Register wires subscriber + connection in one transaction so Marketplace is usable immediately.

**What else we considered.** Admin-only user creation; invite tokens; registering without an Active connection.

**Why we rejected that.** Admin-only slows a marketplace demo. Invites need email (out of scope). A buyer with no connection makes Marketplace a dead end.

**Trade-offs.** Placeholder phone/address on self-registered subscribers. Starter plan is “cheapest active,” not a curated trial SKU. Still no password reset (out of scope).

---

## UX role tips

**What we did.** `RoleTipBanner` under the shell: one short tip per role (admin, lead, agent, tech, buyer), dismissible into `localStorage` (`nexushub-tip-<role>`).

**Why.** Five roles share one app; first login is confusing without a sentence of orientation. Tips are copy only — they do not change permissions.

**What else we considered.** Onboarding wizard / empty-state tours; role-specific home redirects only.

**Why we rejected that.** Wizards burn time and annoy second visits. Redirects alone do not explain *what to do* on the page you land on.

**Trade-offs.** Easy to ignore; tips can go stale if nav labels change. Deliberately not a product-analytics experiment — just a dismissible hint.

---

## Database sketch (what the schema is doing)

Logical groups in `database/schema.sql`:

1. **Reference** — `pops`, `plans`, `subscribers`, `users`
2. **Core** — `connections`, `plan_changes`, `billing_logs`, `technician_shifts`
3. **Workflow** — `tickets`, `ticket_tasks`, `ticket_notes`
4. **Audit** — `audit_logs` (append-only; no update/delete API)

Separate `plan_changes` vs `billing_logs` so marketplace history has a durable change record *and* two proration ledger lines. Shifts are date + TIME (no midnight cross) so containment checks stay simple. Task window CHECKs exist where MySQL allows; the service still validates.

---

## API contract (short)

Base `/api`, JSON only. Success `{ data, meta? }`; errors `{ error: { code, message, details } }`. **409** for conflicts (IP, schedule); **422** for business/validation rules. Full route table lives in the README.

---

## Testing stance

Vitest covers the sharp edges without a live DB: overlap, proration, status transitions, rank compaction. Those are the rules that hurt if wrong. Supertest can wrap the Express app when a DB is available; the mandatory bar is the pure helpers above.

---

## Explicit non-goals

Payment gateways, email/SMS, file uploads, WebSockets, multi-tenant, i18n, password reset, refresh tokens, Docker/K8s, custom CI beyond platform auto-deploy.

---

## What we’d improve with more time

- Soften free-tier cold starts (paid Render, or a cheap always-on box) and document a warmer health ping if demos keep timing out.
- Replace contiguous recompaction with a strategy that scales past demo board sizes, or at least add a unique `(status, rank_index)` guard where MySQL cooperates.
- Real migration history (numbered forward-only) instead of “full wipe schema” + one additive file — fine for a small project, awkward for a long-lived Aiven instance.
- Password reset and JWT revoke/refresh if this left demo-land.
- Overnight shifts and deferred plan-change effective dates — both were conscious simplifications.
- Slightly richer signup (real address/phone, chosen starter plan) without opening admin self-registration.
- A couple of authenticated API smoke tests against a disposable DB so route wiring is covered the same way the math is.

None of that blocks the current product surface; it is where a follow-up iteration would go.
