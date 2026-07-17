"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePos } from "@/lib/pos/PosContext";
import { computeOrderTotals, counterAvailability } from "@/lib/pos/types";
import { Badge, Card, CardHeader, EmptyState, KpiTile } from "@/components/ui";

function isToday(iso: string) {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export default function PosDashboardPage() {
  const { menuItems, orders, payments, refunds, syncFromKitchen } = usePos();
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const paidToday = orders.filter((o) => o.status === "PAID" && isToday(o.openedAt));
  const salesTotal = paidToday.reduce((sum, o) => sum + computeOrderTotals(o).total, 0);
  const avgOrderValue = paidToday.length > 0 ? salesTotal / paidToday.length : 0;
  const voidCount = orders.filter((o) => o.status === "VOIDED" && isToday(o.openedAt)).length;
  const refundTotal = refunds.filter((r) => isToday(r.createdAt)).reduce((sum, r) => sum + r.amount, 0);

  const todaysPayments = payments.filter((p) => isToday(p.recordedAt) && paidToday.some((o) => o.id === p.orderId));
  const byMethod = todaysPayments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});

  const lowOrSoldOut = menuItems.filter((m) => m.active && counterAvailability(m) !== "AVAILABLE");
  const recentOrders = [...orders].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()).slice(0, 6);

  async function handleSync() {
    setSyncing(true);
    try {
      await syncFromKitchen();
      setLastSynced(new Date().toISOString());
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Sales today" value={formatCurrency(salesTotal)} sub={`${paidToday.length} orders`} tone="success" icon={Wallet} />
        <KpiTile label="Avg order value" value={formatCurrency(avgOrderValue)} tone="neutral" icon={TrendingUp} />
        <KpiTile label="Voids today" value={voidCount} tone={voidCount > 0 ? "warning" : "neutral"} icon={AlertTriangle} />
        <KpiTile label="Refunds today" value={formatCurrency(refundTotal)} tone={refundTotal > 0 ? "danger" : "neutral"} icon={ShoppingBag} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Counter availability needing attention"
            action={
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-md border border-border-2 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-surface-2 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} strokeWidth={2} />
                {syncing ? "Syncing…" : "Sync from Kitchen"}
              </button>
            }
          />
          {lastSynced && (
            <p className="mb-2 text-[11px] text-ink-faint">
              Last synced {new Date(lastSynced).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {lowOrSoldOut.length === 0 ? (
            <EmptyState>Counter is fully stocked.</EmptyState>
          ) : (
            <div className="space-y-2">
              {lowOrSoldOut.map((item) => {
                const status = counterAvailability(item);
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{item.emoji}</span>
                      <div>
                        <div className="font-semibold text-ink">{item.name}</div>
                        <div className="text-ink-faint">{item.counterQty} on the counter</div>
                      </div>
                    </div>
                    <Badge tone={status === "SOLD_OUT" ? "danger" : "warning"}>{status === "SOLD_OUT" ? "Sold out" : "Low"}</Badge>
                  </div>
                );
              })}
            </div>
          )}
          <Link href="/pos/menu" className="mt-3 inline-block text-xs font-semibold text-brand hover:underline">
            Manage menu & counter stock →
          </Link>
        </Card>

        <Card>
          <CardHeader title="Sales by payment method" />
          {Object.keys(byMethod).length === 0 ? (
            <EmptyState>No sales recorded today.</EmptyState>
          ) : (
            <div className="space-y-2">
              {Object.entries(byMethod).map(([method, amount]) => (
                <div key={method} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 text-ink-soft">{method.replace("_", " ")}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${salesTotal > 0 ? (amount / salesTotal) * 100 : 0}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-ink-faint">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent orders" action={<Link href="/pos/orders" className="text-xs font-semibold text-brand hover:underline">View all →</Link>} />
        {recentOrders.length === 0 ? (
          <EmptyState icon={ShoppingBag}>No orders yet — head to the Terminal to punch one.</EmptyState>
        ) : (
          <div className="divide-y divide-border text-xs">
            {recentOrders.map((order) => {
              const totals = computeOrderTotals(order);
              return (
                <div key={order.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="font-semibold text-ink">{order.code}</span>
                    <span className="ml-2 text-ink-faint">Table/Counter {order.tableOrCounterNumber} · {order.openedBy}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{formatCurrency(totals.total)}</span>
                    <Badge tone={order.status === "PAID" ? "success" : order.status === "VOIDED" ? "danger" : "neutral"}>{order.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
