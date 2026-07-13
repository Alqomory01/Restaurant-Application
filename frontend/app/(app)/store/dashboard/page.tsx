"use client";

import Link from "next/link";
import { AlertTriangle, ClipboardList, FileText, Package, Users } from "lucide-react";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import { stockStatus } from "@/lib/foodops/types";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, KpiTile, Badge, EmptyState } from "@/components/ui";

const poStatusTone: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  DRAFT: "neutral",
  AWAITING_APPROVAL: "warning",
  APPROVED: "success",
  SENT: "info",
  PARTIAL: "warning",
  COMPLETE: "success",
  REJECTED: "danger",
};

const stockTone: Record<string, "success" | "warning" | "danger"> = {
  HEALTHY: "success",
  LOW: "warning",
  CRITICAL: "danger",
};

export default function StoreDashboardPage() {
  const { items, suppliers, purchaseOrders } = useFoodOps();

  const lowStockItems = items.filter((i) => stockStatus(i) !== "HEALTHY").sort((a, b) => a.onHand / a.reorderLevel - b.onHand / b.reorderLevel);
  const openPOs = purchaseOrders.filter((po) => !["COMPLETE", "REJECTED"].includes(po.status));
  const awaitingApproval = purchaseOrders.filter((po) => po.status === "AWAITING_APPROVAL");
  const activeSuppliers = suppliers.filter((s) => s.status === "ACTIVE");
  const recentPOs = [...purchaseOrders].slice(0, 6);

  const supplierName = (id: number) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const poTotal = (po: (typeof purchaseOrders)[number]) => po.lineItems.reduce((sum, li) => sum + li.qtyOrdered * li.unitPrice, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Package} label="Items in stock" value={items.length} sub="Across all storage locations" />
        <KpiTile
          icon={FileText}
          label="Open purchase orders"
          value={openPOs.length}
          tone={awaitingApproval.length > 0 ? "warning" : "neutral"}
          sub={awaitingApproval.length > 0 ? `${awaitingApproval.length} awaiting approval` : "None awaiting approval"}
        />
        <KpiTile
          icon={AlertTriangle}
          label="Low stock alerts"
          value={lowStockItems.length}
          tone={lowStockItems.length > 0 ? "danger" : "success"}
          sub="Items at or below reorder level"
        />
        <KpiTile icon={Users} label="Active suppliers" value={activeSuppliers.length} sub={`${suppliers.length} total on file`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Low stock alerts"
            action={
              <Link href="/store/items" className="text-xs font-semibold text-brand hover:underline">
                View all items
              </Link>
            }
          />
          {lowStockItems.length === 0 ? (
            <EmptyState icon={Package}>Nothing below reorder level right now.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="pb-2">Item</th>
                    <th className="pb-2">On hand</th>
                    <th className="pb-2">Reorder at</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="py-2.5 font-medium text-ink">{item.name}</td>
                      <td className="py-2.5 text-ink-soft">
                        {item.onHand} {item.useUnit}
                      </td>
                      <td className="py-2.5 text-ink-soft">
                        {item.reorderLevel} {item.useUnit}
                      </td>
                      <td className="py-2.5">
                        <Badge tone={stockTone[stockStatus(item)]}>{stockStatus(item)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Pending approvals"
            action={
              <Link href="/store/purchase-orders" className="text-xs font-semibold text-brand hover:underline">
                View all
              </Link>
            }
          />
          {awaitingApproval.length === 0 ? (
            <EmptyState icon={ClipboardList}>Nothing waiting on approval.</EmptyState>
          ) : (
            <div className="space-y-2">
              {awaitingApproval.map((po) => (
                <div key={po.id} className="rounded-md border-l-4 border-warning bg-warning-bg p-2.5 text-xs">
                  <div className="font-semibold text-warning">{po.code}</div>
                  <div className="text-warning">
                    {formatCurrency(poTotal(po))} · {supplierName(po.supplierId)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent purchase order activity"
          action={
            <Link href="/store/purchase-orders" className="text-xs font-semibold text-brand hover:underline">
              View all
            </Link>
          }
        />
        {recentPOs.length === 0 ? (
          <EmptyState icon={FileText}>No purchase orders yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="pb-2">PO number</th>
                  <th className="pb-2">Supplier</th>
                  <th className="pb-2">Items</th>
                  <th className="pb-2">Total value</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPOs.map((po) => (
                  <tr key={po.id} className="border-t border-border">
                    <td className="py-2.5 font-mono text-ink-soft">{po.code}</td>
                    <td className="py-2.5 font-medium text-ink">{supplierName(po.supplierId)}</td>
                    <td className="py-2.5 text-ink-soft">{po.lineItems.length} items</td>
                    <td className="py-2.5 text-ink-soft">{formatCurrency(poTotal(po))}</td>
                    <td className="py-2.5">
                      <Badge tone={poStatusTone[po.status]}>{po.status.replaceAll("_", " ")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
