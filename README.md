# Mise ERP — Kitchen Module

Restaurant ERP, starting with the kitchen module: recipes, daily production planning, batch tracking with atomic ingredient deduction, kitchen stock, stock requests, role-gated recipe costing, an audit trail, and a live kitchen dashboard/KDS.

Stack: **Next.js** (App Router) + **Django REST Framework** + **PostgreSQL**, wired together with Docker Compose.

## Run it

```bash
cp .env.example .env   # defaults work as-is for local dev
docker compose up -d --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api
- Django admin: http://localhost:8000/admin
- Postgres (host access, e.g. via psql/DBeaver): `localhost:5433` (remapped from 5432 to avoid clashing with a locally installed Postgres)

On first boot the backend container runs migrations and seeds demo data automatically (`seed_kitchen_demo`).

### Demo users

All demo users share the password `MiseDemo123!`:

| Username | Role | Can see |
|---|---|---|
| `kitchen_staff` | Kitchen Staff | KDS, batches, recipes, stock, requests. No costing. |
| `head_chef` | Head Chef | All of the above, plus a **limited** food-cost trend signal (on target / watch / over target — no figures). |
| `manager` | Manager | Everything, including full food-cost figures and margins. Also a Django superuser (`/admin` access). |

## Project layout

```
backend/    Django + DRF API
  apps/accounts/   auth (JWT), User/Branch/AuditLog models
  apps/kitchen/    all kitchen domain logic
frontend/   Next.js App Router UI
  app/        routes (App Router — no src/ directory)
  components/ shared UI
  context/    auth context
  lib/        API client, types
docker-compose.yml
```

## Local (non-Docker) backend dev

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # (or .venv/bin/pip on macOS/Linux)
docker compose up -d db   # just the database
POSTGRES_HOST=localhost POSTGRES_PORT=5433 ./.venv/Scripts/python manage.py migrate
POSTGRES_HOST=localhost POSTGRES_PORT=5433 ./.venv/Scripts/python manage.py seed_kitchen_demo
POSTGRES_HOST=localhost POSTGRES_PORT=5433 ./.venv/Scripts/python manage.py runserver
```

## Local (non-Docker) frontend dev

```bash
cd frontend
npm install
npm run dev
```

Before pushing: `npx tsc --noEmit && npm run build` on the frontend, `python manage.py check` on the backend. See `CONTRIBUTING.md` for the full workflow.

## What's implemented

**Auth** — JWT (access token in memory, refresh token as an httpOnly cookie), role-scoped to `HEAD_CHEF` / `KITCHEN_STAFF` / `MANAGER`.

**Recipes** — ingredients, cooking steps, yield/costing fields. An ingredient's unit (kg, L, g, ...) is defined once on the ingredient itself and reused everywhere — a recipe or a stock row can't silently disagree with it.

**Daily production plans** — submitting a plan calculates ingredient requirements across all its items and auto-raises kitchen stock requests for any shortfall, with urgency derived from how soon the batch is scheduled.

**Kitchen Display System** — polling-based board to start batches from a plan (WebSocket real-time sync is intentionally deferred — see below).

**Batch completion** — a single atomic transaction:
- Checks every required ingredient has enough stock *before* writing anything; if not, the request fails with a 409 listing exactly what's short, instead of allowing the batch through and leaving stock negative.
- Deducts kitchen stock and records theoretical-vs-actual ingredient usage.
- Snapshots each ingredient's unit cost at the moment of the deduction, so a later price change doesn't retroactively rewrite historical food-cost reports.

**Kitchen stock** — on-hand levels with reorder-threshold flags.

**Stock requests** — create + mark fulfilled, each one auto-numbered (`KSR-0001`, ...) via a lock-safe counter that won't collide even if two people raise a request in the same instant.

**Recipe costing** — role-gated, enforced server-side (not a cosmetic frontend lock):
- Manager sees full theoretical-vs-actual cost and margin figures.
- Head Chef sees a lightweight trend signal per dish (on target / watch / over target) with no figures, so portioning can be corrected on the line without exposing full margin data.
- Kitchen Staff sees neither.

**Audit trail** — every state-changing action (recipe created/updated/deleted, batch started/completed, plan submitted, stock request raised/fulfilled) is logged with who did it and when, in an append-only log visible to Head Chef and Manager as a "Recent activity" feed on the dashboard.

**Dashboard** — live KPIs (batches today, production efficiency, ingredient shortfalls), with the food-cost KPI gated to Manager.

## Known limitations / what's next

Being upfront about what's still missing rather than letting it be a surprise:

- **No wastage tracking yet.** Over-production and prep waste aren't captured anywhere, despite being one of the biggest controllable costs in a kitchen. Next up.
- **No automated tests.** The atomic stock deduction, costing math, and permission checks are all correctness-critical and currently only verified by hand.
- **No offline/retry handling on the frontend.** A dropped connection mid-action currently just shows an error with no retry path (the backend transaction itself is safe either way).
- **No Reports screen.** Sell-through, staff output, wastage cost, and exports don't exist yet.
- **Multi-branch is a stub.** Every model has a `branch` field but nothing enforces it — fine for a single location, would need real scoping before a second branch goes live.
- **API routes aren't versioned** (`/api/kitchen/...` rather than `/api/v1/kitchen/...`).
- FoodOps (procurement/inventory), DineFlow (POS), and the Management module don't exist yet — see `mise_system_flows.html` for the eventual full-system design this kitchen module is the first piece of.
