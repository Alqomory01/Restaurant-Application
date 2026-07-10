"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { CookingStep, Ingredient, Recipe, RecipeIngredient } from "@/lib/types";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const statusTone: Record<string, "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  DEVELOPMENT: "neutral",
  DISCONTINUED: "warning",
};

type Mode = { kind: "list" } | { kind: "edit"; recipe: Recipe | null } | { kind: "view"; recipe: Recipe };

const inputCls = "w-full rounded-md border border-border-2 px-2 py-1.5";

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  async function load() {
    try {
      const [recipeData, ingredientData] = await Promise.all([
        api.get<{ results?: Recipe[] } | Recipe[]>("/kitchen/recipes/"),
        api.get<{ results?: Ingredient[] } | Ingredient[]>("/kitchen/ingredients/"),
      ]);
      setRecipes(Array.isArray(recipeData) ? recipeData : recipeData.results ?? []);
      setIngredients(Array.isArray(ingredientData) ? ingredientData : ingredientData.results ?? []);
    } catch (err) {
      setError(errorMessage(err, "Failed to load recipes."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;

  if (mode.kind === "edit") {
    return (
      <RecipeForm
        recipe={mode.recipe}
        ingredients={ingredients}
        onCancel={() => setMode({ kind: "list" })}
        onSaved={async () => {
          await load();
          setMode({ kind: "list" });
        }}
      />
    );
  }

  if (mode.kind === "view") {
    return <RecipeQuickView recipe={mode.recipe} onClose={() => setMode({ kind: "list" })} onEdit={() => setMode({ kind: "edit", recipe: mode.recipe })} />;
  }

  return (
    <Card>
      <CardHeader
        title={`Recipes (${recipes.length})`}
        action={
          <Button variant="primary" onClick={() => setMode({ kind: "edit", recipe: null })}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New recipe
          </Button>
        }
      />
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {recipes.length === 0 ? (
        <EmptyState>No recipes yet.</EmptyState>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="pb-2">Recipe</th>
              <th className="pb-2">Category</th>
              <th className="pb-2">Yield</th>
              <th className="pb-2">Selling price</th>
              <th className="pb-2">Target food cost</th>
              <th className="pb-2">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2">
                  <button className="font-medium text-ink hover:text-brand hover:underline" onClick={() => setMode({ kind: "view", recipe: r })}>
                    {r.name}
                  </button>
                </td>
                <td className="py-2 text-ink-soft">{r.category}</td>
                <td className="py-2 text-ink-soft">
                  {r.yield_qty} {r.yield_unit}
                </td>
                <td className="py-2 text-ink-soft">{formatCurrency(r.selling_price)}</td>
                <td className="py-2 text-ink-soft">{r.target_food_cost_pct ? `${r.target_food_cost_pct}%` : "—"}</td>
                <td className="py-2">
                  <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                </td>
                <td className="py-2">
                  <Button onClick={() => setMode({ kind: "edit", recipe: r })}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function RecipeQuickView({ recipe, onClose, onEdit }: { recipe: Recipe; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-base font-bold text-ink">{recipe.name}</div>
            <div className="text-xs text-ink-soft">
              {recipe.category} · {recipe.yield_qty} {recipe.yield_unit} per batch · {recipe.prep_time_minutes} min prep
            </div>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Ingredients</div>
          <div className="space-y-1.5">
            {recipe.ingredients.map((ri) => (
              <div key={ri.id} className="flex justify-between rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
                <span>{ri.ingredient_name}</span>
                <span className="font-semibold text-brand">
                  {ri.qty} {ri.unit}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Cooking steps</div>
          <div className="space-y-2">
            {recipe.steps.map((s) => (
              <div key={s.id} className="rounded-md border-l-2 border-brand bg-surface-2 p-2.5 text-xs">
                <div className="mb-1 font-bold text-ink">
                  {s.step_number}. {s.title}
                </div>
                <div className="text-ink-soft">{s.description}</div>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {s.duration_minutes != null && `${s.duration_minutes} min`}
                  {s.temperature_c != null && ` · ${s.temperature_c}°C`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={onEdit}>Edit full recipe</Button>
        </div>
      </div>
    </div>
  );
}

function RecipeForm({
  recipe,
  ingredients,
  onCancel,
  onSaved,
}: {
  recipe: Recipe | null;
  ingredients: Ingredient[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [category, setCategory] = useState(recipe?.category ?? "");
  const [yieldQty, setYieldQty] = useState(recipe?.yield_qty ?? "1");
  const [yieldUnit, setYieldUnit] = useState(recipe?.yield_unit ?? "portions");
  const [prepTime, setPrepTime] = useState(String(recipe?.prep_time_minutes ?? 30));
  const [sellingPrice, setSellingPrice] = useState(recipe?.selling_price ?? "0");
  const [targetFc, setTargetFc] = useState(recipe?.target_food_cost_pct ?? "");
  const [allergen, setAllergen] = useState(recipe?.allergen_info ?? "");
  const [status, setStatus] = useState(recipe?.status ?? "ACTIVE");
  const [items, setItems] = useState<RecipeIngredient[]>(recipe?.ingredients ?? []);
  const [steps, setSteps] = useState<CookingStep[]>(recipe?.steps ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addIngredient() {
    if (ingredients.length === 0) return;
    setItems((prev) => [...prev, { ingredient: ingredients[0].id, qty: "1", is_optional: false }]);
  }

  function unitFor(ingredientId: number) {
    return ingredients.find((ing) => ing.id === ingredientId)?.default_unit ?? "";
  }
  function updateIngredient(i: number, patch: Partial<RecipeIngredient>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeIngredient(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addStep() {
    setSteps((prev) => [...prev, { step_number: prev.length + 1, title: "", description: "", duration_minutes: null, temperature_c: null }]);
  }
  function updateStep(i: number, patch: Partial<CookingStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 })));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      name,
      category,
      yield_qty: yieldQty,
      yield_unit: yieldUnit,
      prep_time_minutes: Number(prepTime),
      selling_price: sellingPrice,
      target_food_cost_pct: targetFc || null,
      allergen_info: allergen,
      status,
      // Existing rows keep their id so the backend updates them in place
      // instead of deleting and recreating every ingredient/step on every
      // save; rows without one (freshly added in this session) are created.
      ingredients: items.map((i) => ({ id: i.id, ingredient: i.ingredient, qty: i.qty, is_optional: i.is_optional })),
      steps: steps.map((s) => ({
        id: s.id,
        step_number: s.step_number,
        title: s.title,
        description: s.description,
        duration_minutes: s.duration_minutes,
        temperature_c: s.temperature_c,
      })),
    };
    try {
      if (recipe) {
        await api.put(`/kitchen/recipes/${recipe.id}/`, payload);
      } else {
        await api.post("/kitchen/recipes/", payload);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Failed to save recipe."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={onCancel}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
        </Button>
        <span className="text-sm font-bold text-ink">{recipe ? recipe.name : "New recipe"}</span>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 text-xs">
        <Field label="Recipe name *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Category *"><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
        <Field label="Status">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as Recipe["status"])}>
            <option value="ACTIVE">Active</option>
            <option value="DEVELOPMENT">Development</option>
            <option value="DISCONTINUED">Discontinued</option>
          </select>
        </Field>
        <Field label="Yield quantity *"><input type="number" className={inputCls} value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} /></Field>
        <Field label="Yield unit *"><input className={inputCls} value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} /></Field>
        <Field label="Prep time (min)"><input type="number" className={inputCls} value={prepTime} onChange={(e) => setPrepTime(e.target.value)} /></Field>
        <Field label="Selling price (₦)"><input type="number" className={inputCls} value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} /></Field>
        <Field label="Target food cost %"><input type="number" className={inputCls} value={targetFc ?? ""} onChange={(e) => setTargetFc(e.target.value)} /></Field>
        <Field label="Allergen info"><input className={inputCls} value={allergen} onChange={(e) => setAllergen(e.target.value)} /></Field>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
          <span className="text-xs font-bold text-ink">Ingredients (per {yieldQty} {yieldUnit} yield)</span>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto_auto] items-center gap-2 text-xs">
              <Combobox
                value={item.ingredient}
                onChange={(value) => updateIngredient(i, { ingredient: value })}
                options={ingredients.map((ing) => ({ value: ing.id, label: ing.name }))}
              />
              <input type="number" className={inputCls} value={item.qty} onChange={(e) => updateIngredient(i, { qty: e.target.value })} />
              <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-ink-soft" title="Set on the ingredient itself, not per recipe">
                {unitFor(item.ingredient) || "—"}
              </div>
              <label className="flex items-center gap-1 text-ink-soft">
                <input type="checkbox" checked={item.is_optional} onChange={(e) => updateIngredient(i, { is_optional: e.target.checked })} />
                Optional
              </label>
              <Button variant="danger" onClick={() => removeIngredient(i)}>
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Button onClick={addIngredient} disabled={ingredients.length === 0}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add ingredient
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
          <span className="text-xs font-bold text-ink">Cooking steps</span>
        </div>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3 rounded-md bg-surface-2 p-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                {step.step_number}
              </div>
              <div className="flex-1 space-y-2">
                <input className={inputCls} placeholder="Step title" value={step.title} onChange={(e) => updateStep(i, { title: e.target.value })} />
                <textarea className={`${inputCls} min-h-14`} placeholder="Describe this step…" value={step.description} onChange={(e) => updateStep(i, { description: e.target.value })} />
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-semibold text-ink-soft">Duration (mins)</label>
                  <input
                    type="number"
                    className={`${inputCls} w-16`}
                    value={step.duration_minutes ?? ""}
                    onChange={(e) => updateStep(i, { duration_minutes: e.target.value ? Number(e.target.value) : null })}
                  />
                  <label className="text-[11px] font-semibold text-ink-soft">Temp (°C)</label>
                  <input
                    type="number"
                    className={`${inputCls} w-16`}
                    value={step.temperature_c ?? ""}
                    onChange={(e) => updateStep(i, { temperature_c: e.target.value ? Number(e.target.value) : null })}
                  />
                  <Button variant="danger" className="ml-auto" onClick={() => removeStep(i)}>
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Button onClick={addStep}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add cooking step
          </Button>
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving || !name || !category}>
          {saving ? "Saving…" : "Save recipe"}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="font-semibold text-ink-soft">{label}</label>
      {children}
    </div>
  );
}
