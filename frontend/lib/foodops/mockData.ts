import type { GRN, PurchaseOrder, StoreItem, Supplier } from "./types";

/** Above this value a purchase order needs Manager sign-off before it can
 * go to the supplier — mirrors the GM-approval rule in the reference
 * mockup. */
export const PO_APPROVAL_THRESHOLD = 50000;

export const initialSuppliers: Supplier[] = [
  { id: 1, name: "Emeka Foods Ltd", category: "Proteins", contactName: "Chukwuemeka Obi", contactPhone: "0803-445-2211", paymentTerms: "Net 30", leadTimeDays: 2, deliveryAccuracyPct: 94, qualityAvg: 4.7, status: "ACTIVE" },
  { id: 2, name: "Sunshine Produce", category: "Produce", contactName: "Fatima Abdullahi", contactPhone: "0812-334-9900", paymentTerms: "Cash on delivery", leadTimeDays: 1, deliveryAccuracyPct: 78, qualityAvg: 4.2, status: "ACTIVE" },
  { id: 3, name: "ColdChain Ltd", category: "Proteins", contactName: "James Okafor", contactPhone: "0701-221-8834", paymentTerms: "50% upfront", leadTimeDays: 3, deliveryAccuracyPct: 61, qualityAvg: 3.8, status: "FLAGGED" },
  { id: 4, name: "DryGoods Warehouse", category: "Dry goods", contactName: "Ngozi Eze", contactPhone: "0905-778-0023", paymentTerms: "Net 14", leadTimeDays: 2, deliveryAccuracyPct: 91, qualityAvg: 4.5, status: "ACTIVE" },
  { id: 5, name: "Lagos Beverages Co.", category: "Beverages", contactName: "Tunde Adeyemi", contactPhone: "0818-992-1100", paymentTerms: "Net 7", leadTimeDays: 1, deliveryAccuracyPct: 98, qualityAvg: 4.9, status: "ACTIVE" },
  { id: 6, name: "FreshPack Supplies", category: "Packaging", contactName: "Amina Bello", contactPhone: "0903-556-7712", paymentTerms: "Net 14", leadTimeDays: 3, deliveryAccuracyPct: 89, qualityAvg: 4.3, status: "ACTIVE" },
];

export const initialItems: StoreItem[] = [
  { id: 1, name: "Long grain rice", category: "Dry goods", barcode: "4901234", preferredSupplierId: 1, buyUnit: "50 kg bag", useUnit: "kg", reorderLevel: 25, maxLevel: 200, onHand: 12, unitCost: 950, shelfLifeDays: 180, location: "Main store" },
  { id: 2, name: "Whole chicken (frozen)", category: "Proteins", barcode: "7823001", preferredSupplierId: 3, buyUnit: "1 kg", useUnit: "kg", reorderLevel: 30, maxLevel: 120, onHand: 18, unitCost: 1800, shelfLifeDays: 90, location: "Cold room" },
  { id: 3, name: "Fresh tomatoes", category: "Produce", barcode: "5512340", preferredSupplierId: 2, buyUnit: "1 kg", useUnit: "kg", reorderLevel: 20, maxLevel: 80, onHand: 34, unitCost: 620, shelfLifeDays: 7, location: "Dry store" },
  { id: 4, name: "Palm oil (refined)", category: "Dry goods", barcode: "3301129", preferredSupplierId: 4, buyUnit: "25 L drum", useUnit: "L", reorderLevel: 15, maxLevel: 75, onHand: 8, unitCost: 1800, shelfLifeDays: 365, location: "Main store" },
  { id: 5, name: "Bottled water (50cl)", category: "Beverages", barcode: "6690012", preferredSupplierId: 5, buyUnit: "1 crate (24)", useUnit: "unit", reorderLevel: 5, maxLevel: 40, onHand: 22, unitCost: 3600, shelfLifeDays: 365, location: "Main store" },
  { id: 6, name: "Scotch bonnet pepper", category: "Produce", barcode: "5512390", preferredSupplierId: 2, buyUnit: "1 kg", useUnit: "kg", reorderLevel: 10, maxLevel: 50, onHand: 28, unitCost: 1400, shelfLifeDays: 5, location: "Dry store" },
  { id: 7, name: "Onions (red)", category: "Produce", barcode: "5512395", preferredSupplierId: 2, buyUnit: "1 kg", useUnit: "kg", reorderLevel: 15, maxLevel: 60, onHand: 22, unitCost: 500, shelfLifeDays: 14, location: "Dry store" },
];

export const initialPurchaseOrders: PurchaseOrder[] = [
  {
    id: 1, code: "PO-2026-0090", supplierId: 2, status: "AWAITING_APPROVAL", priority: "NORMAL",
    expectedDate: "2026-07-14", deliveryAddress: "Victoria Island Branch — 12 Kofo Abayomi St, Lagos", notes: "",
    raisedBy: "Akin Okonkwo", raisedAt: "2026-07-10T09:00:00",
    lineItems: [{ id: 1, itemId: 3, qtyOrdered: 40, unit: "kg", unitPrice: 700 }, { id: 2, itemId: 7, qtyOrdered: 20, unit: "kg", unitPrice: 500 }],
  },
  {
    id: 2, code: "PO-2026-0089", supplierId: 1, status: "AWAITING_APPROVAL", priority: "HIGH",
    expectedDate: "2026-07-13", deliveryAddress: "Victoria Island Branch — 12 Kofo Abayomi St, Lagos", notes: "",
    raisedBy: "Akin Okonkwo", raisedAt: "2026-07-10T07:30:00",
    lineItems: [{ id: 3, itemId: 1, qtyOrdered: 100, unit: "kg", unitPrice: 950 }, { id: 4, itemId: 2, qtyOrdered: 40, unit: "kg", unitPrice: 1800 }],
  },
  {
    id: 3, code: "PO-2026-0087", supplierId: 3, status: "AWAITING_APPROVAL", priority: "URGENT",
    expectedDate: "2026-07-12", deliveryAddress: "Victoria Island Branch — 12 Kofo Abayomi St, Lagos", notes: "Overdue — escalate if not approved by EOD.",
    raisedBy: "Akin Okonkwo", raisedAt: "2026-07-09T10:00:00",
    lineItems: [{ id: 5, itemId: 2, qtyOrdered: 80, unit: "kg", unitPrice: 1800 }],
  },
  {
    id: 4, code: "PO-2026-0088", supplierId: 5, status: "SENT", priority: "NORMAL",
    expectedDate: "2026-07-13", deliveryAddress: "Victoria Island Branch — 12 Kofo Abayomi St, Lagos", notes: "",
    raisedBy: "Akin Okonkwo", raisedAt: "2026-07-09T11:00:00",
    lineItems: [{ id: 6, itemId: 5, qtyOrdered: 15, unit: "crate", unitPrice: 3600 }],
  },
  {
    id: 5, code: "PO-2026-0086", supplierId: 4, status: "COMPLETE", priority: "NORMAL",
    expectedDate: "2026-07-11", deliveryAddress: "Victoria Island Branch — 12 Kofo Abayomi St, Lagos", notes: "",
    raisedBy: "Akin Okonkwo", raisedAt: "2026-07-08T09:00:00",
    lineItems: [{ id: 7, itemId: 4, qtyOrdered: 25, unit: "L", unitPrice: 1800 }],
  },
];

export const initialGRNs: GRN[] = [
  {
    id: 1, code: "GRN-2026-0040", poId: 5, supplierId: 4, deliveryNote: "DGW-INV-3312", receivingTempC: "",
    status: "COMPLETE", receivedBy: "Akin Okonkwo", receivedAt: "2026-07-11T09:14:00",
    lineItems: [{ id: 1, itemId: 4, qtyOrdered: 25, qtyReceived: 25, qtyRejected: 0, quality: 5, expiryDate: "2027-07-11", rejectReason: "" }],
  },
];

let nextId = 1000;
export function generateId(): number {
  nextId += 1;
  return nextId;
}

export function generateCode(prefix: "PO" | "GRN", year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}
