"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ToastProvider";
import { formatCurrency } from "@/lib/format";
import {
  PO_APPROVAL_THRESHOLD,
  generateCode,
  generateId,
  initialGRNs,
  initialItems,
  initialPurchaseOrders,
  initialSuppliers,
} from "./mockData";
import type { GRN, GRNLineItem, POLineItem, PurchaseOrder, StoreItem, Supplier } from "./types";

const APPROVAL_OVERDUE_HOURS = 4;
const OVERDUE_CHECK_INTERVAL_MS = 60000;

interface NewPOInput {
  supplierId: number;
  priority: PurchaseOrder["priority"];
  expectedDate: string;
  deliveryAddress: string;
  notes: string;
  lineItems: Omit<POLineItem, "id">[];
  raisedBy: string;
}

interface NewGRNInput {
  poId: number | null;
  supplierId: number;
  deliveryNote: string;
  receivingTempC: string;
  receivedBy: string;
  lineItems: Omit<GRNLineItem, "id">[];
}

interface FoodOpsContextValue {
  suppliers: Supplier[];
  items: StoreItem[];
  purchaseOrders: PurchaseOrder[];
  grns: GRN[];
  /** Every mutator here is async and can reject, even though today's
   * implementation is a synchronous in-memory update that never actually
   * fails — matching the shape real API calls will have (see
   * lib/foodops/API_CONTRACT.md) means callers already await + try/catch
   * correctly, so swapping the internals later touches only this file. */
  addSupplier: (input: Omit<Supplier, "id">) => Promise<Supplier>;
  updateSupplier: (id: number, input: Omit<Supplier, "id">) => Promise<Supplier>;
  addItem: (input: Omit<StoreItem, "id">) => Promise<StoreItem>;
  updateItem: (id: number, input: Omit<StoreItem, "id">) => Promise<StoreItem>;
  createPurchaseOrder: (input: NewPOInput) => Promise<PurchaseOrder>;
  approvePurchaseOrder: (id: number) => Promise<void>;
  rejectPurchaseOrder: (id: number, reason: string) => Promise<void>;
  createGRN: (input: NewGRNInput) => Promise<GRN>;
}

const FoodOpsContext = createContext<FoodOpsContextValue | null>(null);

export function FoodOpsProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [items, setItems] = useState<StoreItem[]>(initialItems);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialPurchaseOrders);
  const [grns, setGrns] = useState<GRN[]>(initialGRNs);
  const poSequence = useRef(90);
  const grnSequence = useRef(40);
  const { pushToast } = useToast();

  const addSupplier = async (input: Omit<Supplier, "id">): Promise<Supplier> => {
    const supplier: Supplier = { ...input, id: generateId() };
    setSuppliers((prev) => [...prev, supplier]);
    return supplier;
  };

  const updateSupplier = async (id: number, input: Omit<Supplier, "id">): Promise<Supplier> => {
    const supplier: Supplier = { ...input, id };
    setSuppliers((prev) => prev.map((s) => (s.id === id ? supplier : s)));
    return supplier;
  };

  const addItem = async (input: Omit<StoreItem, "id">): Promise<StoreItem> => {
    const item: StoreItem = { ...input, id: generateId() };
    setItems((prev) => [...prev, item]);
    return item;
  };

  const updateItem = async (id: number, input: Omit<StoreItem, "id">): Promise<StoreItem> => {
    const item: StoreItem = { ...input, id };
    setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
    return item;
  };

  const createPurchaseOrder = async (input: NewPOInput): Promise<PurchaseOrder> => {
    poSequence.current += 1;
    const total = input.lineItems.reduce((sum, li) => sum + li.qtyOrdered * li.unitPrice, 0);
    const po: PurchaseOrder = {
      id: generateId(),
      code: generateCode("PO", 2026, poSequence.current),
      supplierId: input.supplierId,
      status: total > PO_APPROVAL_THRESHOLD ? "AWAITING_APPROVAL" : "SENT",
      priority: input.priority,
      expectedDate: input.expectedDate,
      deliveryAddress: input.deliveryAddress,
      notes: input.notes,
      raisedBy: input.raisedBy,
      raisedAt: new Date().toISOString(),
      lineItems: input.lineItems.map((li) => ({ ...li, id: generateId() })),
    };
    setPurchaseOrders((prev) => [po, ...prev]);

    if (po.status === "AWAITING_APPROVAL") {
      const supplierName = suppliers.find((s) => s.id === po.supplierId)?.name ?? "supplier";
      pushToast({
        tone: "warning",
        title: "New PO awaiting approval",
        message: `${po.code} · ${formatCurrency(total)} · ${supplierName} — needs Manager approval.`,
        href: "/store/purchase-orders",
      });
    }

    return po;
  };

  const approvePurchaseOrder = async (id: number): Promise<void> => {
    setPurchaseOrders((prev) => prev.map((po) => (po.id === id ? { ...po, status: "SENT" } : po)));
  };

  const rejectPurchaseOrder = async (id: number, reason: string): Promise<void> => {
    setPurchaseOrders((prev) => prev.map((po) => (po.id === id ? { ...po, status: "REJECTED", rejectionReason: reason } : po)));
  };

  const createGRN = async (input: NewGRNInput): Promise<GRN> => {
    grnSequence.current += 1;
    const lineItems = input.lineItems.map((li) => ({ ...li, id: generateId() }));
    const anyRejected = lineItems.some((li) => li.qtyRejected > 0);
    const anyShort = lineItems.some((li) => li.qtyReceived + li.qtyRejected < li.qtyOrdered);
    const status: GRN["status"] = anyRejected ? "DISPUTED" : anyShort ? "PARTIAL" : "COMPLETE";

    const grn: GRN = {
      id: generateId(),
      code: generateCode("GRN", 2026, grnSequence.current),
      poId: input.poId,
      supplierId: input.supplierId,
      deliveryNote: input.deliveryNote,
      receivingTempC: input.receivingTempC,
      status,
      receivedBy: input.receivedBy,
      receivedAt: new Date().toISOString(),
      lineItems,
    };

    // A GRN is the moment stock actually changes hands — rejected units
    // never entered usable inventory, so only (received - rejected) lands
    // on hand.
    setItems((prev) =>
      prev.map((item) => {
        const line = lineItems.find((li) => li.itemId === item.id);
        if (!line) return item;
        return { ...item, onHand: item.onHand + (line.qtyReceived - line.qtyRejected) };
      })
    );

    if (input.poId) {
      setPurchaseOrders((prev) =>
        prev.map((po) => (po.id === input.poId ? { ...po, status: anyShort || anyRejected ? "PARTIAL" : "COMPLETE" } : po))
      );
    }

    setGrns((prev) => [grn, ...prev]);

    if (status === "DISPUTED" || status === "PARTIAL") {
      const supplierName = suppliers.find((s) => s.id === input.supplierId)?.name ?? "supplier";
      pushToast({
        tone: "danger",
        title: status === "DISPUTED" ? "Delivery has rejected items" : "Short delivery received",
        message: `${grn.code} · ${supplierName} — check the receiving log for details.`,
        href: "/store/receiving",
      });
    }

    return grn;
  };

  // Spec's "PO approval overdue (4 hours)" alert — checked on an interval
  // rather than tied to any single mutation, since it depends on elapsed
  // time, not on something changing. Each PO only fires once per session.
  const alertedOverdueIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    function checkOverdue() {
      const now = Date.now();
      for (const po of purchaseOrders) {
        if (po.status !== "AWAITING_APPROVAL" || alertedOverdueIds.current.has(po.id)) continue;
        const hoursWaiting = (now - new Date(po.raisedAt).getTime()) / (1000 * 60 * 60);
        if (hoursWaiting < APPROVAL_OVERDUE_HOURS) continue;
        alertedOverdueIds.current.add(po.id);
        pushToast({
          tone: "danger",
          title: "PO approval overdue",
          message: `${po.code} has been waiting on approval for over ${APPROVAL_OVERDUE_HOURS} hours.`,
          href: "/store/purchase-orders",
        });
      }
    }
    checkOverdue();
    const interval = setInterval(checkOverdue, OVERDUE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [purchaseOrders, pushToast]);

  const value = useMemo(
    () => ({
      suppliers,
      items,
      purchaseOrders,
      grns,
      addSupplier,
      updateSupplier,
      addItem,
      updateItem,
      createPurchaseOrder,
      approvePurchaseOrder,
      rejectPurchaseOrder,
      createGRN,
    }),
    [suppliers, items, purchaseOrders, grns]
  );

  return <FoodOpsContext.Provider value={value}>{children}</FoodOpsContext.Provider>;
}

export function useFoodOps() {
  const ctx = useContext(FoodOpsContext);
  if (!ctx) throw new Error("useFoodOps must be used within FoodOpsProvider");
  return ctx;
}
