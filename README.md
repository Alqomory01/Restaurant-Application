# Mise ERP — Kitchen Module

Restaurant ERP, starting with the kitchen module: recipes, daily production planning, batch tracking with atomic ingredient deduction, kitchen stock, stock requests, wastage tracking, role-gated recipe costing, reporting, an audit trail, and a live kitchen dashboard/KDS — in light or dark mode, resilient to a dropped connection.

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

40 tests covering the correctness-critical paths: the atomic batch-completion transaction (success, insufficient-stock rollback, double-completion rejection, cost-drift regression), wastage logging (both the stock-deducting and cost-only paths, the exactly-one-of-ingredient-or-batch rule, role-based value visibility), recipe costing permissions and threshold math, reporting rollups and role-gated money figures, the dashboard's day-over-day comparison figures, production-plan item add/edit/remove guards, the race-safe code sequence under real concurrent threads, and the full auth flow (login/refresh/logout/token-blacklist, audit log writes).

## What's implemented

**Auth** — JWT (access token in Redux, refresh token as an httpOnly cookie), role-scoped to `HEAD_CHEF` / `KITCHEN_STAFF` / `MANAGER`. State lives in `lib/features/authSlice.ts`; `hooks/useAuth()` is the component-facing API (`{ user, loading, login, logout }`).

**Theme** — light/dark, toggled from the top bar, persisted to `localStorage`, applied before first paint (no flash of the wrong theme). One semantic color-token system (`bg`, `surface`, `ink`, `brand`, `success`/`warning`/`danger`/`info`, ...) drives every screen — including the Kitchen Display, which used to be hardcoded dark regardless of the rest of the app.

**Recipes** — ingredients, cooking steps, yield/costing fields. An ingredient's unit (kg, L, g, ...) is defined once on the ingredient itself and reused everywhere — a recipe or a stock row can't silently disagree with it.

**Daily production plans** — a day can hold more than one plan (breakfast/lunch/dinner/all-day are independent `ProductionPlan`s), each shown as its own card. Recipes can be added to or removed from a plan while it's still in `DRAFT`; once a plan is `SUBMITTED` its items are locked (edit/delete of a plan item is rejected server-side once it has a batch, so a stray request can't desync `planned_qty` from what was actually started or cascade-delete real production history). Submitting a plan calculates ingredient requirements across all its items and auto-raises kitchen stock requests for any shortfall, with urgency derived from how soon the batch is scheduled. The Kitchen Display and Dashboard both aggregate items across *all* of today's plans, not just one.

**Kitchen Display System** — polling-based board to start batches from a plan (WebSocket real-time sync is intentionally deferred — see below). Built touch-first rather than as a shrunk-down admin screen: large tap targets, a bold color-coded status bar per card, and a "running late" flag computed from the item's scheduled time — since this is the one screen actually used hands-on at a station, not from a desk.

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

**Dashboard** — live KPIs (batches today, production efficiency, ingredient shortfalls, wastage today), with food-cost figures gated to Manager. Efficiency, wastage, and food-cost tiles show a real day-over-day trend arrow (today vs. yesterday's actual figures — never a fabricated/projected number, and the arrow is only shown once today has its own data to compare) via a shared `TrendIndicator`/`KpiTile` in `components/ui.tsx`.

**Reports** — Head Chef/Manager only, filterable by Today / Last 7 days / This month:
- Production and utilization per recipe (planned vs actual, wasted, and a "utilization %" — produced minus wasted as a share of produced. This stands in for real sell-through until a POS module exists to say what actually sold).
- Wastage broken down by reason, with a running total.
- Per-staff output: batches completed and wastage logged.

Wastage cost figures (per recipe, by reason, per staff, and the overall total) follow the same Manager-only visibility rule as everywhere else in the module.

**Offline/retry handling** — a dropped connection is now a first-class case instead of a dead end:
- The API client (`lib/api.ts`) tells a real network failure (`NetworkError`) apart from a normal error response (`ApiError`) and surfaces an honest message either way, instead of a generic "failed to load".
- Read requests (GET) retry automatically up to twice with backoff on a dropped connection — most transient wifi blips resolve themselves without the user noticing. Writes (POST/PATCH/DELETE) don't auto-retry, since replaying a request that may have already reached the server risks a duplicate; those fail fast with a clear message and the form keeps whatever the user typed, so retrying is just pressing submit again.
- A slim banner at the top of the app (`components/ConnectionBanner.tsx`) tracks real server reachability — not just the browser's `navigator.onLine`, which can say "online" even when the wifi router has no upstream internet — by pinging a lightweight `/api/health/` endpoint on load, on the browser's `offline`/`online` events, and every 20s as a fallback. It clears itself automatically once the connection is back.

**Responsive layout** — the sidebar collapses into an off-canvas drawer (hamburger toggle, backdrop, auto-closes on navigation) below the `lg` breakpoint instead of permanently eating ~200px of a tablet's width. Kitchens run tablets, not widescreen monitors.

**Live alerts** — a toast layer (`components/ToastProvider.tsx`) mounted once at the root, plus `hooks/useKitchenAlerts.ts` polling the dashboard endpoint every 15s while logged in. A new pending stock request (whether auto-raised from a blocked batch or raised by hand) surfaces as a toast with a link to Stock requests, instead of only being discoverable by someone happening to open the dashboard.

**Searchable pickers** — ingredient/recipe/batch `<select>` dropdowns (wastage, stock requests, recipe ingredients, production planning) were replaced with a filter-as-you-type `Combobox` (`components/Combobox.tsx`, keyboard-navigable). A plain `<select>` is fine for a handful of options; it stops being usable once a real kitchen has 100+ ingredients.

## Where this is headed

Mise ERP is being built as a **multi-tenant SaaS product** — sold to restaurant businesses large and small, not just run internally for one — with two planned offerings: a monthly subscription and a one-time enterprise deployment that we maintain under contract. The explicit bar to clear is Orda Africa (the honest apples-to-apples competitor) and Odoo's restaurant module (beatable on depth-for-this-vertical and simplicity, not on Odoo's total feature surface across every business domain).

**Current sequencing decision:** harden the Kitchen module to production-grade before building out multi-tenancy or the other modules — prove the full product works end-to-end for one real operation first. An `Organization` model exists as a lightweight, unenforced stub (same pattern as `Branch`) so new models added between now and then don't need an expensive retrofit later, but no data is actually tenant-scoped yet.

## Known limitations / what's next

Being upfront about what's still missing rather than letting it be a surprise:

- **Reports has no real sell-through yet.** "Utilization" (produced minus wasted) is an honest proxy, not actual units sold — that needs a POS/DineFlow module this kitchen module doesn't have. No exports (CSV/PDF) yet either. Reports also doesn't have trend arrows the way the Dashboard does — its date-range picker (Today / Last 7 days / This month) is the way to compare periods for now.
- **Live alerts cover one signal.** `useKitchenAlerts` only watches for new ingredient shortfalls today — other events worth surfacing (a batch running late, a wastage spike) aren't wired up yet, though the toast layer itself is general-purpose.
- **Multi-tenancy isn't real yet.** `Organization` and `Branch` exist as structural stubs but nothing enforces data isolation between them — fine for one operation, required before this is sold to more than one.
- **API routes aren't versioned** (`/api/kitchen/...` rather than `/api/v1/kitchen/...`).
- FoodOps (procurement/inventory), DineFlow (POS), and the Management module don't exist yet — see `mise_system_flows.html` for the eventual full-system design this kitchen module is the first piece of.
