export type SupplierStatus = "ACTIVE" | "FLAGGED" | "INACTIVE";

export interface Supplier {
  id: number;
  name: string;
  category: string;
  contactName: string;
  contactPhone: string;
  paymentTerms: string;
  leadTimeDays: number;
  deliveryAccuracyPct: number;
  qualityAvg: number;
  status: SupplierStatus;
}

export interface StoreItem {
  id: number;
  name: string;
  category: string;
  barcode: string;
  preferredSupplierId: number | null;
  buyUnit: string;
  useUnit: string;
  reorderLevel: number;
  maxLevel: number;
  onHand: number;
  unitCost: number;
  shelfLifeDays: number | null;
  location: string;
}

export type StockStatus = "CRITICAL" | "LOW" | "HEALTHY";

export function stockStatus(item: StoreItem): StockStatus {
  if (item.onHand <= item.reorderLevel * 0.6) return "CRITICAL";
  if (item.onHand <= item.reorderLevel) return "LOW";
  return "HEALTHY";
}

export type POStatus = "DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "SENT" | "PARTIAL" | "COMPLETE" | "REJECTED";

export interface POLineItem {
  id: number;
  itemId: number;
  qtyOrdered: number;
  unit: string;
  unitPrice: number;
}

export interface PurchaseOrder {
  id: number;
  code: string;
  supplierId: number;
  status: POStatus;
  priority: "NORMAL" | "HIGH" | "URGENT";
  expectedDate: string;
  deliveryAddress: string;
  notes: string;
  raisedBy: string;
  raisedAt: string;
  rejectionReason?: string;
  lineItems: POLineItem[];
}

export type GRNStatus = "IN_PROGRESS" | "COMPLETE" | "DISPUTED" | "PARTIAL";

export interface GRNLineItem {
  id: number;
  itemId: number;
  qtyOrdered: number;
  qtyReceived: number;
  qtyRejected: number;
  quality: number;
  expiryDate: string | null;
  rejectReason: string;
}

export interface GRN {
  id: number;
  code: string;
  poId: number | null;
  supplierId: number;
  deliveryNote: string;
  receivingTempC: string;
  status: GRNStatus;
  receivedBy: string;
  receivedAt: string;
  lineItems: GRNLineItem[];
}

/** Spec section 4.5.1's six stock movement types — RETURN and PRODUCTION
 * DEDUCTION happen in other modules (supplier returns aren't built here;
 * production deduction is Kitchen's, not Store's), so only the four that
 * actually originate in this module are tracked. Every on-hand change
 * anywhere in FoodOpsContext writes one of these, so Reports' inventory
 * movement table isn't reconstructed from snapshots — it's a real ledger. */
export type StockMovementType = "RECEIPT" | "DISPATCH" | "WASTAGE" | "ADJUSTMENT";

export interface StockMovement {
  id: number;
  itemId: number;
  type: StockMovementType;
  /** Signed — positive for stock coming in (RECEIPT, an upward ADJUSTMENT),
   * negative for stock going out (DISPATCH, WASTAGE, a downward ADJUSTMENT). */
  qty: number;
  reference: string;
  occurredAt: string;
}

export type StoreWastageReason = "EXPIRED" | "SPOILED" | "DAMAGED" | "OVER_PRODUCED" | "PREP_WASTE" | "THEFT_SUSPECTED";

/** Value above which the spec requires supervisor (Manager) sign-off before
 * the entry is permanently logged. */
export const WASTAGE_ACKNOWLEDGEMENT_THRESHOLD = 5000;

export interface StoreWastageEntry {
  id: number;
  itemId: number;
  qty: number;
  reason: StoreWastageReason;
  notes: string;
  estimatedValue: number;
  loggedBy: string;
  loggedAt: string;
  /** Only present when estimatedValue > WASTAGE_ACKNOWLEDGEMENT_THRESHOLD. */
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface SupplierPerformance {
  deliveryAccuracyPct: number | null;
  qualityAvg: number | null;
  grnCount: number;
}

/** Real, not seeded — "on time" means the GRN's receivedAt date is on or
 * before the linked PO's expectedDate. A GRN with no linked PO (a manual
 * receipt) doesn't count toward accuracy since there's nothing to be on
 * time against, but its line quality still counts toward the quality avg.
 * Returns nulls (not 0) when there's no GRN history yet, so "no data" and
 * "perfect record" render differently rather than both showing 0%/0. */
export function computeSupplierPerformance(
  supplierId: number,
  grns: GRN[],
  purchaseOrders: PurchaseOrder[]
): SupplierPerformance {
  const supplierGrns = grns.filter((g) => g.supplierId === supplierId);
  if (supplierGrns.length === 0) return { deliveryAccuracyPct: null, qualityAvg: null, grnCount: 0 };

  let onTimeCount = 0;
  let timedCount = 0;
  let qualitySum = 0;
  let qualityCount = 0;

  for (const grn of supplierGrns) {
    if (grn.poId) {
      const po = purchaseOrders.find((p) => p.id === grn.poId);
      if (po?.expectedDate) {
        timedCount += 1;
        const receivedDate = grn.receivedAt.slice(0, 10);
        if (receivedDate <= po.expectedDate) onTimeCount += 1;
      }
    }
    for (const line of grn.lineItems) {
      qualitySum += line.quality;
      qualityCount += 1;
    }
  }

  return {
    deliveryAccuracyPct: timedCount > 0 ? Math.round((onTimeCount / timedCount) * 100) : null,
    qualityAvg: qualityCount > 0 ? qualitySum / qualityCount : null,
    grnCount: supplierGrns.length,
  };
}
