# POS module — API contract

This is the contract the POS frontend is already built against. Everything
under `/pos/*` currently runs on an in-memory mock (`PosContext.tsx`, seeded
from `mockData.ts`) with the exact shapes defined in `types.ts` — build the
real backend to match this, and swapping the mock for real `fetch` calls is a
small, mechanical change to one file (`PosContext.tsx`) rather than a rewrite
of every page. Follows the same naming convention and reasoning as
[`lib/foodops/API_CONTRACT.md`](../foodops/API_CONTRACT.md) (Store's
equivalent doc) — read that first if this is your first time implementing
one of these mock-to-real handoffs.

**Naming convention**: snake_case JSON matching Django/DRF, mapped to the
camelCase fields in `types.ts` once real endpoints exist.

**Auth/permissions**: reuse the existing JWT auth. The real spec roles for
this module are Cashier and FOH Supervisor — **neither exists as a Django
role yet** (see `components/PosAccessGate.tsx`'s comment). Today, `MANAGER`
is the only real role that reaches `/pos/*`, and a lightweight in-app PIN
pad (`/pos/shift`) identifies which mock `CashierProfile` is running the
till, purely for shift-tracking/approval-authority display — it is **not**
real authentication. Building this for real means either (a) adding
`CASHIER`/`FOH_SUPERVISOR` as real Django roles with their own PIN-based
login flow (spec 6.5.1 describes this as the actual intended UX — a
lightweight per-shift PIN distinct from a full username/password login), or
(b) keeping the Manager-level JWT gate and layering a real PIN check server-
side. Don't build real Cashier/FOH Supervisor Django roles without also
building this PIN login flow — a role with no matching login path is dead
weight, same reasoning as the GM/Owner split we deliberately deferred this
session.

---

## Menu items

`GET/POST /api/pos/menu-items/`, `GET/PATCH /api/pos/menu-items/{id}/`

Permission: Manager (menu configuration is spec 6.1's territory, not a
Cashier action).

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `name` | `name` | required |
| `description` | `description` | shown to customers |
| `recipe` | `recipeId` | FK to Kitchen's real `Recipe`, nullable — **cross-app FK**, same pattern as `StoreItem.preferredSupplierId` pointing at a Supplier in a different table; here it points into `apps.kitchen`, not another POS table |
| `recipe_name` | `recipeName` | read-only, `source="recipe.name"` — cached for display and for batch-name matching (see *Counter stock sync* below) |
| `category` | `category` | required |
| `emoji` | `emoji` | today's lightweight image stand-in — swap for a real `image` upload field when there's image infra; keep `emoji` as a cheap fallback even then |
| `selling_price` | `sellingPrice` | decimal, ₦, **exclusive of tax** — inclusive price is `selling_price * (1 + TAX_RATE)`, computed, never stored separately |
| `availability` | `availability` | `ALL_DAY`\|`BREAKFAST`\|`LUNCH`\|`DINNER` |
| `allergens` | `allergens` | array of free-text labels (e.g. `["Peanuts"]`), informational only — no allergen-based filtering logic anywhere |
| `modifier_groups` | `modifierGroups` | nested, `[{name, options: [{label, price_delta}]}]` |
| `combo` | `combo` | nullable, `{item_ids: [...], combo_price}` — when set, `selling_price` should equal `combo_price` (single source, avoid drift) |
| `active` | `active` | soft toggle, never delete a menu item that's been sold — matches Kitchen's Recipe `status` / Store's `SupplierStatus` "never hard-delete something with history" pattern |
| `happy_hour` | `happyHour` | nullable, `{start_time, end_time, price}` |
| `bulk_discount` | `bulkDiscount` | nullable, `{min_qty, pct}` |
| `staff_meal_price` | `staffMealPrice` | nullable, ₦ — spec calls this "role-restricted"; enforce that server-side once a real Cashier/FOH role exists, not just as a UI checkbox |
| `counter_qty` | `counterQty` | **not directly editable via normal flow** — see *Counter stock movement ledger* below, same reasoning as `StoreItem.onHand` |
| `low_stock_threshold` | `lowStockThreshold` | decimal |

---

## Counter stock movement ledger

Read-only trail, exactly mirroring Store's `StockMovement`/`stock-movements`
endpoint — see that doc for the full reasoning (Reports-style reconstruction
without snapshots). `GET /api/pos/counter-movements/?menu_item={id}`.

| JSON field | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `menu_item` | `menuItemId` | FK |
| `type` | `type` | `PRODUCTION_SYNC`\|`SALE`\|`VOID_RESTORE`\|`MANUAL_ADJUSTMENT` |
| `qty` | `qty` | signed — positive onto the counter, negative off it |
| `reference` | `reference` | order code, batch code, etc. |
| `occurred_at` | `occurredAt` | `auto_now_add` |

Written as a side effect of: a sale (`chargeOrder`), a void restoring stock
(`voidOrder` on a `PAID` order), a manual counter-stock correction on the
menu item form, and the Kitchen sync below — never written directly by the
client.

### Counter stock sync from Kitchen

**This is a real, working integration today, not mocked** — `PosContext`'s
`syncFromKitchen()` already calls Kitchen's real `GET /api/kitchen/batches/`
directly and matches `recipe_name` (case-insensitive) to a linked menu item,
adding `actual_qty` to its `counterQty`. Two gotchas worth knowing before
building the real version of this:

1. `BatchProductionViewSet` has **no server-side status/date filter** — the
   frontend already filters `status === "COMPLETE"` client-side (the same
   gap already found and fixed once on the Kitchen stock-requests endpoint
   during the Store pass — don't rediscover it a third time).
2. The frontend does **not** filter by "today" — the seeded demo data's
   batches are dated whenever the container was last seeded, not literally
   today, so a naive `completed_at` date filter silently shows nothing in a
   demo environment. It tracks already-synced batch IDs in memory instead
   (resets on reload, same as every other mock state in this module). A
   real backend implementation should push this automatically at batch-
   completion time (spec 5.3.2: "pushes finished item availability to the
   POS Module") rather than requiring a manual sync at all — the manual
   "Sync from Kitchen" button on `/pos/dashboard` is a stand-in for that
   push until cross-module events/webhooks exist.

Matching by recipe name rather than a shared ID has the same "known gap"
status as Store's Dispatch screen matching Store items to Kitchen
ingredients by name — worth a real shared reference once cross-module IDs
are wired up.

---

## Orders

`GET/POST /api/pos/orders/`, `GET /api/pos/orders/{id}/`

Permission: create/edit lines — Cashier/FOH Supervisor (today: Manager, via
the till operator identified by PIN). Void/refund — see their own sections
below.

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `code` | `code` | read-only, server-generated (`ORD-2026-0001`-style), same `CodeSequence` pattern used elsewhere |
| `table_or_counter_number` | `tableOrCounterNumber` | required — spec: "All orders require table/counter number" |
| `lines` | `lines` | nested, see below |
| `discount_pct` | `discountPct` | requires `discount_reason` when non-zero; **discounts above a configurable threshold should require supervisor approval server-side** (spec 6.2.3), not just a UI text field the way it's mocked today |
| `discount_reason` | `discountReason` | |
| `status` | `status` | `OPEN`\|`PAID`\|`VOIDED` — read-only, server-computed by the actions below |
| `shift` | `shiftId` | FK |
| `opened_by` / `opened_by_name` | `openedBy` | read-only, the identified cashier |
| `opened_at` | `openedAt` | `auto_now_add` |
| `closed_at` | `closedAt` | set on charge |
| `void_reason` / `voided_by` | `voidReason` / `voidedBy` | set only via the void action |

**Order line** (`order_lines`, nested under an order):

| JSON field | `OrderLine` field | Notes |
|---|---|---|
| `menu_item` | `menuItemId` | FK |
| `qty` | `qty` | |
| `unit_price` | `unitPrice` | **snapshot at add-time** — happy hour / staff meal / bulk discount tier is resolved once, when added, not recomputed later; same reasoning as Kitchen's batch-completion cost snapshot (a later price change shouldn't retroactively rewrite an open order) |
| `selected_modifiers` | `selectedModifiers` | `[{group_name, option_label, price_delta}]`, also snapshotted |
| `note` | `note` | kitchen prep instruction |
| `is_complimentary` | `isComplimentary` | zero-prices the line |
| `complimentary_reason` | `complimentaryReason` | required when `is_complimentary` — spec: "must have reason code"; **manager-approval should be a real server-side check** once real roles exist, mocked today as a free-text field |

**Totals are computed, never stored** — `subtotal`/`discount_total`/
`tax_total`/`total` should be a serializer method or endpoint response field,
recomputed from `lines`/`discount_pct`/`TAX_RATE` every time, exactly
mirroring `computeOrderTotals()` in `types.ts`. Storing them risks drift if a
line is edited after the fact.

**Custom actions**:

- `POST /api/pos/orders/{id}/charge/` — body: `[{method, amount,
  change_given, reference}]` (an array supports split payment). Validates
  `sum(amount) >= total` server-side (the frontend UI already gates this,
  but never trust the client for money math). Side effects, atomic
  transaction: write `Payment` rows, decrement each line's `menu_item
  .counter_qty` by `qty`, write a `SALE` counter-movement per line, set
  `status = PAID` and `closed_at`.
- `POST /api/pos/orders/{id}/void/` — body: `{reason, voided_by}`. If
  `status == OPEN`: any till operator can call this (spec: cashier can void
  pre-payment in the same session — the frontend's Terminal "Void order"
  button covers the *never-charged* case of this by writing an already-
  `VOIDED` order in one shot, not by calling void on an `OPEN` one; see the
  `PosContext.voidNewOrder` comment for why). If `status == PAID`: **must be
  restricted to Supervisor/GM server-side** (spec 6.3.1) — the frontend
  gates this behind a real 4-digit PIN check today
  (`components/pos/SupervisorPinModal.tsx`, validated against a mock
  `CashierProfile` with `role === FOH_SUPERVISOR`), which is a much closer
  approximation of the real thing than a typed name, but still isn't
  server-enforced. Restores counter stock via `VOID_RESTORE` movements when
  voiding a `PAID` order. Sets `status = VOIDED` — **never deleted**,
  matches spec exactly.
- `POST /api/pos/orders/{id}/refund/` — see *Refunds* below; separate from
  void because a refund doesn't reverse the sale itself (the food already
  left the counter), only the money.

---

## Payments

Read-only from the client's perspective — written only as a side effect of
`orders/{id}/charge/` above. `GET /api/pos/payments/?order={id}`.

| JSON field | `Payment` field | Notes |
|---|---|---|
| `method` | `method` | `CASH`\|`CARD`\|`MOBILE_TRANSFER`\|`VOUCHER` |
| `amount` | `amount` | the amount applied to the order (not cash tendered) |
| `change_given` | `changeGiven` | cash-only; `0` for every other method |
| `reference` | `reference` | card/mobile transaction reference |
| `recorded_at` | `recordedAt` | `auto_now_add` |

---

## Refunds

`POST /api/pos/orders/{id}/refund/`, `GET /api/pos/refunds/`

Permission: **below** `REFUND_APPROVAL_THRESHOLD` (₦5,000, spec's own
example figure — make it a Django setting) — FOH Supervisor PIN. **Above**
it — GM, with **dual approval** (spec 6.3.2: "Refunds above threshold: GM
authorization with dual approval (supervisor + GM)"). The frontend gates
both cases behind the same `SupervisorPinModal`, but reasons that only a
real `MANAGER` JWT login can reach `/pos/*` at all (see *Auth/permissions*
above), so that already-authenticated session stands in for the GM half of
"dual approval" — the supervisor PIN is the second, independent check. A
real implementation should still record both approvers as separate
fields/FKs (`authorized_by` becomes a combined string today, e.g.
`"{supervisor} + Manager (GM)"`), and should decide explicitly whether
"the Manager who happens to be logged in" is an acceptable stand-in for a
named GM approval or whether a second real PIN/login step is required —
this repo's frontend made the pragmatic call, but it's a real product
decision, not just an implementation detail.

| JSON field | `Refund` field | Notes |
|---|---|---|
| `amount` | `amount` | full or partial |
| `method` | `method` | **must match the order's original payment method unless a GM override is documented** (spec 6.3.2) — not enforced anywhere yet, frontend or backend |
| `reason_code` | `reasonCode` | required |
| `authorized_by` | `authorizedBy` | see dual-approval note above |
| `created_at` | `createdAt` | `auto_now_add` |

Does **not** restore `counter_qty` — refunding money doesn't un-sell food
already served, distinct from a void.

---

## Cashiers & shifts

`GET /api/pos/cashiers/` (Manager-only, back-office), and the shift flow:

`POST /api/pos/shifts/open/` — body: `{pin, opening_float}`. Looks up the
`CashierProfile` by PIN server-side (never trust a client-supplied cashier
id), records `opening_float`, computes `float_discrepancy` against
`STANDARD_OPENING_FLOAT` (Django setting). Discrepancy is **flagged, not
blocked** (spec: "flagged immediately — supervisor must acknowledge") — a
real implementation needs an actual acknowledgement action here, mocked
today as just a toast.

`POST /api/pos/shifts/{id}/close/` — body: `{closing_cash_counted}`.
Computes `expected_cash_at_close = opening_float + cash_sales - cash_refunds`
for that shift (server-side aggregation, not trusted from the client),
`cash_variance = closing_cash_counted - expected`. If variance is a shortage
beyond `SHORTAGE_THRESHOLD`, increment that cashier's
`consecutive_shortage_shifts`; reset to 0 on a clean close. At
`SHORTAGE_FLAG_COUNT` (3) consecutive shortages, set `flagged = true` and
**this needs a real GM notification** (spec 6.5.2's fraud-detection rule) —
today it's a toast in the same browser session, not an actual alert to
anyone else.

| `CashierProfile` field | Notes |
|---|---|
| `pin` | should be hashed server-side, never returned in any list response |
| `role` | `CASHIER`\|`FOH_SUPERVISOR` |
| `consecutive_shortage_shifts` / `flagged` | server-maintained, see above |

---

## Not built as dedicated endpoints yet

- **`/pos/dashboard` and `/pos/reports`** both compute everything
  client-side from the orders/payments/refunds/menu-items list responses —
  same "fine until real data volume says otherwise" reasoning as Store's
  dashboard/reports. Build a dedicated aggregation endpoint only if that
  stops being true. `/pos/reports`' range picker (Today/Last 7 days/This
  month), sales-by-item table, payment-method breakdown, refunds table, and
  transaction log with CSV export all mirror Store Reports' established
  pattern (`toCsv`/`downloadCsv`).
- **Menu availability by time-of-day** (`availability` field —
  BREAKFAST/LUNCH/DINNER) is stored but **not enforced** anywhere yet,
  frontend or backend — an item tagged `BREAKFAST` is still sellable all
  day today. Needs either a scheduled task or a request-time check against
  configured meal-period windows once this matters for real service.
- **Split payment, discount-threshold approval, and complimentary-reason
  approval are all client-validated only** — every one of these needs a
  real server-side check before this ships past prototype stage; each is
  flagged individually above so nothing gets silently assumed.
- **A mock-specific gotcha, not a real-backend concern**: `PosContext`'s
  mutators (`chargeOrder`, `voidOrder`, `refundOrder`) look up their target
  order via `orders.find(...)` against the mock's in-memory React state.
  That's safe when calls are naturally separated by a render (the normal
  Terminal flow always has one — e.g. opening the payment modal is its own
  render before the user clicks Confirm), but **breaks if a future feature
  chains `createOrder` → `addLine` → one of those mutators synchronously in
  one handler with no render in between** — React defers a functional
  `setState` updater's execution, so the very next line still sees stale
  state. This bit the Terminal's "Void order" (pre-payment cart void)
  feature during this pass; it's fixed there via a dedicated
  `voidNewOrder()` mutator that builds the whole already-voided record in
  one synchronous step instead of chaining three public calls. A real
  Django backend doesn't have this problem (each call is a real request-
  response, not a same-tick JS closure) — flagged here only so nobody
  "fixes" `voidNewOrder` back into a chain of calls without knowing why it
  isn't one already.
