"use client";

import { useState } from "react";
import { Ban, Receipt, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePos } from "@/lib/pos/PosContext";
import { computeOrderTotals, REFUND_APPROVAL_THRESHOLD, type Order, type OrderStatus, type PaymentMethod } from "@/lib/pos/types";
import { Badge, Button, Card, Chip, EmptyState } from "@/components/ui";

const statusTone: Record<OrderStatus, "success" | "neutral" | "danger"> = {
  PAID: "success",
  OPEN: "neutral",
  VOIDED: "danger",
};

const REASON_CODES = ["Customer changed mind", "Wrong item punched", "Quality issue", "Duplicate order", "Price dispute", "Other"];

export default function OrdersPage() {
  const { orders, payments, refunds, menuItems, activeShift, voidOrder, refundOrder } = usePos();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [voidTargetId, setVoidTargetId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidSupervisor, setVoidSupervisor] = useState("");

  const [refundTargetId, setRefundTargetId] = useState<number | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("CASH");
  const [refundReason, setRefundReason] = useState(REASON_CODES[0]);
  const [refundSupervisor, setRefundSupervisor] = useState("");
  const [refundGm, setRefundGm] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = orders.filter((o) => !statusFilter || o.status === statusFilter);

  function itemName(id: number) {
    return menuItems.find((m) => m.id === id)?.name ?? "Item";
  }

  async function confirmVoid() {
    if (voidTargetId == null || !voidReason.trim()) return;
    const order = orders.find((o) => o.id === voidTargetId);
    const needsSupervisor = order?.status === "PAID";
    if (needsSupervisor && !voidSupervisor.trim()) return;
    setBusy(true);
    try {
      await voidOrder(voidTargetId, voidReason.trim(), needsSupervisor ? voidSupervisor.trim() : activeShift?.cashierName ?? "Cashier");
      setVoidTargetId(null);
      setVoidReason("");
      setVoidSupervisor("");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRefund() {
    if (refundTargetId == null || !refundAmount || !refundReason.trim()) return;
    const amount = Number(refundAmount);
    const aboveThreshold = amount > REFUND_APPROVAL_THRESHOLD;
    if (aboveThreshold && (!refundSupervisor.trim() || !refundGm.trim())) return;
    if (!aboveThreshold && !refundSupervisor.trim()) return;
    setBusy(true);
    try {
      await refundOrder(refundTargetId, {
        amount,
        method: refundMethod,
        reasonCode: refundReason,
        authorizedBy: aboveThreshold ? `${refundSupervisor.trim()} + ${refundGm.trim()} (GM)` : refundSupervisor.trim(),
      });
      setRefundTargetId(null);
      setRefundAmount("");
      setRefundSupervisor("");
      setRefundGm("");
    } finally {
      setBusy(false);
    }
  }

  const voidTarget = orders.find((o) => o.id === voidTargetId) ?? null;
  const refundTarget = orders.find((o) => o.id === refundTargetId) ?? null;
  const refundAboveThreshold = Number(refundAmount) > REFUND_APPROVAL_THRESHOLD;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Chip active={statusFilter === null} onClick={() => setStatusFilter(null)}>All ({orders.length})</Chip>
        <Chip active={statusFilter === "PAID"} onClick={() => setStatusFilter(statusFilter === "PAID" ? null : "PAID")}>Paid ({orders.filter((o) => o.status === "PAID").length})</Chip>
        <Chip active={statusFilter === "VOIDED"} tone="danger" onClick={() => setStatusFilter(statusFilter === "VOIDED" ? null : "VOIDED")}>Voided ({orders.filter((o) => o.status === "VOIDED").length})</Chip>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Receipt}>No orders yet — punch one on the Terminal.</EmptyState>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((order) => {
            const totals = computeOrderTotals(order);
            const orderRefunds = refunds.filter((r) => r.orderId === order.id);
            const orderPayments = payments.filter((p) => p.orderId === order.id);
            const refundedTotal = orderRefunds.reduce((sum, r) => sum + r.amount, 0);
            const expanded = expandedId === order.id;
            return (
              <Card key={order.id} className="p-0">
                <button className="flex w-full items-center justify-between p-3.5 text-left" onClick={() => setExpandedId(expanded ? null : order.id)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink">{order.code}</span>
                      <Badge tone={statusTone[order.status]}>{order.status}</Badge>
                      {refundedTotal > 0 && <Badge tone="warning">Refunded {formatCurrency(refundedTotal)}</Badge>}
                    </div>
                    <div className="text-xs text-ink-faint">
                      Table/Counter {order.tableOrCounterNumber} · {order.openedBy} · {new Date(order.openedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-ink">{formatCurrency(totals.total)}</span>
                </button>

                {expanded && (
                  <div className="border-t border-border p-3.5 text-xs">
                    <div className="mb-3 space-y-1">
                      {order.lines.map((l) => (
                        <div key={l.id} className="flex justify-between text-ink-soft">
                          <span>{l.qty}× {itemName(l.menuItemId)}{l.isComplimentary ? " (Comp)" : ""}</span>
                          <span>{formatCurrency(l.isComplimentary ? 0 : (l.unitPrice + l.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0)) * l.qty)}</span>
                        </div>
                      ))}
                    </div>
                    {orderPayments.length > 0 && (
                      <div className="mb-3 border-t border-border pt-2">
                        <div className="mb-1 font-semibold text-ink-soft">Payments</div>
                        {orderPayments.map((p) => (
                          <div key={p.id} className="flex justify-between text-ink-faint">
                            <span>{p.method}</span><span>{formatCurrency(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {order.status === "VOIDED" && (
                      <div className="mb-3 rounded-md bg-danger-bg p-2 text-danger">
                        Voided by {order.voidedBy} — {order.voidReason}
                      </div>
                    )}
                    {orderRefunds.length > 0 && (
                      <div className="mb-3 rounded-md bg-warning-bg p-2 text-warning">
                        {orderRefunds.map((r) => (
                          <div key={r.id}>{formatCurrency(r.amount)} refunded ({r.reasonCode}) — authorized by {r.authorizedBy}</div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {order.status !== "VOIDED" && (
                        <Button variant="danger" onClick={() => { setVoidTargetId(order.id); setVoidReason(""); setVoidSupervisor(""); }}>
                          <Ban className="h-3.5 w-3.5" strokeWidth={2} /> Void
                        </Button>
                      )}
                      {order.status === "PAID" && (
                        <Button onClick={() => { setRefundTargetId(order.id); setRefundAmount(String(totals.total - refundedTotal)); setRefundMethod(orderPayments[0]?.method ?? "CASH"); }}>
                          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> Refund
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setVoidTargetId(null)}>
          <Card className="w-full max-w-sm" >
            <div onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 text-sm font-bold text-ink">Void {voidTarget.code}</div>
              {voidTarget.status === "PAID" && (
                <p className="mb-2 text-xs text-warning">This order was already paid — voiding after payment requires a Supervisor or GM.</p>
              )}
              <div className="space-y-2.5 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-ink-soft">Reason *</label>
                  <input className="w-full rounded-md border border-border-2 px-2 py-1.5" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Why is this being voided?" />
                </div>
                {voidTarget.status === "PAID" && (
                  <div className="space-y-1">
                    <label className="font-semibold text-ink-soft">Supervisor / GM name *</label>
                    <input className="w-full rounded-md border border-border-2 px-2 py-1.5" value={voidSupervisor} onChange={(e) => setVoidSupervisor(e.target.value)} placeholder="Authorizing supervisor" />
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1 justify-center" onClick={() => setVoidTargetId(null)}>Cancel</Button>
                  <Button variant="danger" className="flex-1 justify-center" onClick={confirmVoid} disabled={busy || !voidReason.trim() || (voidTarget.status === "PAID" && !voidSupervisor.trim())}>
                    {busy ? "Voiding…" : "Confirm void"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {refundTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setRefundTargetId(null)}>
          <Card className="w-full max-w-sm">
            <div onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 text-sm font-bold text-ink">Refund {refundTarget.code}</div>
              <div className="space-y-2.5 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-ink-soft">Amount *</label>
                  <input type="number" className="w-full rounded-md border border-border-2 px-2 py-1.5" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-ink-soft">Refund method</label>
                  <select className="w-full rounded-md border border-border-2 px-2 py-1.5" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="MOBILE_TRANSFER">Mobile Transfer</option>
                    <option value="VOUCHER">Voucher</option>
                  </select>
                  <p className="text-ink-faint">Must match original payment method unless a GM override is documented below.</p>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-ink-soft">Reason code *</label>
                  <select className="w-full rounded-md border border-border-2 px-2 py-1.5" value={refundReason} onChange={(e) => setRefundReason(e.target.value)}>
                    {REASON_CODES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {refundAboveThreshold ? (
                  <div className="space-y-2 rounded-md border border-warning/30 bg-warning-bg p-2">
                    <p className="font-semibold text-warning">Above {formatCurrency(REFUND_APPROVAL_THRESHOLD)} — dual approval required.</p>
                    <input className="w-full rounded-md border border-border-2 px-2 py-1.5" value={refundSupervisor} onChange={(e) => setRefundSupervisor(e.target.value)} placeholder="FOH Supervisor name" />
                    <input className="w-full rounded-md border border-border-2 px-2 py-1.5" value={refundGm} onChange={(e) => setRefundGm(e.target.value)} placeholder="GM name" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="font-semibold text-ink-soft">FOH Supervisor authorization *</label>
                    <input className="w-full rounded-md border border-border-2 px-2 py-1.5" value={refundSupervisor} onChange={(e) => setRefundSupervisor(e.target.value)} placeholder="Supervisor name" />
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1 justify-center" onClick={() => setRefundTargetId(null)}>Cancel</Button>
                  <Button
                    variant="primary"
                    className="flex-1 justify-center"
                    onClick={confirmRefund}
                    disabled={busy || !refundAmount || !refundSupervisor.trim() || (refundAboveThreshold && !refundGm.trim())}
                  >
                    {busy ? "Processing…" : "Confirm refund"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
