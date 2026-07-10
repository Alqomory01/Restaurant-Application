"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { BatchProduction, Ingredient, InsufficientStockError, WastageEntry, WastageReason } from "@/lib/types";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const reasonLabel: Record<WastageReason, string> = {
  OVER_PRODUCTION: "Over-production",
  PREP_WASTE: "Prep waste",
  SPOILAGE: "Spoilage",
  DROPPED: "Dropped / accident",
  OTHER: "Other",
};

const reasonTone: Record<WastageReason, "danger" | "warning" | "neutral"> = {
  OVER_PRODUCTION: "warning",
  PREP_WASTE: "neutral",
  SPOILAGE: "danger",
  DROPPED: "danger",
  OTHER: "neutral",
};

type WasteKind = "ingredient" | "batch";

export default function WastagePage() {
  const [entries, setEntries] = useState<WastageEntry[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [batches, setBatches] = useState<BatchProduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shortfalls, setShortfalls] = useState<string[] | null>(null);

  const [kind, setKind] = useState<WasteKind>("ingredient");
  const [ingredientId, setIngredientId] = useState<number | "">("");
  const [batchId, setBatchId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<WastageReason>("PREP_WASTE");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [entryData, ingredientData, batchData] = await Promise.all([
        api.get<WastageEntry[]>("/kitchen/wastage/"),
        api.get<{ results?: Ingredient[] } | Ingredient[]>("/kitchen/ingredients/"),
        api.get<{ results?: BatchProduction[] } | BatchProduction[]>("/kitchen/batches/"),
      ]);
      setEntries(entryData);
      setIngredients(Array.isArray(ingredientData) ? ingredientData : ingredientData.results ?? []);
      const batchList = Array.isArray(batchData) ? batchData : batchData.results ?? [];
      setBatches(batchList.filter((b) => b.status === "COMPLETE"));
    } catch (err) {
      setError(errorMessage(err, "Failed to load wastage log."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setShortfalls(null);
    try {
      await api.post("/kitchen/wastage/", {
        ingredient: kind === "ingredient" ? ingredientId : null,
        batch: kind === "batch" ? batchId : null,
        qty,
        reason,
        notes,
      });
      setQty("");
      setNotes("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as InsufficientStockError;
        setError(body.detail);
        setShortfalls(body.shortfalls ?? []);
      } else {
        setError(errorMessage(err, "Failed to log wastage."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;

  const canSubmit = kind === "ingredient" ? ingredientId !== "" : batchId !== "";

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2">
        <Card>
          <CardHeader title="Wastage log" />
          {entries.length === 0 ? (
            <EmptyState icon={Trash2}>Nothing logged yet.</EmptyState>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="pb-2">What</th>
                  <th className="pb-2">Qty</th>
                  <th className="pb-2">Reason</th>
                  <th className="pb-2">Value</th>
                  <th className="pb-2">Logged by</th>
                  <th className="pb-2">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="py-2">
                      <div className="font-medium text-ink">
                        {e.ingredient_name ?? `${e.recipe_name} (${e.batch_code})`}
                      </div>
                      {e.notes && <div className="mt-0.5 text-ink-faint">{e.notes}</div>}
                    </td>
                    <td className="py-2 text-ink-soft">
                      {e.qty} {e.unit}
                    </td>
                    <td className="py-2">
                      <Badge tone={reasonTone[e.reason]}>{reasonLabel[e.reason]}</Badge>
                    </td>
                    <td className="py-2 text-ink-soft">{formatCurrency(e.value)}</td>
                    <td className="py-2 text-ink-soft">{e.logged_by_name ?? "—"}</td>
                    <td className="py-2 text-ink-faint">{new Date(e.logged_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Log wastage" />
        <div className="space-y-3 text-xs">
          <div className="flex gap-2">
            <button
              onClick={() => setKind("ingredient")}
              className={`flex-1 rounded-md border px-2 py-1.5 font-semibold ${kind === "ingredient" ? "border-brand bg-brand-light text-brand" : "border-border-2 text-ink-soft"}`}
            >
              Raw ingredient
            </button>
            <button
              onClick={() => setKind("batch")}
              className={`flex-1 rounded-md border px-2 py-1.5 font-semibold ${kind === "batch" ? "border-brand bg-brand-light text-brand" : "border-border-2 text-ink-soft"}`}
            >
              Finished batch
            </button>
          </div>

          {kind === "ingredient" ? (
            <div className="space-y-1">
              <label className="font-semibold text-ink-soft">Ingredient</label>
              <Combobox
                placeholder="Select ingredient…"
                value={ingredientId}
                onChange={setIngredientId}
                options={ingredients.map((i) => ({ value: i.id, label: i.name }))}
              />
              <p className="text-ink-faint">Deducts from kitchen stock — same as it going into a dish.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="font-semibold text-ink-soft">Completed batch</label>
              <Combobox
                placeholder="Select batch…"
                value={batchId}
                onChange={setBatchId}
                options={batches.map((b) => ({ value: b.id, label: b.recipe_name, sublabel: b.batch_code }))}
              />
              <p className="text-ink-faint">Ingredients were already deducted when the batch completed — this only records the cost of the wasted portions.</p>
            </div>
          )}

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
            <label className="font-semibold text-ink-soft">Reason</label>
            <select
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value as WastageReason)}
            >
              {Object.entries(reasonLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-ink-soft">Notes</label>
            <textarea
              className="w-full rounded-md border border-border-2 px-2 py-1.5"
              placeholder="What happened…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-danger/25 bg-danger-bg p-2.5 text-danger">
              <p className="font-semibold">{error}</p>
              {shortfalls && shortfalls.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {shortfalls.map((s) => <li key={s}>{s}</li>)}
                </ul>
              )}
            </div>
          )}

          <Button
            variant="primary"
            className="w-full justify-center"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit || !qty}
          >
            {submitting ? "Logging…" : "Log wastage"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
