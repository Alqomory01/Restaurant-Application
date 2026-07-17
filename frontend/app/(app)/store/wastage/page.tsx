"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import { WASTAGE_ACKNOWLEDGEMENT_THRESHOLD, type StoreWastageReason } from "@/lib/foodops/types";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const REASON_LABEL: Record<StoreWastageReason, string> = {
  EXPIRED: "Expired",
  SPOILED: "Spoiled",
  DAMAGED: "Damaged",
  OVER_PRODUCED: "Over-produced",
  PREP_WASTE: "Preparation waste",
  THEFT_SUSPECTED: "Theft suspected",
};

const inputCls = "w-full rounded-md border border-border-2 px-2 py-1.5";

function isToday(iso: string) {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function isThisWeek(iso: string) {
  const date = new Date(iso).getTime();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return date >= weekAgo;
}

export default function StoreWastagePage() {
  const { user } = useAuth();
  const { items, wastageEntries, logWastage, acknowledgeWastage } = useFoodOps();
  const isManager = user?.role === "MANAGER";

  const [itemId, setItemId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<StoreWastageReason>("SPOILED");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ackBusyId, setAckBusyId] = useState<number | null>(null);

  const selectedItem = items.find((i) => i.id === itemId) ?? null;
  const estimatedValue = selectedItem && qty ? (Number(qty) || 0) * selectedItem.unitCost : 0;
  const willNeedAck = estimatedValue > WASTAGE_ACKNOWLEDGEMENT_THRESHOLD;
  const overAvailable = selectedItem != null && Number(qty) > selectedItem.onHand;
  const canSubmit = itemId && qty && Number(qty) > 0 && !overAvailable;

  const todayEntries = wastageEntries.filter((w) => isToday(w.loggedAt));
  const weekEntries = wastageEntries.filter((w) => isThisWeek(w.loggedAt));
  const todayValue = todayEntries.reduce((sum, w) => sum + w.estimatedValue, 0);
  const weekValue = weekEntries.reduce((sum, w) => sum + w.estimatedValue, 0);
  const needingAck = wastageEntries.filter((w) => w.estimatedValue > WASTAGE_ACKNOWLEDGEMENT_THRESHOLD && !w.acknowledgedBy);

  const byReason = wastageEntries.reduce<Record<string, number>>((acc, w) => {
    acc[w.reason] = (acc[w.reason] ?? 0) + 1;
    return acc;
  }, {});
  const totalCount = wastageEntries.length || 1;

  function itemName(id: number) {
    return items.find((i) => i.id === id)?.name ?? "—";
  }

  async function handleSubmit() {
    if (!itemId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await logWastage({
        itemId,
        qty: Number(qty),
        reason,
        notes,
        loggedBy: `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Unknown",
      });
      setItemId("");
      setQty("");
      setReason("SPOILED");
      setNotes("");
    } catch (err) {
      setError(errorMessage(err, "Failed to log wastage."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcknowledge(id: number) {
    setAckBusyId(id);
    try {
      await acknowledgeWastage(id, `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Manager");
    } finally {
      setAckBusyId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <div className="text-xs font-medium text-ink-soft">Today&apos;s wastage</div>
            <div className="mt-2 text-2xl font-bold text-danger">{formatCurrency(todayValue)}</div>
            <div className="mt-1 text-xs text-ink-faint">{todayEntries.length} entries logged</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-ink-soft">This week</div>
            <div className="mt-2 text-2xl font-bold text-ink">{formatCurrency(weekValue)}</div>
            <div className="mt-1 text-xs text-ink-faint">{weekEntries.length} entries logged</div>
          </Card>
        </div>

        {isManager && needingAck.length > 0 && (
          <Card>
            <CardHeader title="Needs supervisor sign-off" action={<Badge tone="danger">{needingAck.length}</Badge>} />
            <div className="space-y-2">
              {needingAck.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-md border-l-4 border-danger bg-danger-bg p-2.5 text-xs">
                  <div>
                    <div className="font-semibold text-danger">
                      {itemName(w.itemId)} — {w.qty} · {formatCurrency(w.estimatedValue)}
                    </div>
                    <div className="text-danger">{REASON_LABEL[w.reason]} · logged by {w.loggedBy}</div>
                  </div>
                  <Button variant="danger" onClick={() => handleAcknowledge(w.id)} disabled={ackBusyId === w.id}>
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                    {ackBusyId === w.id ? "Signing…" : "Acknowledge"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Wastage log" />
          {wastageEntries.length === 0 ? (
            <EmptyState icon={Trash2}>No wastage logged yet.</EmptyState>
          ) : (
            <div className="divide-y divide-border text-xs">
              {wastageEntries.slice(0, 12).map((w) => (
                <div key={w.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-medium text-ink">
                      {itemName(w.itemId)} — {w.qty}
                    </div>
                    <div className="text-ink-faint">
                      {REASON_LABEL[w.reason]} · {w.loggedBy} ·{" "}
                      {new Date(w.loggedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {w.acknowledgedBy && ` · signed off by ${w.acknowledgedBy}`}
                    </div>
                  </div>
                  <Badge tone={w.estimatedValue > WASTAGE_ACKNOWLEDGEMENT_THRESHOLD && !w.acknowledgedBy ? "danger" : "neutral"}>
                    {formatCurrency(w.estimatedValue)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Wastage by reason" />
          <div className="space-y-2">
            {(Object.keys(REASON_LABEL) as StoreWastageReason[])
              .filter((r) => byReason[r])
              .map((r) => (
                <div key={r} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 text-ink-soft">{REASON_LABEL[r]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${((byReason[r] ?? 0) / totalCount) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-ink-faint">{byReason[r]}</span>
                </div>
              ))}
            {wastageEntries.length === 0 && <p className="text-xs text-ink-faint">No data yet.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Log new wastage entry" />
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Item *</label>
            <Combobox
              placeholder="Select item…"
              value={itemId}
              onChange={setItemId}
              options={items.map((i) => ({ value: i.id, label: i.name, sublabel: `${i.onHand} ${i.useUnit} on hand` }))}
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Reason code *</label>
            <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as StoreWastageReason)}>
              {(Object.keys(REASON_LABEL) as StoreWastageReason[]).map((r) => (
                <option key={r} value={r}>{REASON_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Quantity wasted *</label>
            <input type="number" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.00" />
            {overAvailable && (
              <p className="flex items-center gap-1 text-danger">
                <AlertTriangle className="h-3 w-3" strokeWidth={2} /> Only {selectedItem?.onHand} {selectedItem?.useUnit} on hand.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">
              Notes {reason === "THEFT_SUSPECTED" && "(required)"}
            </label>
            <textarea className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the circumstances…" />
          </div>

          <div className="flex items-center justify-between rounded-md bg-surface-2 p-3">
            <div>
              <div className="text-ink-soft">Estimated monetary loss</div>
              <div className="text-[10px] text-ink-faint">Calculated at current unit cost</div>
            </div>
            <span className="text-lg font-bold text-danger">{selectedItem ? formatCurrency(estimatedValue) : "—"}</span>
          </div>

          {willNeedAck && (
            <div className="rounded-md border border-info/25 bg-info-bg p-2.5 text-info">
              <strong>Supervisor sign-off required.</strong> Above {formatCurrency(WASTAGE_ACKNOWLEDGEMENT_THRESHOLD)}, a Manager
              must acknowledge this entry before it's considered resolved.
            </div>
          )}
          {error && <p className="text-danger">{error}</p>}

          <Button
            variant="primary"
            className="w-full justify-center"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting || (reason === "THEFT_SUSPECTED" && !notes.trim())}
          >
            {submitting ? "Logging…" : "Submit wastage log"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
