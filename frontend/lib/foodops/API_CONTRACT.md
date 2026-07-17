# Store module — API contract

This is the contract the Store frontend is already built against. Everything
under `/store/*` currently runs on an in-memory mock (`FoodOpsContext.tsx`,
seeded from `mockData.ts`) with the exact shapes defined in `types.ts` — build
the real backend to match this, and swapping the mock for real `fetch` calls
is a small, mechanical change to one file (`FoodOpsContext.tsx`) rather than a
rewrite of every page.

**Naming convention**: the rest of this API (`/api/kitchen/...`) is snake_case
JSON, matching Django/DRF convention — Store should match it for consistency,
even though the frontend's TypeScript types are camelCase. The frontend-facing
column below is what to name each JSON field as; the frontend adapter maps
`snake_case` → the `camelCase` fields in `types.ts` once real endpoints exist.

**Auth/permissions**: reuse the existing JWT auth (`apps.accounts`). No new
permission classes should be needed beyond checking `request.user.role` the
same way `apps/kitchen/permissions.py` does — `IsManager` already exists and
applies as-is; add an equivalent `IsManagerOrStoreKeeper` for the
department-level checks below.

---

## Suppliers

`GET/POST /api/store/suppliers/`, `GET/PATCH /api/store/suppliers/{id}/`

Permission: Manager or Store Keeper (matches `StoreAccessGate` on the frontend).

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `name` | `name` | required |
| `category` | `category` | required, free text (matches Item's `category`) |
| `contact_name` | `contactName` | |
| `contact_phone` | `contactPhone` | |
| `payment_terms` | `paymentTerms` | free text — frontend currently offers Net 7/14/30, Cash on delivery, 50% upfront as a select, but doesn't enforce those values |
| `lead_time_days` | `leadTimeDays` | integer |
| `delivery_accuracy_pct` | `deliveryAccuracyPct` | **server-computed** from GRN history (% delivered on/before `expected_date`) — new suppliers start at 0, not client-settable |
| `quality_avg` | `qualityAvg` | **server-computed**, average of `GRNLineItem.quality` across all lines from this supplier — new suppliers start at 0, not client-settable |
| `status` | `status` | `ACTIVE` \| `FLAGGED` \| `INACTIVE`. Spec: auto-flag to `FLAGGED` if `delivery_accuracy_pct` drops below 70% over a rolling 30 days — not built on the frontend yet, worth doing server-side when this exists |

---

## Item master

`GET/POST /api/store/items/`, `GET/PATCH /api/store/items/{id}/`

Permission: Manager or Store Keeper.

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `name` | `name` | required |
| `category` | `category` | required |
| `barcode` | `barcode` | optional |
| `preferred_supplier` | `preferredSupplierId` | FK to Supplier, nullable |
| `preferred_supplier_name` | *(derived client-side today)* | read-only, `source="preferred_supplier.name"` — matches the `ingredient_name`-style pattern already used throughout `apps/kitchen/serializers.py` |
| `buy_unit` | `buyUnit` | free text, e.g. "50 kg bag" |
| `use_unit` | `useUnit` | required, free text, e.g. "kg" |
| `reorder_level` | `reorderLevel` | decimal |
| `max_level` | `maxLevel` | decimal |
| `on_hand` | `onHand` | decimal — **not directly editable via normal flow**, see below |
| `unit_cost` | `unitCost` | decimal, ₦ |
| `shelf_life_days` | `shelfLifeDays` | integer, nullable |
| `location` | `location` | free text |

`on_hand` changes two ways: (1) a direct `PATCH` when a manager/keeper does a
stocktake correction — the frontend's edit form already labels this
explicitly as a correction, not the normal path; (2) automatically when a GRN
is confirmed (see below). No special endpoint needed for (1), just allow
`on_hand` in the `PATCH` payload.

`stockStatus()` (CRITICAL/LOW/HEALTHY) is a pure frontend computation from
`on_hand` vs `reorder_level` — no backend field needed for it.

---

## Purchase orders

`GET/POST /api/store/purchase-orders/`, `GET /api/store/purchase-orders/{id}/`

Permission: **create** — Manager or Store Keeper. **approve/reject** — Manager
only (Store Keeper "cannot approve POs independently" per spec; this must be
enforced server-side, not just hidden in the UI).

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `code` | `code` | **read-only, server-generated** (`PO-2026-0091`-style) — reuse the same race-safe `next_code()`/`CodeSequence` pattern already in `apps/kitchen/utils.py` rather than reinventing it |
| `supplier` | `supplierId` | FK, required on create |
| `supplier_name` | *(derived client-side today)* | read-only |
| `status` | `status` | **read-only, server-computed** — see status logic below, client never sets this directly |
| `priority` | `priority` | `NORMAL` \| `HIGH` \| `URGENT`, client-settable |
| `expected_date` | `expectedDate` | required |
| `delivery_address` | `deliveryAddress` | |
| `notes` | `notes` | |
| `raised_by` | *(derived client-side today)* | read-only, `request.user` at creation — matches `raised_by` on `StockRequest`/`ProductionPlan` elsewhere |
| `raised_by_name` | `raisedBy` | read-only, `source="raised_by.get_full_name"` |
| `raised_at` | `raisedAt` | read-only, `auto_now_add` |
| `rejection_reason` | `rejectionReason` | read-only, only set via the reject action below |
| `line_items` | `lineItems` | nested, writable on create: `[{item, qty_ordered, unit, unit_price}]` |

**Status logic on create** (currently client-side in `FoodOpsContext.createPurchaseOrder` —
**must move server-side**, since a client can't be trusted to self-report
"under threshold, auto-sent"):
- Sum `qty_ordered * unit_price` across all line items.
- If total > `PO_APPROVAL_THRESHOLD` (₦50,000 — see `mockData.ts`, make this a
  Django setting so it's changeable without a redeploy): status = `AWAITING_APPROVAL`.
- Otherwise: status = `SENT`.

**Custom actions** (mirror the `@action` pattern used throughout
`apps/kitchen/views.py`, e.g. `BatchProductionViewSet.complete`):
- `POST /api/store/purchase-orders/{id}/approve/` — Manager only, 403 otherwise.
  Only valid from `AWAITING_APPROVAL` → `SENT`; 400 if called on a PO in any
  other status.
- `POST /api/store/purchase-orders/{id}/reject/` — Manager only. Body:
  `{"reason": "..."}`, required, non-empty (matches the frontend's `Reject`
  form, which disables submit until a reason is entered). Sets
  `status = REJECTED` and stores `rejection_reason`. Only valid from
  `AWAITING_APPROVAL`.

Both actions should call `log_action()` (the existing audit-trail helper in
`apps/accounts/utils.py`) — Kitchen's `AuditLog` already has no per-app
restriction, so PO approve/reject entries can land in the same audit feed.

---

## Receiving (GRN)

`GET/POST /api/store/grns/`

Permission: Manager or Store Keeper (matches "Receive Stock" in the spec's
permission matrix).

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `code` | `code` | read-only, server-generated (`GRN-2026-0041`-style, same `CodeSequence` pattern) |
| `po` | `poId` | FK, nullable |
| `po_code` | *(derived client-side today)* | read-only |
| `supplier` | `supplierId` | FK, required |
| `supplier_name` | *(derived client-side today)* | read-only |
| `delivery_note` | `deliveryNote` | |
| `receiving_temp_c` | `receivingTempC` | free text |
| `status` | `status` | **read-only, server-computed**, see below |
| `received_by` / `received_by_name` | `receivedBy` | read-only, `request.user` |
| `received_at` | `receivedAt` | read-only, `auto_now_add` |
| `line_items` | `lineItems` | nested, writable on create: `[{item, qty_ordered, qty_received, qty_rejected, quality, expiry_date, reject_reason}]` |

**This is the one endpoint with real side effects — must be a single atomic
transaction**, same shape as `BatchProductionViewSet.complete()`:

1. Create the GRN + line items.
2. For each line: `item.on_hand += (qty_received - qty_rejected)`. Rejected
   units never enter usable inventory (matches the comment already in
   `FoodOpsContext.createGRN`).
3. Compute GRN `status`: any line with `qty_rejected > 0` → `DISPUTED`; else
   any line with `qty_received + qty_rejected < qty_ordered` → `PARTIAL`;
   else `COMPLETE`.
4. If `po` is set, update the linked PO's `status`: `PARTIAL` if any line was
   short or rejected, else `COMPLETE`.
5. `log_action()` the GRN confirmation.

No separate "confirm" step — unlike Kitchen's plan → batch → complete flow,
the frontend creates the GRN and applies its effects in one call (`POST`
*is* the confirmation). Keep it that way; don't add a draft state unless a
real need shows up.

---

## Stock movement ledger

Not a CRUD resource the frontend calls directly — a read-only trail of every
quantity change to a Store item, used to power "last movement" on Stock
levels and to reconstruct opening/closing stock in Reports without needing
point-in-time snapshots. Mirrored today by `StockMovement` in `types.ts` and
`FoodOpsContext`'s `recordMovement()` helper, called internally by every
mutator that changes `on_hand`.

`GET /api/store/stock-movements/?item={id}&from={date}&to={date}`

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `item` | `itemId` | FK |
| `type` | `type` | `RECEIPT` \| `DISPATCH` \| `WASTAGE` \| `ADJUSTMENT` |
| `qty` | `qty` | decimal, **signed** — positive is stock in, negative is stock out |
| `reference` | `reference` | free text, e.g. a GRN code, a dispatch destination, "Manual stocktake correction" |
| `occurred_at` | `occurredAt` | read-only, `auto_now_add` |

Write a row here as a side effect of each of these, never directly from the
client:
- GRN confirmation → one `RECEIPT` row per line (`qty_received - qty_rejected`).
- A stocktake `PATCH` to `item.on_hand` where the new value differs from the
  old → one `ADJUSTMENT` row (`new_on_hand - old_on_hand`), reference
  `"Manual stocktake correction"`.
- Dispatch confirm/manual dispatch (below) → one `DISPATCH` row, `qty`
  negative.
- Wastage log (below) → one `WASTAGE` row, `qty` negative.

---

## Dispatch

Two distinct actions today, both frontend-only mock writes against
`stockMovements` — no dedicated Store backend endpoint exists yet:

1. **Confirming a pending Kitchen request** — the frontend already calls
   Kitchen's real, existing endpoints directly (`GET
   /api/kitchen/stock-requests/?status=PENDING` then `POST
   /api/kitchen/stock-requests/{id}/mark-fulfilled/`), matching the
   ingredient to a Store item by case-insensitive name (the two modules
   don't share an item master yet — see *Known gaps*). This is a real,
   working integration today, not mocked; it just doesn't decrement a real
   Store `on_hand` anywhere, only the in-memory `stockMovements` ledger.
2. **Manual dispatch** — destination (free text today, `"Kitchen"` \|
   `"Front of House"` offered as suggestions, not enforced), item, qty,
   reason — no Kitchen-side counterpart, purely a Store-side movement.

When this gets a real backend, both paths should converge on the same
`POST /api/store/dispatch/` endpoint (`{item, qty, destination, reference,
kitchen_stock_request_id?}`) that writes a `DISPATCH` movement and decrements
`item.on_hand` server-side — with (1) still also calling Kitchen's
`mark-fulfilled` action as it does today. Note Kitchen's `mark_fulfilled` has
no partial-quantity parameter (it always adds the full `qty_requested`); if
partial fulfillment ever matters, that's a Kitchen-side change, out of scope
for Store.

---

## Wastage (Store-side)

Distinct from Kitchen's existing `/api/kitchen/wastage/` — this is Store
inventory shrinkage (expired/spoiled/damaged stock, not kitchen prep waste).

`GET/POST /api/store/wastage/`, `POST /api/store/wastage/{id}/acknowledge/`

Permission: **log** — Manager or Store Keeper. **acknowledge** — Manager only.

| JSON field (backend) | `types.ts` field | Notes |
|---|---|---|
| `id` | `id` | |
| `item` | `itemId` | FK, required |
| `qty` | `qty` | decimal, required — **server must reject if `qty > item.on_hand`**, matching the frontend's `overAvailable` guard (don't trust the client-side check alone) |
| `reason` | `reason` | `EXPIRED` \| `SPOILED` \| `DAMAGED` \| `OVER_PRODUCED` \| `PREP_WASTE` \| `THEFT_SUSPECTED` |
| `notes` | `notes` | required when `reason = THEFT_SUSPECTED` (frontend already enforces this client-side; enforce server-side too) |
| `estimated_value` | `estimatedValue` | **server-computed**, `qty * item.unit_cost` at time of logging — snapshot it, don't recompute live later, same reasoning as Kitchen's batch-completion cost snapshot |
| `logged_by` / `logged_by_name` | `loggedBy` | read-only, `request.user` |
| `logged_at` | `loggedAt` | read-only, `auto_now_add` |
| `acknowledged_by` / `acknowledged_by_name` | `acknowledgedBy` | null until acknowledged |
| `acknowledged_at` | `acknowledgedAt` | null until acknowledged |

**On create**: decrement `item.on_hand -= qty` and write a `WASTAGE`
stock-movement row (`qty` negative), in the same transaction — mirrors GRN's
side-effect pattern above.

**Acknowledgement threshold**: entries where `estimated_value >
WASTAGE_ACKNOWLEDGEMENT_THRESHOLD` (₦5,000 — see `types.ts`, make this a
Django setting like the PO approval threshold) need a Manager to call the
`acknowledge` action before they're considered resolved — matches the spec's
"wastage above ₦5,000 requires supervisor sign-off" rule. The frontend
surfaces unacknowledged over-threshold entries as a "Needs supervisor
sign-off" section (Manager view) and a toast at the moment of logging.

---

## Store reports

**Not built as a dedicated endpoint yet** — `/store/reports` currently
computes everything client-side from the `items`/`suppliers`/`purchase-orders`/
`grns`/`stock-movements`/`wastage` list responses, same "fine until real data
volume says otherwise" reasoning as the Store dashboard above. The one piece
of real logic worth mirroring server-side if/when this becomes a dedicated
endpoint:

- **Opening/closing stock per item, for an arbitrary date range**, computed
  by taking each item's *current* `on_hand` as `closing` and subtracting the
  signed sum of that item's stock-movement rows that fall inside the range —
  i.e. `opening = closing - sum(movements in range)`. This is why the
  movement ledger above exists: it means Reports never needs a point-in-time
  snapshot table that could drift out of sync with the real `on_hand`.
- **Supplier performance** (`computeSupplierPerformance` in `types.ts`) is
  the same on-time-%/quality-average computation already described under
  *Suppliers* above (`delivery_accuracy_pct`/`quality_avg`) — Reports just
  renders it per-supplier in a table instead of as a single summary field.
  Once suppliers carry those fields server-computed, Reports can either
  reuse them directly or recompute scoped to the selected date range,
  whichever the real backend implementation makes cheaper.

---

## Dashboard

**Not a new endpoint yet.** `/store/dashboard` currently computes all its KPIs
client-side from the `suppliers`/`items`/`purchase-orders` list responses —
that's fine at real-world Store data volumes for now. Only build a dedicated
`/api/store/dashboard/` aggregation endpoint (mirroring
`apps/kitchen/views.py`'s `DashboardView`) if list-endpoint pagination or
data volume actually makes client-side aggregation slow — don't build it
speculatively.

---

## Known gaps this contract doesn't cover yet

Matches the "Known limitations" already called out in the main README —
listed here so nothing gets silently assumed:

- All 9 reference-mockup screens are now built frontend-only, including
  Stock levels, Dispatch, Wastage, and Reports (see their sections above) —
  but none of them have a real backend endpoint yet, only in-memory mock
  state.
- Store items are matched to Kitchen ingredients **by case-insensitive
  name** on the Dispatch screen — there's no shared item master between the
  two modules. A real shared master (or an explicit mapping table) is worth
  building before this ships for real; name matching is a stopgap.
- No PO approval SLA/escalation (spec: 4-hour auto-escalation alert) — not
  built anywhere yet, frontend or backend.
- Supplier `FLAGGED` status auto-trigger (delivery accuracy < 70% over 30
  days) — not built.
- The Suppliers list view still shows static seeded `delivery_accuracy_pct`/
  `quality_avg` rather than the real `computeSupplierPerformance` figures
  that Reports already uses — worth making consistent once Suppliers is
  revisited.
