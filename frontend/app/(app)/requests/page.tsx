"use client";

import { useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Ingredient, StockRequest, Urgency } from "@/lib/types";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const urgencyTone: Record<Urgency, "danger" | "warning" | "neutral"> = {
  URGENT: "danger",
  HIGH: "warning",
  NORMAL: "neutral",
};

export default function RequestsPage() {
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ingredientId, setIngredientId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("NORMAL");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [reqData, ingData] = await Promise.all([
        api.get<{ results?: StockRequest[] } | StockRequest[]>("/kitchen/stock-requests/"),
        api.get<{ results?: Ingredient[] } | Ingredient[]>("/kitchen/ingredients/"),
      ]);
      setRequests(Array.isArray(reqData) ? reqData : reqData.results ?? []);
      setIngredients(Array.isArray(ingData) ? ingData : ingData.results ?? []);
    } catch (err) {
      setError(errorMessage(err, "Failed to load stock requests."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!ingredientId || !qty) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/kitchen/stock-requests/", {
        ingredient: ingredientId,
        qty_requested: qty,
        urgency,
        reason,
      });
      setIngredientId("");
      setQty("");
      setUrgency("NORMAL");
      setReason("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to create stock request."));
    } finally {
      setSubmitting(false);
    }
  }

  async function markFulfilled(id: number) {
    try {
      await api.post(`/kitchen/stock-requests/${id}/mark-fulfilled/`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to update request."));
    }
  }

  if (loading) return <Spinner />;

  const pending = requests.filter((r) => r.status === "PENDING");
  const resolved = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 space-y-4">
        <Card>
          <CardHeader title="Outgoing requests to store" action={<Badge tone="danger">{pending.length} pending</Badge>} />
          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          {pending.length === 0 ? (
            <EmptyState>No pending stock requests.</EmptyState>
          ) : (
            <div className="space-y-2">
              {pending.map((r) => (
                <div key={r.id} className={`rounded-md border-l-4 p-3 text-xs ${r.urgency === "URGENT" ? "border-danger" : r.urgency === "HIGH" ? "border-warning" : "border-border-2"}`}>
                  <div className="mb-1 flex items-start justify-between">
                    <div>
                      <div className="font-bold text-ink">{r.request_code}</div>
                      <div className="text-ink-soft">
                        Raised by {r.raised_by_name ?? "—"} · Urgency:{" "}
                        <span className="font-semibold">{r.urgency}</span>
                      </div>
                    </div>
                    <Badge tone={urgencyTone[r.urgency]}>{r.status}</Badge>
                  </div>
                  <div className="text-ink">
                    {r.ingredient_name} — {r.qty_requested} {r.reason && `· ${r.reason}`}
                  </div>
                  <div className="mt-2">
                    <Button onClick={() => markFulfilled(r.id)}>Mark fulfilled</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Request history" />
          {resolved.length === 0 ? (
            <EmptyState>No resolved requests yet.</EmptyState>
          ) : (
            <div className="space-y-2 text-xs">
              {resolved.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <span>
                    <strong>{r.request_code}</strong> — {r.ingredient_name} · {r.qty_requested}
                  </span>
                  <Badge tone={r.status === "FULFILLED" ? "success" : "neutral"}>{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="New stock request" />
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Ingredient</label>
            <Combobox
              placeholder="Select ingredient…"
              value={ingredientId}
              onChange={setIngredientId}
              options={ingredients.map((i) => ({ value: i.id, label: i.name }))}
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Quantity</label>
            <input
              type="number"
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Urgency</label>
            <select
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as Urgency)}
            >
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Reason</label>
            <input
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              placeholder="e.g. Blocking current batch"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button
            variant="primary"
            className="w-full justify-center"
            onClick={handleCreate}
            disabled={submitting || !ingredientId || !qty}
          >
            {submitting ? "Sending…" : "Send request to store"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
