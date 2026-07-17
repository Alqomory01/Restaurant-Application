"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import { computeSupplierPerformance, stockStatus, type StockStatus } from "@/lib/foodops/types";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";

type RangeKey = "today" | "week" | "month";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "This month",
};

const stockTone: Record<StockStatus, "success" | "warning" | "danger"> = {
  HEALTHY: "success",
  LOW: "warning",
  CRITICAL: "danger",
};

function toLocalISODate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function rangeFor(key: RangeKey): { from: string; to: string } {
  const today = new Date();
  const to = toLocalISODate(today);
  if (key === "today") return { from: to, to };
  if (key === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toLocalISODate(start), to };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: toLocalISODate(start), to };
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function StoreReportsPage() {
  const { items, suppliers, purchaseOrders, grns, stockMovements, wastageEntries } = useFoodOps();
  const [range, setRange] = useState<RangeKey>("today");
  const { from, to } = rangeFor(range);

  const inRange = (iso: string) => {
    const d = iso.slice(0, 10);
    return d >= from && d <= to;
  };

  const totalInventoryValue = items.reduce((sum, i) => sum + i.onHand * i.unitCost, 0);
  const posInRange = purchaseOrders.filter((po) => inRange(po.raisedAt));
  const posValue = posInRange.reduce((sum, po) => sum + po.lineItems.reduce((s, li) => s + li.qtyOrdered * li.unitPrice, 0), 0);
  const wastageInRange = wastageEntries.filter((w) => inRange(w.loggedAt));
  const wastageValue = wastageInRange.reduce((sum, w) => sum + w.estimatedValue, 0);
  const flaggedSuppliers = suppliers.filter((s) => s.status === "FLAGGED").length;

  const movementRows = items
    .map((item) => {
      const movements = stockMovements.filter((m) => m.itemId === item.id);
      const inRangeMovements = movements.filter((m) => inRange(m.occurredAt));
      const closing = item.onHand;
      const opening = closing - inRangeMovements.reduce((sum, m) => sum + m.qty, 0);
      const received = inRangeMovements.filter((m) => m.type === "RECEIPT").reduce((sum, m) => sum + m.qty, 0);
      const dispatched = inRangeMovements.filter((m) => m.type === "DISPATCH").reduce((sum, m) => sum + Math.abs(m.qty), 0);
      const wasted = inRangeMovements.filter((m) => m.type === "WASTAGE").reduce((sum, m) => sum + Math.abs(m.qty), 0);
      const adjusted = inRangeMovements.filter((m) => m.type === "ADJUSTMENT").reduce((sum, m) => sum + m.qty, 0);
      const hasActivity = inRangeMovements.length > 0;
      return { item, opening, received, dispatched, wasted, adjusted, closing, hasActivity };
    })
    .filter((row) => row.hasActivity || range === "today");

  function exportMovementCsv() {
    const header = ["Item", "Opening", "Received", "Dispatched", "Wasted", "Adjusted", "Closing", "Status"];
    const rows = movementRows.map((r) => [
      r.item.name,
      r.opening,
      r.received,
      r.dispatched,
      r.wasted,
      r.adjusted,
      r.closing,
      stockStatus(r.item),
    ]);
    downloadCsv(`store-inventory-movement-${from}-to-${to}.csv`, toCsv([header, ...rows]));
  }

  const supplierRows = suppliers.map((s) => ({ supplier: s, perf: computeSupplierPerformance(s.id, grns, purchaseOrders) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => (
            <Button key={key} variant={range === key ? "primary" : "default"} onClick={() => setRange(key)}>
              {RANGE_LABEL[key]}
            </Button>
          ))}
        </div>
        <Button onClick={exportMovementCsv}>
          <Download className="h-3.5 w-3.5" strokeWidth={2} /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-medium text-ink-soft">Total inventory value</div>
          <div className="mt-2 text-2xl font-bold text-brand">{formatCurrency(totalInventoryValue)}</div>
          <div className="mt-1 text-xs text-ink-faint">At current unit cost</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-soft">POs raised</div>
          <div className="mt-2 text-2xl font-bold text-ink">{posInRange.length}</div>
          <div className="mt-1 text-xs text-ink-faint">{formatCurrency(posValue)} total value</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-soft">Wastage cost</div>
          <div className="mt-2 text-2xl font-bold text-danger">{formatCurrency(wastageValue)}</div>
          <div className="mt-1 text-xs text-ink-faint">{wastageInRange.length} entries logged</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-soft">Suppliers flagged</div>
          <div className="mt-2 text-2xl font-bold text-warning">{flaggedSuppliers}</div>
          <div className="mt-1 text-xs text-ink-faint">Low delivery performance</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Daily inventory movement" />
          {movementRows.length === 0 ? (
            <EmptyState>No stock movement in this range.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="pb-2 pr-3">Item</th>
                    <th className="pb-2 pr-3">Opening</th>
                    <th className="pb-2 pr-3">Received</th>
                    <th className="pb-2 pr-3">Dispatched</th>
                    <th className="pb-2 pr-3">Wasted</th>
                    <th className="pb-2 pr-3">Adjusted</th>
                    <th className="pb-2 pr-3">Closing</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {movementRows.map((r) => (
                    <tr key={r.item.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium text-ink">{r.item.name}</td>
                      <td className="py-2 pr-3 text-ink-soft">{r.opening}</td>
                      <td className="py-2 pr-3 text-success">{r.received > 0 ? `+${r.received}` : "—"}</td>
                      <td className="py-2 pr-3 text-ink-soft">{r.dispatched > 0 ? r.dispatched : "—"}</td>
                      <td className="py-2 pr-3 text-danger">{r.wasted > 0 ? r.wasted : "—"}</td>
                      <td className={`py-2 pr-3 ${r.adjusted !== 0 ? (r.adjusted > 0 ? "text-success" : "text-danger") : "text-ink-soft"}`}>
                        {r.adjusted !== 0 ? (r.adjusted > 0 ? `+${r.adjusted}` : r.adjusted) : "—"}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-ink">{r.closing}</td>
                      <td className="py-2">
                        <Badge tone={stockTone[stockStatus(r.item)]}>{stockStatus(r.item)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Supplier performance" />
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="pb-2">Supplier</th>
                <th className="pb-2">Deliveries</th>
                <th className="pb-2">On time</th>
                <th className="pb-2">Quality</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.map(({ supplier, perf }) => (
                <tr key={supplier.id} className="border-t border-border">
                  <td className="py-2 font-medium text-ink">{supplier.name}</td>
                  <td className="py-2 text-ink-soft">{perf.grnCount}</td>
                  <td className="py-2">
                    {perf.deliveryAccuracyPct == null ? (
                      <span className="text-ink-faint">No data yet</span>
                    ) : (
                      <span className={perf.deliveryAccuracyPct >= 90 ? "text-success" : perf.deliveryAccuracyPct >= 75 ? "text-warning" : "text-danger"}>
                        {perf.deliveryAccuracyPct}%
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-ink-soft">{perf.qualityAvg != null ? `${perf.qualityAvg.toFixed(1)} / 5` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
