"use client";

import { useState } from "react";
import { AlertOctagon, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePos } from "@/lib/pos/PosContext";
import { Badge, Card, EmptyState } from "@/components/ui";

export default function ShiftsPage() {
  const { shifts, cashiers, orders, payments } = usePos();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = [...shifts].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

  return (
    <div className="space-y-4">
      {cashiers.some((c) => c.flagged) && (
        <Card className="border-danger/40 bg-danger-bg">
          <div className="flex items-center gap-2 text-danger">
            <AlertOctagon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="text-sm font-semibold">
              {cashiers.filter((c) => c.flagged).map((c) => c.name).join(", ")} flagged — 3+ consecutive cash shortages. Notify GM per fraud-detection policy.
            </span>
          </div>
        </Card>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={Clock}>No shifts recorded yet.</EmptyState>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((shift) => {
            const shiftOrders = orders.filter((o) => o.shiftId === shift.id);
            const paidShiftOrders = shiftOrders.filter((o) => o.status === "PAID");
            const shiftPayments = payments.filter((p) => paidShiftOrders.some((o) => o.id === p.orderId));
            const salesTotal = shiftPayments.reduce((sum, p) => sum + p.amount, 0);
            const byMethod = shiftPayments.reduce<Record<string, number>>((acc, p) => {
              acc[p.method] = (acc[p.method] ?? 0) + p.amount;
              return acc;
            }, {});
            const cashier = cashiers.find((c) => c.id === shift.cashierId);
            const expanded = expandedId === shift.id;
            const varianceTone = shift.cashVariance == null || Math.abs(shift.cashVariance) < 0.01 ? "text-ink-soft" : shift.cashVariance < 0 ? "text-danger" : "text-warning";

            return (
              <Card key={shift.id} className="p-0">
                <button className="flex w-full items-center justify-between p-3.5 text-left" onClick={() => setExpandedId(expanded ? null : shift.id)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink">{shift.cashierName}</span>
                      <Badge tone={shift.status === "OPEN" ? "success" : "neutral"}>{shift.status}</Badge>
                      {cashier?.flagged && <Badge tone="danger">Flagged</Badge>}
                    </div>
                    <div className="text-xs text-ink-faint">
                      {new Date(shift.openedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {shift.closedAt && ` → ${new Date(shift.closedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-ink">{formatCurrency(salesTotal)}</div>
                    {shift.cashVariance != null && (
                      <div className={`text-xs font-semibold ${varianceTone}`}>
                        {shift.cashVariance > 0 ? "+" : ""}{formatCurrency(shift.cashVariance)} variance
                      </div>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-border p-3.5 text-xs">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <div className="flex justify-between"><span className="text-ink-soft">Opening float</span><span className="text-ink">{formatCurrency(shift.openingFloat)}</span></div>
                      <div className="flex justify-between"><span className="text-ink-soft">Float discrepancy</span><span className={shift.floatDiscrepancy !== 0 ? "text-warning" : "text-ink"}>{shift.floatDiscrepancy > 0 ? "+" : ""}{formatCurrency(shift.floatDiscrepancy)}</span></div>
                      <div className="flex justify-between"><span className="text-ink-soft">Orders (paid)</span><span className="text-ink">{shiftOrders.filter((o) => o.status === "PAID").length}</span></div>
                      <div className="flex justify-between"><span className="text-ink-soft">Voided</span><span className="text-ink">{shiftOrders.filter((o) => o.status === "VOIDED").length}</span></div>
                      {shift.closingCashCounted != null && (
                        <>
                          <div className="flex justify-between"><span className="text-ink-soft">Expected cash</span><span className="text-ink">{formatCurrency(shift.expectedCashAtClose)}</span></div>
                          <div className="flex justify-between"><span className="text-ink-soft">Counted cash</span><span className="text-ink">{formatCurrency(shift.closingCashCounted)}</span></div>
                        </>
                      )}
                    </div>
                    {Object.keys(byMethod).length > 0 && (
                      <div className="mt-3 border-t border-border pt-2.5">
                        <div className="mb-1 font-semibold text-ink-soft">Sales by payment method</div>
                        {Object.entries(byMethod).map(([method, amount]) => (
                          <div key={method} className="flex justify-between text-ink-faint">
                            <span>{method}</span><span>{formatCurrency(amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
