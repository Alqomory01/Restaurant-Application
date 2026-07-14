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

- No Dispatch or Wastage endpoints (Store-side wastage, not Kitchen's
  existing one) — out of scope for the core procure-to-stock loop.
- No Store Reports endpoint (daily inventory movement, food cost breakdown,
  supplier performance) — the reference mockup has one, this build doesn't.
- No PO approval SLA/escalation (spec: 4-hour auto-escalation alert) — not
  built anywhere yet, frontend or backend.
- Supplier `FLAGGED` status auto-trigger (delivery accuracy < 70% over 30
  days) — not built.
