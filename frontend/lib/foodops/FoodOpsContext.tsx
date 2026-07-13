"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
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
  addSupplier: (input: Omit<Supplier, "id">) => void;
  updateSupplier: (id: number, input: Omit<Supplier, "id">) => void;
  addItem: (input: Omit<StoreItem, "id">) => void;
  updateItem: (id: number, input: Omit<StoreItem, "id">) => void;
  createPurchaseOrder: (input: NewPOInput) => PurchaseOrder;
  approvePurchaseOrder: (id: number) => void;
  rejectPurchaseOrder: (id: number, reason: string) => void;
  createGRN: (input: NewGRNInput) => GRN;
}

const FoodOpsContext = createContext<FoodOpsContextValue | null>(null);

export function FoodOpsProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [items, setItems] = useState<StoreItem[]>(initialItems);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialPurchaseOrders);
  const [grns, setGrns] = useState<GRN[]>(initialGRNs);
  const poSequence = useRef(90);
  const grnSequence = useRef(40);

  const addSupplier = (input: Omit<Supplier, "id">) => {
    setSuppliers((prev) => [...prev, { ...input, id: generateId() }]);
  };

  const updateSupplier = (id: number, input: Omit<Supplier, "id">) => {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...input, id } : s)));
  };

  const addItem = (input: Omit<StoreItem, "id">) => {
    setItems((prev) => [...prev, { ...input, id: generateId() }]);
  };

  const updateItem = (id: number, input: Omit<StoreItem, "id">) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...input, id } : i)));
  };

  const createPurchaseOrder = (input: NewPOInput): PurchaseOrder => {
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
    return po;
  };

  const approvePurchaseOrder = (id: number) => {
    setPurchaseOrders((prev) => prev.map((po) => (po.id === id ? { ...po, status: "SENT" } : po)));
  };

  const rejectPurchaseOrder = (id: number, reason: string) => {
    setPurchaseOrders((prev) => prev.map((po) => (po.id === id ? { ...po, status: "REJECTED", rejectionReason: reason } : po)));
  };

  const createGRN = (input: NewGRNInput): GRN => {
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
    return grn;
  };

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
