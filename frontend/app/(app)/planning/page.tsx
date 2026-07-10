"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { ProductionPlan, Recipe, StockRequest } from "@/lib/types";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const statusTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  COMPLETE: "success",
  IN_PROGRESS: "warning",
  BLOCKED: "danger",
  PENDING: "neutral",
};

const PERIODS = ["BREAKFAST", "LUNCH", "DINNER", "ALL_DAY"] as const;
const PERIOD_LABEL: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  ALL_DAY: "All day",
};

interface DraftItem {
  recipe: number;
  planned_qty: string;
  unit: string;
  scheduled_time: string;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function upcomingDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().slice(0, 10);
  });
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

export default function PlanningPage() {
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const [planData, recipeData] = await Promise.all([
        api.get<{ results?: ProductionPlan[] } | ProductionPlan[]>("/kitchen/plans/"),
        api.get<{ results?: Recipe[] } | Recipe[]>("/kitchen/recipes/"),
      ]);
      const planList = Array.isArray(planData) ? planData : planData.results ?? [];
      setPlans(planList.filter((p) => p.service_date === todayStr()));
      setRecipes(Array.isArray(recipeData) ? recipeData : recipeData.results ?? []);
    } catch (err) {
      setError(errorMessage(err, "Failed to load production plan."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;

  const usedPeriods = new Set(plans.map((p) => p.service_period));

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Today's production plans</h2>
        <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New production plan
        </Button>
      </div>

      {showForm && (
        <NewPlanForm
          recipes={recipes}
          usedPeriods={usedPeriods}
          onCancel={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}

      {plans.length === 0 ? (
        <Card>
          <EmptyState>No production plan has been created for today yet.</EmptyState>
        </Card>
      ) : (
        plans.map((plan) => <PlanCard key={plan.id} plan={plan} recipes={recipes} onChange={load} />)
      )}
    </div>
  );
}

function PlanCard({ plan, recipes, onChange }: { plan: ProductionPlan; recipes: Recipe[]; onChange: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [createdRequests, setCreatedRequests] = useState<StockRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newRecipe, setNewRecipe] = useState<number | "">("");
  const [newQty, setNewQty] = useState("10");
  const [newUnit, setNewUnit] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [savingItem, setSavingItem] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [duplicateSubmitting, setDuplicateSubmitting] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<{ created: number; skipped: string[] } | null>(null);

  function openDuplicatePicker() {
    setDuplicating(true);
    setSelectedDates(new Set(upcomingDates(7)));
    setDuplicateResult(null);
  }

  function toggleDate(date: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function handleDuplicate() {
    if (selectedDates.size === 0) return;
    setDuplicateSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ created: ProductionPlan[]; skipped_dates: string[] }>(
        `/kitchen/plans/${plan.id}/duplicate/`,
        { dates: Array.from(selectedDates) }
      );
      setDuplicateResult({ created: res.created.length, skipped: res.skipped_dates });
      setDuplicating(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to duplicate plan."));
    } finally {
      setDuplicateSubmitting(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ plan: ProductionPlan; stock_requests_created: StockRequest[] }>(
        `/kitchen/plans/${plan.id}/submit/`
      );
      setCreatedRequests(res.stock_requests_created);
      await onChange();
    } catch (err) {
      setError(errorMessage(err, "Failed to submit plan."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddItem() {
    if (!newRecipe || !newQty) return;
    setSavingItem(true);
    setError(null);
    try {
      await api.post("/kitchen/plan-items/", {
        plan: plan.id,
        recipe: newRecipe,
        planned_qty: newQty,
        unit: newUnit,
        scheduled_time: newTime,
      });
      setNewRecipe("");
      setNewQty("10");
      setNewUnit("");
      setAddingItem(false);
      await onChange();
    } catch (err) {
      setError(errorMessage(err, "Failed to add item."));
    } finally {
      setSavingItem(false);
    }
  }

  async function handleRemoveItem(id: number) {
    setRemovingId(id);
    setError(null);
    try {
      await api.del(`/kitchen/plan-items/${id}/`);
      await onChange();
    } catch (err) {
      setError(errorMessage(err, "Failed to remove item."));
    } finally {
      setRemovingId(null);
    }
  }

  const isDraft = plan.status === "DRAFT";

  return (
    <Card>
      <CardHeader
        title={`${PERIOD_LABEL[plan.service_period] ?? plan.service_period} plan`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={isDraft ? "neutral" : "success"}>{plan.status}</Badge>
            <Button onClick={openDuplicatePicker} disabled={plan.items.length === 0}>
              <Copy className="h-3.5 w-3.5" strokeWidth={2} /> Duplicate to other days
            </Button>
            {isDraft && (
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit plan & request ingredients"}
              </Button>
            )}
          </div>
        }
      />
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {createdRequests && createdRequests.length > 0 && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning-bg p-3 text-xs text-warning">
          <strong>{createdRequests.length} stock request(s) auto-created</strong> for ingredient shortfalls:{" "}
          {createdRequests.map((r) => `${r.ingredient_name} (${r.qty_requested})`).join(", ")}.
        </div>
      )}
      {duplicateResult && (
        <div className="mb-3 rounded-md border border-info/25 bg-info-bg p-3 text-xs text-info">
          <strong>{duplicateResult.created} plan(s) created</strong> — each is an independent draft you can adjust
          before submitting.
          {duplicateResult.skipped.length > 0 && (
            <> Skipped {duplicateResult.skipped.map(dayLabel).join(", ")} — already has a {PERIOD_LABEL[plan.service_period]?.toLowerCase()} plan.</>
          )}
        </div>
      )}
      {duplicating && (
        <div className="mb-3 rounded-md border border-border-2 bg-surface-2 p-3">
          <div className="mb-2 text-xs font-semibold text-ink-soft">Copy this plan's recipes onto:</div>
          <div className="flex flex-wrap gap-1.5">
            {upcomingDates(7).map((date) => (
              <button
                key={date}
                onClick={() => toggleDate(date)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  selectedDates.has(date)
                    ? "border-brand bg-brand-light text-brand"
                    : "border-border-2 text-ink-soft hover:bg-surface"
                }`}
              >
                {dayLabel(date)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setDuplicating(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleDuplicate}
              disabled={duplicateSubmitting || selectedDates.size === 0}
            >
              {duplicateSubmitting ? "Duplicating…" : `Duplicate to ${selectedDates.size} day(s)`}
            </Button>
          </div>
        </div>
      )}

      {plan.items.length === 0 && !addingItem ? (
        <EmptyState>No recipes added to this plan yet.</EmptyState>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="pb-2">Recipe</th>
              <th className="pb-2">Planned qty</th>
              <th className="pb-2">Assigned to</th>
              <th className="pb-2">Scheduled</th>
              <th className="pb-2">Status</th>
              {isDraft && <th className="pb-2"></th>}
            </tr>
          </thead>
          <tbody>
            {plan.items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="py-2.5 font-medium text-ink">{item.recipe_name}</td>
                <td className="py-2.5 text-ink-soft">
                  {item.planned_qty} {item.unit}
                </td>
                <td className="py-2.5 text-ink-soft">{item.assigned_to_name ?? "—"}</td>
                <td className="py-2.5 text-ink-soft">{item.scheduled_time?.slice(0, 5) ?? "—"}</td>
                <td className="py-2.5">
                  <Badge tone={statusTone[item.status]}>{item.status.replaceAll("_", " ")}</Badge>
                </td>
                {isDraft && (
                  <td className="py-2.5 text-right">
                    {item.status === "PENDING" && (
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={removingId === item.id}
                        title="Remove from plan"
                        className="text-ink-faint transition hover:text-danger disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isDraft &&
        (addingItem ? (
          <div className="mt-3 grid grid-cols-[2fr_1fr_1fr_1fr_auto_auto] items-center gap-2 text-xs">
            <Combobox
              placeholder="Select recipe…"
              value={newRecipe}
              onChange={(id) => {
                setNewRecipe(id);
                const recipe = recipes.find((r) => r.id === id);
                if (recipe) setNewUnit(recipe.yield_unit);
              }}
              options={recipes.map((r) => ({ value: r.id, label: r.name }))}
            />
            <input
              className="rounded-md border border-border-2 px-2 py-1"
              type="number"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
            />
            <input
              className="rounded-md border border-border-2 px-2 py-1"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
            />
            <input
              className="rounded-md border border-border-2 px-2 py-1"
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
            <Button variant="primary" onClick={handleAddItem} disabled={savingItem || !newRecipe}>
              {savingItem ? "Adding…" : "Add"}
            </Button>
            <Button onClick={() => setAddingItem(false)}>Cancel</Button>
          </div>
        ) : (
          <Button className="mt-3" onClick={() => setAddingItem(true)} disabled={recipes.length === 0}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add recipe to this plan
          </Button>
        ))}
    </Card>
  );
}

function NewPlanForm({
  recipes,
  usedPeriods,
  onCancel,
  onCreated,
}: {
  recipes: Recipe[];
  usedPeriods: Set<string>;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [servicePeriod, setServicePeriod] = useState(PERIODS.find((p) => !usedPeriods.has(p)) ?? "LUNCH");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addDraftItem() {
    if (recipes.length === 0) return;
    const recipe = recipes[0];
    setDraftItems((prev) => [
      ...prev,
      { recipe: recipe.id, planned_qty: "10", unit: recipe.yield_unit, scheduled_time: "09:00" },
    ]);
  }

  function updateDraftItem(index: number, patch: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreatePlan() {
    setCreating(true);
    setError(null);
    try {
      await api.post<ProductionPlan>("/kitchen/plans/", {
        service_date: todayStr(),
        service_period: servicePeriod,
        items: draftItems.map((i) => ({
          recipe: i.recipe,
          planned_qty: i.planned_qty,
          unit: i.unit,
          scheduled_time: i.scheduled_time,
        })),
      });
      await onCreated();
    } catch (err) {
      setError(errorMessage(err, "Failed to create plan."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New production plan" />
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <div className="mb-4 flex items-center gap-2 text-xs">
        <label className="font-semibold text-ink-soft">Service period</label>
        <select
          className="rounded-md border border-border-2 px-2 py-1"
          value={servicePeriod}
          onChange={(e) => setServicePeriod(e.target.value as (typeof PERIODS)[number])}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
              {usedPeriods.has(p) ? " (already planned)" : ""}
            </option>
          ))}
        </select>
        {usedPeriods.has(servicePeriod) && (
          <span className="text-warning">A plan for this period already exists today — this creates a second one.</span>
        )}
      </div>

      <div className="space-y-2">
        {draftItems.map((item, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-2 text-xs">
            <Combobox
              value={item.recipe}
              onChange={(recipeId) => {
                const recipe = recipes.find((r) => r.id === recipeId);
                updateDraftItem(i, { recipe: recipeId, unit: recipe?.yield_unit ?? item.unit });
              }}
              options={recipes.map((r) => ({ value: r.id, label: r.name }))}
            />
            <input
              className="rounded-md border border-border-2 px-2 py-1"
              type="number"
              value={item.planned_qty}
              onChange={(e) => updateDraftItem(i, { planned_qty: e.target.value })}
            />
            <input
              className="rounded-md border border-border-2 px-2 py-1"
              value={item.unit}
              onChange={(e) => updateDraftItem(i, { unit: e.target.value })}
            />
            <input
              className="rounded-md border border-border-2 px-2 py-1"
              type="time"
              value={item.scheduled_time}
              onChange={(e) => updateDraftItem(i, { scheduled_time: e.target.value })}
            />
            <Button variant="danger" onClick={() => removeDraftItem(i)}>
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button onClick={addDraftItem} disabled={recipes.length === 0}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add recipe
        </Button>
        <div className="flex gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleCreatePlan} disabled={creating || draftItems.length === 0}>
            {creating ? "Creating…" : "Create plan"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
