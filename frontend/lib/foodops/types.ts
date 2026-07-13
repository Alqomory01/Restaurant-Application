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
