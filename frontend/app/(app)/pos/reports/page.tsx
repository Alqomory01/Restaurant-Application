"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePos } from "@/lib/pos/PosContext";
import { computeOrderTotals } from "@/lib/pos/types";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";

type RangeKey = "today" | "week" | "month";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "This month",
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

export default function PosReportsPage() {
  const { menuItems, orders, payments, refunds } = usePos();
  const [range, setRange] = useState<RangeKey>("today");
  const { from, to } = rangeFor(range);

  const inRange = (iso: string) => {
    const d = iso.slice(0, 10);
    return d >= from && d <= to;
  };

  const paidOrders = orders.filter((o) => o.status === "PAID" && inRange(o.openedAt));
  const voidedOrders = orders.filter((o) => o.status === "VOIDED" && inRange(o.openedAt));
  const rangePayments = payments.filter((p) => paidOrders.some((o) => o.id === p.orderId));
  const rangeRefunds = refunds.filter((r) => inRange(r.createdAt));

  const totalSales = paidOrders.reduce((sum, o) => sum + computeOrderTotals(o).total, 0);
  const avgOrderValue = paidOrders.length > 0 ? totalSales / paidOrders.length : 0;
  const cashCollected = rangePayments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amount, 0);
  const voidedValue = voidedOrders.reduce((sum, o) => sum + computeOrderTotals(o).total, 0);

  const itemSales = new Map<string, { qty: number; revenue: number }>();
  for (const order of paidOrders) {
    for (const line of order.lines) {
      const item = menuItems.find((m) => m.id === line.menuItemId);
      const name = item?.name ?? "Item";
      const revenue = line.isComplimentary ? 0 : (line.unitPrice + line.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.qty;
      const existing = itemSales.get(name) ?? { qty: 0, revenue: 0 };
      itemSales.set(name, { qty: existing.qty + line.qty, revenue: existing.revenue + revenue });
    }
  }
  const itemSalesRows = Array.from(itemSales.entries()).sort((a, b) => b[1].revenue - a[1].revenue);

  const byMethod = rangePayments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});
  const maxMethod = Math.max(...Object.values(byMethod), 1);

  function exportTransactionLog() {
    const header = ["Order", "Table/Counter", "Items", "Payment", "Amount", "Time", "Status"];
    const rows = [...orders]
      .filter((o) => inRange(o.openedAt))
      .map((o) => {
        const totals = computeOrderTotals(o);
        const orderPayments = payments.filter((p) => p.orderId === o.id);
        return [
          o.code,
          o.tableOrCounterNumber,
          o.lines.length,
          orderPayments.map((p) => p.method).join("/") || "—",
          totals.total,
          new Date(o.openedAt).toLocaleString("en-GB"),
          o.status,
        ];
      });
    downloadCsv(`pos-transactions-${from}-to-${to}.csv`, toCsv([header, ...rows]));
  }

  const rangeOrders = [...orders].filter((o) => inRange(o.openedAt)).sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

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
        <Button onClick={exportTransactionLog}>
          <Download className="h-3.5 w-3.5" strokeWidth={2} /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-medium text-ink-soft">Total sales</div>
          <div className="mt-2 text-2xl font-bold text-brand">{formatCurrency(totalSales)}</div>
          <div className="mt-1 text-xs text-ink-faint">{paidOrders.length} transactions</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-soft">Avg order value</div>
          <div className="mt-2 text-2xl font-bold text-ink">{formatCurrency(avgOrderValue)}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-soft">Cash collected</div>
          <div className="mt-2 text-2xl font-bold text-ink">{formatCurrency(cashCollected)}</div>
          <div className="mt-1 text-xs text-ink-faint">{totalSales > 0 ? Math.round((cashCollected / totalSales) * 100) : 0}% of revenue</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-soft">Voids</div>
          <div className="mt-2 text-2xl font-bold text-danger">{voidedOrders.length}</div>
          <div className="mt-1 text-xs text-ink-faint">{formatCurrency(voidedValue)} voided</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Sales by item" />
          {itemSalesRows.length === 0 ? (
            <EmptyState>No transactions in this range.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="pb-2 pr-3">Item</th>
                    <th className="pb-2 pr-3">Qty</th>
                    <th className="pb-2 pr-3">Revenue</th>
                    <th className="pb-2">% of sales</th>
                  </tr>
                </thead>
                <tbody>
                  {itemSalesRows.map(([name, d]) => (
                    <tr key={name} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium text-ink">{name}</td>
                      <td className="py-2 pr-3 text-ink-soft">{d.qty}</td>
                      <td className="py-2 pr-3 text-ink">{formatCurrency(d.revenue)}</td>
                      <td className="py-2 text-ink-faint">{totalSales > 0 ? Math.round((d.revenue / totalSales) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Sales by payment method" />
          {Object.keys(byMethod).length === 0 ? (
            <EmptyState>No sales in this range.</EmptyState>
          ) : (
            <div className="space-y-2">
              {Object.entries(byMethod).map(([method, amount]) => (
                <div key={method} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-ink-soft">{method.replace("_", " ")}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(amount / maxMethod) * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-ink-faint">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-border pt-3">
            <CardHeader title="Refunds" />
            {rangeRefunds.length === 0 ? (
              <p className="text-xs text-ink-faint">No refunds in this range.</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {rangeRefunds.map((r) => {
                  const order = orders.find((o) => o.id === r.orderId);
                  return (
                    <div key={r.id} className="flex justify-between">
                      <span className="text-ink-soft">{order?.code ?? "—"} · {r.reasonCode}</span>
                      <span className="font-semibold text-danger">{formatCurrency(r.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Transaction log" />
        {rangeOrders.length === 0 ? (
          <EmptyState>No transactions in this range.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="pb-2 pr-3">Order</th>
                  <th className="pb-2 pr-3">Table/Counter</th>
                  <th className="pb-2 pr-3">Items</th>
                  <th className="pb-2 pr-3">Payment</th>
                  <th className="pb-2 pr-3">Amount</th>
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rangeOrders.map((o) => {
                  const totals = computeOrderTotals(o);
                  const orderPayments = payments.filter((p) => p.orderId === o.id);
                  return (
                    <tr key={o.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono text-ink">{o.code}</td>
                      <td className="py-2 pr-3 text-ink-soft">{o.tableOrCounterNumber}</td>
                      <td className="py-2 pr-3 text-ink-soft">{o.lines.length} item(s)</td>
                      <td className="py-2 pr-3 text-ink-soft">{orderPayments.map((p) => p.method).join(" / ") || "—"}</td>
                      <td className="py-2 pr-3 font-semibold text-brand">{formatCurrency(totals.total)}</td>
                      <td className="py-2 pr-3 text-ink-faint">{new Date(o.openedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-2">
                        <Badge tone={o.status === "PAID" ? "success" : o.status === "VOIDED" ? "danger" : "neutral"}>{o.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
