"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Send, Truck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { StockRequest, Urgency } from "@/lib/types";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const urgencyTone: Record<Urgency, "danger" | "warning" | "neutral"> = {
  URGENT: "danger",
  HIGH: "warning",
  NORMAL: "neutral",
};

const DESTINATIONS = ["Kitchen", "Front of House"];

export default function DispatchPage() {
  const { items, stockMovements, recordDispatch } = useFoodOps();
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [destination, setDestination] = useState(DESTINATIONS[0]);
  const [manualItemId, setManualItemId] = useState<number | "">("");
  const [manualQty, setManualQty] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  async function load() {
    try {
      // The Kitchen stock-requests endpoint has no filter backend wired up
      // server-side, so ?status=PENDING is silently ignored — filter here
      // instead of trusting the query param.
      const data = await api.get<{ results?: StockRequest[] } | StockRequest[]>("/kitchen/stock-requests/?status=PENDING");
      const all = Array.isArray(data) ? data : data.results ?? [];
      setRequests(all.filter((r) => r.status === "PENDING"));
    } catch (err) {
      setError(errorMessage(err, "Failed to load kitchen stock requests."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function matchedItem(ingredientName: string) {
    return items.find((i) => i.name.toLowerCase() === ingredientName.toLowerCase()) ?? null;
  }

  async function confirmDispatch(request: StockRequest) {
    setBusyId(request.id);
    setError(null);
    try {
      await api.post(`/kitchen/stock-requests/${request.id}/mark-fulfilled/`);
      const item = matchedItem(request.ingredient_name);
      if (item) {
        await recordDispatch({
          itemId: item.id,
          qty: Number(request.qty_requested),
          reference: `Kitchen request ${request.request_code}`,
        });
      }
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to confirm dispatch."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleManualDispatch() {
    if (!manualItemId || !manualQty) return;
    setManualSubmitting(true);
    setManualError(null);
    try {
      const reference = `Manual dispatch to ${destination}${manualReason ? ` — ${manualReason}` : ""}`;
      await recordDispatch({ itemId: manualItemId, qty: Number(manualQty), reference });
      setManualItemId("");
      setManualQty("");
      setManualReason("");
    } catch (err) {
      setManualError(errorMessage(err, "Failed to log manual dispatch."));
    } finally {
      setManualSubmitting(false);
    }
  }

  const dispatchLog = stockMovements
    .filter((m) => m.type === "DISPATCH")
    .slice(0, 8)
    .map((m) => ({ ...m, itemName: items.find((i) => i.id === m.itemId)?.name ?? "—" }));

  if (loading) return <Spinner />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Pending dispatch requests from Kitchen" action={<Badge tone="warning">{requests.length} pending</Badge>} />
          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          {requests.length === 0 ? (
            <EmptyState icon={Truck}>Nothing waiting on dispatch right now.</EmptyState>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => {
                const item = matchedItem(r.ingredient_name);
                const requested = Number(r.qty_requested);
                const short = item != null && item.onHand < requested;
                return (
                  <div key={r.id} className="rounded-md border border-border p-3 text-xs">
                    <div className="mb-1.5 flex items-start justify-between">
                      <div>
                        <div className="font-bold text-ink">{r.request_code}</div>
                        <div className="text-ink-soft">
                          Raised by {r.raised_by_name ?? "—"} · {r.reason || "No reason given"}
                        </div>
                      </div>
                      <Badge tone={urgencyTone[r.urgency]}>{r.urgency}</Badge>
                    </div>
                    <div className="mb-2 text-ink">
                      <span className="font-semibold">{r.ingredient_name}</span> — requesting {r.qty_requested}
                    </div>
                    {item ? (
                      <div className={`mb-2 text-ink-soft ${short ? "text-danger" : ""}`}>
                        Store on hand: {item.onHand} {item.useUnit}
                        {short && " — not enough to cover this in full"}
                      </div>
                    ) : (
                      <div className="mb-2 flex items-center gap-1 text-ink-faint">
                        <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                        Not tracked in Store item master yet — dispatching will still mark it fulfilled in Kitchen.
                      </div>
                    )}
                    <Button variant="primary" onClick={() => confirmDispatch(r)} disabled={busyId === r.id}>
                      <Send className="h-3.5 w-3.5" strokeWidth={2} />
                      {busyId === r.id ? "Confirming…" : "Confirm dispatch"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Dispatch log" />
          {dispatchLog.length === 0 ? (
            <EmptyState>No dispatches logged yet.</EmptyState>
          ) : (
            <div className="divide-y divide-border text-xs">
              {dispatchLog.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <span className="text-ink">
                    <span className="font-semibold">{m.itemName}</span> · {Math.abs(m.qty)} · {m.reference}
                  </span>
                  <span className="shrink-0 pl-3 text-ink-faint">
                    {new Date(m.occurredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Manual dispatch" />
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Destination</label>
            <select
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {DESTINATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Item</label>
            <Combobox
              placeholder="Select item…"
              value={manualItemId}
              onChange={setManualItemId}
              options={items.map((i) => ({ value: i.id, label: i.name, sublabel: `${i.onHand} ${i.useUnit} on hand` }))}
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Quantity</label>
            <input
              type="number"
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              value={manualQty}
              onChange={(e) => setManualQty(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Reason for manual dispatch</label>
            <input
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              placeholder="e.g. Emergency request from Head Chef"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
            />
          </div>
          {manualError && <p className="text-danger">{manualError}</p>}
          <Button
            variant="primary"
            className="w-full justify-center"
            onClick={handleManualDispatch}
            disabled={manualSubmitting || !manualItemId || !manualQty}
          >
            {manualSubmitting ? "Logging…" : "Log manual dispatch"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
