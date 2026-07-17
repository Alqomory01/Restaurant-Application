export type MenuAvailability = "ALL_DAY" | "BREAKFAST" | "LUNCH" | "DINNER";

export interface ModifierOption {
  label: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: number;
  name: string;
  options: ModifierOption[];
}

export interface ComboConfig {
  itemIds: number[];
  comboPrice: number;
}

export interface HappyHourConfig {
  startTime: string;
  endTime: string;
  price: number;
}

export interface BulkDiscountConfig {
  minQty: number;
  pct: number;
}

/** Standard VAT rate applied to menu prices — spec 6.1.1 wants both
 * exclusive and inclusive prices shown, not a second field typed by hand. */
export const TAX_RATE = 0.075;

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  /** FK to a real Kitchen `Recipe.id` — nullable since not every sellable
   * item (e.g. a bottled drink) needs a kitchen recipe behind it. */
  recipeId: number | null;
  /** Cached at link time for display and for name-matching finished batches
   * during "sync from Kitchen" — see computeSyncableBatches(). */
  recipeName: string | null;
  category: string;
  /** Lightweight image stand-in — no upload infra exists yet, and an emoji
   * renders identically in every theme without needing an asset pipeline. */
  emoji: string;
  sellingPrice: number;
  availability: MenuAvailability;
  modifierGroups: ModifierGroup[];
  combo: ComboConfig | null;
  active: boolean;
  happyHour: HappyHourConfig | null;
  bulkDiscount: BulkDiscountConfig | null;
  staffMealPrice: number | null;
  /** Portions physically ready to sell right now — pushed here by Kitchen
   * batch completion (via syncFromKitchen) and decremented by each sale.
   * Distinct from Kitchen's own raw-ingredient stock: this is *finished*
   * counter stock, matching spec 6.4's "counter availability" concept. */
  counterQty: number;
  lowStockThreshold: number;
}

export type CounterStockMovementType = "PRODUCTION_SYNC" | "SALE" | "VOID_RESTORE" | "MANUAL_ADJUSTMENT";

export interface CounterStockMovement {
  id: number;
  menuItemId: number;
  type: CounterStockMovementType;
  /** Signed — positive for stock coming onto the counter, negative for a
   * sale leaving it. */
  qty: number;
  reference: string;
  occurredAt: string;
}

export type CounterAvailabilityStatus = "SOLD_OUT" | "LOW" | "AVAILABLE";

export function counterAvailability(item: MenuItem): CounterAvailabilityStatus {
  if (item.counterQty <= 0) return "SOLD_OUT";
  if (item.counterQty <= item.lowStockThreshold) return "LOW";
  return "AVAILABLE";
}

export interface SelectedModifier {
  groupName: string;
  optionLabel: string;
  priceDelta: number;
}

export interface OrderLine {
  id: number;
  menuItemId: number;
  qty: number;
  unitPrice: number;
  selectedModifiers: SelectedModifier[];
  note: string;
  isComplimentary: boolean;
  complimentaryReason: string | null;
}

export function lineTotal(line: OrderLine): number {
  if (line.isComplimentary) return 0;
  const modifierTotal = line.selectedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  return (line.unitPrice + modifierTotal) * line.qty;
}

export type OrderStatus = "OPEN" | "PAID" | "VOIDED";

export interface Order {
  id: number;
  code: string;
  tableOrCounterNumber: string;
  lines: OrderLine[];
  discountPct: number;
  discountReason: string;
  status: OrderStatus;
  shiftId: number;
  openedBy: string;
  openedAt: string;
  closedAt: string | null;
  voidReason: string | null;
  voidedBy: string | null;
}

export interface OrderTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}

export function computeOrderTotals(order: Pick<Order, "lines" | "discountPct">): OrderTotals {
  const subtotal = order.lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const discountTotal = Math.round(subtotal * (order.discountPct / 100) * 100) / 100;
  const taxable = subtotal - discountTotal;
  const taxTotal = Math.round(taxable * TAX_RATE * 100) / 100;
  const total = Math.round((taxable + taxTotal) * 100) / 100;
  return { subtotal, discountTotal, taxTotal, total };
}

export type PaymentMethod = "CASH" | "CARD" | "MOBILE_TRANSFER" | "VOUCHER";

export interface Payment {
  id: number;
  orderId: number;
  method: PaymentMethod;
  amount: number;
  changeGiven: number;
  reference: string;
  recordedAt: string;
}

/** Spec 6.3.2's own example figure — refunds under this need only FOH
 * Supervisor authorization; above it needs dual GM approval. */
export const REFUND_APPROVAL_THRESHOLD = 5000;

export interface Refund {
  id: number;
  orderId: number;
  amount: number;
  method: PaymentMethod;
  reasonCode: string;
  authorizedBy: string;
  createdAt: string;
}

export type CashierRole = "CASHIER" | "FOH_SUPERVISOR";

/** Spec 6.5's "if a cashier's session has a cash shortage above threshold
 * for three consecutive shifts, flag the account and notify GM" rule. */
export const SHORTAGE_FLAG_COUNT = 3;
export const SHORTAGE_THRESHOLD = 1000;

export interface CashierProfile {
  id: number;
  name: string;
  pin: string;
  role: CashierRole;
  consecutiveShortageShifts: number;
  flagged: boolean;
}

/** Standard till float every shift is expected to open with — a counted
 * amount that differs from this gets flagged for supervisor acknowledgement
 * immediately, per spec 6.5.1. */
export const STANDARD_OPENING_FLOAT = 20000;

export type ShiftStatus = "OPEN" | "CLOSED";

export interface Shift {
  id: number;
  cashierId: number;
  cashierName: string;
  openedAt: string;
  openingFloat: number;
  floatDiscrepancy: number;
  closedAt: string | null;
  closingCashCounted: number | null;
  expectedCashAtClose: number | null;
  cashVariance: number | null;
  status: ShiftStatus;
}
