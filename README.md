# Mise ERP — Kitchen Module

Restaurant ERP, starting with the kitchen module: recipes, daily production planning, batch tracking with atomic ingredient deduction, kitchen stock, stock requests, wastage tracking, role-gated recipe costing, reporting, an audit trail, and a live kitchen dashboard/KDS — in light or dark mode, resilient to a dropped connection. Frontend-only prototypes of the **Store module** (suppliers, item master, purchase orders, receiving, stock levels, dispatch, wastage, reports) and the **POS module** (menu management, order terminal, payments, shifts, void/refund) sit alongside it — see *Store module* and *POS module* below.

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
| `kitchen_staff` | Kitchen Staff | KDS, batches, recipes, stock, requests, wastage log (can log entries, not their cost). No costing. No Store module. |
| `head_chef` | Head Chef | All of the above, plus wastage cost figures and a **limited** food-cost trend signal (on target / watch / over target — no numbers). No Store module. |
| `store_keeper` | Store Keeper | The Store module only (suppliers, item master, purchase orders, receiving, stock levels, dispatch, wastage, reports) — can create POs and receive goods, but can't approve a PO. No Kitchen module. |
| `manager` | Manager | Everything in Kitchen, Store, **and POS**, including full food-cost figures, margins, PO approval, and till/shift oversight. Also a Django superuser (`/admin` access). |

Kitchen and Store are modeled as separate departments, not a single ladder of access — Kitchen roles can't see Store's supplier/procurement data, and Store Keeper can't see Kitchen's production data, each enforced twice (nav items hidden outright, and a real gate blocking a direct/bookmarked URL too — not just a locked-looking page). POS is Manager-only for now — its real spec roles (Cashier, FOH Supervisor) aren't real Django roles yet; see *POS module* below for why and how that's handled instead.

Use the sun/moon toggle in the top bar to switch light/dark — it's saved per browser and applies everywhere, including the Kitchen Display screen.

## Project layout

```
backend/    Django + DRF API
  apps/accounts/   auth (JWT), User/Organization/Branch/AuditLog models
  apps/kitchen/    all kitchen domain logic
frontend/   Next.js App Router UI
  app/         routes (App Router — no src/ directory); app/(app)/store/* and app/(app)/pos/* are the Store and POS modules
  components/  shared UI (Shell, ui.tsx, ThemeToggle, StoreAccessGate, PosAccessGate)
  hooks/       useAuth (Redux-backed)
  lib/         Redux store + slices (features/), API client, types
  lib/foodops/ Store module's types/mock data/state — frontend-only, no backend yet
  lib/pos/     POS module's types/mock data/state — frontend-only, no backend yet
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

59 tests covering the correctness-critical paths: the atomic batch-completion transaction (success, insufficient-stock rollback, double-completion rejection, cost-drift regression, concurrent-request race), wastage logging (both the stock-deducting and cost-only paths, the exactly-one-of-ingredient-or-batch rule, role-based value visibility), recipe costing permissions and threshold math, reporting rollups and role-gated money figures, the dashboard's day-over-day comparison figures, production-plan item add/edit/remove guards (both the standalone endpoint and the diff-based whole-plan sync), plan duplication, diff-based recipe ingredient/step sync, the race-safe code sequence under real concurrent threads, the full auth flow (login/refresh/logout/token-blacklist, audit log writes), and `STORE_KEEPER` correctly falling through every Kitchen permission check with no accidental superuser bypass.

## What's implemented

**Auth** — JWT (access token in Redux, refresh token as an httpOnly cookie), role-scoped to `HEAD_CHEF` / `KITCHEN_STAFF` / `MANAGER` / `STORE_KEEPER`. State lives in `lib/features/authSlice.ts`; `hooks/useAuth()` is the component-facing API (`{ user, loading, login, logout }`). Login redirects by role (`STORE_KEEPER` → Store dashboard, everyone else → Kitchen dashboard) since the two departments' nav is now mutually exclusive — see *Store module* below.

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

The full procurement-to-stock loop — Suppliers → Item master → Purchase Orders → Receiving (GRN) → Stock levels → Dispatch → Wastage → Reports — as a real, interactive frontend, deliberately built **without a backend yet**. Reachable via the "Store" sections in the sidebar (`/store/dashboard`, `/store/suppliers`, `/store/items`, `/store/purchase-orders`, `/store/receiving`, `/store/stock`, `/store/dispatch`, `/store/wastage`, `/store/reports`), same shell, same theme, same component library as the Kitchen module — one product, not two bolted together.

- **Access is role-scoped, not just shown-then-locked, in both directions.** Manager and Store Keeper see the Store module; Kitchen Staff and Head Chef don't — the nav section doesn't render for them at all (`components/Shell.tsx`), and a direct/bookmarked `/store/...` URL still hits a real gate (`components/StoreAccessGate.tsx`) instead of the page. The reverse is also true: Store Keeper doesn't see Kitchen's nav sections either, and a direct `/dashboard`/`/kds`/etc. URL hits a matching gate in `app/(app)/layout.tsx`. This is a deliberate departure from Kitchen's own Costing/Reports pattern (nav visible to everyone in that department, content locked per-role) — Kitchen and Store are genuinely separate departments in the underlying business, not one feature with a paywall.
- **Suppliers** — searchable/filterable list, add **and edit**. New suppliers start with no delivery-accuracy/quality score — those are meant to build up from real GRN history, not be typed in by hand; the edit form makes that explicit and adds an Active/Flagged/Inactive status field.
- **Item master** — searchable/filterable list (by category or low-stock), add **and edit** (buy unit vs. use unit, reorder/max levels, unit cost, shelf life, storage location). Editing on-hand quantity directly is flagged in the UI as a stocktake-style correction, not the normal path — normal stock movement should flow through receiving.
- **Purchase orders** — multi-line create form (supplier, priority, delivery details, line items with running total), status filter chips, and a detail view per PO. Orders over ₦50,000 require Manager approval before being marked sent — under that, they're auto-sent. Store Keeper can raise and view POs but not approve one, matching the spec's "cannot approve POs independently" rule. Approving is one click; **rejecting requires a reason** (captured inline in the detail view, shown back on the PO afterward) so a store keeper knows what to fix before resubmitting.
- **Receiving (GRN)** — pick a sent PO, record quantity received/rejected/quality/expiry per line; confirming a GRN actually updates item stock levels (received minus rejected) and marks the PO complete or partially received, with a short-delivery banner when a line comes in under what was ordered.
- **Stock levels** — searchable/filterable (Critical/Low/location) table with a stock-level progress bar per item and a "last movement" timestamp. A **Stocktake mode** lets a bulk physical count be entered inline and saved in one action — only rows that actually differ from the current figure are written, each becoming a logged `ADJUSTMENT` movement (see the ledger below), not a silent overwrite. CSV export.
- **Dispatch** — genuinely wired to Kitchen's real, already-tested `/api/kitchen/stock-requests/` endpoints (not mocked): pending requests raised from the Kitchen side show up here, and confirming one calls Kitchen's real `mark-fulfilled` action, then records a matching `DISPATCH` movement on the Store side if the ingredient name matches a Store item (case-insensitive; unmatched ones still get marked fulfilled in Kitchen, with an explicit "not tracked in Store item master yet" note, since the two modules don't share an item master). Also supports a manual dispatch (destination, item, quantity, reason) for stock leaving Store outside of a formal Kitchen request. Kitchen's `mark_fulfilled` endpoint always adds the full requested quantity with no partial-fulfillment parameter — since this pass is frontend-only, Dispatch doesn't offer a short-fulfillment quantity field; it shows a short-delivery warning but doesn't block confirming.
- **Wastage log** (Store-side, distinct from Kitchen's own `/wastage`) — log a wasted quantity against a Store item with a reason code, notes (required for "Theft suspected"), and a live estimated-value calculation at the item's current unit cost. Entries above ₦5,000 require Manager sign-off (`WASTAGE_ACKNOWLEDGEMENT_THRESHOLD`) via an explicit Acknowledge action, matching the spec's supervisor sign-off rule — surfaced both as a "Needs supervisor sign-off" section (Manager view) and a toast at the moment of logging.
- **Reports** — Today / Last 7 days / This month, with a Daily inventory movement table (opening → received → dispatched → wasted → adjusted → closing, reconstructed from the stock movement ledger rather than stored as point-in-time snapshots) plus KPI cards (inventory value, POs raised, wastage cost, suppliers flagged) and a Supplier performance table computed from real GRN history (`computeSupplierPerformance` — on-time % and average quality, `null` rather than 0 when a supplier has no GRNs yet). CSV export.
- **Responsive** — same tablet-first treatment as the rest of the app (the spec's own hardware assumption for this role is "Tablet or Desktop PC + Barcode Scanner"): grids collapse to 1–2 columns and tables scroll horizontally below `lg`/`sm` instead of cramming or overflowing the page.
- **Every mutation is async, with real submitting/error UI** — add/edit supplier, add/edit item, create PO, approve/reject PO, confirm GRN all show a "Saving…/Approving…/Confirming…" disabled state and a real error message on failure, exactly like Kitchen's forms do. `FoodOpsContext.tsx`'s mutators are declared `async` and return `Promise`s even though today's implementation is a synchronous in-memory update that never actually fails — the point is that every call site already `await`s + `try/catch`es correctly, so replacing the internals with real `fetch` calls later touches one file, not every page.
- **Live alerts**, reusing the same toast layer Kitchen's `useKitchenAlerts` already established: a new PO landing in `AWAITING_APPROVAL` toasts immediately (value + supplier, link to Purchase Orders); a PO sitting in `AWAITING_APPROVAL` for over 4 hours toasts once per session (matches the spec's approval-escalation rule); a GRN that comes back short or with rejected items toasts a discrepancy warning (link to Receiving). Unlike Kitchen's alerts, these aren't polling a server — Store's state changes are all local mutations today, so each mutator toasts directly at the point of the state transition; the 4-hour check is the one genuinely time-based exception, run on an interval against `raisedAt` timestamps.

**This is real interactive state, not static mockup data** — everything created or edited (suppliers, items, POs, GRNs, stock movements, wastage entries) lives in a React Context (`lib/foodops/FoodOpsContext.tsx`) seeded from `lib/foodops/mockData.ts`, so the whole loop is genuinely testable end-to-end (approve a PO, receive it, watch the item's on-hand quantity actually change; run a stocktake and watch it show up in Reports as an `ADJUSTMENT`; confirm a Kitchen dispatch request and watch Kitchen's own stock-requests list update for real) within a session. It resets on page reload — there's no backend/database behind it yet, by design, since this pass was scoped frontend-only. The **role** side of this is real, though — `STORE_KEEPER` is an actual `User.Role` on the backend (see *What's implemented* below), just not yet wired to any Store-specific backend endpoints since none exist. Turning the module itself into the real thing means Django models mirroring `lib/foodops/types.ts` and real endpoints — the Dispatch screen's Kitchen-side integration is a live preview of that: it already calls Kitchen's real endpoints today, so once Store has its own backend, only the Store-side half of that call needs to move off mock state.

**Stock movement ledger** — every quantity change to a Store item (`RECEIPT` from a GRN, `DISPATCH` to Kitchen/FOH, `WASTAGE`, or a stocktake `ADJUSTMENT`) is recorded as a signed-quantity row in `stockMovements` (`lib/foodops/types.ts`), not just applied silently to `onHand`. This is what lets Reports reconstruct a real opening/closing stock table for any date range from the ledger, instead of needing point-in-time snapshots that would drift out of sync with reality.

**Building the real backend for this?** See [`lib/foodops/API_CONTRACT.md`](frontend/lib/foodops/API_CONTRACT.md) — endpoint list, exact field names (with the snake_case ↔ camelCase mapping to `types.ts`), permissions per action, and which business logic (PO approval threshold, GRN stock-update side effects, status computation) has to live server-side rather than trusting the client. Written so the frontend integration is a small change to `FoodOpsContext.tsx` once the endpoints exist, not a rewrite.

## POS module (frontend prototype)

Point of Sale & Front of House — menu configuration, order-taking, payment, void/refund, shift management, and reporting — same frontend-only-for-now treatment as Store, built against the full spec section rather than a cut-down version, and polished to match a detailed reference mockup's interaction model (modals over a persistent terminal, an on-screen numpad, real PIN-gated supervisor approval) rather than stopping at "functionally equivalent." Reachable via the "Point of Sale" / "POS management" sidebar sections (`/pos/dashboard`, `/pos/terminal`, `/pos/shift`, `/pos/shifts`, `/pos/orders`, `/pos/menu`, `/pos/reports`), same shell/theme/component library as everywhere else.

- **Access is Manager-only, with a lightweight PIN layer inside the module for Cashier/FOH Supervisor.** The spec's real POS roles (Cashier, FOH Supervisor) aren't real Django roles yet — deliberately, per the same reasoning that kept `GENERAL_MANAGER`/`OWNER` out of the role enum this session: a role needs real distinguishing behavior before it's worth adding, not just a label. `components/PosAccessGate.tsx` gates `/pos/*` to `MANAGER` (mirrors `StoreAccessGate` before `STORE_KEEPER` existed); once inside, `/pos/shift`'s PIN pad identifies which mock `CashierProfile` is actually running the terminal — a faithful frontend implementation of the spec's own "cashier logs in with a PIN" flow (spec 6.5.1), distinct from the real JWT app login, without touching real backend auth. The same PIN idea powers a reusable `components/pos/SupervisorPinModal.tsx` — checked against a mock `CashierProfile` with `role === FOH_SUPERVISOR` — used anywhere the spec calls for supervisor sign-off (voiding an already-paid order, an above-preset discount, a refund) instead of a typed name in a text field.
- **Terminal** (`/pos/terminal`) — the touchscreen order screen, touch-first like the Kitchen Display (large tap targets), with the menu grid and cart *always* visible — Payment, Receipt, Discount, and Void are all modals layered on top (dimmed background, not a full-screen replace), so the cashier never loses context mid-transaction. A category-tabbed, counter-status-aware item grid (description and allergen tag shown per card; healthy items sell normally, low-stock items show an orange badge but stay sellable, sold-out items grey out and can't be tapped, matching spec 6.4 exactly) — a small quick-add button skips straight to the cart for the common no-customization case, while tapping the card itself still opens the modifier picker when one applies. The cart supports per-line quantity, notes, a manager-approved complimentary toggle (zero-prices the line, reason required), a staff-meal price toggle where configured, and an order-level discount via a dedicated modal (quick presets, a code field, and a supervisor-PIN gate on the largest preset). A **"Void order"** cart action lets a never-charged order be logged as `VOIDED` with a reason before it's ever paid for — still a real, auditable `Order` record per spec 6.3.1's "never deleted" rule, with zero stock impact since nothing was decremented yet. Payment supports Cash (an on-screen numpad plus quick-cash buttons and change calculation), Card, Mobile Transfer, Voucher, and Split (multiple payment legs summing to the total, each recorded separately) — spec 6.2.2's split-payment requirement done for real, not simplified away.
- **Shift management** (`/pos/shift`, `/pos/shifts`) — PIN-identify → opening float entry (flagged, not blocked, if it differs from the standard float — matches spec 6.5.1) → live running totals while the shift is open → close-out (physical cash count vs. expected cash, variance shown, full shift summary generated). `/pos/shifts` is the history view, and implements the spec's fraud-detection rule for real: three consecutive shortage shifts flags the cashier's account and would notify a GM in a real deployment (a toast here, since there's no one else's session to notify yet). Both screens correctly exclude a since-voided order's payment from the shift's cash totals — a real bug found and fixed during this pass, where a voided cash sale was inflating "expected cash at close" and manufacturing a false shortage.
- **Orders** (`/pos/orders`) — the transaction log plus Void & Refund center. Void before payment is immediate; **voiding an already-paid order requires a real supervisor PIN** (spec 6.3.1) via `SupervisorPinModal`, not a typed name. Refunds are separate from voids (money reverses, the food doesn't un-sell) — below `REFUND_APPROVAL_THRESHOLD` (₦5,000, the spec's own example figure) needs one FOH Supervisor PIN; above it needs spec 6.3.2's dual approval, satisfied here by that same PIN plus the fact that only an already-authenticated Manager session can reach this screen at all (an explicit, documented product decision — see `lib/pos/API_CONTRACT.md`, not a shortcut taken silently). The refund method defaults to matching the original payment. Nothing is ever deleted — voided orders stay in the system marked `VOIDED` with who authorized it and why.
- **Menu management** (`/pos/menu`) — every spec 6.1.1/6.1.2 field: name, description, category, allergens, an emoji as a lightweight image stand-in (no upload infra exists yet), exclusive/inclusive-of-VAT pricing, availability schedule, modifier groups with per-option price deltas, combo bundles (pick existing menu items + a bundle price), active/inactive toggle, and the full dynamic-pricing set — happy-hour time window, bulk-quantity discount, staff meal price. The recipe picker is a **real** `Combobox` sourced from Kitchen's actual `GET /api/kitchen/recipes/` endpoint, not a disconnected mock list.
- **Dashboard** (`/pos/dashboard`) — today's sales/order-count/average-order-value/void/refund KPIs, sales-by-payment-method breakdown, a low/sold-out counter-stock list, recent orders, and a **"Sync from Kitchen"** action.
- **Reports** (`/pos/reports`) — Today / Last 7 days / This month, mirroring Store Reports' established pattern: KPI cards (total sales, avg order value, cash collected, voids), a sales-by-item table, a payment-method breakdown, a refunds table, and a full transaction log with CSV export.
- **Real cross-module integration, same bar Dispatch set for Store**: "Sync from Kitchen" calls Kitchen's real, already-tested `GET /api/kitchen/batches/`, matches each completed batch's `recipe_name` (case-insensitive) to a linked menu item, and adds its `actual_qty` to that item's counter stock — a genuine implementation of spec 5.3.2's "pushes finished item availability to the POS Module" rule, not a mocked stand-in. Two things worth knowing: Kitchen's batches endpoint has no server-side status filter either (the same gap already found and fixed once on the stock-requests endpoint), so filtering happens client-side; and sync tracks already-synced batch IDs in memory rather than filtering by "today's date", since the seeded demo data's batches are dated whenever the container was last seeded, not literally today.
- **Counter stock movement ledger** — every counter-quantity change (`PRODUCTION_SYNC`, `SALE`, `VOID_RESTORE`, `MANUAL_ADJUSTMENT`) is a signed-quantity row, exactly mirroring Store's `StockMovement` ledger — same reasoning: real historical reconstruction later, not silent overwrites. Crossing into low-stock or sold-out fires a toast (not just a badge change) so a busy cashier doesn't have to notice the counter grid changing color on its own.
- **Same interactive-state architecture as Store** — `lib/pos/PosContext.tsx` (mock React Context, async mutators shaped like future real API calls) seeded from `lib/pos/mockData.ts`, whose menu items are seeded with the exact names and prices of Kitchen's real seeded recipes (Jollof Rice, Grilled Chicken, Beef Suya, Egusi Soup, Fried Plantain, Chapman) so "Sync from Kitchen" has real matches to demonstrate out of the box. Resets on reload — no backend yet, by design.

**Building the real backend for this?** See [`lib/pos/API_CONTRACT.md`](frontend/lib/pos/API_CONTRACT.md) — same structure as Store's contract doc, including an explicit note on what it takes to turn Cashier/FOH Supervisor into real Django roles with a real PIN-login flow instead of the mock operator layer, and a flagged explanation of a mock-only async-state gotcha (`voidNewOrder`) worth understanding before touching that code.

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
- **Neither the Store nor the POS module has a backend yet.** Everything under `/store/*` and `/pos/*` is a real, interactive frontend on in-memory mock state (`lib/foodops/`, `lib/pos/`) — neither persists across a reload. All 9 Store screens and all 6 POS screens are built. Dispatch (Store) and "Sync from Kitchen" (POS) are the two screens that already talk to a real backend (Kitchen's `stock-requests` and `batches` endpoints respectively), both currently matching by ingredient/recipe name (case-insensitive) rather than a shared item master — a real shared master across all three modules is worth building once Store and POS both have their own backends. The Management, HR, and Financial modules don't exist yet — see `mise_system_flows.html` for the eventual full-system design.
- **POS's Cashier/FOH Supervisor "roles" are a mock PIN layer inside the module, not real Django roles.** Deliberate, for now — same reasoning as not splitting `MANAGER` into `GENERAL_MANAGER`/`OWNER` yet: a role needs real distinguishing backend behavior before it's worth adding. See `lib/pos/API_CONTRACT.md` for what a real PIN-login flow for these roles would need.
- **POS's split payment, discount-threshold approval, refund dual-approval, and complimentary-reason approval are all client-validated only.** The frontend enforces the spec's rules (dual GM approval above the refund threshold, supervisor name required to void a paid order, etc.) but nothing stops a modified request from skipping them, since there's no server yet to hold the line. Flagged individually in `lib/pos/API_CONTRACT.md`.
- **Store's Suppliers list still shows static seeded performance figures.** `computeSupplierPerformance` (real GRN-derived on-time %/quality) is wired into Store Reports but not yet into the Suppliers list view — worth doing for consistency once there's a reason to revisit that screen.
