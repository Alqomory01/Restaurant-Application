"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { ProductionPlan, Recipe, StockRequest } from "@/lib/types";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";

const statusTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  COMPLETE: "success",
  IN_PROGRESS: "warning",
  BLOCKED: "danger",
  PENDING: "neutral",
};

interface DraftItem {
  recipe: number;
  planned_qty: string;
  unit: string;
  scheduled_time: string;
}

export default function PlanningPage() {
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdRequests, setCreatedRequests] = useState<StockRequest[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [servicePeriod, setServicePeriod] = useState("LUNCH");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  async function load() {
    try {
      const [plans, recipeList] = await Promise.all([
        api.get<{ results?: ProductionPlan[] } | ProductionPlan[]>("/kitchen/plans/"),
        api.get<{ results?: Recipe[] } | Recipe[]>("/kitchen/recipes/"),
      ]);
      const planListRaw = Array.isArray(plans) ? plans : plans.results ?? [];
      const recipeListRaw = Array.isArray(recipeList) ? recipeList : recipeList.results ?? [];
      setPlan(planListRaw[0] ?? null);
      setRecipes(recipeListRaw);
    } catch (err) {
      setError(errorMessage(err, "Failed to load production plan."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
      const today = new Date().toISOString().slice(0, 10);
      const created = await api.post<ProductionPlan>("/kitchen/plans/", {
        service_date: today,
        service_period: servicePeriod,
        items: draftItems.map((i) => ({
          recipe: i.recipe,
          planned_qty: i.planned_qty,
          unit: i.unit,
          scheduled_time: i.scheduled_time,
        })),
      });
      setPlan(created);
      setShowForm(false);
      setDraftItems([]);
    } catch (err) {
      setError(errorMessage(err, "Failed to create plan."));
    } finally {
      setCreating(false);
    }
  }

  async function handleSubmit() {
    if (!plan) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ plan: ProductionPlan; stock_requests_created: StockRequest[] }>(
        `/kitchen/plans/${plan.id}/submit/`
      );
      setPlan(res.plan);
      setCreatedRequests(res.stock_requests_created);
    } catch (err) {
      setError(errorMessage(err, "Failed to submit plan."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      {createdRequests && createdRequests.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-bg p-3 text-xs text-warning">
          <strong>{createdRequests.length} stock request(s) auto-created</strong> for ingredient shortfalls:{" "}
          {createdRequests.map((r) => `${r.ingredient_name} (${r.qty_requested})`).join(", ")}.
        </div>
      )}

      <Card>
        <CardHeader
          title={plan ? `Today's plan — ${plan.service_period}` : "Today's plan"}
          action={
            plan ? (
              plan.status === "DRAFT" && (
                <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit plan & request ingredients"}
                </Button>
              )
            ) : (
              <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New production plan
              </Button>
            )
          }
        />
        {!plan ? (
          <EmptyState>No production plan has been created for today yet.</EmptyState>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="pb-2">Recipe</th>
                <th className="pb-2">Planned qty</th>
                <th className="pb-2">Assigned to</th>
                <th className="pb-2">Scheduled</th>
                <th className="pb-2">Status</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showForm && (
        <Card>
          <CardHeader title="New production plan" />
          <div className="mb-4 flex items-center gap-2 text-xs">
            <label className="font-semibold text-ink-soft">Service period</label>
            <select
              className="rounded-md border border-border-2 px-2 py-1"
              value={servicePeriod}
              onChange={(e) => setServicePeriod(e.target.value)}
            >
              <option value="BREAKFAST">Breakfast</option>
              <option value="LUNCH">Lunch</option>
              <option value="DINNER">Dinner</option>
              <option value="ALL_DAY">All day</option>
            </select>
          </div>

          <div className="space-y-2">
            {draftItems.map((item, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-2 text-xs">
                <select
                  className="rounded-md border border-border-2 px-2 py-1"
                  value={item.recipe}
                  onChange={(e) => {
                    const recipeId = Number(e.target.value);
                    const recipe = recipes.find((r) => r.id === recipeId);
                    updateDraftItem(i, { recipe: recipeId, unit: recipe?.yield_unit ?? item.unit });
                  }}
                >
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
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
              <Button onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreatePlan} disabled={creating || draftItems.length === 0}>
                {creating ? "Creating…" : "Create plan"}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
