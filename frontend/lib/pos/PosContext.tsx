"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import type { BatchProduction } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";
import { formatCurrency } from "@/lib/format";
import { generateId, generateOrderCode, initialCashiers, initialMenuItems } from "./mockData";
import type {
  CashierProfile,
  CounterStockMovement,
  CounterStockMovementType,
  MenuItem,
  Order,
  OrderLine,
  Payment,
  PaymentMethod,
  Refund,
  SelectedModifier,
  Shift,
} from "./types";
import {
  REFUND_APPROVAL_THRESHOLD,
  SHORTAGE_FLAG_COUNT,
  SHORTAGE_THRESHOLD,
  STANDARD_OPENING_FLOAT,
} from "./types";

interface NewLineInput {
  menuItemId: number;
  qty: number;
  unitPrice: number;
  selectedModifiers: SelectedModifier[];
  note: string;
  isComplimentary: boolean;
  complimentaryReason: string | null;
}

interface ChargeLeg {
  method: PaymentMethod;
  amount: number;
  changeGiven: number;
  reference: string;
}

interface RefundInput {
  amount: number;
  method: PaymentMethod;
  reasonCode: string;
  authorizedBy: string;
}

interface SyncResult {
  syncedCount: number;
  totalPortions: number;
  unmatched: string[];
}

interface PosContextValue {
  menuItems: MenuItem[];
  counterMovements: CounterStockMovement[];
  orders: Order[];
  payments: Payment[];
  refunds: Refund[];
  cashiers: CashierProfile[];
  shifts: Shift[];
  activeShift: Shift | null;
  addMenuItem: (input: Omit<MenuItem, "id">) => Promise<MenuItem>;
  updateMenuItem: (id: number, input: Omit<MenuItem, "id">) => Promise<MenuItem>;
  openShift: (cashierId: number, openingFloat: number) => Promise<Shift>;
  closeShift: (shiftId: number, closingCashCounted: number) => Promise<Shift>;
  createOrder: (tableOrCounterNumber: string) => Promise<Order>;
  addLine: (orderId: number, input: NewLineInput) => Promise<void>;
  updateLine: (orderId: number, lineId: number, patch: Partial<OrderLine>) => Promise<void>;
  removeLine: (orderId: number, lineId: number) => Promise<void>;
  setDiscount: (orderId: number, discountPct: number, discountReason: string) => Promise<void>;
  chargeOrder: (orderId: number, legs: ChargeLeg[]) => Promise<void>;
  voidOrder: (orderId: number, reason: string, voidedBy: string) => Promise<void>;
  refundOrder: (orderId: number, input: RefundInput) => Promise<Refund>;
  syncFromKitchen: () => Promise<SyncResult>;
}

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initialMenuItems);
  const [counterMovements, setCounterMovements] = useState<CounterStockMovement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [cashiers, setCashiers] = useState<CashierProfile[]>(initialCashiers);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const orderSequence = useRef(0);
  const syncedBatchIds = useRef<Set<number>>(new Set());
  const { pushToast } = useToast();

  const activeShift = shifts.find((s) => s.status === "OPEN") ?? null;

  function recordCounterMovement(menuItemId: number, type: CounterStockMovementType, qty: number, reference: string) {
    setCounterMovements((prev) => [
      { id: generateId(), menuItemId, type, qty, reference, occurredAt: new Date().toISOString() },
      ...prev,
    ]);
  }

  function adjustCounterQty(menuItemId: number, delta: number, type: CounterStockMovementType, reference: string) {
    let crossedSoldOut = false;
    let itemName = "";
    setMenuItems((prev) =>
      prev.map((item) => {
        if (item.id !== menuItemId) return item;
        const nextQty = Math.max(0, item.counterQty + delta);
        if (item.counterQty > 0 && nextQty === 0) {
          crossedSoldOut = true;
          itemName = item.name;
        }
        return { ...item, counterQty: nextQty };
      })
    );
    recordCounterMovement(menuItemId, type, delta, reference);
    if (crossedSoldOut) {
      pushToast({
        tone: "danger",
        title: "Item sold out",
        message: `${itemName} just hit zero on the counter — Kitchen needs to know to start the next batch.`,
        href: "/pos/dashboard",
      });
    }
  }

  const addMenuItem = async (input: Omit<MenuItem, "id">): Promise<MenuItem> => {
    const item: MenuItem = { ...input, id: generateId() };
    setMenuItems((prev) => [...prev, item]);
    return item;
  };

  const updateMenuItem = async (id: number, input: Omit<MenuItem, "id">): Promise<MenuItem> => {
    const item: MenuItem = { ...input, id };
    setMenuItems((prev) => prev.map((i) => (i.id === id ? item : i)));
    return item;
  };

  const openShift = async (cashierId: number, openingFloat: number): Promise<Shift> => {
    const cashier = cashiers.find((c) => c.id === cashierId);
    const floatDiscrepancy = openingFloat - STANDARD_OPENING_FLOAT;
    const shift: Shift = {
      id: generateId(),
      cashierId,
      cashierName: cashier?.name ?? "Unknown",
      openedAt: new Date().toISOString(),
      openingFloat,
      floatDiscrepancy,
      closedAt: null,
      closingCashCounted: null,
      expectedCashAtClose: null,
      cashVariance: null,
      status: "OPEN",
    };
    setShifts((prev) => [shift, ...prev]);

    if (floatDiscrepancy !== 0) {
      pushToast({
        tone: "warning",
        title: "Opening float discrepancy",
        message: `${cashier?.name ?? "Cashier"} counted ${formatCurrency(openingFloat)} — expected ${formatCurrency(
          STANDARD_OPENING_FLOAT
        )} (${floatDiscrepancy > 0 ? "+" : ""}${formatCurrency(floatDiscrepancy)}). Supervisor should acknowledge.`,
        href: "/pos/shift",
      });
    }

    return shift;
  };

  const closeShift = async (shiftId: number, closingCashCounted: number): Promise<Shift> => {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) throw new Error("Shift not found");

    // A voided order's payment no longer represents cash actually sitting in
    // the drawer — voidOrder hands it back to the customer — so it must be
    // excluded here even though the Payment row itself is never deleted.
    const shiftPayments = payments.filter((p) => {
      const order = orders.find((o) => o.id === p.orderId);
      return order?.shiftId === shiftId && order.status !== "VOIDED";
    });
    const shiftRefunds = refunds.filter((r) => orders.find((o) => o.id === r.orderId)?.shiftId === shiftId);
    const cashSales = shiftPayments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amount, 0);
    const cashRefunds = shiftRefunds.filter((r) => r.method === "CASH").reduce((sum, r) => sum + r.amount, 0);
    const expectedCashAtClose = shift.openingFloat + cashSales - cashRefunds;
    const cashVariance = Math.round((closingCashCounted - expectedCashAtClose) * 100) / 100;

    const updated: Shift = {
      ...shift,
      closedAt: new Date().toISOString(),
      closingCashCounted,
      expectedCashAtClose,
      cashVariance,
      status: "CLOSED",
    };
    setShifts((prev) => prev.map((s) => (s.id === shiftId ? updated : s)));

    const isShortage = cashVariance < -SHORTAGE_THRESHOLD;
    setCashiers((prev) =>
      prev.map((c) => {
        if (c.id !== shift.cashierId) return c;
        const consecutiveShortageShifts = isShortage ? c.consecutiveShortageShifts + 1 : 0;
        const flagged = consecutiveShortageShifts >= SHORTAGE_FLAG_COUNT;
        return { ...c, consecutiveShortageShifts, flagged };
      })
    );

    const cashierAfter = cashiers.find((c) => c.id === shift.cashierId);
    const wouldFlag = isShortage && (cashierAfter?.consecutiveShortageShifts ?? 0) + 1 >= SHORTAGE_FLAG_COUNT;

    if (Math.abs(cashVariance) > SHORTAGE_THRESHOLD) {
      pushToast({
        tone: cashVariance < 0 ? "danger" : "warning",
        title: cashVariance < 0 ? "Cash shortage at shift close" : "Cash overage at shift close",
        message: `${shift.cashierName} — ${formatCurrency(Math.abs(cashVariance))} ${
          cashVariance < 0 ? "short" : "over"
        } against expected. ${wouldFlag ? "3rd consecutive shortage — account flagged for GM review." : "Supervisor review recommended."}`,
        href: "/pos/shifts",
      });
    }

    return updated;
  };

  const createOrder = async (tableOrCounterNumber: string): Promise<Order> => {
    if (!activeShift) throw new Error("No active shift");
    orderSequence.current += 1;
    const order: Order = {
      id: generateId(),
      code: generateOrderCode(2026, orderSequence.current),
      tableOrCounterNumber,
      lines: [],
      discountPct: 0,
      discountReason: "",
      status: "OPEN",
      shiftId: activeShift.id,
      openedBy: activeShift.cashierName,
      openedAt: new Date().toISOString(),
      closedAt: null,
      voidReason: null,
      voidedBy: null,
    };
    setOrders((prev) => [order, ...prev]);
    return order;
  };

  const addLine = async (orderId: number, input: NewLineInput): Promise<void> => {
    const line: OrderLine = { ...input, id: generateId() };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, lines: [...o.lines, line] } : o)));
  };

  const updateLine = async (orderId: number, lineId: number, patch: Partial<OrderLine>): Promise<void> => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } : o
      )
    );
  };

  const removeLine = async (orderId: number, lineId: number): Promise<void> => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, lines: o.lines.filter((l) => l.id !== lineId) } : o))
    );
  };

  const setDiscount = async (orderId: number, discountPct: number, discountReason: string): Promise<void> => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, discountPct, discountReason } : o)));
  };

  const chargeOrder = async (orderId: number, legs: ChargeLeg[]): Promise<void> => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const newPayments: Payment[] = legs.map((leg) => ({
      id: generateId(),
      orderId,
      method: leg.method,
      amount: leg.amount,
      changeGiven: leg.changeGiven,
      reference: leg.reference,
      recordedAt: new Date().toISOString(),
    }));
    setPayments((prev) => [...newPayments, ...prev]);

    for (const line of order.lines) {
      adjustCounterQty(line.menuItemId, -line.qty, "SALE", order.code);
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "PAID", closedAt: new Date().toISOString() } : o))
    );
  };

  const voidOrder = async (orderId: number, reason: string, voidedBy: string): Promise<void> => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    if (order.status === "PAID") {
      for (const line of order.lines) {
        adjustCounterQty(line.menuItemId, line.qty, "VOID_RESTORE", `Void ${order.code}`);
      }
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "VOIDED", voidReason: reason, voidedBy } : o))
    );
  };

  const refundOrder = async (orderId: number, input: RefundInput): Promise<Refund> => {
    const refund: Refund = { ...input, id: generateId(), orderId, createdAt: new Date().toISOString() };
    setRefunds((prev) => [refund, ...prev]);

    if (input.amount > REFUND_APPROVAL_THRESHOLD) {
      const order = orders.find((o) => o.id === orderId);
      pushToast({
        tone: "warning",
        title: "Above-threshold refund processed",
        message: `${formatCurrency(input.amount)} on ${order?.code ?? "order"} — required dual GM approval, authorized by ${input.authorizedBy}.`,
        href: "/pos/orders",
      });
    }

    return refund;
  };

  const syncFromKitchen = async (): Promise<SyncResult> => {
    let batches: BatchProduction[];
    try {
      const data = await api.get<{ results?: BatchProduction[] } | BatchProduction[]>("/kitchen/batches/");
      batches = Array.isArray(data) ? data : data.results ?? [];
    } catch (err) {
      pushToast({ tone: "danger", title: "Sync from Kitchen failed", message: errorMessage(err, "Could not reach the Kitchen module.") });
      return { syncedCount: 0, totalPortions: 0, unmatched: [] };
    }

    // Kitchen's batches endpoint has no server-side status filter, same gap
    // already found on the stock-requests endpoint — filter client-side.
    const completed = batches.filter((b) => b.status === "COMPLETE" && !syncedBatchIds.current.has(b.id));

    let syncedCount = 0;
    let totalPortions = 0;
    const unmatched: string[] = [];

    for (const batch of completed) {
      syncedBatchIds.current.add(batch.id);
      const qty = Number(batch.actual_qty ?? 0);
      if (qty <= 0) continue;
      const match = menuItems.find((m) => m.recipeName?.toLowerCase() === batch.recipe_name.toLowerCase());
      if (!match) {
        unmatched.push(batch.recipe_name);
        continue;
      }
      adjustCounterQty(match.id, qty, "PRODUCTION_SYNC", `Batch ${batch.batch_code}`);
      syncedCount += 1;
      totalPortions += qty;
    }

    if (syncedCount > 0) {
      pushToast({
        tone: "success",
        title: "Synced from Kitchen",
        message: `${syncedCount} completed batch${syncedCount === 1 ? "" : "es"} · ${totalPortions} portions added to the counter.`,
        href: "/pos/terminal",
      });
    }

    return { syncedCount, totalPortions, unmatched };
  };

  const value = useMemo(
    () => ({
      menuItems,
      counterMovements,
      orders,
      payments,
      refunds,
      cashiers,
      shifts,
      activeShift,
      addMenuItem,
      updateMenuItem,
      openShift,
      closeShift,
      createOrder,
      addLine,
      updateLine,
      removeLine,
      setDiscount,
      chargeOrder,
      voidOrder,
      refundOrder,
      syncFromKitchen,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuItems, counterMovements, orders, payments, refunds, cashiers, shifts, activeShift]
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used within PosProvider");
  return ctx;
}
