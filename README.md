# Mise ERP — Kitchen Module

Restaurant ERP, starting with the kitchen module: recipes, daily production planning, batch tracking with atomic ingredient deduction, kitchen stock, stock requests, wastage tracking, role-gated recipe costing, an audit trail, and a live kitchen dashboard/KDS — in light or dark mode.

Stack: **Next.js** (App Router) + **Redux Toolkit** + **Django REST Framework** + **PostgreSQL**, wired together with Docker Compose.

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
| `kitchen_staff` | Kitchen Staff | KDS, batches, recipes, stock, requests, wastage log (can log entries, not their cost). No costing. |
| `head_chef` | Head Chef | All of the above, plus wastage cost figures and a **limited** food-cost trend signal (on target / watch / over target — no numbers). |
| `manager` | Manager | Everything, including full food-cost figures and margins. Also a Django superuser (`/admin` access). |

Use the sun/moon toggle in the top bar to switch light/dark — it's saved per browser and applies everywhere, including the Kitchen Display screen.

## Project layout

```
backend/    Django + DRF API
  apps/accounts/   auth (JWT), User/Organization/Branch/AuditLog models
  apps/kitchen/    all kitchen domain logic
frontend/   Next.js App Router UI
  app/         routes (App Router — no src/ directory)
  components/  shared UI (Shell, ui.tsx, ThemeToggle, StoreProvider)
  hooks/       useAuth (Redux-backed)
  lib/         Redux store + slices (features/), API client, types
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

## Running tests

```bash
cd backend
POSTGRES_HOST=localhost POSTGRES_PORT=5433 ./.venv/Scripts/python manage.py test apps.kitchen apps.accounts
```

27 tests covering the correctness-critical paths: the atomic batch-completion transaction (success, insufficient-stock rollback, double-completion rejection, cost-drift regression), wastage logging (both the stock-deducting and cost-only paths, the exactly-one-of-ingredient-or-batch rule, role-based value visibility), recipe costing permissions and threshold math, the race-safe code sequence under real concurrent threads, and the full auth flow (login/refresh/logout/token-blacklist, audit log writes).

## What's implemented

**Auth** — JWT (access token in Redux, refresh token as an httpOnly cookie), role-scoped to `HEAD_CHEF` / `KITCHEN_STAFF` / `MANAGER`. State lives in `lib/features/authSlice.ts`; `hooks/useAuth()` is the component-facing API (`{ user, loading, login, logout }`).

**Theme** — light/dark, toggled from the top bar, persisted to `localStorage`, applied before first paint (no flash of the wrong theme). One semantic color-token system (`bg`, `surface`, `ink`, `brand`, `success`/`warning`/`danger`/`info`, ...) drives every screen — including the Kitchen Display, which used to be hardcoded dark regardless of the rest of the app.

**Recipes** — ingredients, cooking steps, yield/costing fields. An ingredient's unit (kg, L, g, ...) is defined once on the ingredient itself and reused everywhere — a recipe or a stock row can't silently disagree with it.

**Daily production plans** — submitting a plan calculates ingredient requirements across all its items and auto-raises kitchen stock requests for any shortfall, with urgency derived from how soon the batch is scheduled.

**Kitchen Display System** — polling-based board to start batches from a plan (WebSocket real-time sync is intentionally deferred — see below).

**Batch completion** — a single atomic transaction:
- Checks every required ingredient has enough stock *before* writing anything; if not, the request fails with a 409 listing exactly what's short, instead of allowing the batch through and leaving stock negative.
- Deducts kitchen stock and records theoretical-vs-actual ingredient usage.
- Snapshots each ingredient's unit cost at the moment of the deduction, so a later price change doesn't retroactively rewrite historical food-cost reports.

**Kitchen stock** — on-hand levels with reorder-threshold flags.

**Stock requests** — create + mark fulfilled, each one auto-numbered (`KSR-0001`, ...) via a lock-safe counter that won't collide even if two people raise a request in the same instant.

**Wastage log** — two kinds, both logged the same way but handled differently underneath:
- *Raw ingredient* waste (spoilage, prep trimming, a dropped tray) deducts from kitchen stock, same as if it had gone into a dish — and is blocked with a 409 if there isn't enough on hand.
- *Finished-batch* waste (over-production, didn't sell) points at a completed batch instead. Its ingredients were already deducted when the batch completed, so this only records the cost of the wasted portions, using the recipe's actual cost where known.

Cost figures on wastage entries follow the same visibility rule as recipe costing — everyone can log and see *what* was wasted and why, only Head Chef/Manager see the ₦ value.

**Recipe costing** — role-gated, enforced server-side (not a cosmetic frontend lock):
- Manager sees full theoretical-vs-actual cost and margin figures.
- Head Chef sees a lightweight trend signal per dish (on target / watch / over target) with no figures, so portioning can be corrected on the line without exposing full margin data.
- Kitchen Staff sees neither.

**Audit trail** — every state-changing action (recipe created/updated/deleted, batch started/completed, plan submitted, stock request raised/fulfilled, wastage logged) is recorded with who did it and when, in an append-only log visible to Head Chef and Manager as a "Recent activity" feed on the dashboard.

**Dashboard** — live KPIs (batches today, production efficiency, ingredient shortfalls, wastage today), with food-cost figures gated to Manager.

## Where this is headed

Mise ERP is being built as a **multi-tenant SaaS product** — sold to restaurant businesses large and small, not just run internally for one — with two planned offerings: a monthly subscription and a one-time enterprise deployment that we maintain under contract. The explicit bar to clear is Orda Africa (the honest apples-to-apples competitor) and Odoo's restaurant module (beatable on depth-for-this-vertical and simplicity, not on Odoo's total feature surface across every business domain).

**Current sequencing decision:** harden the Kitchen module to production-grade before building out multi-tenancy or the other modules — prove the full product works end-to-end for one real operation first. An `Organization` model exists as a lightweight, unenforced stub (same pattern as `Branch`) so new models added between now and then don't need an expensive retrofit later, but no data is actually tenant-scoped yet.

## Known limitations / what's next

Being upfront about what's still missing rather than letting it be a surprise:

- **No offline/retry handling on the frontend.** A dropped connection mid-action currently just shows an error with no retry path (the backend transaction itself is safe either way).
- **No Reports screen.** Sell-through, staff output, wastage trends over time, and exports don't exist yet.
- **Multi-tenancy isn't real yet.** `Organization` and `Branch` exist as structural stubs but nothing enforces data isolation between them — fine for one operation, required before this is sold to more than one.
- **API routes aren't versioned** (`/api/kitchen/...` rather than `/api/v1/kitchen/...`).
- FoodOps (procurement/inventory), DineFlow (POS), and the Management module don't exist yet — see `mise_system_flows.html` for the eventual full-system design this kitchen module is the first piece of.
