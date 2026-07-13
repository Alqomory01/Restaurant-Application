"use client";

import { useState } from "react";
import { AlertTriangle, ClipboardCheck, Truck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import type { GRNStatus } from "@/lib/foodops/types";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const grnStatusTone: Record<GRNStatus, "success" | "warning" | "danger"> = {
  IN_PROGRESS: "warning",
  COMPLETE: "success",
  DISPUTED: "danger",
  PARTIAL: "warning",
};

const inputCls = "w-full rounded-md border border-border-2 px-2 py-1.5";

interface DraftLine {
  itemId: number;
  qtyOrdered: number;
  qtyReceived: string;
  qtyRejected: string;
  quality: string;
  expiryDate: string;
  rejectReason: string;
}

export default function ReceivingPage() {
  const { user } = useAuth();
  const { items, suppliers, purchaseOrders, grns, createGRN } = useFoodOps();
  const [selectedPoId, setSelectedPoId] = useState<number | "">("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [receivingTemp, setReceivingTemp] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [result, setResult] = useState<{ code: string; shortItems: string[] } | null>(null);

  const itemName = (id: number) => items.find((i) => i.id === id)?.name ?? "—";
  const supplierName = (id: number) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const pendingDeliveries = purchaseOrders.filter((po) => po.status === "SENT");
  const selectedPo = purchaseOrders.find((po) => po.id === selectedPoId) ?? null;

  function pickPO(poId: number) {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    setSelectedPoId(poId);
    setResult(null);
    setLines(
      po.lineItems.map((li) => ({
        itemId: li.itemId,
        qtyOrdered: li.qtyOrdered,
        qtyReceived: String(li.qtyOrdered),
        qtyRejected: "0",
        quality: "5",
        expiryDate: "",
        rejectReason: "",
      }))
    );
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const shortfalls = lines.filter((l) => (Number(l.qtyReceived) || 0) + (Number(l.qtyRejected) || 0) < l.qtyOrdered);
  const discrepancyCount = lines.filter(
    (l) => (Number(l.qtyReceived) || 0) + (Number(l.qtyRejected) || 0) !== l.qtyOrdered || Number(l.qtyRejected) > 0
  ).length;

  function handleConfirm() {
    if (!selectedPo) return;
    const grn = createGRN({
      poId: selectedPo.id,
      supplierId: selectedPo.supplierId,
      deliveryNote,
      receivingTempC: receivingTemp,
      receivedBy: `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Unknown",
      lineItems: lines.map((l) => ({
        itemId: l.itemId,
        qtyOrdered: l.qtyOrdered,
        qtyReceived: Number(l.qtyReceived) || 0,
        qtyRejected: Number(l.qtyRejected) || 0,
        quality: Number(l.quality) || 0,
        expiryDate: l.expiryDate || null,
        rejectReason: l.rejectReason,
      })),
    });
    setResult({
      code: grn.code,
      shortItems: shortfalls.map((l) => itemName(l.itemId)),
    });
    setSelectedPoId("");
    setLines([]);
    setDeliveryNote("");
    setReceivingTemp("");
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="New goods received note" />
          <div className="mb-4 space-y-1 text-xs">
            <label className="font-semibold text-ink-soft">Purchase order</label>
            <Combobox
              placeholder="Select a sent PO to receive against…"
              value={selectedPoId}
              onChange={pickPO}
              options={pendingDeliveries.map((po) => ({
                value: po.id,
                label: po.code,
                sublabel: supplierName(po.supplierId),
              }))}
              emptyLabel="No purchase orders are waiting on delivery."
            />
          </div>

          {!selectedPo ? (
            <EmptyState icon={Truck}>Select a purchase order above to start receiving its delivery.</EmptyState>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-semibold text-ink-soft">Supplier delivery note / invoice no.</label>
                  <input className={inputCls} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-ink-soft">Receiving temperature (cold chain)</label>
                  <input
                    className={inputCls}
                    value={receivingTemp}
                    onChange={(e) => setReceivingTemp(e.target.value)}
                    placeholder="°C — required for proteins and dairy"
                  />
                </div>
              </div>

              <div className="mb-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="text-left text-ink-soft">
                      <th className="pb-2">Item</th>
                      <th className="pb-2">PO qty</th>
                      <th className="pb-2">Qty received</th>
                      <th className="pb-2">Qty rejected</th>
                      <th className="pb-2">Quality (1–5)</th>
                      <th className="pb-2">Expiry date</th>
                      <th className="pb-2">Reject reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-2 pr-2 font-medium text-ink">{itemName(line.itemId)}</td>
                        <td className="py-2 pr-2 text-ink-soft">{line.qtyOrdered}</td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            className={inputCls}
                            value={line.qtyReceived}
                            onChange={(e) => updateLine(i, { qtyReceived: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            className={inputCls}
                            value={line.qtyRejected}
                            onChange={(e) => updateLine(i, { qtyRejected: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select className={inputCls} value={line.quality} onChange={(e) => updateLine(i, { quality: e.target.value })}>
                            <option value="5">5</option>
                            <option value="4">4</option>
                            <option value="3">3</option>
                            <option value="2">2</option>
                            <option value="1">1</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            className={inputCls}
                            value={line.expiryDate}
                            onChange={(e) => updateLine(i, { expiryDate: e.target.value })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            className={inputCls}
                            value={line.rejectReason}
                            onChange={(e) => updateLine(i, { rejectReason: e.target.value })}
                            placeholder={Number(line.qtyRejected) > 0 ? "Required" : "—"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {shortfalls.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg p-3 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                  <div>
                    <strong>Short delivery detected — {shortfalls.length} item(s).</strong> {shortfalls.map((l) => itemName(l.itemId)).join(", ")}{" "}
                    received less than ordered. The purchase order will be marked partially received.
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-surface-2 p-2">
                  <div className="text-base font-bold text-info">{lines.length}</div>
                  <div className="text-ink-soft">Items on PO</div>
                </div>
                <div className="rounded-md bg-surface-2 p-2">
                  <div className="text-base font-bold text-success">{lines.length - discrepancyCount}</div>
                  <div className="text-ink-soft">Items as expected</div>
                </div>
                <div className="rounded-md bg-surface-2 p-2">
                  <div className="text-base font-bold text-warning">{discrepancyCount}</div>
                  <div className="text-ink-soft">Discrepancies</div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="primary" onClick={handleConfirm}>
                  <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2} /> Confirm GRN & update inventory
                </Button>
              </div>
            </>
          )}
        </Card>

        {result && (
          <div className="rounded-md border border-success/25 bg-success-bg p-3 text-xs text-success">
            <strong>{result.code} confirmed.</strong> Kitchen stock levels have been updated.
            {result.shortItems.length > 0 && (
              <> The linked purchase order is marked partially received for: {result.shortItems.join(", ")}.</>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Recent GRNs" />
          {grns.length === 0 ? (
            <EmptyState>No goods received yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="pb-2">GRN</th>
                    <th className="pb-2">Supplier</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {grns.slice(0, 6).map((g) => (
                    <tr key={g.id} className="border-t border-border">
                      <td className="py-2 font-mono text-ink-soft">{g.code}</td>
                      <td className="py-2 text-ink">{supplierName(g.supplierId)}</td>
                      <td className="py-2">
                        <Badge tone={grnStatusTone[g.status]}>{g.status.replaceAll("_", " ")}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Pending deliveries" />
          {pendingDeliveries.length === 0 ? (
            <EmptyState icon={Truck}>Nothing out for delivery right now.</EmptyState>
          ) : (
            <div className="space-y-2">
              {pendingDeliveries.map((po) => (
                <div key={po.id} className="rounded-md border-l-4 border-info bg-info-bg p-2.5 text-xs text-info">
                  <div className="font-semibold">
                    {po.code} · {supplierName(po.supplierId)}
                  </div>
                  <div>
                    Expected {po.expectedDate} · {po.lineItems.length} items
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
