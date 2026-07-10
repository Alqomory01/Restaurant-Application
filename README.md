# Mise ERP — Kitchen Module

Restaurant ERP, starting with the kitchen module: recipes, daily production planning, batch tracking with atomic ingredient deduction, kitchen stock, stock requests, wastage tracking, role-gated recipe costing, reporting, an audit trail, and a live kitchen dashboard/KDS — in light or dark mode, resilient to a dropped connection. A frontend-only prototype of the **Store module** (suppliers, item master, purchase orders, goods receiving) sits alongside it — see *Store module* below.

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
  app/         routes (App Router — no src/ directory); app/(app)/store/* is the Store module
  components/  shared UI (Shell, ui.tsx, ThemeToggle, StoreProvider)
  hooks/       useAuth (Redux-backed)
  lib/         Redux store + slices (features/), API client, types
  lib/foodops/ Store module's types/mock data/state — frontend-only, no backend yet
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

52 tests covering the correctness-critical paths: the atomic batch-completion transaction (success, insufficient-stock rollback, double-completion rejection, cost-drift regression, concurrent-request race), wastage logging (both the stock-deducting and cost-only paths, the exactly-one-of-ingredient-or-batch rule, role-based value visibility), recipe costing permissions and threshold math, reporting rollups and role-gated money figures, the dashboard's day-over-day comparison figures, production-plan item add/edit/remove guards (both the standalone endpoint and the diff-based whole-plan sync), plan duplication, diff-based recipe ingredient/step sync, the race-safe code sequence under real concurrent threads, and the full auth flow (login/refresh/logout/token-blacklist, audit log writes).

## What's implemented

**Auth** — JWT (access token in Redux, refresh token as an httpOnly cookie), role-scoped to `HEAD_CHEF` / `KITCHEN_STAFF` / `MANAGER`. State lives in `lib/features/authSlice.ts`; `hooks/useAuth()` is the component-facing API (`{ user, loading, login, logout }`).

**Theme** — light/dark, toggled from the top bar, persisted to `localStorage`, applied before first paint (no flash of the wrong theme). One semantic color-token system (`bg`, `surface`, `ink`, `brand`, `success`/`warning`/`danger`/`info`, ...) drives every screen — including the Kitchen Display, which used to be hardcoded dark regardless of the rest of the app.

**Recipes** — ingredients, cooking steps, yield/costing fields. An ingredient's unit (kg, L, g, ...) is defined once on the ingredient itself and reused everywhere — a recipe or a stock row can't silently disagree with it. Editing a recipe's ingredients/steps diffs against what's already there (matched by id) instead of deleting and recreating every row on every save.

**Daily production plans** — a day can hold more than one plan (breakfast/lunch/dinner/all-day are independent `ProductionPlan`s), each shown as its own card. Recipes can be added to or removed from a plan while it's still in `DRAFT`; once a plan is `SUBMITTED` its items are locked (edit/delete of a plan item is rejected server-side once it has a batch, so a stray request can't desync `planned_qty` from what was actually started or cascade-delete real production history). Submitting a plan calculates ingredient requirements across all its items and auto-raises kitchen stock requests for any shortfall, with urgency derived from how soon the batch is scheduled. The Kitchen Display and Dashboard both aggregate items across *all* of today's plans, not just one.

**Plan the week** — any plan can be duplicated onto other dates (a day-picker defaults to the next 7 days) as new, independently-editable `DRAFT` plans — set up Monday's lunch once and copy it forward instead of rebuilding each day from scratch. A target date that already has a plan for that service period is skipped, not overwritten or doubled up. Staff assignment isn't copied (a different day usually means different people). This is deliberately a one-time copy, not a synced template or a demand-driven auto-planner — there's no POS/sales data in the system yet for "adjust based on what actually sold" to mean anything real; see *Known limitations*.

**Kitchen Display System** — polling-based board to start batches from a plan (WebSocket real-time sync is intentionally deferred — see below). Built touch-first rather than as a shrunk-down admin screen: large tap targets, a bold color-coded status bar per card, and a "running late" flag computed from the item's scheduled time — since this is the one screen actually used hands-on at a station, not from a desk.

**Batch completion** — a single atomic transaction, with the row lock held for the entire operation (not just the initial status check — releasing it in between is what would let two near-simultaneous completes both slip through and double-deduct stock; there's a real concurrent-threads test for this):
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

## Store module (frontend prototype)

The procurement-to-stock loop — Suppliers → Item master → Purchase Orders → Receiving (GRN) — as a real, interactive frontend, deliberately built **without a backend yet**. Reachable via the "Store" section in the sidebar (`/store/dashboard`, `/store/suppliers`, `/store/items`, `/store/purchase-orders`, `/store/receiving`), same shell, same theme, same component library as the Kitchen module — one product, not two bolted together.

- **Suppliers** — searchable/filterable list, add-supplier form. New suppliers start with no delivery-accuracy/quality score — those are meant to build up from real GRN history, not be typed in by hand.
- **Item master** — searchable/filterable list (by category or low-stock), add-item form (buy unit vs. use unit, reorder/max levels, unit cost, shelf life, storage location).
- **Purchase orders** — multi-line create form (supplier, priority, delivery details, line items with running total), status filter chips. Orders over ₦50,000 require Manager approval before being marked sent — under that, they're auto-sent. Approve/Reject actions are Manager-only (`useAuth()`-gated, same pattern as Kitchen).
- **Receiving (GRN)** — pick a sent PO, record quantity received/rejected/quality/expiry per line; confirming a GRN actually updates item stock levels (received minus rejected) and marks the PO complete or partially received, with a short-delivery banner when a line comes in under what was ordered.

**This is real interactive state, not static mockup data** — everything created (suppliers, items, POs, GRNs) lives in a React Context (`lib/foodops/FoodOpsContext.tsx`) seeded from `lib/foodops/mockData.ts`, so the whole loop is genuinely testable end-to-end (approve a PO, receive it, watch the item's on-hand quantity actually change) within a session. It resets on page reload — there's no backend/database behind it yet, by design, since this pass was scoped frontend-only. Turning this into the real thing means Django models mirroring `lib/foodops/types.ts`, real endpoints, and wiring the Kitchen side's stock requests to actually reach this module's dispatch flow (Dispatch and Wastage screens from the reference mockup aren't built yet either — this pass covered the core procure-to-stock loop only).

## Where this is headed

Mise ERP is being built as a **multi-tenant SaaS product** — sold to restaurant businesses large and small, not just run internally for one — with two planned offerings: a monthly subscription and a one-time enterprise deployment that we maintain under contract. The explicit bar to clear is Orda Africa (the honest apples-to-apples competitor) and Odoo's restaurant module (beatable on depth-for-this-vertical and simplicity, not on Odoo's total feature surface across every business domain).

**Current sequencing decision:** harden the Kitchen module to production-grade before building out multi-tenancy or the other modules — prove the full product works end-to-end for one real operation first. An `Organization` model exists as a lightweight, unenforced stub (same pattern as `Branch`) so new models added between now and then don't need an expensive retrofit later, but no data is actually tenant-scoped yet.

## Known limitations / what's next

Being upfront about what's still missing rather than letting it be a surprise:

- **Reports has no real sell-through yet.** "Utilization" (produced minus wasted) is an honest proxy, not actual units sold — that needs a POS/DineFlow module this kitchen module doesn't have. No exports (CSV/PDF) yet either. Reports also doesn't have trend arrows the way the Dashboard does — its date-range picker (Today / Last 7 days / This month) is the way to compare periods for now.
- **Plan duplication is a one-time copy, not demand-driven.** "Plan the week" copies today's items forward as-is; it doesn't (and can't yet) adjust quantities based on what actually sold, since that needs the same POS/sell-through data Reports is waiting on. Once that exists, this is the natural place to layer a "suggested quantity based on last week's sales" nudge on top of the manual copy.
- **Live alerts cover one signal.** `useKitchenAlerts` only watches for new ingredient shortfalls today — other events worth surfacing (a batch running late, a wastage spike) aren't wired up yet, though the toast layer itself is general-purpose.
- **Multi-tenancy isn't real yet.** `Organization` and `Branch` exist as structural stubs but nothing enforces data isolation between them — fine for one operation, required before this is sold to more than one.
- **API routes aren't versioned** (`/api/kitchen/...` rather than `/api/v1/kitchen/...`).
- **The Store module has no backend.** Everything under `/store/*` is a real, interactive frontend on in-memory mock state (`lib/foodops/`) — it doesn't persist, isn't connected to Kitchen's actual stock requests, and covers only the core procure-to-stock loop (Dispatch and Wastage from the reference mockup aren't built). DineFlow (POS) and the Management module don't exist yet — see `mise_system_flows.html` for the eventual full-system design.
